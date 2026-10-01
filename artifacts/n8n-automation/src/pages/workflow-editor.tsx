import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { LiveExecutionLog } from "@/components/live-execution-log";
import { AiGenerateModal } from "@/components/ai-generate-modal";
import { Link, useLocation } from "wouter";
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  useGetWorkflow,
  useCreateWorkflow,
  useUpdateWorkflow,
  useExecuteWorkflow,
  useListNodeTypes,
  useListCredentials,
  getGetWorkflowQueryKey,
  getListNodeTypesQueryKey,
  getListCredentialsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Play, Save, X, Plus,
  Globe, Mail, MessageSquare, Database, Code2,
  Filter, GitBranch, Timer, Variable, FileJson,
  Clock, Webhook, Activity, Zap, Copy, CheckCheck, KeyRound, Sparkles,
  History, RotateCcw, ChevronRight, Download, AlertTriangle
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  Globe, Mail, MessageSquare, Database, Code2,
  Filter, GitBranch, Timer, Variable, FileJson,
  Clock, Webhook, Activity, Zap, Play,
};

const NODE_COLORS_MAP: Record<string, string> = {
  schedule: "#8b5cf6",
  webhook: "#6366f1",
  http_request: "#3b82f6",
  send_email: "#06b6d4",
  slack_message: "#10b981",
  transform: "#f59e0b",
  filter: "#f97316",
  delay: "#94a3b8",
  approval: "#f97316",
  database_query: "#0ea5e9",
  ai_prompt: "#a855f7",
  set_variable: "#64748b",
  loop: "#ec4899",
  merge: "#14b8a6",
};

function AutomationNode({ data }: NodeProps) {
  const Icon = ICON_MAP[data.icon as string] ?? Zap;
  return (
    <div
      className="bg-card border-2 rounded-xl px-4 py-3 min-w-[160px] shadow-lg transition-all"
      style={{ borderColor: data.color as string ?? "#f97316" }}
    >
      <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, background: data.color as string ?? "#f97316", border: "2px solid hsl(222 47% 10%)" }} />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg" style={{ background: `${data.color as string}20` }}>
          <Icon className="w-4 h-4" style={{ color: data.color as string }} />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground leading-tight">{data.label as string}</p>
          <p className="text-[10px] text-muted-foreground capitalize">{String(data.nodeType ?? "").replace(/_/g, " ")}</p>
        </div>
      </div>
      {data.nodeType === "if_else" ? <>
        <Handle id="true" type="source" position={Position.Right} style={{ top: "30%", background: "#22c55e" }} />
        <Handle id="false" type="source" position={Position.Right} style={{ top: "75%", background: "#ef4444" }} />
        <div className="mt-2 flex justify-between text-[10px]"><span className="text-green-400">True</span><span className="text-red-400">False</span></div>
      </> : <Handle type="source" position={Position.Right} style={{ width: 10, height: 10, background: data.color as string ?? "#f97316", border: "2px solid hsl(222 47% 10%)" }} />}
    </div>
  );
}

const nodeTypes: NodeTypes = { automation: AutomationNode };

let idCounter = 100;
function nextId() { return `node-${++idCounter}`; }

// ── Node Config Panel ─────────────────────────────────────────────────────────

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  options,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "select" | "textarea" | "password";
  placeholder?: string;
  options?: string[];
  rows?: number;
}) {
  const base = "mt-1 w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";
  return (
    <div>
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      {type === "select" && options ? (
        <select value={value} onChange={e => onChange(e.target.value)} className={base}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className={`${base} resize-none font-mono`} rows={rows ?? 4} />
      ) : (
        <input type={type === "password" ? "password" : "text"} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} className={base} />
      )}
    </div>
  );
}

