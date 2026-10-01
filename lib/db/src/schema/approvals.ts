import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { executionsTable } from "./executions";

export const approvalRequestsTable = pgTable("approval_requests", {
  id: serial("id").primaryKey(),
  executionId: integer("execution_id").notNull().references(() => executionsTable.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(),
  workflowId: integer("workflow_id").notNull(),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("Approval Required"),
  message: text("message").notNull().default(""),
  approverEmails: jsonb("approver_emails").notNull().default([]),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | expired
  decision: text("decision"),
  deciderEmail: text("decider_email"),
  responseNote: text("response_note"),
  approveToken: text("approve_token").notNull(),
  rejectToken: text("reject_token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  // Multi-approver fields
  approvalMode: text("approval_mode").notNull().default("any"), // any | all | sequential
  responses: jsonb("responses").notNull().default([]),           // Array<{email,decision,respondedAt,note?}>
  pendingApprovers: jsonb("pending_approvers").notNull().default([]), // Array<{email,approveToken,rejectToken}>
  currentApproverIdx: integer("current_approver_idx").notNull().default(0),
});

export const insertApprovalRequestSchema = createInsertSchema(approvalRequestsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertApprovalRequest = z.infer<typeof insertApprovalRequestSchema>;
export type ApprovalRequest = typeof approvalRequestsTable.$inferSelect;
