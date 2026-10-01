import { Router, type IRouter } from "express";
import { eq, count, avg, sql, and } from "drizzle-orm";
import { db, workflowsTable, executionsTable } from "@workspace/db";
import { requireAuth, upsertUser } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/stats/dashboard", async (req, res): Promise<void> => {
  await upsertUser(req.userId);
  const uid = req.userId;

  const [workflowStats] = await db.select({
    total: count(),
    active: sql<number>`count(*) filter (where ${workflowsTable.active} = true)`,
  }).from(workflowsTable).where(eq(workflowsTable.userId, uid));

  const [execStats] = await db.select({
    total: count(),
    successful: sql<number>`count(*) filter (where ${executionsTable.status} = 'success')`,
    failed: sql<number>`count(*) filter (where ${executionsTable.status} = 'error')`,
    avgDuration: avg(executionsTable.durationMs),
  }).from(executionsTable).where(eq(executionsTable.userId, uid));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayStats] = await db.select({
    count: count(),
  }).from(executionsTable).where(
    and(eq(executionsTable.userId, uid), sql`${executionsTable.startedAt} >= ${today}`)
  );

  const total = Number(execStats?.total ?? 0);
  const successful = Number(execStats?.successful ?? 0);

  res.json({
    totalWorkflows: Number(workflowStats?.total ?? 0),
    activeWorkflows: Number(workflowStats?.active ?? 0),
    totalExecutions: total,
    successfulExecutions: successful,
    failedExecutions: Number(execStats?.failed ?? 0),
    avgDurationMs: Math.round(Number(execStats?.avgDuration ?? 0)),
    executionsToday: Number(todayStats?.count ?? 0),
    successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
  });
});

router.get("/stats/execution-history", async (req, res): Promise<void> => {
  const uid = req.userId;
  const result = await db.execute(sql`
    SELECT
      DATE(started_at AT TIME ZONE 'UTC')::text as date,
      COUNT(*) FILTER (WHERE status = 'success') as success,
      COUNT(*) FILTER (WHERE status = 'error') as error
    FROM executions
    WHERE started_at >= NOW() - INTERVAL '30 days'
      AND user_id = ${uid}
    GROUP BY DATE(started_at AT TIME ZONE 'UTC')
    ORDER BY date ASC
  `);

  const rawRows = Array.isArray(result) ? result : (result?.rows ?? []);
  res.json(rawRows.map((r: Record<string, unknown>) => ({
    date: r.date,
    success: Number(r.success ?? 0),
    error: Number(r.error ?? 0),
  })));
});

export default router;
