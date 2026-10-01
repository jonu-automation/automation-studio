import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, executionsTable, workflowsTable } from "@workspace/db";
import {
  GetExecutionParams,
  ListExecutionsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, upsertUser } from "../middlewares/requireAuth";
import { executeWorkflowLogic } from "../lib/executor";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/executions", async (req, res): Promise<void> => {
  await upsertUser(req.userId);
  const params = ListExecutionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  const conditions = [eq(executionsTable.userId, req.userId)];
  if (params.data.workflowId) conditions.push(eq(executionsTable.workflowId, params.data.workflowId));
  if (params.data.status && params.data.status !== "all") conditions.push(eq(executionsTable.status, params.data.status));
  const query = db.select().from(executionsTable).where(and(...conditions));

  const limit = params.data.limit ?? 20;
  const executions = await query.orderBy(desc(executionsTable.startedAt)).limit(limit);
  res.json(executions);
});

router.get("/executions/:id", async (req, res): Promise<void> => {
  const params = GetExecutionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  const [execution] = await db.select().from(executionsTable).where(
    and(eq(executionsTable.id, params.data.id), eq(executionsTable.userId, req.userId))
  );

  if (!execution) {
    res.status(404).json({ error: "not_found", message: "Execution not found" });
    return;
  }

  res.json(execution);
});

router.post("/executions/:id/retry", async (req, res): Promise<void> => {
  const params = GetExecutionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  const [original] = await db.select().from(executionsTable).where(
    and(eq(executionsTable.id, params.data.id), eq(executionsTable.userId, req.userId))
  );

  if (!original) {
    res.status(404).json({ error: "not_found", message: "Execution not found" });
    return;
  }

  if (original.status !== "error" && original.status !== "rejected") {
    res.status(400).json({ error: "not_retryable", message: "Only failed or rejected executions can be retried" });
    return;
  }

  // Fetch the current workflow definition
  const [workflow] = await db.select().from(workflowsTable).where(
    and(eq(workflowsTable.id, original.workflowId), eq(workflowsTable.userId, req.userId))
  );

  if (!workflow) {
    res.status(404).json({ error: "workflow_not_found", message: "The workflow for this execution no longer exists" });
    return;
  }

  // Re-run with original input — executeWorkflowLogic creates its own execution record
  const inputData = (original.inputData as Record<string, unknown>) ?? {};
  const newExecution = await executeWorkflowLogic(workflow, { ...inputData, _retried_from: original.id }, req.userId);

  res.json(newExecution);
});

export default router;
