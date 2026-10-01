import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useListWorkflows, useDeleteWorkflow, useToggleWorkflow, getListWorkflowsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Trash2, Edit, CheckCircle2, XCircle, Activity, Clock, ToggleLeft, ToggleRight, Upload } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
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

export default function Workflows() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const { data: workflowsRaw, isLoading } = useListWorkflows(
    { search: search || undefined, status: statusFilter },
    { query: { queryKey: getListWorkflowsQueryKey({ search: search || undefined, status: statusFilter }) } }
  );
  const workflows = Array.isArray(workflowsRaw) ? workflowsRaw : [];

  const deleteWorkflow = useDeleteWorkflow({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListWorkflowsQueryKey() }),
    }
  });

  const toggleWorkflow = useToggleWorkflow({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListWorkflowsQueryKey() }),
    }
  });

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Delete workflow "${name}"?`)) {
      deleteWorkflow.mutate({ id });
    }
  };

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (file.size > 1_000_000) {
      toast.error("File too large. Maximum size is 1MB.");
      return;
    }

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      toast.error("Invalid JSON file. Please check the file and try again.");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch(`/api/workflows/import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });

      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        // response wasn't JSON — treat as generic failure
      }

      if (!res.ok) {
        const msg = (data?.message as string) ?? `Import failed (${res.status})`;
        toast.error(msg);
        return;
      }

      const warnings: string[] = [];
      const importWarnings = data.importWarnings as { credentialsStripped?: boolean; unknownNodeTypes?: string[] } | undefined;
      if (importWarnings?.credentialsStripped) {
        warnings.push("Credential fields were removed — reconfigure them in the editor.");
      }
      if ((importWarnings?.unknownNodeTypes?.length ?? 0) > 0) {
        warnings.push(`Unknown node types were imported as-is: ${importWarnings!.unknownNodeTypes!.join(", ")}`);
      }

      if (warnings.length > 0) {
        sessionStorage.setItem(`import-warnings-${data.id}`, JSON.stringify(warnings));
      }

      await qc.invalidateQueries({ queryKey: getListWorkflowsQueryKey() });
      toast.success(`"${data.name}" imported successfully`);
      navigate(`/workflows/${data.id}`);
    } catch {
      toast.error("Failed to import workflow. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your automation pipelines</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-2 bg-card border border-border text-muted-foreground text-sm font-medium px-4 py-2 rounded-lg hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? (
              <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Import
          </button>
          <Link href="/workflows/new">
            <button className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" />
              New Workflow
            </button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search workflows..."
            className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["all", "active", "inactive"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-xs font-medium transition-colors capitalize ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : workflows?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
              <Activity className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No workflows found</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first workflow to get started</p>
            <Link href="/workflows/new">
              <button className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" /> Create Workflow
              </button>
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Name</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Last Run</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Runs</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows?.map(wf => (
                <tr key={wf.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/workflows/${wf.id}`}>
                      <p className="text-sm font-medium text-foreground hover:text-primary transition-colors cursor-pointer">{wf.name}</p>
                    </Link>
                    {wf.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{wf.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleWorkflow.mutate({ id: wf.id })}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title={wf.active ? "Deactivate" : "Activate"}
                      >
                        {wf.active ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                      <span className={`text-xs font-medium ${wf.active ? "text-primary" : "text-muted-foreground"}`}>
                        {wf.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      {wf.lastRunStatus ? <StatusBadge status={wf.lastRunStatus} /> : <span className="text-xs text-muted-foreground">Never</span>}
                      {wf.lastRunAt && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(wf.lastRunAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-muted-foreground">
                      <span className="text-foreground font-medium">{wf.totalRuns}</span> total
                      <span className="ml-2 text-emerald-400">{wf.successRuns} ok</span>
                      {wf.errorRuns > 0 && <span className="ml-1 text-red-400">{wf.errorRuns} err</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/workflows/${wf.id}`}>
                        <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted" title="Edit">
                          <Edit className="w-4 h-4" />
                        </button>
                      </Link>
                      <button
                        onClick={() => handleDelete(wf.id, wf.name)}
                        className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors rounded-md hover:bg-red-400/10"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
