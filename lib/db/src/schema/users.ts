import { pgTable, text, timestamp, integer, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  plan: text("plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  lemonSqueezyCustomerId: text("lemonsqueezy_customer_id"),
  lemonSqueezySubscriptionId: text("lemonsqueezy_subscription_id"),
  // Legacy run counter (kept for compatibility)
  runsThisMonth: integer("runs_this_month").notNull().default(0),
  runsResetAt: timestamp("runs_reset_at", { withTimezone: true }).notNull().defaultNow(),
  // Compute-time billing (milliseconds of actual execution, idle time excluded)
  computeMsUsed: bigint("compute_ms_used", { mode: "number" }).notNull().default(0),
  computeMsResetAt: timestamp("compute_ms_reset_at", { withTimezone: true }).notNull().defaultNow(),
  // MCP (Model Context Protocol) personal access token — exposes user's
  // workflows as callable tools to AI assistants like Claude Desktop, Cursor.
  mcpApiKey: text("mcp_api_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  runsThisMonth: true,
  runsResetAt: true,
  computeMsUsed: true,
  computeMsResetAt: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

// ── Plan limits ───────────────────────────────────────────────────────────────
// Compute seconds = actual CPU time. Idle time (waiting for webhooks,
// human approvals, delays) does NOT count. Failed retries are free.

export const PLAN_LIMITS = {
  free: {
    maxWorkflows: 5,
    maxComputeSecondsPerMonth: 5_000,
    maxRunsPerMonth: 500,
    maxVersions: 5,
    selfHosting: false,
    label: "Free",
    price: 0,
    badge: null,
  },
  hobby: {
    maxWorkflows: 20,
    maxComputeSecondsPerMonth: 50_000,
    maxRunsPerMonth: 5_000,
    maxVersions: 20,
    selfHosting: false,
    label: "Hobby",
    price: 12,
    badge: "Most popular",
  },
  pro: {
    maxWorkflows: Infinity,
    maxComputeSecondsPerMonth: 500_000,
    maxRunsPerMonth: Infinity,
    maxVersions: null,
    selfHosting: false,
    label: "Pro",
    price: 39,
    badge: "Best value",
  },
  team: {
    maxWorkflows: Infinity,
    maxComputeSecondsPerMonth: 5_000_000,
    maxRunsPerMonth: Infinity,
    maxVersions: null,
    selfHosting: true,
    label: "Team",
    price: 99,
    badge: null,
  },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

export function getPlanLimit(plan: string) {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.free;
}

export function getComputeSecondsUsed(computeMsUsed: number) {
  return Math.round(computeMsUsed / 1000);
}

export function isComputeLimitReached(plan: string, computeMsUsed: number) {
  const limit = getPlanLimit(plan);
  const usedSeconds = computeMsUsed / 1000;
  return usedSeconds >= limit.maxComputeSecondsPerMonth;
}
