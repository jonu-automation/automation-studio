import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db, usersTable, workflowsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { executeWorkflowLogic } from "../lib/executor";

const router = Router();

// ── Personal Access Token management (authenticated user routes) ─────────────

router.get("/mcp/key", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select({ key: usersTable.mcpApiKey })
    .from(usersTable).where(eq(usersTable.id, req.userId));
  res.json({ key: user?.key ?? null });
});

router.post("/mcp/key", requireAuth, async (req, res): Promise<void> => {
  const key = `mcp_${randomBytes(24).toString("base64url")}`;
  await db.update(usersTable).set({ mcpApiKey: key }).where(eq(usersTable.id, req.userId));
  res.json({ key });
});

router.delete("/mcp/key", requireAuth, async (req, res): Promise<void> => {
  await db.update(usersTable).set({ mcpApiKey: null }).where(eq(usersTable.id, req.userId));
  res.json({ ok: true });
});

// ── MCP JSON-RPC 2.0 endpoint ─────────────────────────────────────────────────
// Authenticated by Bearer token (the user's mcp_api_key).
// Implements: initialize, tools/list, tools/call

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

// Slugify workflow name → tool name (MCP tool names must be identifier-safe)
function toToolName(id: number, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  return `workflow_${id}_${slug || "unnamed"}`;
}
function fromToolName(toolName: string): number | null {
  const m = /^workflow_(\d+)_/.exec(toolName);
  return m ? parseInt(m[1], 10) : null;
}

async function authenticateMcp(req: Request): Promise<string | null> {
  const auth = req.header("authorization") ?? "";
  const m = /^Bearer\s+(mcp_[A-Za-z0-9_-]+)$/.exec(auth);
  if (!m) return null;
  const [user] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.mcpApiKey, m[1]));
  return user?.id ?? null;
}

router.post("/mcp", async (req: Request, res: Response): Promise<void> => {
  const userId = await authenticateMcp(req);
  if (!userId) {
    res.status(401).json(rpcError(null, -32001, "Invalid or missing MCP API key. Provide it as: Authorization: Bearer mcp_..."));
    return;
  }

  const body = req.body as JsonRpcRequest;
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    res.status(400).json(rpcError(body?.id, -32600, "Invalid Request"));
    return;
  }

  try {
    switch (body.method) {
      case "initialize": {
        res.json(rpcResult(body.id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "automation-studio", version: "1.0.0" },
        }));
        return;
      }

      case "notifications/initialized": {
        // Notification — no response per JSON-RPC 2.0 spec
        res.status(204).end();
        return;
      }

      case "tools/list": {
        const workflows = await db.select({
          id: workflowsTable.id,
          name: workflowsTable.name,
          description: workflowsTable.description,
        }).from(workflowsTable).where(eq(workflowsTable.userId, userId));

        const tools = workflows.map(w => ({
          name: toToolName(w.id, w.name),
          description: w.description?.trim() || `Execute the "${w.name}" automation workflow.`,
          inputSchema: {
            type: "object",
            properties: {
              inputData: {
                type: "object",
                description: "Optional input data passed to the workflow as the trigger payload.",
                additionalProperties: true,
              },
            },
          },
        }));

        res.json(rpcResult(body.id, { tools }));
        return;
      }

      case "tools/call": {
        const params = (body.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        if (!params.name) {
          res.json(rpcError(body.id, -32602, "Missing 'name' parameter"));
          return;
        }

        const workflowId = fromToolName(params.name);
        if (workflowId === null) {
          res.json(rpcError(body.id, -32602, `Unknown tool: ${params.name}`));
          return;
        }

        const [workflow] = await db.select().from(workflowsTable)
          .where(eq(workflowsTable.id, workflowId));

        if (!workflow || workflow.userId !== userId) {
          res.json(rpcError(body.id, -32602, `Workflow ${workflowId} not found or access denied`));
          return;
        }

        const inputData = (params.arguments?.inputData as Record<string, unknown>) ?? {};
        const execution = await executeWorkflowLogic(workflow, inputData, userId);

        res.json(rpcResult(body.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                executionId: execution.id,
                status: execution.status,
                output: execution.outputData,
                error: execution.error,
                durationMs: execution.durationMs,
              }, null, 2),
            },
          ],
          isError: execution.status === "error",
        }));
        return;
      }

      default:
        res.json(rpcError(body.id, -32601, `Method not found: ${body.method}`));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    res.json(rpcError(body.id, -32603, message));
  }
});

export default router;
