import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, XCircle, Clock, ClipboardCheck, AlertTriangle, Users, ArrowRight, ChevronDown } from "lucide-react";
import { useListApprovals, useRespondToApproval } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListApprovalsQueryKey } from "@workspace/api-client-react";
import { toast } from "sonner";

const STATUS_CONFIG = {
  pending: { label: "Pending", icon: Clock, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" },
  approved: { label: "Approved", icon: CheckCircle2, color: "text-green-400", bg: "bg-green-400/10 border-green-400/20" },
  rejected: { label: "Rejected", icon: XCircle, color: "text-red-400", bg: "bg-red-400/10 border-red-400/20" },
  expired: { label: "Expired", icon: AlertTriangle, color: "text-muted-foreground", bg: "bg-muted/30 border-border" },
};

const MODE_CONFIG = {
  any: { label: "Any", title: "First to respond wins", icon: Users, color: "text-sky-400 bg-sky-400/10 border-sky-400/20" },
  all: { label: "All", title: "Unanimous approval required", icon: Users, color: "text-violet-400 bg-violet-400/10 border-violet-400/20" },
  sequential: { label: "Sequential", title: "Approved one at a time in order", icon: ArrowRight, color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
};

interface ApproverResponse {
  email: string;
  decision: string;
  respondedAt: string;
  note?: string;
}

interface PendingApprover {
  email: string;
  approveToken: string;
  rejectToken: string;
}

function ApproverProgressRow({
  email,
  response,
  isCurrent,
  idx,
}: {
  email: string;
  response?: ApproverResponse;
  isCurrent?: boolean;
  idx: number;
}) {
  const responded = !!response;
  const approved = response?.decision === "approved";
  const rejected = response?.decision === "rejected";

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs ${
      responded
        ? approved
          ? "border-green-500/20 bg-green-500/5"
          : "border-red-500/20 bg-red-500/5"
        : isCurrent
        ? "border-amber-400/30 bg-amber-400/5"
        : "border-border bg-muted/20"
    }`}>
      <span className="text-[10px] text-muted-foreground w-4 text-center">{idx + 1}</span>
      <span className={`flex-1 truncate ${isCurrent ? "text-amber-400" : "text-muted-foreground"}`}>{email}</span>
      {responded ? (
        approved ? (
          <span className="flex items-center gap-1 text-green-400"><CheckCircle2 className="w-3 h-3" /> Approved</span>
        ) : (
          <span className="flex items-center gap-1 text-red-400"><XCircle className="w-3 h-3" /> Rejected</span>
        )
      ) : isCurrent ? (
        <span className="flex items-center gap-1 text-amber-400"><Clock className="w-3 h-3" /> Awaiting</span>
      ) : (
        <span className="text-muted-foreground/50">Queued</span>
      )}
    </div>
  );
}

function ApprovalCard({ approval, onRespond }: {
  approval: {
    id: number;
    title: string;
    message: string;
    status: string;
    createdAt: string;
    deadlineAt?: string | null;
    deciderEmail?: string | null;
    responseNote?: string | null;
    approverEmails: string[];
    approvalMode?: string | null;
    responses?: ApproverResponse[] | null;
    pendingApprovers?: PendingApprover[] | null;
    currentApproverIdx?: number | null;
    executionId: number;
  };
  onRespond: (id: number, decision: "approved" | "rejected", note?: string) => void;
}) {
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [loading, setLoading] = useState<"approved" | "rejected" | null>(null);
  const cfg = STATUS_CONFIG[approval.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;

  const mode = (approval.approvalMode ?? "any") as keyof typeof MODE_CONFIG;
  const modeCfg = MODE_CONFIG[mode] ?? MODE_CONFIG.any;
  const ModeIcon = modeCfg.icon;
  const responses = approval.responses ?? [];
  const isMultiMode = mode === "all" || mode === "sequential";
  const approvedCount = responses.filter(r => r.decision === "approved").length;
  const totalApprovers = approval.approverEmails.length;
  const currentIdx = approval.currentApproverIdx ?? 0;

  async function handleDecision(decision: "approved" | "rejected") {
    setLoading(decision);
    await onRespond(approval.id, decision, note || undefined);
    setLoading(null);
    setNote("");
    setShowNote(false);
  }

  return (
    <div className={`border rounded-xl p-5 ${cfg.bg}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${cfg.color}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground truncate">{approval.title}</h3>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} flex-shrink-0`}>
                {cfg.label}
              </span>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1 flex-shrink-0 ${modeCfg.color}`}
                title={modeCfg.title}>
                <ModeIcon className="w-2.5 h-2.5" />{modeCfg.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{approval.message}</p>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
              <span>Execution #{approval.executionId}</span>
              <span>Created {formatDistanceToNow(new Date(approval.createdAt), { addSuffix: true })}</span>
              {approval.deadlineAt && approval.status === "pending" && (
                <span className="text-amber-400">
                  Expires {formatDistanceToNow(new Date(approval.deadlineAt), { addSuffix: true })}
                </span>
              )}
              {approval.deciderEmail && (
                <span>by {approval.deciderEmail}</span>
              )}
            </div>
            {approval.responseNote && (
              <p className="mt-2 text-xs text-muted-foreground italic">"{approval.responseNote}"</p>
            )}

            {/* Multi-mode progress summary */}
            {isMultiMode && totalApprovers > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setShowProgress(p => !p)}
                  className="flex items-center gap-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>{approvedCount}/{totalApprovers} approved</span>
                  {mode === "all" && (
                    <div className="flex gap-0.5">
                      {approval.approverEmails.map((email, i) => {
                        const res = responses.find(r => r.email === email);
                        return (
                          <div key={i} className={`w-3 h-1.5 rounded-sm ${
                            res?.decision === "approved" ? "bg-green-400" :
                            res?.decision === "rejected" ? "bg-red-400" : "bg-border"
                          }`} />
                        );
                      })}
                    </div>
                  )}
                  {mode === "sequential" && (
                    <span className="text-amber-400">step {Math.min(currentIdx + 1, totalApprovers)}/{totalApprovers}</span>
                  )}
                  <ChevronDown className={`w-3 h-3 transition-transform ${showProgress ? "rotate-180" : ""}`} />
                </button>

                {showProgress && (
                  <div className="mt-2 space-y-1.5">
                    {approval.approverEmails.map((email, i) => {
                      const response = responses.find(r => r.email === email);
                      const isCurrent = mode === "sequential" && i === currentIdx && approval.status === "pending";
                      return (
                        <ApproverProgressRow
                          key={email}
                          email={email}
                          response={response}
                          isCurrent={isCurrent}
                          idx={i}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {approval.status === "pending" && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowNote(!showNote)}
              className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:border-foreground/30 transition-colors"
            >
              + Note
            </button>
            <button
              disabled={!!loading}
              onClick={() => handleDecision("rejected")}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {loading === "rejected" ? "..." : <><XCircle className="w-3.5 h-3.5" />Reject</>}
            </button>
            <button
              disabled={!!loading}
              onClick={() => handleDecision("approved")}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-50"
            >
              {loading === "approved" ? "..." : <><CheckCircle2 className="w-3.5 h-3.5" />Approve</>}
            </button>
          </div>
        )}
      </div>

      {showNote && approval.status === "pending" && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional note (reason for decision)…"
            className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}
    </div>
  );
}

export default function Approvals() {
  const { data: approvalsRaw, isLoading } = useListApprovals();
  const approvals = Array.isArray(approvalsRaw) ? approvalsRaw : [];
  const respondMutation = useRespondToApproval();
  const qc = useQueryClient();

  const pending = approvals.filter(a => a.status === "pending");
  const resolved = approvals.filter(a => a.status !== "pending");

  async function handleRespond(id: number, decision: "approved" | "rejected", note?: string) {
    try {
      await respondMutation.mutateAsync({ id, data: { decision, responseNote: note } });
      qc.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
      toast.success(`Request ${decision}`);
    } catch {
      toast.error("Failed to respond");
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
          <ClipboardCheck className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Approvals</h1>
          <p className="text-xs text-muted-foreground">Human-in-the-loop decisions for your workflows</p>
        </div>
        {pending.length > 0 && (
          <div className="ml-auto flex items-center gap-2 bg-amber-400/10 border border-amber-400/20 text-amber-400 px-3 py-1.5 rounded-full">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold">{pending.length} pending</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-24">
          <ClipboardCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-sm font-medium text-foreground mb-1">No approval requests yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Add an <span className="font-mono bg-muted px-1 rounded">approval</span> node to your workflow
            to require human sign-off before continuing execution.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Awaiting decision
              </h2>
              <div className="space-y-3">
                {pending.map(a => (
                  <ApprovalCard
                    key={a.id}
                    approval={{
                      ...a,
                      approverEmails: (a.approverEmails as string[]) ?? [],
                      responses: (a as unknown as { responses?: ApproverResponse[] }).responses ?? [],
                      pendingApprovers: (a as unknown as { pendingApprovers?: PendingApprover[] }).pendingApprovers ?? [],
                      approvalMode: (a as unknown as { approvalMode?: string }).approvalMode ?? "any",
                      currentApproverIdx: (a as unknown as { currentApproverIdx?: number }).currentApproverIdx ?? 0,
                    }}
                    onRespond={handleRespond}
                  />
                ))}
              </div>
            </section>
          )}

          {resolved.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Resolved
              </h2>
              <div className="space-y-3">
                {resolved.map(a => (
                  <ApprovalCard
                    key={a.id}
                    approval={{
                      ...a,
                      approverEmails: (a.approverEmails as string[]) ?? [],
                      responses: (a as unknown as { responses?: ApproverResponse[] }).responses ?? [],
                      pendingApprovers: (a as unknown as { pendingApprovers?: PendingApprover[] }).pendingApprovers ?? [],
                      approvalMode: (a as unknown as { approvalMode?: string }).approvalMode ?? "any",
                      currentApproverIdx: (a as unknown as { currentApproverIdx?: number }).currentApproverIdx ?? 0,
                    }}
                    onRespond={handleRespond}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