function CredentialSelect({
  label,
  credType,
  value,
  onChange,
  credentials,
}: {
  label: string;
  credType: string;
  value: string;
  onChange: (v: string) => void;
  credentials: Array<{ id: number; name: string; credentialType: string }>;
}) {
  const matching = credentials.filter(c => c.credentialType === credType);
  return (
    <div>
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      {matching.length === 0 ? (
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2.5 py-2">
          <KeyRound className="w-3 h-3 flex-shrink-0" />
          <span>No credentials found. <Link href="/credentials" className="underline">Add one →</Link></span>
        </div>
      ) : (
        <select value={value} onChange={e => onChange(e.target.value)}
          className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="">— use first available —</option>
          {matching.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      )}
    </div>
  );
}

function NodeConfigFields({
  nodeType,
  config,
  onChange,
  webhookUrl,
  credentials,
}: {
  nodeType: string;
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  webhookUrl?: string;
  credentials: Array<{ id: number; name: string; credentialType: string }>;
}) {
  const [copied, setCopied] = useState(false);

  function copyWebhookUrl() {
    if (webhookUrl) {
      navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const str = (key: string, fallback = "") => String(config[key] ?? fallback);

  switch (nodeType) {
    case "webhook":
      return (
        <div className="space-y-3">
          {webhookUrl ? (
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Webhook URL</label>
              <div className="mt-1 flex items-center gap-1.5">
                <code className="flex-1 bg-background border border-border rounded-lg px-2.5 py-2 text-[10px] font-mono text-emerald-400 overflow-hidden text-ellipsis whitespace-nowrap">
                  {webhookUrl}
                </code>
                <button onClick={copyWebhookUrl} className="flex-shrink-0 p-1.5 rounded-lg border border-border hover:bg-muted transition-colors" title="Copy URL">
                  {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">POST to this URL to trigger your workflow</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Save the workflow to get your webhook URL</p>
          )}
        </div>
      );

    case "schedule":
      return (
        <div className="space-y-3">
          <FieldInput label="Cron Expression" value={str("cron", "0 9 * * *")} onChange={v => onChange("cron", v)} placeholder="0 9 * * *" />
          <div className="text-[10px] text-muted-foreground space-y-1">
            <p className="font-semibold">Presets:</p>
            {[
              ["Every minute", "* * * * *"],
              ["Every hour", "0 * * * *"],
              ["Daily 9am", "0 9 * * *"],
              ["Every Monday", "0 9 * * 1"],
            ].map(([label, expr]) => (
              <button key={expr} onClick={() => onChange("cron", expr)}
                className="mr-2 text-primary hover:underline">{label}</button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Activate the workflow for scheduling to take effect</p>
        </div>
      );

    case "manual":
      return <p className="text-xs text-muted-foreground">Click "Run" in the toolbar to trigger this workflow manually.</p>;

    case "http_request":
      return (
        <div className="space-y-3">
          <FieldInput label="Method" value={str("method", "GET")} onChange={v => onChange("method", v)}
            type="select" options={["GET", "POST", "PUT", "PATCH", "DELETE"]} />
          <FieldInput label="URL" value={str("url")} onChange={v => onChange("url", v)} placeholder="https://api.example.com/data" />
          <FieldInput label='Headers (JSON)' value={str("headers")} onChange={v => onChange("headers", v)}
            type="textarea" placeholder={'{"Authorization": "Bearer {{token}}"}'} rows={3} />
          <FieldInput label="Body (JSON)" value={str("body")} onChange={v => onChange("body", v)}
            type="textarea" placeholder={'{"key": "value"}'} rows={3} />
          <CredentialSelect label="Auth Credential (optional)" credType="http_header" value={str("credentialName")}
            onChange={v => onChange("credentialName", v)} credentials={credentials} />
        </div>
      );

    case "email":
      return (
        <div className="space-y-3">
          <CredentialSelect label="Resend Credential" credType="resend" value={str("credentialName")}
            onChange={v => onChange("credentialName", v)} credentials={credentials} />
          <FieldInput label="To" value={str("to")} onChange={v => onChange("to", v)} placeholder="user@example.com" />
          <FieldInput label="From (optional)" value={str("from")} onChange={v => onChange("from", v)} placeholder="noreply@yourdomain.com" />
          <FieldInput label="Subject" value={str("subject")} onChange={v => onChange("subject", v)} placeholder="Hello from Automation Studio" />
          <FieldInput label="Body" value={str("body")} onChange={v => onChange("body", v)} type="textarea" placeholder="Your message here. Use {{variable}} for dynamic values." rows={4} />
        </div>
      );

    case "slack":
      return (
        <div className="space-y-3">
          <CredentialSelect label="Slack Webhook Credential" credType="slack_webhook" value={str("credentialName")}
            onChange={v => onChange("credentialName", v)} credentials={credentials} />
          <FieldInput label="Channel (optional)" value={str("channel")} onChange={v => onChange("channel", v)} placeholder="#general" />
          <FieldInput label="Message" value={str("message")} onChange={v => onChange("message", v)} type="textarea" placeholder="Hello from your workflow! 🚀" rows={4} />
        </div>
      );

    case "transform":
    case "code":
      return (
        <div className="space-y-3">
          <FieldInput label="JavaScript Code" value={str("code", "const output = input;")} onChange={v => onChange("code", v)}
            type="textarea" placeholder={"const output = { ...input, processed: true };"} rows={6} />
          <p className="text-[10px] text-muted-foreground">Use <code className="bg-muted px-1 rounded">input</code> to access the previous node's output. Set <code className="bg-muted px-1 rounded">output</code> to pass data forward.</p>
        </div>
      );

    case "filter":
      return (
        <div className="space-y-3">
          <FieldInput label="Condition (JS expression)" value={str("condition", "input.value > 0")}
            onChange={v => onChange("condition", v)} placeholder="input.status === 'active'" />
          <p className="text-[10px] text-muted-foreground">If the condition is false, the node is skipped and execution stops.</p>
        </div>
      );

    case "if_else":
      return (
        <div className="space-y-3">
          <FieldInput label="Condition (JS expression)" value={str("condition", "input.value > 0")}
            onChange={v => onChange("condition", v)} placeholder="input.status === 'active'" />
          <p className="text-[10px] text-muted-foreground">Output includes <code className="bg-muted px-1 rounded">branch: "true"</code> or <code className="bg-muted px-1 rounded">branch: "false"</code></p>
        </div>
      );

    case "wait":
    case "delay":
      return (
        <FieldInput label="Duration (ms)" value={str("duration", "1000")} onChange={v => onChange("duration", v)} placeholder="1000" />
      );

    case "set_variable":
      return (
        <div className="space-y-3">
          <FieldInput label="Variable Name" value={str("name")} onChange={v => onChange("name", v)} placeholder="myVar" />
          <FieldInput label="Value" value={str("value")} onChange={v => onChange("value", v)} placeholder="{{input.field}} or static value" />
        </div>
      );

    case "json_parse":
      return (
        <FieldInput label="Input Field Path" value={str("input", "body")} onChange={v => onChange("input", v)} placeholder="body" />
      );

    case "database_query":
      return (
        <FieldInput label="SQL Query" value={str("query")} onChange={v => onChange("query", v)}
          type="textarea" placeholder="SELECT * FROM users WHERE id = '{{input.userId}}'" rows={4} />
      );

    case "approval": {
      const mode = str("approvalMode", "any");
      const modeLabels: Record<string, string> = {
        any: "Any approver (first to respond wins)",
        all: "All must approve (unanimous)",
        sequential: "Sequential (one at a time, in order)",
      };
      return (
        <div className="space-y-3">
          <FieldInput label="Title" value={str("title", "Approval Required")} onChange={v => onChange("title", v)} placeholder="Approval Required" />
          <FieldInput label="Message" value={str("message")} onChange={v => onChange("message", v)}
            type="textarea" placeholder="Please review and approve. Order amount: {{input.amount}}" rows={3} />
          <FieldInput label="Approver Emails (comma-separated)" value={str("approverEmails")}
            onChange={v => onChange("approverEmails", v)} placeholder="manager@co.com, director@co.com" />
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Approval Mode</label>
            <select
              value={mode}
              onChange={e => onChange("approvalMode", e.target.value)}
              className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {Object.entries(modeLabels).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">
              {mode === "any" && "The first approver to click approve/reject determines the outcome."}
              {mode === "all" && "All approvers receive emails simultaneously. Everyone must approve."}
              {mode === "sequential" && "Approvers are emailed one at a time in list order. Each must approve before the next is notified."}
            </p>
          </div>
          <FieldInput label="Deadline (hours)" value={str("deadlineHours", "24")} onChange={v => onChange("deadlineHours", v)} placeholder="24" />
          <CredentialSelect label="Resend Credential (for email)" credType="resend" value={str("credentialName")}
            onChange={v => onChange("credentialName", v)} credentials={credentials} />
        </div>
      );
    }

    default:
      return <p className="text-xs text-muted-foreground">No configuration needed for this node type.</p>;
  }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WorkflowEditor({ id }: { id?: string }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const isNew = !id;
  const numId = id ? parseInt(id, 10) : undefined;

  const { data: workflow, isLoading } = useGetWorkflow(numId!, {
    query: { enabled: !!numId, queryKey: getGetWorkflowQueryKey(numId!) }
  });

  const { data: nodeTypesRaw } = useListNodeTypes({
    query: { queryKey: getListNodeTypesQueryKey() }
  });
  const nodeTypesList = Array.isArray(nodeTypesRaw) ? nodeTypesRaw : [];

  const { data: credentialsRaw } = useListCredentials({
    query: { queryKey: getListCredentialsQueryKey() }
  });
  const credentialsList = Array.isArray(credentialsRaw) ? credentialsRaw : [];

  const [name, setName] = useState("Untitled Workflow");
  const [description, setDescription] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ status: string; message: string } | null>(null);
  const [liveExecutionId, setLiveExecutionId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<Array<{
    id: number; versionNumber: number; createdBy: string; createdAt: string; changelog: string | null; nodeCount: number; edgeCount: number;
  }>>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

  const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  async function loadVersions() {
    if (!numId) return;
    setVersionsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/workflows/${numId}/versions`, { credentials: "include" });
      if (res.ok) setVersions(await res.json());
    } catch { /* ignore */ } finally {
      setVersionsLoading(false);
    }
  }

  async function handleRestore(versionNumber: number) {
    if (!numId) return;
    if (!confirm(`Restore to v${versionNumber}? Your current canvas will be replaced.`)) return;
    setRestoringVersion(versionNumber);
    try {
      const res = await fetch(`${BASE_URL}/api/workflows/${numId}/versions/${versionNumber}/restore`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error("Restore failed");
      const { workflow: restored } = await res.json();
      setNodes((restored.nodes as Array<{ id: string; type: string; label: string; x: number; y: number; config?: Record<string, unknown> }>).map(n => ({
        id: n.id, type: "automation", position: { x: n.x ?? 0, y: n.y ?? 0 },
        data: { label: n.label, nodeType: n.type, color: getNodeColor(n.type), config: n.config ?? {}, icon: getNodeIcon(n.type) },
      })));
      setEdges((restored.edges as Array<{ id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>).map(e => ({
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined,
      })));
      setShowHistory(false);
      await loadVersions();
      toast.success(`Restored to v${versionNumber}`);
    } catch {
      toast.error("Failed to restore version");
    } finally {
      setRestoringVersion(null);
    }
  }
  const [showAiModal, setShowAiModal] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const executeWorkflow = useExecuteWorkflow();

  useEffect(() => {
    if (workflow) {
      setName(workflow.name);
      setDescription(workflow.description ?? "");
      const wfNodes = (workflow.nodes as Array<{
        id: string; type: string; label: string; x: number; y: number; config?: Record<string, unknown>;
      }>) || [];
      const wfEdges = (workflow.edges as Array<{
        id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string;
      }>) || [];

      setNodes(wfNodes.map(n => ({
        id: n.id,
        type: "automation",
        position: { x: n.x, y: n.y },
        data: {
          label: n.label,
          nodeType: n.type,
          config: n.config ?? {},
          color: getNodeColor(n.type),
          icon: getNodeIcon(n.type),
        },
      })));
      setEdges(wfEdges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })));

      if (numId) {
        const key = `import-warnings-${numId}`;
        const stored = sessionStorage.getItem(key);
        if (stored) {
          try { setImportWarnings(JSON.parse(stored)); } catch { /* ignore */ }
          sessionStorage.removeItem(key);
        }
      }
    }
  }, [workflow]);

  function handleExport() {
    const exportData = {
      name,
      description: description || undefined,
      exportedAt: new Date().toISOString(),
      nodes: nodes.map(n => ({
        id: n.id,
        type: (n.data as Record<string, unknown>).nodeType as string,
        label: (n.data as Record<string, unknown>).label as string,
        x: n.position.x,
        y: n.position.y,
        config: (n.data as Record<string, unknown>).config ?? {},
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Workflow exported");
  }

  function getNodeColor(type: string): string {
    const nt = nodeTypesList?.find(n => n.type === type);
    if (nt) return nt.color;
    if (["webhook", "schedule", "manual"].includes(type)) return "#f97316";
    if (["http_request", "email", "slack"].includes(type)) return "#3b82f6";
    if (["database_query", "transform"].includes(type)) return "#8b5cf6";
    if (["filter", "if_else", "wait"].includes(type)) return "#22c55e";
    return "#64748b";
  }

  function getNodeIcon(type: string): string {
    const nt = nodeTypesList?.find(n => n.type === type);
    if (nt) return nt.icon;
    const iconMap: Record<string, string> = {
      webhook: "Webhook", schedule: "Clock", manual: "Play",
      http_request: "Globe", email: "Mail", slack: "MessageSquare",
      database_query: "Database", transform: "Code2", filter: "Filter",
      if_else: "GitBranch", wait: "Timer", set_variable: "Variable",
      json_parse: "FileJson",
    };
    return iconMap[type] ?? "Zap";
  }

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({ ...connection, id: `edge-${Date.now()}` }, eds));
  }, [setEdges]);

  const onLoadDemoWorkflow = useCallback(() => {
    const demoNodes: Node[] = [
      {
        id: "demo-1", type: "automation", position: { x: 80, y: 160 },
        data: { label: "Webhook Trigger", nodeType: "webhook", color: "#6366f1", icon: "Webhook",
          config: { path: "/order-received", method: "POST" } },
      },
      {
        id: "demo-2", type: "automation", position: { x: 320, y: 160 },
        data: { label: "Filter High-Value", nodeType: "filter", color: "#f97316", icon: "Filter",
          config: { condition: "input.amount > 1000" } },
      },
      {
        id: "demo-3", type: "automation", position: { x: 560, y: 160 },
        data: { label: "Enrich via API", nodeType: "http_request", color: "#3b82f6", icon: "Globe",
          config: { url: "https://api.example.com/enrich", method: "POST",
            body: '{"orderId":"{{input.id}}"}' } },
      },
      {
        id: "demo-4", type: "automation", position: { x: 800, y: 160 },
        data: { label: "Manager Approval", nodeType: "approval", color: "#f97316", icon: "Activity",
          config: { approvers: ["manager@example.com"], deadline: "24h",
            message: "High-value order requires approval: {{input.amount}}" } },
      },
      {
        id: "demo-5", type: "automation", position: { x: 1040, y: 160 },
        data: { label: "Notify Customer", nodeType: "send_email", color: "#06b6d4", icon: "Mail",
          config: { to: "{{input.customerEmail}}", subject: "Your order is confirmed!",
            body: "Order {{input.id}} has been approved and is being processed." } },
      },
    ];
    const demoEdges: Edge[] = [
      { id: "demo-e1", source: "demo-1", target: "demo-2" },
      { id: "demo-e2", source: "demo-2", target: "demo-3" },
      { id: "demo-e3", source: "demo-3", target: "demo-4" },
      { id: "demo-e4", source: "demo-4", target: "demo-5" },
    ];
    setNodes(demoNodes);
    setEdges(demoEdges);
  }, [setNodes, setEdges]);

  const addNodeFromPalette = useCallback((type: string, label: string) => {
    const offset = nodes.length * 30;
    const id = nextId();
    const newNode: Node = {
      id,
      type: "automation",
      position: { x: 120 + offset, y: 120 + offset },
      data: {
        label,
        nodeType: type,
        color: getNodeColor(type),
        icon: getNodeIcon(type),
        config: {},
      },
    };
    setNodes(nds => [...nds, newNode]);
  }, [nodes.length, setNodes]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/reactflow-type");
    const label = event.dataTransfer.getData("application/reactflow-label");
    if (!type || !reactFlowWrapper.current) return;

    const rect = reactFlowWrapper.current.getBoundingClientRect();
    const x = event.clientX - rect.left - 80;
    const y = event.clientY - rect.top - 30;
    const id = nextId();

    const newNode: Node = {
      id,
      type: "automation",
      position: { x, y },
      data: {
        label,
        nodeType: type,
        config: {},
        color: getNodeColor(type),
        icon: getNodeIcon(type),
      },
    };
    setNodes(nds => [...nds, newNode]);
  }, [setNodes, getNodeColor, getNodeIcon]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  function toWorkflowNodes() {
    return nodes.map(n => ({
      id: n.id,
      type: String(n.data.nodeType ?? ""),
      label: String(n.data.label ?? ""),
      x: n.position.x,
      y: n.position.y,
      config: (n.data.config as Record<string, unknown>) ?? {},
    }));
  }

  function toWorkflowEdges() {
    return edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (isNew) {
        const created = await createWorkflow.mutateAsync({
          data: {
            name,
            description: description || undefined,
            nodes: toWorkflowNodes(),
            edges: toWorkflowEdges(),
          },
        });
        navigate(`/workflows/${created.id}`);
      } else {
        await updateWorkflow.mutateAsync({
          id: numId!,
          data: {
            name,
            description: description || undefined,
            nodes: toWorkflowNodes(),
            edges: toWorkflowEdges(),
          },
        });
        qc.invalidateQueries({ queryKey: getGetWorkflowQueryKey(numId!) });
      }
      toast.success("Saved!");
      setRunResult({ status: "success", message: "Saved!" });
      setTimeout(() => setRunResult(null), 2000);
    } catch {
      toast.error("Failed to save");
      setRunResult({ status: "error", message: "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  async function handleRun() {
    if (!numId) {
      setRunResult({ status: "error", message: "Save first before running" });
      return;
    }
    setRunning(true);
    setRunResult(null);
    setLiveExecutionId(null);
    try {
      // Run the current canvas, including changes that have not been saved yet.
      await updateWorkflow.mutateAsync({
        id: numId,
        data: { name, description: description || undefined, nodes: toWorkflowNodes(), edges: toWorkflowEdges() },
      });
      const result = await executeWorkflow.mutateAsync({ id: numId, data: { inputData: {} } });
      // Show live log for this execution (replays buffered events)
      if (result.id) setLiveExecutionId(result.id);
      const rStatus = result.status as string;
      setRunResult({
        status: rStatus === "success" || rStatus === "waiting_approval" ? "success" : "error",
        message: rStatus === "success" ? "Workflow completed!"
          : rStatus === "waiting_approval" ? "Waiting for approval…"
          : `Failed: ${(result as { error?: string }).error ?? "Unknown error"}`,
      });
    } catch {
      setRunResult({ status: "error", message: "Execution failed" });
    } finally {
      setRunning(false);
      qc.invalidateQueries({ queryKey: getGetWorkflowQueryKey(numId) });
    }
  }

  function onApplyAiWorkflow(result: { nodes: Array<{ id: string; nodeType: string; label: string; config?: Record<string, unknown> }>; edges: Array<{ source: string; target: string }> }) {
    const spacing = 250;
    const cols = 3;
    const rfNodes: Node[] = result.nodes.map((n, i) => ({
      id: n.id,
      type: "customNode",
      position: {
        x: 100 + (i % cols) * spacing,
        y: 80 + Math.floor(i / cols) * 160,
      },
      data: {
        label: n.label,
        nodeType: n.nodeType,
        config: n.config ?? {},
        color: NODE_COLORS_MAP[n.nodeType] ?? "#f97316",
      },
    }));
    const rfEdges: Edge[] = result.edges.map((e, i) => ({
      id: `ai-edge-${i}`,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      style: { stroke: "#f97316", strokeWidth: 1.5 },
      animated: true,
    }));
    setNodes(rfNodes);
    setEdges(rfEdges);
  }

  const groupedNodeTypes = nodeTypesList?.reduce((acc, nt) => {
    if (!acc[nt.category]) acc[nt.category] = [];
    acc[nt.category].push(nt);
    return acc;
  }, {} as Record<string, typeof nodeTypesList>) ?? {};

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card flex-shrink-0">
        <Link href="/workflows">
          <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 bg-transparent text-sm font-semibold text-foreground focus:outline-none border-b border-transparent focus:border-border px-1"
          placeholder="Workflow name"
        />
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="hidden lg:block flex-1 bg-transparent text-xs text-muted-foreground focus:outline-none px-1"
          placeholder="Description (optional)"
        />

        {runResult && (
          <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ${
            runResult.status === "success"
              ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
              : "text-red-400 bg-red-400/10 border-red-400/20"
          }`}>
            {runResult.message}
          </div>
        )}

        <button
          onClick={() => setShowAiModal(true)}
          className="inline-flex items-center gap-2 bg-purple-600/15 text-purple-400 border border-purple-500/30 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-purple-600/25 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Generate with AI
        </button>

        <button
          onClick={handleRun}
          disabled={running || saving || !numId}
          className="inline-flex items-center gap-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-emerald-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? (
            <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          Run
        </button>
        {numId && (
          <button
            onClick={() => { setShowHistory(h => !h); if (!showHistory) loadVersions(); }}
            className={`inline-flex items-center gap-2 border text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
              showHistory
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            History
          </button>
        )}
        <button
          onClick={handleExport}
          disabled={nodes.length === 0}
          title="Export workflow as JSON"
          className="inline-flex items-center gap-2 bg-card border border-border text-muted-foreground text-sm font-medium px-3 py-1.5 rounded-lg hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
        <button
          onClick={handleSave}
          disabled={saving || running}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Save
        </button>
      </div>

      {/* Import warning banner */}
      {importWarnings.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-400/10 border-b border-amber-400/20 flex-shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-400 mb-1">Imported workflow — action required</p>
            {importWarnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-400/80">{w}</p>
            ))}
          </div>
          <button
            onClick={() => setImportWarnings([])}
            className="text-amber-400/60 hover:text-amber-400 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — node palette */}
        <div className="w-52 flex-shrink-0 border-r border-border bg-sidebar overflow-y-auto">
          <div className="p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Nodes</p>
            {Object.entries(groupedNodeTypes).map(([category, types]) => (
              <div key={category} className="mb-4">
                <p className="text-[10px] font-medium text-muted-foreground mb-1.5 px-1">{category}</p>
                <div className="space-y-1">
                  {types.map(nt => {
                    const Icon = ICON_MAP[nt.icon] ?? Zap;
                    return (
                      <div
                        key={nt.type}
                        draggable={nt.type !== "database_query"}
                        onDragStart={e => {
                          e.dataTransfer.setData("application/reactflow-type", nt.type);
                          e.dataTransfer.setData("application/reactflow-label", nt.label);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => nt.type !== "database_query" && addNodeFromPalette(nt.type, nt.label)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-sidebar-accent transition-colors"
                        title={nt.type === "database_query" ? "Not implemented in this version" : `${nt.description} (click to add, or drag)`}
                      >
                        <div className="p-1 rounded" style={{ background: `${nt.color}20` }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: nt.color }} />
                        </div>
                        <span className="text-xs text-sidebar-foreground">{nt.label}{nt.type === "database_query" ? " (unavailable)" : ""}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div ref={reactFlowWrapper} className="flex-1 bg-background" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode="Delete"
            className="bg-background"
          >
            <Background color="hsl(220 20% 18%)" gap={20} size={1} />
            <Controls className="!bg-card !border-border" />
            <MiniMap
              className="!bg-card !border-border"
              nodeColor={n => String(n.data?.color ?? "#f97316")}
              maskColor="rgba(0,0,0,0.4)"
            />
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-4">
                <Zap className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Drag nodes from the left panel</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Connect them to build your automation</p>
              <div className="flex items-center gap-2 mt-4 pointer-events-auto">
                <span className="text-xs text-muted-foreground/50">or</span>
                <button
                  onClick={onLoadDemoWorkflow}
                  className="text-xs text-amber-500 hover:text-amber-400 font-medium underline underline-offset-2 transition-colors"
                >
                  Load example order-approval workflow
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live execution log — bottom panel */}
        {liveExecutionId && (
          <div className="absolute bottom-0 left-0 right-0 z-10">
            <LiveExecutionLog
              executionId={liveExecutionId}
              onClose={() => setLiveExecutionId(null)}
            />
          </div>
        )}

        {/* Right panel — node config */}
        {selectedNode && (
          <div className="w-72 flex-shrink-0 border-l border-border bg-card overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Configure Node</p>
                  <p className="text-[10px] text-muted-foreground capitalize mt-0.5">{String(selectedNode.data.nodeType ?? "").replace(/_/g, " ")}</p>
                </div>
                <button onClick={() => setSelectedNode(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Label */}
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Label</label>
                  <input
                    value={String(selectedNode.data.label ?? "")}
                    onChange={e => {
                      setNodes(nds => nds.map(n => n.id === selectedNode.id
                        ? { ...n, data: { ...n.data, label: e.target.value } }
                        : n
                      ));
                      setSelectedNode(s => s ? { ...s, data: { ...s.data, label: e.target.value } } : s);
                    }}
                    className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {/* Per-type config fields */}
                <NodeConfigFields
                  nodeType={String(selectedNode.data.nodeType ?? "")}
                  config={(selectedNode.data.config as Record<string, unknown>) ?? {}}
                  onChange={(key, value) => {
                    const newConfig = { ...(selectedNode.data.config as Record<string, unknown> ?? {}), [key]: value };
                    setNodes(nds => nds.map(n => n.id === selectedNode.id
                      ? { ...n, data: { ...n.data, config: newConfig } }
                      : n
                    ));
                    setSelectedNode(s => s ? { ...s, data: { ...s.data, config: newConfig } } : s);
                  }}
                  webhookUrl={
                    selectedNode.data.nodeType === "webhook" && workflow?.webhookToken
                      ? `${window.location.origin}/api/webhooks/${workflow.webhookToken}`
                      : undefined
                  }
                  credentials={credentialsList.map(c => ({ id: c.id, name: c.name, credentialType: c.credentialType }))}
                />

                <div className="pt-2 border-t border-border">
                  <button
                    onClick={() => {
                      setNodes(nds => nds.filter(n => n.id !== selectedNode.id));
                      setEdges(eds => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
                      setSelectedNode(null);
                    }}
                    className="w-full text-xs text-red-400 border border-red-400/20 bg-red-400/5 hover:bg-red-400/10 py-2 rounded-lg transition-colors"
                  >
                    Delete Node
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Version history panel */}
        {showHistory && (
          <div className="w-72 flex-shrink-0 border-l border-border bg-card overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Version History</span>
              </div>
              <button onClick={() => setShowHistory(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {versionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <History className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-xs text-muted-foreground">No versions yet.</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">Save the workflow to create your first version.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="p-2 space-y-1">
                  {versions.map((v, idx) => (
                    <div key={v.id} className={`rounded-lg border p-3 transition-colors ${idx === 0 ? "border-primary/30 bg-primary/5" : "border-border hover:border-border/80 bg-background"}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-foreground">v{v.versionNumber}</span>
                          {idx === 0 && (
                            <span className="text-[9px] font-semibold bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">current</span>
                          )}
                        </div>
                        {idx !== 0 && (
                          <button
                            onClick={() => handleRestore(v.versionNumber)}
                            disabled={restoringVersion === v.versionNumber}
                            className="flex items-center gap-1 text-[10px] font-medium text-amber-400 hover:text-amber-300 border border-amber-400/20 hover:border-amber-400/40 bg-amber-400/5 hover:bg-amber-400/10 px-2 py-1 rounded transition-colors disabled:opacity-50"
                          >
                            {restoringVersion === v.versionNumber ? (
                              <div className="w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <RotateCcw className="w-2.5 h-2.5" />
                            )}
                            Restore
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-1.5">
                        {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                      </p>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70">
                        <span>{v.nodeCount} node{v.nodeCount !== 1 ? "s" : ""}</span>
                        <span>{v.edgeCount} edge{v.edgeCount !== 1 ? "s" : ""}</span>
                      </div>
                      {v.changelog && (
                        <p className="text-[10px] text-muted-foreground mt-1.5 italic truncate" title={v.changelog}>
                          {v.changelog}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground/50 text-center pb-4">Last 20 versions kept</p>
              </div>
            )}
          </div>
        )}
      </div>

      {showAiModal && (
        <AiGenerateModal
          onClose={() => setShowAiModal(false)}
          onApply={onApplyAiWorkflow}
        />
      )}
    </div>
  );
}
