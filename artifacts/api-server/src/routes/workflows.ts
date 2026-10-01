import { Router, type IRouter } from "express";
import { eq, ilike, desc, and, sql, max, asc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, workflowsTable, executionsTable, usersTable } from "@workspace/db";
import { PLAN_LIMITS, type Plan, workflowVersionsTable } from "@workspace/db/schema";
import { onWorkflowToggled } from "../lib/scheduler";
import {
  CreateWorkflowBody,
  UpdateWorkflowBody,
  GetWorkflowParams,
  UpdateWorkflowParams,
  DeleteWorkflowParams,
  ExecuteWorkflowParams,
  ToggleWorkflowParams,
  ListWorkflowsQueryParams,
} from "@workspace/api-zod";
import { executeWorkflowLogic } from "../lib/executor";
import { requireAuth, upsertUser, checkAndIncrementRunLimit } from "../middlewares/requireAuth";
import { count } from "drizzle-orm";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/workflows", async (req, res): Promise<void> => {
  await upsertUser(req.userId);
  const params = ListWorkflowsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  let query = db.select().from(workflowsTable)
    .where(eq(workflowsTable.userId, req.userId))
    .$dynamic();

  if (params.data.search) {
    query = query.where(and(
      eq(workflowsTable.userId, req.userId),
      ilike(workflowsTable.name, `%${params.data.search}%`)
    ));
  }

  if (params.data.status && params.data.status !== "all") {
    query = query.where(and(
      eq(workflowsTable.userId, req.userId),
      eq(workflowsTable.active, params.data.status === "active")
    ));
  }

  const workflows = await query.orderBy(desc(workflowsTable.updatedAt));
  res.json(workflows);
});

router.post("/workflows", async (req, res): Promise<void> => {
  await upsertUser(req.userId);
  const parsed = CreateWorkflowBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", message: parsed.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId));
  const plan = ((user?.plan) ?? "free") as Plan;
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  if (limits.maxWorkflows !== Infinity) {
    const [{ total }] = await db.select({ total: count() }).from(workflowsTable)
      .where(eq(workflowsTable.userId, req.userId));
    if (Number(total) >= limits.maxWorkflows) {
      res.status(402).json({
        error: "plan_limit",
        message: `Free plan allows up to ${limits.maxWorkflows} workflows. Upgrade to Pro for unlimited workflows.`,
      });
      return;
    }
  }

  const webhookToken = randomUUID();

  const [workflow] = await db.insert(workflowsTable).values({
    userId: req.userId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    nodes: (parsed.data.nodes ?? []) as object,
    edges: (parsed.data.edges ?? []) as object,
    webhookToken,
  }).returning();

  // Create initial v1 so version history is never empty after first save
  try {
    await db.insert(workflowVersionsTable).values({
      workflowId: workflow.id,
      versionNumber: 1,
      nodesJson: (parsed.data.nodes ?? []) as object,
      edgesJson: (parsed.data.edges ?? []) as object,
      createdBy: req.userId,
      changelog: "Initial version",
    });
  } catch {
    // Version saving is non-critical — don't fail the create
  }

  res.status(201).json(workflow);
});

// ── Import ────────────────────────────────────────────────────────────────────

const VALID_NODE_TYPES = new Set([
  "webhook", "schedule", "manual",
  "http_request", "email", "slack",
  "database_query", "transform",
  "filter", "if_else", "wait",
  "set_variable", "json_parse",
  "approval",
]);

// ── n8n format support ────────────────────────────────────────────────────────

