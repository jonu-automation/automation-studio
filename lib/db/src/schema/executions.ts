import { pgTable, text, serial, timestamp, integer, jsonb, bigint, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workflowsTable } from "./workflows";

export const executionsTable = pgTable("executions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  workflowId: integer("workflow_id").notNull().references(() => workflowsTable.id, { onDelete: "cascade" }),
  workflowName: text("workflow_name").notNull(),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  billableComputeMs: bigint("billable_compute_ms", { mode: "number" }).notNull().default(0),
  error: text("error"),
  nodeResults: jsonb("node_results").notNull().default([]),
  inputData: jsonb("input_data").notNull().default({}),
  outputData: jsonb("output_data"),
  // Human-in-the-loop: when execution is paused at an approval node
  pausedAtNodeId: text("paused_at_node_id"),
  resumeContext: jsonb("resume_context"),
  waitingForApproval: boolean("waiting_for_approval").notNull().default(false),
});

export const insertExecutionSchema = createInsertSchema(executionsTable).omit({
  id: true,
  startedAt: true,
});

export type InsertExecution = z.infer<typeof insertExecutionSchema>;
export type Execution = typeof executionsTable.$inferSelect;
