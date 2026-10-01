import cron, { type ScheduledTask } from "node-cron";
import { eq, and, lt } from "drizzle-orm";
import { db, workflowsTable, approvalRequestsTable, executionsTable } from "@workspace/db";
import { executeWorkflowLogic } from "./executor";
import { logger } from "./logger";
import type { Workflow } from "@workspace/db";
import { checkAndIncrementRunLimit } from "../middlewares/requireAuth";

const jobs = new Map<number, ScheduledTask>();

function getScheduleNodes(workflow: Workflow): Array<{ cron: string }> {
  const nodes = (workflow.nodes as Array<{ type: string; config?: Record<string, unknown> }>) || [];
  return nodes
    .filter(n => n.type === "schedule")
    .map(n => ({ cron: String(n.config?.cron ?? "* * * * *") }));
}

function registerWorkflow(workflow: Workflow): void {
  // Unregister any existing job first
  unregisterWorkflow(workflow.id);

  const scheduleNodes = getScheduleNodes(workflow);
  if (scheduleNodes.length === 0) return;

  const cronExpr = scheduleNodes[0].cron;

  if (!cron.validate(cronExpr)) {
    logger.warn({ workflowId: workflow.id, cronExpr }, "Invalid cron expression, skipping");
    return;
  }

  logger.info({ workflowId: workflow.id, cronExpr }, "Registering scheduled workflow");

  const task = cron.schedule(cronExpr, async () => {
    try {
      logger.info({ workflowId: workflow.id }, "Running scheduled workflow");
      // Re-fetch the latest workflow in case it changed
      const [latest] = await db
        .select()
        .from(workflowsTable)
        .where(and(eq(workflowsTable.id, workflow.id), eq(workflowsTable.active, true)));

      if (!latest) {
        // Workflow was deactivated or deleted
        unregisterWorkflow(workflow.id);
        return;
      }

      const allowance = await checkAndIncrementRunLimit(latest.userId);
      if (!allowance.allowed) { logger.warn({ workflowId: latest.id }, "Scheduled workflow exceeded run limit"); return; }
      await executeWorkflowLogic(latest, { triggered_by: "schedule", timestamp: new Date().toISOString() }, latest.userId);
    } catch (err) {
      logger.error({ err, workflowId: workflow.id }, "Scheduled workflow execution failed");
    }
  });

  jobs.set(workflow.id, task);
}

function unregisterWorkflow(workflowId: number): void {
  const existing = jobs.get(workflowId);
  if (existing) {
    existing.stop();
    jobs.delete(workflowId);
    logger.info({ workflowId }, "Unregistered scheduled workflow");
  }
}

export async function initScheduler(): Promise<void> {
  logger.info("Initializing cron scheduler");

  const activeWorkflows = await db
    .select()
    .from(workflowsTable)
    .where(eq(workflowsTable.active, true));

  for (const workflow of activeWorkflows) {
    registerWorkflow(workflow);
  }

  logger.info({ count: jobs.size }, "Scheduler initialized");
}

export function onWorkflowToggled(workflow: Workflow): void {
  if (workflow.active) {
    registerWorkflow(workflow);
  } else {
    unregisterWorkflow(workflow.id);
  }
}

export function getScheduledWorkflowIds(): number[] {
  return Array.from(jobs.keys());
}

// ── Approval deadline expiry ──────────────────────────────────────────────────

async function expireOverdueApprovals(): Promise<void> {
  const now = new Date();
  try {
    // Find pending approvals past their deadline
    const overdue = await db
      .select()
      .from(approvalRequestsTable)
      .where(
        and(
          eq(approvalRequestsTable.status, "pending"),
          lt(approvalRequestsTable.deadlineAt, now),
        ),
      );

    if (overdue.length === 0) return;

    logger.info({ count: overdue.length }, "Expiring overdue approval requests");

    for (const approval of overdue) {
      // Mark approval as expired
      await db
        .update(approvalRequestsTable)
        .set({ status: "expired", respondedAt: now })
        .where(eq(approvalRequestsTable.id, approval.id));

      // Mark the paused execution as failed/rejected
      await db
        .update(executionsTable)
        .set({
          status: "error",
          finishedAt: now,
          waitingForApproval: false,
          error: `Approval expired after deadline`,
        })
        .where(
          and(
            eq(executionsTable.id, approval.executionId),
            eq(executionsTable.waitingForApproval, true),
          ),
        );

      logger.info({ approvalId: approval.id, executionId: approval.executionId }, "Approval expired");
    }
  } catch (err) {
    logger.error({ err }, "Error expiring overdue approvals");
  }
}

export function startApprovalExpiryJob(): void {
  // Run every 15 minutes
  cron.schedule("*/15 * * * *", () => {
    expireOverdueApprovals().catch(err =>
      logger.error({ err }, "Approval expiry job failed"),
    );
  });
  logger.info("Approval expiry cron started (every 15 minutes)");
}