const N8N_TYPE_MAP: Record<string, string> = {
  "n8n-nodes-base.httpRequest": "http_request",
  "n8n-nodes-base.webhook": "webhook",
  "n8n-nodes-base.webhookTrigger": "webhook",
  "n8n-nodes-base.scheduleTrigger": "schedule",
  "n8n-nodes-base.cron": "schedule",
  "n8n-nodes-base.interval": "schedule",
  "n8n-nodes-base.start": "manual",
  "n8n-nodes-base.manualTrigger": "manual",
  "n8n-nodes-base.emailSend": "email",
  "n8n-nodes-base.emailReadImap": "email",
  "n8n-nodes-base.gmail": "email",
  "n8n-nodes-base.slack": "slack",
  "n8n-nodes-base.postgres": "database_query",
  "n8n-nodes-base.mysql": "database_query",
  "n8n-nodes-base.mySql": "database_query",
  "n8n-nodes-base.mongoDb": "database_query",
  "n8n-nodes-base.redis": "database_query",
  "n8n-nodes-base.set": "transform",
  "n8n-nodes-base.code": "transform",
  "n8n-nodes-base.function": "transform",
  "n8n-nodes-base.functionItem": "transform",
  "n8n-nodes-base.merge": "transform",
  "n8n-nodes-base.splitInBatches": "transform",
  "n8n-nodes-base.itemLists": "transform",
  "n8n-nodes-base.if": "if_else",
  "n8n-nodes-base.switch": "if_else",
  "n8n-nodes-base.wait": "wait",
  "n8n-nodes-base.filter": "filter",
  "n8n-nodes-base.removeduplicates": "filter",
  "n8n-nodes-base.noOp": "transform",
  "n8n-nodes-base.executeWorkflow": "http_request",
  "n8n-nodes-base.respondToWebhook": "webhook",
};

type N8nNode = {
  id?: string;
  name: string;
  type: string;
  position?: [number, number];
  parameters?: Record<string, unknown>;
  typeVersion?: number;
};

type N8nConnections = Record<string, {
  main?: Array<Array<{ node: string; type: string; index: number }>>;
}>;

function isN8nFormat(body: Record<string, unknown>): boolean {
  // n8n exports have a `connections` object and nodes with `typeVersion` or `parameters`
  if (body.connections && typeof body.connections === "object") return true;
  if (Array.isArray(body.nodes)) {
    const firstNode = (body.nodes as unknown[])[0];
    if (firstNode && typeof firstNode === "object") {
      const n = firstNode as Record<string, unknown>;
      if ("typeVersion" in n || "parameters" in n) return true;
    }
  }
  return false;
}

