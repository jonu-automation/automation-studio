import { Link, useLocation } from "wouter";
import { useGetDashboardStats, useListWorkflows, useListExecutions, useGetExecutionHistory, useToggleWorkflow, useRetryExecution, getListExecutionsQueryKey } from "@workspace/api-client-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, Play, CheckCircle2, XCircle, Zap, TrendingUp, Clock, ArrowRight, ToggleLeft, ToggleRight, RotateCcw, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListWorkflowsQueryKey } from "@workspace/api-client-react";

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${accent ?? "text-foreground"}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${accent ? "bg-primary/10" : "bg-muted"}`}>
          <Icon className={`w-5 h-5 ${accent ?? "text-muted-foreground"}`} />
        </div>
      </div>
    </div>
  );
}

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
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded px-2 py-0.5 status-pulse">
      <Activity className="w-3 h-3" /> Running
    </span>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: workflows } = useListWorkflows({ status: "active" });
  const { data: executions } = useListExecutions({ limit: 5 });
  const { data: failedExecutions } = useListExecutions({ status: "error", limit: 5 });
  const { data: history } = useGetExecutionHistory();
  const toggle = useToggleWorkflow({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListWorkflowsQueryKey() }),
    }
  });
  const retry = useRetryExecution();

  const safeWorkflows = Array.isArray(workflows) ? workflows : [];
  const safeExecutions = Array.isArray(executions) ? executions : [];
  const safeFailedExecutions = Array.isArray(failedExecutions) ? failedExecutions : [];
  const chartData = (Array.isArray(history) ? history : []).map(h => ({
    date: h.date?.slice(5) ?? "",
    Success: h.success,
    Failed: h.error,
  }));

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitor your automation workflows</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Workflows" value={stats?.totalWorkflows ?? 0} icon={Zap} />
        <StatCard label="Active" value={stats?.activeWorkflows ?? 0} icon={Play} accent="text-primary" />
        <StatCard label="Success Rate" value={`${stats?.successRate ?? 0}%`} icon={TrendingUp} accent="text-emerald-400" />
        <StatCard label="Avg Duration" value={`${Math.round((stats?.avgDurationMs ?? 0) / 100) / 10}s`} icon={Clock} sub={`${stats?.executionsToday ?? 0} runs today`} />
      </div>

      {/* Failed Runs Panel — Dead Letter Queue */}
      {safeFailedExecutions.length > 0 && (
        <div className="bg-red-400/5 border border-red-400/20 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-red-400/15">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <h2 className="text-sm font-semibold text-red-400">
                Failed Runs — {safeFailedExecutions.length} need attention
              </h2>
            </div>
            <Link href="/executions?status=error" className="text-xs text-red-400/70 hover:text-red-400 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-red-400/10">
            {safeFailedExecutions.map(ex => (
              <div key={ex.id} className="flex items-center gap-4 px-5 py-3 hover:bg-red-400/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{ex.workflowName}</p>
                  <p className="text-xs text-red-400/80 font-mono truncate mt-0.5" title={ex.error ?? ""}>
                    {ex.error ?? "Unknown error"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground shrink-0">
                  {new Date(ex.startedAt).toLocaleTimeString()}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    disabled={retry.isPending}
                    onClick={() => {
                      retry.mutate(
                        { id: ex.id },
                        {
                          onSuccess: data => {
                            qc.invalidateQueries({ queryKey: getListExecutionsQueryKey() });
                            navigate(`/executions/${data.id}`);
                          },
                        }
                      );
                    }}
                    className="inline-flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 border border-amber-500/30 hover:border-amber-400/50 rounded px-2 py-1 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className={`w-3 h-3 ${retry.isPending ? "animate-spin" : ""}`} />
                    Retry
                  </button>
                  <Link href={`/executions/${ex.id}`}>
                    <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Execution history chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Execution History (30 days)</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 20% 18%)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(210 15% 55%)" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(210 15% 55%)" }} />
                <Tooltip
                  contentStyle={{ background: "hsl(222 40% 10%)", border: "1px solid hsl(220 20% 18%)", borderRadius: "6px", fontSize: "12px" }}
                  labelStyle={{ color: "hsl(210 20% 92%)" }}
                />
                <Area type="monotone" dataKey="Success" stroke="#f97316" fill="url(#successGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="Failed" stroke="#ef4444" fill="url(#errorGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No execution data yet</div>
          )}
        </div>

        {/* Recent executions */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Recent Runs</h2>
            <Link href="/executions" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {safeExecutions.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No executions yet</p>
            )}
            {safeExecutions.map(ex => (
              <Link key={ex.id} href={`/executions/${ex.id}`}>
                <div className="flex items-center gap-3 hover:bg-muted/50 rounded-md p-2 -mx-2 transition-colors cursor-pointer">
                  <StatusBadge status={ex.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{ex.workflowName}</p>
                    <p className="text-xs text-muted-foreground">{ex.durationMs ? `${ex.durationMs}ms` : "—"}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Active workflows */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Active Workflows</h2>
          <Link href="/workflows" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
            All workflows <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-2">
          {safeWorkflows.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No active workflows</p>
              <Link href="/workflows/new">
                <button className="mt-3 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md font-medium hover:bg-primary/90 transition-colors">
                  Create your first workflow
                </button>
              </Link>
            </div>
          )}
          {safeWorkflows.map(wf => (
            <div key={wf.id} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
              <div className="flex-1 min-w-0">
                <Link href={`/workflows/${wf.id}`}>
                  <p className="text-sm font-medium text-foreground hover:text-primary transition-colors cursor-pointer">{wf.name}</p>
                </Link>
                <p className="text-xs text-muted-foreground">{wf.totalRuns} runs · {wf.successRuns} success · {wf.errorRuns} errors</p>
              </div>
              {wf.lastRunStatus && <StatusBadge status={wf.lastRunStatus} />}
              <button
                onClick={() => toggle.mutate({ id: wf.id })}
                className="text-muted-foreground hover:text-primary transition-colors"
                title="Toggle active"
              >
                {wf.active ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
