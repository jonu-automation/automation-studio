import { useEffect, useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Globe, Mail, MessageSquare, Database, Code2,
  Filter, GitBranch, Timer, Variable, FileJson,
  Clock, Webhook, Activity, Zap, Play,
  Sparkles, FileText, Table, MessageCircle, Sheet,
  ClipboardCheck, X, ArrowRight, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const ICON_MAP: Record<string, React.ElementType> = {
  Globe, Mail, MessageSquare, Database, Code2,
  Filter, GitBranch, Timer, Variable, FileJson,
  Clock, Webhook, Activity, Zap, Play,
  Sparkles, FileText, Table, MessageCircle, Sheet,
  ClipboardCheck,
};

const TYPE_COLOR: Record<string, string> = {
  webhook: "#6366f1",
  schedule: "#8b5cf6",
  manual: "#f97316",
  http_request: "#3b82f6",
  email: "#06b6d4",
  slack: "#10b981",
  database_query: "#0ea5e9",
  transform: "#f59e0b",
  code: "#f59e0b",
  filter: "#f97316",
  if_else: "#22c55e",
  wait: "#94a3b8",
  set_variable: "#64748b",
  json_parse: "#64748b",
  google_sheets: "#10b981",
  openai: "#a855f7",
  notion: "#10b981",
  airtable: "#10b981",
  discord: "#10b981",
  approval: "#f97316",
};

const TYPE_ICON: Record<string, string> = {
  webhook: "Webhook",
  schedule: "Clock",
  manual: "Play",
  http_request: "Globe",
  email: "Mail",
  slack: "MessageSquare",
  database_query: "Database",
  transform: "Code2",
  code: "Code2",
  filter: "Filter",
  if_else: "GitBranch",
  wait: "Timer",
  set_variable: "Variable",
  json_parse: "FileJson",
  google_sheets: "Sheet",
  openai: "Sparkles",
  notion: "FileText",
  airtable: "Table",
  discord: "MessageCircle",
  approval: "ClipboardCheck",
};

type RawNode = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
};
type RawEdge = { id: string; source: string; target: string };
type TemplateDetail = {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  nodes: RawNode[];
  edges: RawEdge[];
};

function PreviewNode({ data }: NodeProps) {
  const Icon = ICON_MAP[data.icon as string] ?? Zap;
  const color = (data.color as string) ?? "#f97316";
  return (
    <div
      className="bg-card border-2 rounded-xl px-4 py-3 min-w-[160px] shadow-lg"
      style={{ borderColor: color }}
    >
      <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, background: color, border: "2px solid hsl(222 47% 10%)" }} />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg" style={{ background: `${color}20` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground leading-tight">{data.label as string}</p>
          <p className="text-[10px] text-muted-foreground capitalize">{String(data.nodeType ?? "").replace(/_/g, " ")}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ width: 10, height: 10, background: color, border: "2px solid hsl(222 47% 10%)" }} />
    </div>
  );
}

const previewNodeTypes: NodeTypes = { automation: PreviewNode };

function toFlowNodes(raw: RawNode[]): Node[] {
  return raw.map((n) => {
    const color = TYPE_COLOR[n.type] ?? "#f97316";
    const icon = TYPE_ICON[n.type] ?? "Zap";
    return {
      id: n.id,
      type: "automation",
      position: { x: n.x, y: n.y },
      data: { label: n.label, nodeType: n.type, color, icon, config: n.config },
      draggable: false,
      selectable: false,
      connectable: false,
    };
  });
}

function toFlowEdges(raw: RawEdge[]): Edge[] {
  return raw.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "smoothstep",
    animated: true,
    style: { stroke: "#f97316", strokeWidth: 2 },
  }));
}

type Props = {
  templateId: string;
  onClose: () => void;
};

export function TemplatePreviewModal({ templateId, onClose }: Props) {
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [using, setUsing] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [, setLocation] = useLocation();

  useEffect(() => {
    void load();
  }, [templateId]);

  async function load() {
    try {
      const res = await fetch(`/api/templates/${templateId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      const data: TemplateDetail = await res.json();
      setTemplate(data);
      setNodes(toFlowNodes(data.nodes));
      setEdges(toFlowEdges(data.edges));
    } catch {
      toast.error("Failed to load template preview");
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleUse() {
    if (!template) return;
    setUsing(true);
    try {
      const res = await fetch(`/api/templates/${template.id}/use`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      toast.success(`Created "${template.name}"`);
      setLocation(`/workflows/${data.id}`);
    } catch {
      toast.error("Failed to create workflow from template");
      setUsing(false);
    }
  }

  const onNodesChangeStable = useCallback(onNodesChange, [onNodesChange]);
  const onEdgesChangeStable = useCallback(onEdgesChange, [onEdgesChange]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div className="flex-1 min-w-0 pr-4">
            {loading ? (
              <div className="h-5 bg-muted rounded animate-pulse w-48 mb-2" />
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {template?.category}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{template?.difficulty}</span>
                </div>
                <h2 className="text-lg font-bold text-foreground leading-tight">{template?.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">{template?.description}</p>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Flow preview */}
        <div className="flex-1 min-h-0 relative" style={{ height: "420px" }}>
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChangeStable}
              onEdgesChange={onEdgesChangeStable}
              nodeTypes={previewNodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnDrag={true}
              zoomOnScroll={true}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#1e293b" gap={24} />
            </ReactFlow>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/30">
          {!loading && template && (
            <p className="text-xs text-muted-foreground">
              {template.nodes.length} nodes · {template.edges.length} connections
            </p>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onClose}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
            >
              Close
            </button>
            <button
              onClick={handleUse}
              disabled={using || loading}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {using ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
              ) : (
                <>Use this template <ArrowRight className="w-3.5 h-3.5" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