function convertN8nWorkflow(body: Record<string, unknown>): {
  name: string;
  description?: string;
  nodes: Array<{ id: string; type: string; label: string; x: number; y: number; config: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string }>;
} {
  const rawNodes = (body.nodes ?? []) as N8nNode[];
  const connections = (body.connections ?? {}) as N8nConnections;

  // Build name → id map (n8n uses names in connections, we need IDs)
  const nameToId = new Map<string, string>();
  const nodes = rawNodes.map((n, idx) => {
    const id = n.id ?? `node-${idx + 1}`;
    nameToId.set(n.name, id);

    // Map n8n type to our type, fallback to "http_request" for unknowns
    const mappedType = N8N_TYPE_MAP[n.type] ?? "http_request";

    return {
      id,
      type: mappedType,
      label: n.name,
      x: Array.isArray(n.position) ? (n.position[0] ?? idx * 220) : idx * 220,
      y: Array.isArray(n.position) ? (n.position[1] ?? 200) : 200,
      config: (n.parameters ?? {}) as Record<string, unknown>,
    };
  });

  // Convert n8n connections to our edge format
  const edges: Array<{ id: string; source: string; target: string }> = [];
  let edgeIdx = 0;
  for (const [sourceName, outputs] of Object.entries(connections)) {
    const sourceId = nameToId.get(sourceName);
    if (!sourceId) continue;
    for (const outputGroup of Object.values(outputs)) {
      for (const outputConnections of (outputGroup ?? [])) {
        for (const conn of (outputConnections ?? [])) {
          const targetId = nameToId.get(conn.node);
          if (!targetId) continue;
          edges.push({ id: `e${++edgeIdx}`, source: sourceId, target: targetId });
        }
      }
    }
  }

  return {
    name: (body.name as string) || "Imported Workflow",
    nodes,
    edges,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

function detectCycle(nodes: Array<{ id: string }>, edges: Array<{ source: string; target: string }>): boolean {
  const adj: Record<string, string[]> = {};
  for (const n of nodes) adj[n.id] = [];
  for (const e of edges) {
    if (!adj[e.source]) adj[e.source] = [];
    adj[e.source].push(e.target);
  }
  const visited = new Set<string>();
  const inStack = new Set<string>();
  function dfs(id: string): boolean {
    visited.add(id); inStack.add(id);
    for (const nb of (adj[id] ?? [])) {
      if (!visited.has(nb) && dfs(nb)) return true;
      if (inStack.has(nb)) return true;
    }
    inStack.delete(id); return false;
  }
  for (const n of nodes) if (!visited.has(n.id) && dfs(n.id)) return true;
  return false;
}

router.post("/workflows/import", async (req, res): Promise<void> => {
  await upsertUser(req.userId);

  const bodyStr = JSON.stringify(req.body);
  if (bodyStr.length > 1_000_000) {
    res.status(413).json({ error: "file_too_large", message: "Import file must be under 1MB" });
    return;
  }

  // Auto-detect and convert n8n workflow format
  let importBody = req.body as Record<string, unknown>;
  if (isN8nFormat(importBody)) {
    try {
      importBody = convertN8nWorkflow(importBody) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: "invalid_json", message: "Could not parse n8n workflow format" });
      return;
    }
  }

  const { name, description, nodes, edges } = importBody as {
    name?: unknown; description?: unknown;
    nodes?: unknown; edges?: unknown;
  };

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "invalid_json", message: "Workflow must have a name field" });
    return;
  }
  if (!Array.isArray(nodes)) {
    res.status(400).json({ error: "invalid_json", message: "Workflow must have a nodes array" });
    return;
  }
  // edges default to empty array if not present
  const edgeList = Array.isArray(edges) ? edges : [];

  for (const node of nodes) {
    if (!node.id || !node.type || !node.label) {
      res.status(400).json({ error: "invalid_node", message: "Each node must have id, type, and label fields" });
      return;
    }
  }

  const unknownNodeTypes = [...new Set(
    nodes.filter((n: { type: string }) => !VALID_NODE_TYPES.has(n.type)).map((n: { type: string }) => n.type)
  )];

  for (const edge of edgeList) {
    if (!edge.source || !edge.target) {
      res.status(400).json({ error: "invalid_edge", message: "Each edge must have source and target fields" });
      return;
    }
  }

  if (detectCycle(nodes as Array<{ id: string }>, edgeList as Array<{ source: string; target: string }>)) {
    res.status(400).json({ error: "circular_dependency", message: "Workflow contains circular dependencies between nodes" });
    return;
  }

  const CREDENTIAL_FIELDS = new Set(["credentialId", "credential_id", "apiKey", "api_key", "token", "password", "secret", "accessToken", "access_token"]);
  let credentialsStripped = false;
  const sanitizedNodes = (nodes as Array<{ id: string; type: string; label: string; x?: number; y?: number; config?: Record<string, unknown> }>).map(node => {
    const config = { ...(node.config ?? {}) };
    for (const field of Object.keys(config)) {
      if (CREDENTIAL_FIELDS.has(field)) {
        delete config[field];
        credentialsStripped = true;
      }
    }
    return { ...node, config };
  });

  const [existingWithSameName] = await db.select({ id: workflowsTable.id })
    .from(workflowsTable)
    .where(and(eq(workflowsTable.userId, req.userId), eq(workflowsTable.name, name.trim())))
    .limit(1);
  const finalName = existingWithSameName ? `${name.trim()} (imported)` : name.trim();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId));
  const plan = ((user?.plan) ?? "free") as Plan;
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  if (limits.maxWorkflows !== Infinity) {
    const [{ total }] = await db.select({ total: count() }).from(workflowsTable)
      .where(eq(workflowsTable.userId, req.userId));
    if (Number(total) >= limits.maxWorkflows) {
      res.status(402).json({
        error: "plan_limit",
        message: `Free plan allows up to ${limits.maxWorkflows} workflows. Upgrade to Pro for unlimited workflows.`,
      });
      return;
    }
  }

  const webhookToken = randomUUID();
  const [workflow] = await db.insert(workflowsTable).values({
    userId: req.userId,
    name: finalName,
    description: typeof description === "string" ? description : null,
    nodes: sanitizedNodes as object,
    edges: edgeList as object,
    webhookToken,
  }).returning();

  res.status(201).json({
    ...workflow,
    importWarnings: { unknownNodeTypes, credentialsStripped },
  });
});

router.get("/workflows/:id", async (req, res): Promise<void> => {
  const params = GetWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  const [workflow] = await db.select().from(workflowsTable).where(
    and(eq(workflowsTable.id, params.data.id), eq(workflowsTable.userId, req.userId))
  );

  if (!workflow) {
    res.status(404).json({ error: "not_found", message: "Workflow not found" });
    return;
  }

  res.json(workflow);
});

