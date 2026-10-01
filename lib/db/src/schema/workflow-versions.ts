import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { workflowsTable } from "./workflows";
import { usersTable } from "./users";

export const workflowVersionsTable = pgTable("workflow_versions", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull().references(() => workflowsTable.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  nodesJson: jsonb("nodes_json").notNull().default([]),
  edgesJson: jsonb("edges_json").notNull().default([]),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  changelog: text("changelog"),
});
