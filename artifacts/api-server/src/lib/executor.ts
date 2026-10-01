import { eq, and, ilike, sql as drizzleSql } from "drizzle-orm";
import { db, workflowsTable, executionsTable, credentialsTable, usersTable, approvalRequestsTable } from "@workspace/db";
import { logger } from "./logger";
import type { Workflow } from "@workspace/db";
import { Resend } from "resend";
import { randomBytes } from "crypto";
import { emitExecutionEvent } from "./executionEvents";

import { buildExecutionOrder, inputForNode } from "./graph";
import { evaluate } from "./evaluate";
import { openCredential } from "./vault";

// These node types represent idle/wait time and are excluded from compute billing
const IDLE_NODE_TYPES = new Set(["wait", "delay", "manual", "webhook", "schedule", "approval"]);

export interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  config?: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface NodeResult {
  nodeId: string;
  nodeType: string;
  status: "success" | "error" | "skipped" | "waiting_approval";
  output: Record<string, unknown> | null;
  error: string | null;
  durationMs: number;
  retries?: number;
}

// Node types that benefit from retry (transient failures expected)
const RETRYABLE_NODE_TYPES = new Set([
  "http_request", "email", "slack", "google_sheets", "openai", "notion", "airtable", "discord",
]);
const MAX_RETRIES = 3;

async function executeNodeWithRetry(
  node: WorkflowNode,
  inputData: Record<string, unknown>,
  prevOutputs: Map<string, Record<string, unknown>>,
  userId: string,
  executionId: number,
  workflowId: number,
): Promise<NodeResult> {
  if (!RETRYABLE_NODE_TYPES.has(node.type)) {
    return executeNode(node, inputData, prevOutputs, userId, executionId, workflowId);
  }

  let lastResult: NodeResult | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await executeNode(node, inputData, prevOutputs, userId, executionId, workflowId);
    if (result.status !== "error") {
      return attempt > 0 ? { ...result, retries: attempt } : result;
    }
    lastResult = result;
    if (attempt < MAX_RETRIES) {
      // Exponential backoff: 500ms, 1000ms, 2000ms — retries are free (not billed)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
    }
  }
  return { ...lastResult!, retries: MAX_RETRIES };
}

export interface ResumeContext {
  remainingNodeIds: string[];
  prevOutputs: Record<string, Record<string, unknown>>;
  currentInput: Record<string, unknown>;
  completedResults: NodeResult[];
}

// Special signal thrown by approval node to pause execution
class ApprovalPauseSignal {
  constructor(
    public readonly approvalId: number,
    public readonly nodeId: string,
    public readonly resumeContext: ResumeContext,
  ) {}
}

// ── Credential helpers ────────────────────────────────────────────────────────

async function getCredential(
  userId: string,
  credentialType: string,
  name?: string,
): Promise<Record<string, unknown> | null> {
  const conditions = [eq(credentialsTable.userId, userId), eq(credentialsTable.type, credentialType)];
  if (name) conditions.push(ilike(credentialsTable.name, name));
  const q = db
    .select()
    .from(credentialsTable)
    .where(and(...conditions))
    .$dynamic();

  const results = await q.limit(1);
  return results[0]?.data ? openCredential(results[0].data as Record<string, unknown>) : null;
}

// ── Graph traversal ───────────────────────────────────────────────────────────

// ── Expression helpers ────────────────────────────────────────────────────────

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const keys = key.trim().split(".");
    let val: unknown = data;
    for (const k of keys) {
      if (val && typeof val === "object") val = (val as Record<string, unknown>)[k];
      else { val = ""; break; }
    }
    return val == null ? "" : String(val);
  });
}

// ── Node executor ─────────────────────────────────────────────────────────────