router.put("/workflows/:id", async (req, res): Promise<void> => {
  const params = UpdateWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  const parsed = UpdateWorkflowBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", message: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.active !== undefined) updateData.active = parsed.data.active;
  if (parsed.data.nodes !== undefined) updateData.nodes = parsed.data.nodes;
  if (parsed.data.edges !== undefined) updateData.edges = parsed.data.edges;

  const [workflow] = await db.update(workflowsTable)
    .set(updateData)
    .where(and(eq(workflowsTable.id, params.data.id), eq(workflowsTable.userId, req.userId)))
    .returning();

  if (!workflow) {
    res.status(404).json({ error: "not_found", message: "Workflow not found" });
    return;
  }

  // Auto-save a version whenever nodes or edges change
  if (parsed.data.nodes !== undefined || parsed.data.edges !== undefined) {
    try {
      const [versionUser] = await db.select({ plan: usersTable.plan }).from(usersTable).where(eq(usersTable.id, req.userId));
      const versionPlan = ((versionUser?.plan) ?? "free") as Plan;
      const versionLimits = PLAN_LIMITS[versionPlan] ?? PLAN_LIMITS.free;
      const maxVersions = versionLimits.maxVersions;

      const [maxRow] = await db
        .select({ maxVer: max(workflowVersionsTable.versionNumber) })
        .from(workflowVersionsTable)
        .where(eq(workflowVersionsTable.workflowId, workflow.id));

      const nextVersion = (maxRow?.maxVer ?? 0) + 1;
      await db.insert(workflowVersionsTable).values({
        workflowId: workflow.id,
        versionNumber: nextVersion,
        nodesJson: workflow.nodes as object,
        edgesJson: workflow.edges as object,
        createdBy: req.userId,
        changelog: req.body.changelog ?? null,
      });

      // Prune based on plan: null = unlimited (Pro/Team), number = cap (Free=5, Hobby=20)
      if (maxVersions !== null) {
        const versions = await db
          .select({ id: workflowVersionsTable.id })
          .from(workflowVersionsTable)
          .where(eq(workflowVersionsTable.workflowId, workflow.id))
          .orderBy(desc(workflowVersionsTable.versionNumber));

        if (versions.length > maxVersions) {
          const toDelete = versions.slice(maxVersions).map(v => v.id);
          await db.delete(workflowVersionsTable)
            .where(and(
              eq(workflowVersionsTable.workflowId, workflow.id),
              sql`${workflowVersionsTable.id} = ANY(${toDelete})`
            ));
        }
      }
    } catch {
      // Version saving is non-critical — don't fail the save
    }
  }

  res.json(workflow);
});

