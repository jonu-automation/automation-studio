import { Router, type IRouter } from "express";
import healthRouter from "./health";
import workflowsRouter from "./workflows";
import executionsRouter from "./executions";
import nodeTypesRouter from "./node-types";
import statsRouter from "./stats";
import authRouter from "./auth";
import billingRouter from "./billing";
import credentialsRouter from "./credentials";
import webhooksRouter from "./webhooks";
import { approvalsRouter } from "./approvals";
import streamRouter from "./stream";
import aiRouter from "./ai";
import ssoRouter from "./sso";
import mcpRouter from "./mcp";
import templatesRouter from "./templates";

const router: IRouter = Router();

router.use(healthRouter);
// MCP must be registered BEFORE any router that uses `router.use(requireAuth)`
// globally, because such middleware would match /api/mcp and reject before
// Express falls through to this router.
router.use(mcpRouter);
router.use(templatesRouter);
router.use(authRouter);
// Public routes must precede routers with global requireAuth middleware.
router.use(webhooksRouter);
router.use("/approvals", approvalsRouter);
router.use(workflowsRouter);
router.use(executionsRouter);
router.use(nodeTypesRouter);
router.use(statsRouter);
router.use(billingRouter);
router.use(credentialsRouter);
router.use(streamRouter);
router.use("/ai", aiRouter);
router.use(ssoRouter);

export default router;