async function executeNode(
  node: WorkflowNode,
  inputData: Record<string, unknown>,
  prevOutputs: Map<string, Record<string, unknown>>,
  userId: string,
  executionId: number,
  workflowId: number,
): Promise<NodeResult> {
  const start = Date.now();
  const cfg = node.config ?? {};

  const context: Record<string, unknown> = {
    ...inputData,
    $input: inputData,
    $nodes: Object.fromEntries(prevOutputs),
  };

  try {
    let output: Record<string, unknown> = {};

    switch (node.type) {
      // ── Triggers ────────────────────────────────────────────────────────────
      case "manual":
        output = { triggered: true, timestamp: new Date().toISOString(), data: inputData };
        break;

      case "webhook":
        output = {
          triggered: true,
          method: cfg.method ?? "POST",
          timestamp: new Date().toISOString(),
          data: inputData,
        };
        break;

      case "schedule":
        output = {
          triggered: true,
          cron: cfg.cron ?? "* * * * *",
          timestamp: new Date().toISOString(),
        };
        break;

      // ── Human-in-the-loop Approval ──────────────────────────────────────────
      case "approval": {
        const title = interpolate(String(cfg.title ?? "Approval Required"), context);
        const message = interpolate(String(cfg.message ?? "Please review and approve or reject this workflow step."), context);
        const approverEmailsRaw = cfg.approverEmails ?? cfg.approvers ?? "";
        const approverEmails = typeof approverEmailsRaw === "string"
          ? approverEmailsRaw.split(",").map(e => e.trim()).filter(Boolean)
          : Array.isArray(approverEmailsRaw) ? approverEmailsRaw as string[] : [];

        // "any" = first to respond wins; "all" = everyone must approve; "sequential" = one at a time
        const approvalMode = String(cfg.approvalMode ?? cfg.mode ?? "any");

        const deadlineHours = Number(cfg.deadlineHours ?? 24);
        const deadlineAt = new Date(Date.now() + deadlineHours * 60 * 60 * 1000);

        // For "any" mode: one shared token pair
        // For "all" / "sequential": per-approver tokens so we know who responded
        const sharedApproveToken = randomBytes(32).toString("hex");
        const sharedRejectToken = randomBytes(32).toString("hex");
        const pendingApprovers = approvalMode !== "any"
          ? approverEmails.map(email => ({
              email,
              approveToken: randomBytes(32).toString("hex"),
              rejectToken: randomBytes(32).toString("hex"),
            }))
          : [];

        const [approval] = await db.insert(approvalRequestsTable).values({
          executionId,
          nodeId: node.id,
          workflowId,
          userId,
          title,
          message,
          approverEmails,
          deadlineAt,
          status: "pending",
          approveToken: sharedApproveToken,
          rejectToken: sharedRejectToken,
          approvalMode,
          pendingApprovers,
          responses: [],
          currentApproverIdx: 0,
        }).returning();

        // Send notification emails
        const credName = cfg.credentialName ? String(cfg.credentialName) : undefined;
        const resendCred = await getCredential(userId, "resend", credName);
        if (resendCred?.apiKey && approverEmails.length > 0) {
          try {
            const resend = new Resend(String(resendCred.apiKey));
            const baseUrl = process.env.REPLIT_DEV_DOMAIN
              ? `https://${process.env.REPLIT_DEV_DOMAIN}`
              : "http://localhost:8080";
            const fromAddress = String(resendCred.defaultFrom ?? "Automation Studio <onboarding@resend.dev>");

            if (approvalMode === "any") {
              // Shared token — email all at once
              const approveUrl = `${baseUrl}/api/approvals/${approval.id}/quick?token=${sharedApproveToken}&action=approve`;
              const rejectUrl = `${baseUrl}/api/approvals/${approval.id}/quick?token=${sharedRejectToken}&action=reject`;
              await resend.emails.send({
                from: fromAddress,
                to: approverEmails,
                subject: `Action Required: ${title}`,
                text: `${message}\n\nApprove: ${approveUrl}\nReject: ${rejectUrl}\n\nThis request expires in ${deadlineHours} hours.`,
              });
            } else if (approvalMode === "all") {
              // Per-approver tokens — email everyone simultaneously
              for (const ap of pendingApprovers) {
                const approveUrl = `${baseUrl}/api/approvals/${approval.id}/quick?token=${ap.approveToken}&action=approve`;
                const rejectUrl = `${baseUrl}/api/approvals/${approval.id}/quick?token=${ap.rejectToken}&action=reject`;
                await resend.emails.send({
                  from: fromAddress,
                  to: [ap.email],
                  subject: `Action Required: ${title}`,
                  text: `${message}\n\nApprove: ${approveUrl}\nReject: ${rejectUrl}\n\nThis request expires in ${deadlineHours} hours. All approvers must approve for the workflow to continue.`,
                });
              }
            } else if (approvalMode === "sequential") {
              // Only email the first approver
              const firstAp = pendingApprovers[0];
              if (firstAp) {
                const approveUrl = `${baseUrl}/api/approvals/${approval.id}/quick?token=${firstAp.approveToken}&action=approve`;
                const rejectUrl = `${baseUrl}/api/approvals/${approval.id}/quick?token=${firstAp.rejectToken}&action=reject`;
                await resend.emails.send({
                  from: fromAddress,
                  to: [firstAp.email],
                  subject: `Action Required: ${title}`,
                  text: `${message}\n\n(Sequential approval — you are approver 1 of ${pendingApprovers.length})\n\nApprove: ${approveUrl}\nReject: ${rejectUrl}\n\nThis request expires in ${deadlineHours} hours.`,
                });
              }
            }
          } catch (emailErr) {
            logger.warn({ emailErr }, "Failed to send approval notification email");
          }
        }

        // Throw pause signal — caught by executeWorkflowLogic
        throw new ApprovalPauseSignal(approval.id, node.id, {
          remainingNodeIds: [], // filled by caller
          prevOutputs: {},
          currentInput: inputData,
          completedResults: [],
        });
      }

      // ── HTTP Request ─────────────────────────────────────────────────────────
      case "http_request": {
        const rawUrl = String(cfg.url ?? "");
        if (!rawUrl) throw new Error("HTTP Request: URL is required");
        const url = interpolate(rawUrl, context);
        const method = String(cfg.method ?? "GET").toUpperCase();

        let headers: Record<string, string> = {};
        if (cfg.headers) {
          const h = typeof cfg.headers === "string" ? JSON.parse(cfg.headers) : cfg.headers;
          headers = h as Record<string, string>;
        }

        if (cfg.credentialName && userId) {
          const cred = await getCredential(userId, "http_header", String(cfg.credentialName));
          if (cred?.headerName && cred?.headerValue) {
            headers[String(cred.headerName)] = String(cred.headerValue);
          }
        }

        let body: string | undefined;
        if (cfg.body && method !== "GET" && method !== "HEAD") {
          const b = typeof cfg.body === "string" ? cfg.body : JSON.stringify(cfg.body);
          body = interpolate(b, context);
          if (!headers["Content-Type"] && !headers["content-type"]) {
            headers["Content-Type"] = "application/json";
          }
        }

        const resp = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(15000) });
        const contentType = resp.headers.get("content-type") ?? "";
        const responseBody = contentType.includes("application/json")
          ? await resp.json()
          : await resp.text();

        output = { status: resp.status, ok: resp.ok, body: responseBody, url, method };
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${JSON.stringify(responseBody).slice(0, 300)}`);
        break;
      }

      // ── Send Email (Resend) ──────────────────────────────────────────────────
      case "send_email":
      case "email": {
        const to = interpolate(String(cfg.to ?? ""), context);
        const subject = interpolate(String(cfg.subject ?? ""), context);
        const body = interpolate(String(cfg.body ?? ""), context);

        if (!to) throw new Error("Send Email: 'to' address is required");

        const credName = cfg.credentialName ? String(cfg.credentialName) : undefined;
        const cred = await getCredential(userId, "resend", credName);

        if (!cred?.apiKey) {
          output = {
            sent: false, simulated: true,
            note: "Add a Resend credential in the Credentials page to send real emails",
            to, subject,
          };
          break;
        }

        const resend = new Resend(String(cred.apiKey));
        const fromAddress = String(cfg.from ?? cred.defaultFrom ?? "Automation Studio <onboarding@resend.dev>");
        const { data, error } = await resend.emails.send({ from: fromAddress, to, subject, text: body });
        if (error) throw new Error(`Resend error: ${error.message}`);

        output = { sent: true, messageId: data?.id, to, subject };
        break;
      }

      // ── Slack Message ────────────────────────────────────────────────────────
      case "slack_message":
      case "slack": {
        const message = interpolate(String(cfg.message ?? ""), context);
        const channel = cfg.channel ? interpolate(String(cfg.channel), context) : undefined;

        const credName = cfg.credentialName ? String(cfg.credentialName) : undefined;
        const cred = await getCredential(userId, "slack_webhook", credName);
        const webhookUrl = cfg.webhookUrl ? String(cfg.webhookUrl) : (cred?.url as string | undefined);

        if (!webhookUrl) {
          output = {
            sent: false, simulated: true,
            note: "Add a Slack Webhook credential in the Credentials page to send real messages",
            message, channel,
          };
          break;
        }

        const payload: Record<string, unknown> = { text: message };
        if (channel) payload.channel = channel;

        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`Slack webhook error: ${text}`);
        }

        output = { sent: true, message, channel };
        break;
      }

      // ── Google Sheets ────────────────────────────────────────────────────────
      case "google_sheets": {
        const credName = cfg.credentialName ? String(cfg.credentialName) : undefined;
        const cred = await getCredential(userId, "google_sheets", credName);
        const accessToken = cred?.accessToken ? String(cred.accessToken) : (cfg.accessToken ? String(cfg.accessToken) : undefined);
        const spreadsheetId = interpolate(String(cfg.spreadsheetId ?? ""), context);
        const range = interpolate(String(cfg.range ?? "Sheet1!A:Z"), context);
        const op = String(cfg.operation ?? "append");

        if (!accessToken) {
          output = { ok: false, simulated: true, note: "Add a google_sheets credential (with accessToken) to call the real Sheets API", op, spreadsheetId, range };
          break;
        }
        if (!spreadsheetId) throw new Error("google_sheets: spreadsheetId is required");

        if (op === "read") {
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
          const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
          const data = await resp.json();
          if (!resp.ok) throw new Error(`Google Sheets read error: ${JSON.stringify(data).slice(0, 300)}`);
          output = { ok: true, op: "read", values: (data as { values?: unknown[][] }).values ?? [] };
        } else {
          const valuesRaw = cfg.values;
          const values = typeof valuesRaw === "string" ? JSON.parse(interpolate(valuesRaw, context)) : valuesRaw;
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
          const resp = await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values: values ?? [] }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(`Google Sheets append error: ${JSON.stringify(data).slice(0, 300)}`);
          output = { ok: true, op: "append", updates: (data as { updates?: unknown }).updates };
        }
        break;
      }

      // ── OpenAI Chat ──────────────────────────────────────────────────────────
      case "ai_prompt":
      case "openai": {
        const credName = cfg.credentialName ? String(cfg.credentialName) : undefined;
        const cred = await getCredential(userId, "openai", credName);
        const apiKey = cred?.apiKey ? String(cred.apiKey) : (cfg.apiKey ? String(cfg.apiKey) : undefined);
        const model = String(cfg.model ?? "gpt-4o-mini");
        const systemPrompt = interpolate(String(cfg.systemPrompt ?? ""), context);
        const userPrompt = interpolate(String(cfg.userPrompt ?? ""), context);
        const temperature = cfg.temperature !== undefined ? Number(cfg.temperature) : 0.7;

        if (!apiKey) {
          output = { ok: false, simulated: true, note: "Add an openai credential (apiKey) to call the real OpenAI API", model, userPrompt };
          break;
        }
        if (!userPrompt) throw new Error("openai: userPrompt is required");

        const messages: Array<{ role: string; content: string }> = [];
        if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
        messages.push({ role: "user", content: userPrompt });

        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages, temperature }),
        });
        const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown; error?: { message?: string } };
        if (!resp.ok) throw new Error(`OpenAI error: ${data.error?.message ?? JSON.stringify(data).slice(0, 300)}`);
        output = { ok: true, model, content: data.choices?.[0]?.message?.content ?? "", usage: data.usage };
        break;
      }

      // ── Notion ───────────────────────────────────────────────────────────────
      case "notion": {
        const credName = cfg.credentialName ? String(cfg.credentialName) : undefined;
        const cred = await getCredential(userId, "notion", credName);
        const token = cred?.token ? String(cred.token) : (cred?.apiKey ? String(cred.apiKey) : (cfg.token ? String(cfg.token) : undefined));
        const databaseId = interpolate(String(cfg.databaseId ?? ""), context);

        if (!token) {
          output = { ok: false, simulated: true, note: "Add a notion credential (token) to call the real Notion API", databaseId };
          break;
        }
        if (!databaseId) throw new Error("notion: databaseId is required");

        const propsRaw = cfg.properties;
        const properties = typeof propsRaw === "string" ? JSON.parse(interpolate(propsRaw, context)) : (propsRaw ?? {});
        const contentText = cfg.content ? interpolate(String(cfg.content), context) : "";
        const children = contentText
          ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: contentText } }] } }]
          : undefined;

        const resp = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
          },
          body: JSON.stringify({ parent: { database_id: databaseId }, properties, ...(children ? { children } : {}) }),
        });
        const data = await resp.json() as { id?: string; url?: string; message?: string };
        if (!resp.ok) throw new Error(`Notion error: ${data.message ?? JSON.stringify(data).slice(0, 300)}`);
        output = { ok: true, pageId: data.id, url: data.url };
        break;
      }

      // ── Airtable ─────────────────────────────────────────────────────────────
      case "airtable": {
        const credName = cfg.credentialName ? String(cfg.credentialName) : undefined;
        const cred = await getCredential(userId, "airtable", credName);
        const apiKey = cred?.apiKey ? String(cred.apiKey) : (cfg.apiKey ? String(cfg.apiKey) : undefined);
        const baseId = interpolate(String(cfg.baseId ?? ""), context);
        const tableName = interpolate(String(cfg.tableName ?? ""), context);

        if (!apiKey) {
          output = { ok: false, simulated: true, note: "Add an airtable credential (apiKey) to call the real Airtable API", baseId, tableName };
          break;
        }
        if (!baseId || !tableName) throw new Error("airtable: baseId and tableName are required");

        const fieldsRaw = cfg.fields;
        const fields = typeof fieldsRaw === "string" ? JSON.parse(interpolate(fieldsRaw, context)) : (fieldsRaw ?? {});
        const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ fields }),
        });
        const data = await resp.json() as { id?: string; error?: { message?: string } };
        if (!resp.ok) throw new Error(`Airtable error: ${data.error?.message ?? JSON.stringify(data).slice(0, 300)}`);
        output = { ok: true, recordId: data.id, fields };
        break;
      }

      // ── Discord ──────────────────────────────────────────────────────────────
      case "discord": {
        const credName = cfg.credentialName ? String(cfg.credentialName) : undefined;
        const cred = await getCredential(userId, "discord_webhook", credName);
        const webhookUrl = cfg.webhookUrl ? String(cfg.webhookUrl) : (cred?.url ? String(cred.url) : undefined);
        const content = interpolate(String(cfg.content ?? ""), context);
        const username = cfg.username ? interpolate(String(cfg.username), context) : undefined;

        if (!webhookUrl) {
          output = { sent: false, simulated: true, note: "Provide a webhookUrl or add a discord_webhook credential", content };
          break;
        }
        if (!content) throw new Error("discord: content is required");

        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, ...(username ? { username } : {}) }),
        });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`Discord webhook error (${resp.status}): ${text.slice(0, 300)}`);
        }
        output = { sent: true, content, username };
        break;
      }

      // ── Data ─────────────────────────────────────────────────────────────────
      case "transform":
      case "code": {
        const code = String(cfg.code ?? "const output = input;");
        output = await evaluate(code, context);
        break;
      }

      case "json_parse": {
        const inputField = String(cfg.input ?? "body");
        const raw = inputField.split(".").reduce<unknown>((acc, k) => {
          if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
          return acc;
        }, context);
        if (typeof raw === "string") {
          try { output = { parsed: JSON.parse(raw) }; }
          catch { throw new Error("json_parse: Invalid JSON string"); }
        } else {
          output = { parsed: raw ?? null };
        }
        break;
      }

      case "set_variable": {
        const varName = String(cfg.name ?? "value");
        const varValue = cfg.value !== undefined ? interpolate(String(cfg.value), context) : null;
        output = { ...context, [varName]: varValue };
        break;
      }

      case "format_json": {
        output = { formatted: JSON.stringify(inputData, null, 2), data: inputData };
        break;
      }

      case "database_query":
        throw new Error("Database Query is not implemented yet. Use an HTTP API integration instead.");

      // ── Logic ─────────────────────────────────────────────────────────────────
      case "filter": {
        const condition = String(cfg.condition ?? "true");
        const passed = Boolean((await evaluate(condition, context, true)).result);
        if (!passed) {
          return {
            nodeId: node.id, nodeType: node.type, status: "skipped",
            output: { passed: false, reason: "Condition not met", condition },
            error: null, durationMs: Date.now() - start,
          };
        }
        output = { passed: true, condition, data: inputData };
        break;
      }

      case "if_else": {
        const condition = String(cfg.condition ?? "true");
        const branch = (await evaluate(condition, context, true)).result ? "true" : "false";
        output = { branch, condition, data: inputData };
        break;
      }

      case "wait":
      case "delay": {
        const ms = Math.min(Number(cfg.duration ?? cfg.ms ?? 100), 5000);
        await new Promise(resolve => setTimeout(resolve, ms));
        output = { waited: true, duration: ms };
        break;
      }

      case "merge": {
        output = { merged: inputData, count: Object.keys(inputData).length };
        break;
      }

      default:
        throw new Error(`Unsupported node type: ${node.type}`);
    }

    if (output.simulated) throw new Error(String(output.note ?? "Integration credentials are missing."));
    return { nodeId: node.id, nodeType: node.type, status: "success", output, error: null, durationMs: Date.now() - start };
  } catch (err) {
    if (err instanceof ApprovalPauseSignal) throw err; // propagate up
    return {
      nodeId: node.id, nodeType: node.type, status: "error", output: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ── Finalise execution (write results, billing, workflow stats) ────────────────

async function finaliseExecution(
  executionRecord: { id: number; userId: string; workflowId: number },
  nodeResults: NodeResult[],
  startedAt: Date,
  status: "success" | "error" | "rejected",
  workflow: Workflow,
  errorMsg?: string,
) {
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const outputData = nodeResults.filter(r => r.status === "success").at(-1)?.output ?? null;
  const billableComputeMs = nodeResults
    .filter(r => !IDLE_NODE_TYPES.has(r.nodeType))
    .reduce((sum, r) => sum + r.durationMs, 0);

  const [updated] = await db.update(executionsTable)
    .set({
      status,
      finishedAt,
      durationMs,
      billableComputeMs,
      nodeResults: nodeResults as unknown as object,
      outputData: outputData as object,
      waitingForApproval: false,
      pausedAtNodeId: null,
      error: errorMsg ?? (status !== "success" ? nodeResults.find(r => r.error)?.error : null),
    })
    .where(eq(executionsTable.id, executionRecord.id))
    .returning();

  await db.update(workflowsTable)
    .set({
      lastRunAt: finishedAt,
      lastRunStatus: status,
      totalRuns: (workflow.totalRuns ?? 0) + 1,
      successRuns: (workflow.successRuns ?? 0) + (status === "success" ? 1 : 0),
      errorRuns: (workflow.errorRuns ?? 0) + (status !== "success" ? 1 : 0),
    })
    .where(eq(workflowsTable.id, workflow.id));

  if (executionRecord.userId) {
    await db.update(usersTable)
      .set({
        computeMsUsed: drizzleSql`
          CASE
            WHEN compute_ms_reset_at < date_trunc('month', NOW() AT TIME ZONE 'UTC')
            THEN ${billableComputeMs}
            ELSE compute_ms_used + ${billableComputeMs}
          END
        `,
        computeMsResetAt: drizzleSql`
          CASE
            WHEN compute_ms_reset_at < date_trunc('month', NOW() AT TIME ZONE 'UTC')
            THEN date_trunc('month', NOW() AT TIME ZONE 'UTC')
            ELSE compute_ms_reset_at
          END
        `,
      })
      .where(eq(usersTable.id, executionRecord.userId));
  }

  emitExecutionEvent({
    eventType: "workflow:done",
    executionId: executionRecord.id,
    timestamp: new Date().toISOString(),
    status,
    durationMs,
  });

  return updated;
}

// ── Run node sequence ─────────────────────────────────────────────────────────

async function runNodeSequence(
  nodesToRun: WorkflowNode[],
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[],
  initialPrevOutputs: Map<string, Record<string, unknown>>,
  initialInput: Record<string, unknown>,
  userId: string,
  executionId: number,
  workflowId: number,
): Promise<
  | { paused: true; signal: ApprovalPauseSignal; nodeResults: NodeResult[]; prevOutputs: Map<string, Record<string, unknown>>; currentInput: Record<string, unknown> }
  | { paused: false; nodeResults: NodeResult[]; hasError: boolean; lastOutput: Record<string, unknown> | null }
> {
  const nodeResults: NodeResult[] = [];
  const prevOutputs = new Map(initialPrevOutputs);
  let hasError = false;
  let currentInput = { ...initialInput };

  for (let i = 0; i < nodesToRun.length; i++) {
    const node = nodesToRun[i];
    const ts = () => new Date().toISOString();

    emitExecutionEvent({
      eventType: "node:start",
      executionId,
      timestamp: ts(),
      nodeId: node.id,
      nodeType: node.type,
      nodeLabel: node.label,
    });

    try {
      const routedInput = inputForNode(node, allNodes, edges, prevOutputs, initialInput);
      const result: NodeResult = routedInput === null
        ? { nodeId: node.id, nodeType: node.type, status: "skipped", output: null, error: null, durationMs: 0 }
        : await executeNodeWithRetry(node, routedInput, prevOutputs, userId, executionId, workflowId);
      nodeResults.push(result);

      emitExecutionEvent({
        eventType: "node:complete",
        executionId,
        timestamp: ts(),
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: node.label,
        status: result.status,
        durationMs: result.durationMs,
        output: result.status !== "error" ? result.output : undefined,
        error: result.error,
        ...(result.retries && result.retries > 0 ? { retries: result.retries } : {}),
      });

      if (result.status === "success" && result.output) {
        prevOutputs.set(node.id, result.output);
        currentInput = result.output;
      } else if (result.status === "error") {
        hasError = true;
      } else if (result.status === "skipped") {
        // Skipped nodes must not activate their downstream branch.
      }
    } catch (err) {
      if (err instanceof ApprovalPauseSignal) {
        const remainingNodeIds = nodesToRun.slice(i + 1).map(n => n.id);
        const signal = new ApprovalPauseSignal(err.approvalId, err.nodeId, {
          remainingNodeIds,
          prevOutputs: Object.fromEntries(prevOutputs),
          currentInput,
          completedResults: nodeResults,
        });

        emitExecutionEvent({
          eventType: "workflow:paused",
          executionId,
          timestamp: ts(),
          nodeId: node.id,
          nodeType: node.type,
          status: "waiting_approval",
        });

        return { paused: true, signal, nodeResults, prevOutputs, currentInput };
      }
      throw err;
    }
  }

  const lastOutput = nodeResults.filter(r => r.status === "success").at(-1)?.output ?? null;
  return { paused: false, nodeResults, hasError, lastOutput };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function executeWorkflowLogic(
  workflow: Workflow,
  inputData: Record<string, unknown>,
  userId = "",
) {
  const startedAt = new Date();
  const nodes = (workflow.nodes as WorkflowNode[]) || [];
  const edges = (workflow.edges as WorkflowEdge[]) || [];

  const [executionRecord] = await db.insert(executionsTable).values({
    userId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: "running",
    nodeResults: [],
    inputData,
  }).returning();

  emitExecutionEvent({
    eventType: "workflow:start",
    executionId: executionRecord.id,
    timestamp: new Date().toISOString(),
    status: "running",
  });

  try {
    const executionOrder = buildExecutionOrder(nodes, edges);

    const result = await runNodeSequence(
      executionOrder,
      nodes,
      edges,
      new Map(),
      inputData,
      userId,
      executionRecord.id,
      workflow.id,
    );

    if (result.paused) {
      const { signal, nodeResults } = result;
      const approvalResult: NodeResult = {
        nodeId: signal.nodeId,
        nodeType: "approval",
        status: "waiting_approval",
        output: { approvalId: signal.approvalId, status: "waiting" },
        error: null,
        durationMs: 0,
      };
      const allResults = [...nodeResults, approvalResult];

      const [pausedRecord] = await db.update(executionsTable)
        .set({
          status: "waiting_approval",
          nodeResults: allResults as unknown as object,
          waitingForApproval: true,
          pausedAtNodeId: signal.nodeId,
          resumeContext: signal.resumeContext as unknown as object,
        })
        .where(eq(executionsTable.id, executionRecord.id)).returning();

      return pausedRecord;
    }

    const finalStatus = result.hasError ? "error" : "success";
    return await finaliseExecution(
      { id: executionRecord.id, userId, workflowId: workflow.id },
      result.nodeResults,
      startedAt,
      finalStatus,
      workflow,
    );
  } catch (err) {
    logger.error({ err, executionId: executionRecord.id }, "Workflow execution failed");
    const [updated] = await db.update(executionsTable)
      .set({
        status: "error",
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(executionsTable.id, executionRecord.id))
      .returning();
    return updated;
  }
}

// ── Resume after approval ─────────────────────────────────────────────────────

// ── Internal types for multi-approver tracking ────────────────────────────────

interface PendingApprover { email: string; approveToken: string; rejectToken: string }
interface ApprovalResponse { email: string; decision: string; respondedAt: string; note?: string }

// ── Shared helper: actually reject a paused execution ─────────────────────────

async function doRejectExecution(
  approvalWorkflowId: number,
  executionId: number,
  executionStartedAt: Date,
  deciderEmail: string,
  responseNote?: string,
) {
  await db.update(executionsTable)
    .set({
      status: "rejected",
      finishedAt: new Date(),
      durationMs: Date.now() - executionStartedAt.getTime(),
      waitingForApproval: false,
      pausedAtNodeId: null,
      error: `Rejected by ${deciderEmail}${responseNote ? `: ${responseNote}` : ""}`,
    })
    .where(eq(executionsTable.id, executionId));

  const [wf] = await db.select().from(workflowsTable).where(eq(workflowsTable.id, approvalWorkflowId));
  if (wf) {
    await db.update(workflowsTable)
      .set({
        lastRunAt: new Date(),
        lastRunStatus: "rejected",
        totalRuns: (wf.totalRuns ?? 0) + 1,
        errorRuns: (wf.errorRuns ?? 0) + 1,
      })
      .where(eq(workflowsTable.id, wf.id));
  }
}

// ── Shared helper: resume workflow after final approval ───────────────────────

async function doResumeExecution(
  approvalId: number,
  approvalNodeId: string,
  approvalWorkflowId: number,
  execution: { id: number; userId: string; startedAt: Date; resumeContext: unknown },
  deciderEmail: string,
  responseNote?: string,
) {
  const [wf] = await db.select().from(workflowsTable).where(eq(workflowsTable.id, approvalWorkflowId));
  if (!wf) throw new Error("Workflow not found");

  const resumeCtx = execution.resumeContext as unknown as ResumeContext;
  if (!resumeCtx) {
    await db.update(executionsTable)
      .set({ status: "success", finishedAt: new Date(), waitingForApproval: false })
      .where(eq(executionsTable.id, execution.id));
    return;
  }

  const allNodes = (wf.nodes as WorkflowNode[]) || [];
  const remainingNodes = resumeCtx.remainingNodeIds
    .map(id => allNodes.find(n => n.id === id))
    .filter((n): n is WorkflowNode => !!n);

  const prevOutputs = new Map(
    Object.entries(resumeCtx.prevOutputs ?? {}) as [string, Record<string, unknown>][]
  );

  const completedResults = (resumeCtx.completedResults ?? []) as NodeResult[];
  const approvalNodeResult: NodeResult = {
    nodeId: approvalNodeId,
    nodeType: "approval",
    status: "success",
    output: { approved: true, deciderEmail, responseNote, approvalId },
    error: null,
    durationMs: 0,
  };

  prevOutputs.set(approvalNodeId, approvalNodeResult.output!);

  await db.update(executionsTable)
    .set({ status: "running", waitingForApproval: false })
    .where(eq(executionsTable.id, execution.id));

  const result = await runNodeSequence(
    remainingNodes, allNodes, (wf.edges as WorkflowEdge[]) ?? [], prevOutputs,
    resumeCtx.currentInput ?? {},
    execution.userId, execution.id, wf.id,
  );

  if (result.paused) {
    const { signal, nodeResults } = result;
    const newApprovalResult: NodeResult = {
      nodeId: signal.nodeId, nodeType: "approval", status: "waiting_approval",
      output: { approvalId: signal.approvalId, status: "waiting" }, error: null, durationMs: 0,
    };
    const allResults = [...completedResults, approvalNodeResult, ...nodeResults, newApprovalResult];
    signal.resumeContext.completedResults = [...completedResults, approvalNodeResult, ...nodeResults];
    await db.update(executionsTable)
      .set({
        status: "waiting_approval",
        nodeResults: allResults as unknown as object,
        waitingForApproval: true,
        pausedAtNodeId: signal.nodeId,
        resumeContext: signal.resumeContext as unknown as object,
      })
      .where(eq(executionsTable.id, execution.id));
    return;
  }

  const allResults = [...completedResults, approvalNodeResult, ...result.nodeResults];
  await finaliseExecution(
    { id: execution.id, userId: execution.userId, workflowId: wf.id },
    allResults, execution.startedAt, result.hasError ? "error" : "success", wf,
  );
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function resumeWorkflowFromApproval(
  approvalId: number,
  decision: "approved" | "rejected",
  deciderEmail: string,
  responseNote?: string,
) {
  const [approval] = await db.select().from(approvalRequestsTable).where(eq(approvalRequestsTable.id, approvalId));
  if (!approval) throw new Error("Approval request not found");
  if (approval.status !== "pending") throw new Error("Approval request already responded to");

  const [execution] = await db.select().from(executionsTable).where(eq(executionsTable.id, approval.executionId));
  if (!execution) throw new Error("Execution not found");

  const mode = approval.approvalMode ?? "any";

  // ── "any" mode: first response wins (original behavior) ──────────────────────
  if (mode === "any") {
    await db.update(approvalRequestsTable)
      .set({
        status: decision === "approved" ? "approved" : "rejected",
        decision, deciderEmail, responseNote: responseNote ?? null, respondedAt: new Date(),
      })
      .where(eq(approvalRequestsTable.id, approvalId));

    if (decision === "rejected") {
      await doRejectExecution(approval.workflowId, execution.id, execution.startedAt, deciderEmail, responseNote);
    } else {
      await doResumeExecution(approvalId, approval.nodeId, approval.workflowId, execution, deciderEmail, responseNote);
    }
    return;
  }

  // ── Multi-approver modes: record individual response ─────────────────────────
  const responses = (approval.responses ?? []) as ApprovalResponse[];
  const allResponses: ApprovalResponse[] = [
    ...responses,
    { email: deciderEmail, decision, respondedAt: new Date().toISOString(), note: responseNote },
  ];

  if (decision === "rejected") {
    // Any rejection immediately rejects the whole workflow
    await db.update(approvalRequestsTable)
      .set({
        status: "rejected", decision, deciderEmail, responseNote: responseNote ?? null,
        respondedAt: new Date(), responses: allResponses as unknown as object,
      })
      .where(eq(approvalRequestsTable.id, approvalId));
    await doRejectExecution(approval.workflowId, execution.id, execution.startedAt, deciderEmail, responseNote);
    return;
  }

  // ── "all" mode: everyone must approve ────────────────────────────────────────
  if (mode === "all") {
    const allEmails = approval.approverEmails as string[];
    const approvedEmails = allResponses.filter(r => r.decision === "approved").map(r => r.email);
    const everyoneApproved = allEmails.every(email => approvedEmails.includes(email));

    await db.update(approvalRequestsTable)
      .set({ responses: allResponses as unknown as object })
      .where(eq(approvalRequestsTable.id, approvalId));

    if (!everyoneApproved) {
      // More approvals still needed — stay pending
      return;
    }

    await db.update(approvalRequestsTable)
      .set({ status: "approved", decision: "approved", deciderEmail, respondedAt: new Date() })
      .where(eq(approvalRequestsTable.id, approvalId));

    await doResumeExecution(approvalId, approval.nodeId, approval.workflowId, execution, deciderEmail, responseNote);
    return;
  }

  // ── "sequential" mode: one approver at a time ────────────────────────────────
  if (mode === "sequential") {
    const pendingApprovers = (approval.pendingApprovers ?? []) as PendingApprover[];
    const nextIdx = (approval.currentApproverIdx ?? 0) + 1;

    await db.update(approvalRequestsTable)
      .set({ responses: allResponses as unknown as object, currentApproverIdx: nextIdx })
      .where(eq(approvalRequestsTable.id, approvalId));

    if (nextIdx < pendingApprovers.length) {
      // Send email to the next approver in sequence
      const nextAp = pendingApprovers[nextIdx];
      try {
        const resendCred = await getCredential(execution.userId, "resend", undefined);
        if (resendCred?.apiKey) {
          const resend = new Resend(String(resendCred.apiKey));
          const baseUrl = process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:8080";
          const approveUrl = `${baseUrl}/api/approvals/${approvalId}/quick?token=${nextAp.approveToken}&action=approve`;
          const rejectUrl = `${baseUrl}/api/approvals/${approvalId}/quick?token=${nextAp.rejectToken}&action=reject`;
          const fromAddress = String(resendCred.defaultFrom ?? "Automation Studio <onboarding@resend.dev>");
          await resend.emails.send({
            from: fromAddress, to: [nextAp.email],
            subject: `Action Required: ${approval.title}`,
            text: `${approval.message}\n\n(Sequential approval — you are approver ${nextIdx + 1} of ${pendingApprovers.length}. ${nextIdx} before you approved.)\n\nApprove: ${approveUrl}\nReject: ${rejectUrl}`,
          });
        }
      } catch (emailErr) {
        logger.warn({ emailErr }, "Failed to send sequential approval email");
      }
      // Stay pending — waiting for next approver
      return;
    }

    // Last approver approved — resume the workflow
    await db.update(approvalRequestsTable)
      .set({ status: "approved", decision: "approved", deciderEmail, respondedAt: new Date() })
      .where(eq(approvalRequestsTable.id, approvalId));

    await doResumeExecution(approvalId, approval.nodeId, approval.workflowId, execution, deciderEmail, responseNote);
    return;
  }
}
