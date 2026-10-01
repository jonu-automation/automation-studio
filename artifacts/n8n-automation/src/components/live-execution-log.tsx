import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Clock, Loader2, ChevronDown, ChevronUp, X, ClipboardCheck, Zap } from "lucide-react";

interface ExecutionEvent {
  eventType: string;
  executionId: number;
  timestamp: string;
  nodeId?: string;
  nodeType?: string;
  nodeLabel?: string;
  status?: string;
  durationMs?: number;
  output?: unknown;
  error?: string | null;
}

interface NodeLog {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  status: "running" | "success" | "error" | "skipped" | "waiting_approval";
  durationMs?: number;
  output?: unknown;
  error?: string | null;
  startedAt: string;
}

interface LiveExecutionLogProps {
  executionId: number;
  onClose: () => void;
}

function NodeIcon({ status, nodeType }: { status: string; nodeType: string }) {
  if (nodeType === "approval" && status === "waiting_approval") {
    return <ClipboardCheck className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
  }
  switch (status) {
    case "running":
      return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />;
    case "success":
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
    case "error":
      return <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
    case "skipped":
      return <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />;
    default:
      return <Zap className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />;
  }
}

function OutputPreview({ output }: { output: unknown }) {
  const [expanded, setExpanded] = useState(false);
  if (!output || typeof output !== "object") return null;
  const entries = Object.entries(output as Record<string, unknown>).slice(0, expanded ? 20 : 3);
  const hasMore = Object.keys(output as Record<string, unknown>).length > 3;
  return (
    <div className="mt-1.5 pl-0">
      <div className="bg-black/20 rounded-lg p-2 font-mono text-[10px] space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-1.5">
            <span className="text-primary/80">{k}:</span>
            <span className="text-foreground/60 truncate">{JSON.stringify(v)}</span>
          </div>
        ))}
        {hasMore && !expanded && (
          <button onClick={() => setExpanded(true)} className="text-muted-foreground hover:text-foreground text-[10px]">
            +{Object.keys(output as Record<string, unknown>).length - 3} more…
          </button>
        )}
      </div>
    </div>
  );
}

export function LiveExecutionLog({ executionId, onClose }: LiveExecutionLogProps) {
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [nodeLogs, setNodeLogs] = useState<Map<string, NodeLog>>(new Map());
  const [workflowStatus, setWorkflowStatus] = useState<"running" | "done" | "paused" | "error">("running");
  const [collapsed, setCollapsed] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = `/api/executions/${executionId}/stream`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const event: ExecutionEvent = JSON.parse(e.data);
        setEvents(prev => [...prev, event]);

        if (event.eventType === "node:start" && event.nodeId) {
          setNodeLogs(prev => {
            const updated = new Map(prev);
            updated.set(event.nodeId!, {
              nodeId: event.nodeId!,
              nodeType: event.nodeType ?? "",
              nodeLabel: event.nodeLabel ?? event.nodeId!,
              status: "running",
              startedAt: event.timestamp,
            });
            return updated;
          });
        }

        if (event.eventType === "node:complete" && event.nodeId) {
          setNodeLogs(prev => {
            const updated = new Map(prev);
            const existing = updated.get(event.nodeId!);
            if (existing) {
              updated.set(event.nodeId!, {
                ...existing,
                status: (event.status as NodeLog["status"]) ?? "success",
                durationMs: event.durationMs,
                output: event.output,
                error: event.error,
              });
            }
            return updated;
          });
        }

        if (event.eventType === "workflow:done") {
          setWorkflowStatus(event.status === "success" ? "done" : "error");
          es.close();
        }

        if (event.eventType === "workflow:paused") {
          setWorkflowStatus("paused");
          // Update approval node status
          if (event.nodeId) {
            setNodeLogs(prev => {
              const updated = new Map(prev);
              const existing = updated.get(event.nodeId!);
              if (existing) {
                updated.set(event.nodeId!, { ...existing, status: "waiting_approval" });
              }
              return updated;
            });
          }
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, [executionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [nodeLogs.size]);

  const nodeList = Array.from(nodeLogs.values());
  const hasError = nodeList.some(n => n.status === "error");
  const totalMs = nodeList.reduce((sum, n) => sum + (n.durationMs ?? 0), 0);

  const statusBar = {
    running: { label: "Running…", color: "bg-primary/10 border-primary/20 text-primary" },
    done: { label: hasError ? "Completed with errors" : "Completed", color: hasError ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
    paused: { label: "Waiting for approval", color: "bg-amber-500/10 border-amber-500/20 text-amber-400" },
    error: { label: "Failed", color: "bg-red-500/10 border-red-500/20 text-red-400" },
  }[workflowStatus];

  return (
    <div className="border-t border-border bg-card flex-shrink-0 flex flex-col" style={{ maxHeight: collapsed ? "40px" : "220px", transition: "max-height 0.2s ease" }}>
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-2 border-b border-border flex-shrink-0`}>
        <div className={`flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusBar.color}`}>
          {workflowStatus === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
          {statusBar.label}
          {workflowStatus === "done" && totalMs > 0 && (
            <span className="text-muted-foreground font-normal ml-1">in {totalMs}ms</span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">Execution #{executionId}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setCollapsed(!collapsed)} className="p-1 text-muted-foreground hover:text-foreground rounded">
            {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log entries */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          {nodeList.length === 0 && workflowStatus === "running" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              Starting execution…
            </div>
          )}
          {nodeList.map(node => (
            <div key={node.nodeId} className="group">
              <button
                onClick={() => setExpandedNodes(prev => {
                  const s = new Set(prev);
                  if (s.has(node.nodeId)) s.delete(node.nodeId);
                  else s.add(node.nodeId);
                  return s;
                })}
                className="w-full flex items-center gap-2 text-left hover:bg-muted/30 rounded px-1 py-0.5 transition-colors"
              >
                <NodeIcon status={node.status} nodeType={node.nodeType} />
                <span className="text-xs font-medium text-foreground flex-1 truncate">{node.nodeLabel}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  node.status === "success" ? "text-emerald-400 bg-emerald-400/10"
                  : node.status === "error" ? "text-red-400 bg-red-400/10"
                  : node.status === "skipped" ? "text-muted-foreground bg-muted/30"
                  : node.status === "waiting_approval" ? "text-amber-400 bg-amber-400/10"
                  : "text-primary bg-primary/10"
                }`}>
                  {node.status === "waiting_approval" ? "waiting" : node.status}
                </span>
                {node.durationMs !== undefined && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">{node.durationMs}ms</span>
                )}
                {node.error && <XCircle className="w-3 h-3 text-red-400" />}
              </button>
              {expandedNodes.has(node.nodeId) && (
                <div className="pl-5 pb-1">
                  {node.error && (
                    <p className="text-[11px] text-red-400 bg-red-400/10 rounded p-2 font-mono">{node.error}</p>
                  )}
                  {!!node.output && !node.error && <OutputPreview output={node.output} />}
                  {node.status === "waiting_approval" && (
                    <p className="text-[11px] text-amber-400 bg-amber-400/10 rounded p-2 mt-1">
                      Waiting for human approval. Go to <strong>Approvals</strong> to respond.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