router.delete("/workflows/:id", async (req, res): Promise<void> => {
  const params = DeleteWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  const [workflow] = await db.delete(workflowsTable).where(
    and(eq(workflowsTable.id, params.data.id), eq(workflowsTable.userId, req.userId))
  ).returning();

  if (!workflow) {
    res.status(404).json({ error: "not_found", message: "Workflow not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/workflows/:id/execute", async (req, res): Promise<void> => {
  const params = ExecuteWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  const { allowed, limit, used } = await checkAndIncrementRunLimit(req.userId);
  if (!allowed) {
    res.status(402).json({
      error: "run_limit_reached",
      message: `You've used ${used}/${limit} runs this month. Upgrade to Pro for unlimited runs.`,
      used,
      limit,
    });
    return;
  }

  const [workflow] = await db.select().from(workflowsTable).where(
    and(eq(workflowsTable.id, params.data.id), eq(workflowsTable.userId, req.userId))
  );

  if (!workflow) {
    res.status(404).json({ error: "not_found", message: "Workflow not found" });
    return;
  }

  const inputData = req.body?.inputData ?? {};
  const execution = await executeWorkflowLogic(workflow, inputData, req.userId);
  res.json(execution);
});

router.post("/workflows/:id/toggle", async (req, res): Promise<void> => {
  const params = ToggleWorkflowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  const [existing] = await db.select().from(workflowsTable).where(
    and(eq(workflowsTable.id, params.data.id), eq(workflowsTable.userId, req.userId))
  );

  if (!existing) {
    res.status(404).json({ error: "not_found", message: "Workflow not found" });
    return;
  }

  const [workflow] = await db.update(workflowsTable)
    .set({ active: !existing.active })
    .where(and(eq(workflowsTable.id, params.data.id), eq(workflowsTable.userId, req.userId)))
    .returning();

  // Update the cron scheduler if this workflow has schedule trigger nodes
  onWorkflowToggled(workflow);

  res.json(workflow);
});

// ── Version History ──────────────────────────────────────────────────────────

// GET /api/workflows/:id/versions — list all saved versions (newest first)
router.get("/workflows/:id/versions", async (req, res): Promise<void> => {
  const workflowId = Number(req.params.id);
  if (isNaN(workflowId)) { res.status(400).json({ error: "invalid_id" }); return; }

  const [workflow] = await db.select({ id: workflowsTable.id })
    .from(workflowsTable)
    .where(and(eq(workflowsTable.id, workflowId), eq(workflowsTable.userId, req.userId)));
  if (!workflow) { res.status(404).json({ error: "not_found" }); return; }

  const versions = await db
    .select({
      id: workflowVersionsTable.id,
      versionNumber: workflowVersionsTable.versionNumber,
      createdBy: workflowVersionsTable.createdBy,
      createdAt: workflowVersionsTable.createdAt,
      changelog: workflowVersionsTable.changelog,
      nodeCount: sql<number>`jsonb_array_length(${workflowVersionsTable.nodesJson})`,
      edgeCount: sql<number>`jsonb_array_length(${workflowVersionsTable.edgesJson})`,
    })
    .from(workflowVersionsTable)
    .where(eq(workflowVersionsTable.workflowId, workflowId))
    .orderBy(desc(workflowVersionsTable.versionNumber));

  res.json(versions);
});

// GET /api/workflows/:id/versions/:version — get full nodes+edges for a version
router.get("/workflows/:id/versions/:version", async (req, res): Promise<void> => {
  const workflowId = Number(req.params.id);
  const versionNumber = Number(req.params.version);
  if (isNaN(workflowId) || isNaN(versionNumber)) { res.status(400).json({ error: "invalid_params" }); return; }

  const [workflow] = await db.select({ id: workflowsTable.id })
    .from(workflowsTable)
    .where(and(eq(workflowsTable.id, workflowId), eq(workflowsTable.userId, req.userId)));
  if (!workflow) { res.status(404).json({ error: "not_found" }); return; }

  const [version] = await db
    .select()
    .from(workflowVersionsTable)
    .where(and(
      eq(workflowVersionsTable.workflowId, workflowId),
      eq(workflowVersionsTable.versionNumber, versionNumber),
    ));

  if (!version) { res.status(404).json({ error: "version_not_found" }); return; }
  res.json(version);
});

// POST /api/workflows/:id/versions/:version/restore — restore a version
router.post("/workflows/:id/versions/:version/restore", async (req, res): Promise<void> => {
  const workflowId = Number(req.params.id);
  const versionNumber = Number(req.params.version);
  if (isNaN(workflowId) || isNaN(versionNumber)) { res.status(400).json({ error: "invalid_params" }); return; }

  const [workflow] = await db.select()
    .from(workflowsTable)
    .where(and(eq(workflowsTable.id, workflowId), eq(workflowsTable.userId, req.userId)));
  if (!workflow) { res.status(404).json({ error: "not_found" }); return; }

  const [version] = await db
    .select()
    .from(workflowVersionsTable)
    .where(and(
      eq(workflowVersionsTable.workflowId, workflowId),
      eq(workflowVersionsTable.versionNumber, versionNumber),
    ));
  if (!version) { res.status(404).json({ error: "version_not_found" }); return; }

  // Restore nodes and edges from the chosen version (include userId for safety)
  const [restored] = await db.update(workflowsTable)
    .set({ nodes: version.nodesJson as object, edges: version.edgesJson as object })
    .where(and(eq(workflowsTable.id, workflowId), eq(workflowsTable.userId, req.userId)))
    .returning();

  // Save a new version marking the restore
  const [maxRow] = await db
    .select({ maxVer: max(workflowVersionsTable.versionNumber) })
    .from(workflowVersionsTable)
    .where(eq(workflowVersionsTable.workflowId, workflowId));
  const nextVersion = (maxRow?.maxVer ?? 0) + 1;

  await db.insert(workflowVersionsTable).values({
    workflowId,
    versionNumber: nextVersion,
    nodesJson: version.nodesJson as object,
    edgesJson: version.edgesJson as object,
    createdBy: req.userId,
    changelog: `Restored from v${versionNumber}`,
  });

  res.json({ success: true, workflow: restored, restoredFromVersion: versionNumber });
});

export default router;
