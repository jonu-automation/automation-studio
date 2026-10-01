import { Link, useLocation } from "wouter";
import { useGetExecution, useRetryExecution, getGetExecutionQueryKey, getListExecutionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Activity, ArrowLeft, Clock, MinusCircle, RotateCcw } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-1">
      <CheckCircle2 className="w-4 h-4" /> Success
    </span>
  );
  if (status === "error") return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-1">
      <XCircle className="w-4 h-4" /> Failed
    </span>
  );
  if (status === "skipped") return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted border border-border rounded px-2 py-0.5">
      <MinusCircle className="w-3 h-3" /> Skipped
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-lg px-3 py-1 status-pulse">
      <Activity className="w-4 h-4" /> Running
    </span>
  );
}

export default function ExecutionDetail({ id }: { id: string }) {
  const numId = parseInt(id, 10);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: execution, isLoading, error } = useGetExecution(numId, {
    query: { enabled: !!numId, queryKey: getGetExecutionQueryKey(numId) }
  });
  const retry = useRetryExecution();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !execution) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/executions">
            <button className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-foreground">Execution not found</h1>
        </div>
      </div>
    );
  }

  const nodeResults = execution.nodeResults as Array<{
    nodeId: string;
    nodeType: string;
    status: "success" | "error" | "skipped";
    output: Record<string, unknown> | null;
    error: string | null;
    durationMs: number;
  }>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/executions">
          <button className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Execution #{execution.id}</h1>
          <p className="text-sm text-muted-foreground">{execution.workflowName}</p>
        </div>
        <StatusBadge status={execution.status} />
        {(execution.status === "error" || (execution.status as string) === "rejected") && (
          <button
            disabled={retry.isPending}
            onClick={() => {
              retry.mutate(
                { id: execution.id },
                {
                  onSuccess: data => {
                    qc.invalidateQueries({ queryKey: getListExecutionsQueryKey() });
                    navigate(`/executions/${data.id}`);
                  },
                }
              );
            }}
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RotateCcw className={`w-4 h-4 ${retry.isPending ? "animate-spin" : ""}`} />
            {retry.isPending ? "Retrying…" : "Retry execution"}
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Started</p>
          <p className="text-sm text-foreground mt-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            {new Date(execution.startedAt).toLocaleString()}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Duration</p>
          <p className="text-sm font-mono text-foreground mt-1">
            {execution.durationMs != null ? `${execution.durationMs}ms` : "—"}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Nodes Run</p>
          <p className="text-sm text-foreground mt-1">
            {nodeResults.length} nodes ·{" "}
            <span className="text-emerald-400">{nodeResults.filter(n => n.status === "success").length} ok</span>
            {nodeResults.filter(n => n.status === "error").length > 0 && (
              <span className="text-red-400"> · {nodeResults.filter(n => n.status === "error").length} failed</span>
            )}
          </p>
        </div>
      </div>

      {execution.error && (
        <div className="bg-red-400/5 border border-red-400/20 rounded-lg p-4">
          <p className="text-xs font-medium text-red-400 mb-1">Error</p>
          <p className="text-sm text-red-300 font-mono">{execution.error}</p>
        </div>
      )}

      {/* Node results */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Node Results</h2>
        {nodeResults.length === 0 ? (
          <p className="text-sm text-muted-foreground">No node results recorded.</p>
        ) : (
          nodeResults.map((nr, i) => (
            <div key={nr.nodeId} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <span className="text-xs font-mono text-muted-foreground w-6">{i + 1}</span>
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground capitalize">{nr.nodeType.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground ml-2 font-mono">#{nr.nodeId}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{nr.durationMs}ms</span>
                <StatusBadge status={nr.status} />
              </div>
              {(nr.output || nr.error) && (
                <div className="px-4 py-3">
                  {nr.error && (
                    <p className="text-xs text-red-400 font-mono">{nr.error}</p>
                  )}
                  {nr.output && (
                    <pre className="text-xs text-muted-foreground font-mono overflow-auto max-h-32">
                      {JSON.stringify(nr.output, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
