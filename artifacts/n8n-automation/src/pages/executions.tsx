import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListExecutions,
  useRetryExecution,
  getListExecutionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Activity, Clock, ArrowRight, RotateCcw, AlertTriangle } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded px-2 py-0.5">
      <CheckCircle2 className="w-3 h-3" /> Success
    </span>
  );
  if (status === "error") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400 bg-red-400/10 border border-red-400/20 rounded px-2 py-0.5">
      <XCircle className="w-3 h-3" /> Failed
    </span>
  );
  if (status === "rejected") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-400 bg-orange-400/10 border border-orange-400/20 rounded px-2 py-0.5">
      <XCircle className="w-3 h-3" /> Rejected
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded px-2 py-0.5 status-pulse">
      <Activity className="w-3 h-3" /> Running
    </span>
  );
}

function RetryButton({ executionId, onRetried }: { executionId: number; onRetried: (newId: number) => void }) {
  const retry = useRetryExecution();

  return (
    <button
      disabled={retry.isPending}
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        retry.mutate(
          { id: executionId },
          {
            onSuccess: data => {
              onRetried(data.id);
            },
          }
        );
      }}
      className="inline-flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 border border-amber-500/30 hover:border-amber-400/50 rounded px-2 py-0.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title="Retry this execution with the same input"
    >
      <RotateCcw className={`w-3 h-3 ${retry.isPending ? "animate-spin" : ""}`} />
      {retry.isPending ? "Retrying…" : "Retry"}
    </button>
  );
}

export default function Executions() {
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error" | "running">("all");
  const [limit, setLimit] = useState(20);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: executionsRaw, isLoading } = useListExecutions(
    { status: statusFilter, limit },
    { query: { queryKey: getListExecutionsQueryKey({ status: statusFilter, limit }) } }
  );
  const executions = Array.isArray(executionsRaw) ? executionsRaw : [];

  const handleRetried = (newId: number) => {
    qc.invalidateQueries({ queryKey: getListExecutionsQueryKey() });
    navigate(`/executions/${newId}`);
  };

  const failedCount = statusFilter === "all"
    ? executions.filter(e => e.status === "error" || (e.status as string) === "rejected").length
    : 0;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Executions</h1>
          <p className="text-sm text-muted-foreground mt-1">History of all workflow runs</p>
        </div>
        {failedCount > 0 && (
          <button
            onClick={() => setStatusFilter("error")}
            className="flex items-center gap-2 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-400/15 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            {failedCount} failed — click to filter
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex rounded-lg border border-border overflow-hidden w-fit">
        {(["all", "success", "error", "running"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-2 text-xs font-medium transition-colors capitalize ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            {s === "error" ? "Failed" : s}
          </button>
        ))}
      </div>

      {statusFilter === "error" && !isLoading && (executions?.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-3">
          <RotateCcw className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-400">
            Click <strong>Retry</strong> on any row to re-run it with its original input data. A new execution will be created.
          </p>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : executions?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
              {statusFilter === "error"
                ? <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                : <Activity className="w-6 h-6 text-muted-foreground" />}
            </div>
            <p className="text-sm font-medium text-foreground">
              {statusFilter === "error" ? "No failed executions" : "No executions found"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {statusFilter === "error" ? "Everything is running smoothly." : "Run a workflow to see results here"}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">ID</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Workflow</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Error</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Started</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Duration</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {executions?.map(ex => (
                  <tr key={ex.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-muted-foreground">#{ex.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{ex.workflowName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ex.status} />
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      {ex.error ? (
                        <p className="text-xs text-red-400 font-mono truncate" title={ex.error}>{ex.error}</p>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(ex.startedAt).toLocaleString()}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground font-mono">
                        {ex.durationMs != null ? `${ex.durationMs}ms` : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(ex.status === "error" || (ex.status as string) === "rejected") && (
                          <RetryButton executionId={ex.id} onRetried={handleRetried} />
                        )}
                        <Link href={`/executions/${ex.id}`}>
                          <button className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                            Details <ArrowRight className="w-3 h-3" />
                          </button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {executions && executions.length === limit && (
              <div className="flex justify-center p-4 border-t border-border">
                <button
                  onClick={() => setLimit(l => l + 20)}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
