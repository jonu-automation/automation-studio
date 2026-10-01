import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, workflowsTable } from "@workspace/db";
import { executeWorkflowLogic } from "../lib/executor";
import { logger } from "../lib/logger";
import { checkAndIncrementRunLimit } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Public endpoint — no requireAuth middleware
// Any external service can POST to /api/webhooks/:token to trigger the workflow
router.post("/webhooks/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [workflow] = await db
    .select()
    .from(workflowsTable)
    .where(eq(workflowsTable.webhookToken, token));

  if (!workflow) {
    res.status(404).json({ error: "not_found", message: "No workflow found for this webhook URL" });
    return;
  }

  if (!workflow.active) { res.status(409).json({ error: "Workflow is inactive. Activate it before using its webhook." }); return; }

  const allowance = await checkAndIncrementRunLimit(workflow.userId);
  if (!allowance.allowed) { res.status(402).json({ error: "Workflow owner exceeded run limit." }); return; }

  const inputData: Record<string, unknown> = {
    ...(req.body as Record<string, unknown>),
    $webhook: {
      method: req.method,
      headers: req.headers,
      query: req.query,
      timestamp: new Date().toISOString(),
    },
  };

  logger.info({ workflowId: workflow.id }, "Webhook triggered");

  const execution = await executeWorkflowLogic(workflow, inputData, workflow.userId);
  res.json(execution);
});

export default router;
