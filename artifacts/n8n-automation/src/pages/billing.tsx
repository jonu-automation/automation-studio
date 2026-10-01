import { Link } from "wouter";
import {
  CheckCircle2, Zap, Crown, ArrowRight, RefreshCw,
  AlertCircle, Cpu, Clock, Infinity as InfinityIcon, Users, Sparkles
} from "lucide-react";
import {
  useGetAuthMe,
  useGetBillingUsage,
  useCreateCheckoutSession,
  useCreatePortalSession,
  getGetBillingUsageQueryKey,
} from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

const PLANS = [
  {
    key: "free",
    label: "Free",
    price: 0,
    computeSeconds: "5,000",
    computeSecondsRaw: 5000,
    workflows: "5",
    badge: null,
    features: [
      "5,000 compute-seconds / month",
      "5 workflows",
      "All node types",
      "Webhook triggers",
      "Execution history",
    ],
    highlight: false,
    icon: Zap,
    color: "text-muted-foreground",
  },
  {
    key: "hobby",
    label: "Hobby",
    price: 12,
    computeSeconds: "50,000",
    computeSecondsRaw: 50000,
    workflows: "20",
    badge: "Most popular",
    features: [
      "50,000 compute-seconds / month",
      "20 workflows",
      "Cron scheduling",
      "Email & Slack integrations",
      "Priority support",
    ],
    highlight: true,
    icon: Sparkles,
    color: "text-primary",
  },
  {
    key: "pro",
    label: "Pro",
    price: 39,
    computeSeconds: "500,000",
    computeSecondsRaw: 500000,
    workflows: "Unlimited",
    badge: "Best value",
    features: [
      "500,000 compute-seconds / month",
      "Unlimited workflows",
      "Human-in-the-loop approvals",
      "SSO / OAuth2",
      "AI workflow generator",
    ],
    highlight: false,
    icon: Crown,
    color: "text-amber-400",
  },
  {
    key: "team",
    label: "Team",
    price: 99,
    computeSeconds: "5,000,000",
    computeSecondsRaw: 5000000,
    workflows: "Unlimited",
    badge: null,
    features: [
      "5,000,000 compute-seconds / month",
      "Unlimited workflows",
      "Audit logs & Git sync",
      "SAML / Enterprise SSO",
      "Dedicated support",
    ],
    highlight: false,
    icon: Users,
    color: "text-violet-400",
  },
];

function formatSeconds(s: number) {
  if (s >= 1_000_000) return `${(s / 1_000_000).toFixed(1)}M`;
  if (s >= 1_000) return `${(s / 1_000).toFixed(0)}k`;
  return String(s);
}

export default function Billing() {
  const [location] = useLocation();
  const { data: me, isLoading, refetch } = useGetAuthMe();
  const { data: usage, isLoading: usageLoading } = useGetBillingUsage({
    query: { queryKey: getGetBillingUsageQueryKey() },
  });
  const checkoutMutation = useCreateCheckoutSession();
  const portalMutation = useCreatePortalSession();
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const currentPlan = me?.plan ?? "free";
  const isPaidPlan = ["hobby", "pro", "team"].includes(currentPlan);

  const computeSecondsUsed = usage?.computeSecondsUsed ?? 0;
  const computeSecondsLimit = usage?.computeSecondsLimit ?? 5000;
  const percentUsed = usage?.percentUsed ?? 0;
  const resetAt = usage?.resetAt ? new Date(usage.resetAt) : null;

  useEffect(() => {
    if (location.includes("success=1")) {
      setStatusMsg({ type: "success", text: "Payment successful! Your plan has been upgraded." });
      refetch();
    } else if (location.includes("canceled=1")) {
      setStatusMsg({ type: "error", text: "Payment was canceled. No charges were made." });
    }
  }, [location, refetch]);

  async function handleUpgrade(planKey: string) {
    try {
      const result = await checkoutMutation.mutateAsync({
        data: { planKey: planKey as "hobby" | "pro" | "team" },
      });
      if (result.url) window.location.href = result.url;
    } catch {
      setStatusMsg({ type: "error", text: "Failed to start checkout. Please try again." });
    }
  }

  async function handlePortal() {
    try {
      const result = await portalMutation.mutateAsync();
      if (result.url) window.location.href = result.url;
    } catch {
      setStatusMsg({ type: "error", text: "Failed to open billing portal. Please try again." });
    }
  }

  if (isLoading || usageLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (import.meta.env.VITE_LOCAL_MODE === "true") {
    return <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Execution usage</h1>
      <p className="text-muted-foreground">Local portfolio workspace. No subscription payments are enabled here.</p>
      <div className="bg-card border border-border rounded-xl p-6"><h2 className="font-semibold mb-2">Recorded execution time</h2><p className="text-3xl font-bold">{computeSecondsUsed.toFixed(2)} seconds</p><p className="text-sm text-muted-foreground mt-3">Execution metrics help inspect workflow activity. They are not an invoice. External services have their own limits and charges.</p></div>
    </div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Billing & Plan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Billed by actual compute time — idle time, delays, and waiting for webhooks are free
        </p>
      </div>

      {/* Status message */}
      {statusMsg && (
        <div className={`flex items-center gap-2 p-3 rounded-lg mb-5 text-sm ${
          statusMsg.type === "success"
            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
            : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
        }`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {statusMsg.text}
        </div>
      )}

      {/* Compute-time usage card */}
      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <Cpu className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Compute-Time Usage</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Current plan: <span className="font-semibold text-foreground capitalize">{currentPlan}</span>
                {usage?.price !== undefined && usage.price > 0 && ` · $${usage.price}/mo`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-foreground tabular-nums">
              {formatSeconds(computeSecondsUsed)}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}/ {computeSecondsLimit === null ? "∞" : formatSeconds(computeSecondsLimit)} sec
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{percentUsed}% used</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-3 bg-muted rounded-full overflow-hidden mb-3">
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${
              percentUsed > 90 ? "bg-red-500" :
              percentUsed > 70 ? "bg-amber-500" :
              "bg-primary"
            }`}
            style={{ width: `${Math.max(percentUsed, 0.5)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>
              {resetAt
                ? `Resets ${resetAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                : "Resets monthly"}
            </span>
          </div>
          <span>{usage?.runsThisMonth ?? 0} workflow runs this month</span>
        </div>

        {percentUsed > 80 && computeSecondsLimit !== null && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2 text-xs text-amber-400">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              You're using {percentUsed}% of your monthly compute budget.
              Upgrade to avoid disruptions at month end.
            </span>
          </div>
        )}
      </div>

      {/* What is compute-time billing */}
      <div className="bg-muted/30 border border-border rounded-xl p-5 mb-8">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">How compute-time billing works</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: Cpu,
              title: "Only real work counts",
              desc: "Billing starts when a node executes code. HTTP calls, email sending, Slack messages — that's compute time."
            },
            {
              icon: Clock,
              title: "Idle time is always free",
              desc: "Waiting for webhooks, cron triggers, human approvals, or delays? Zero charge. We never bill for waiting."
            },
            {
              icon: RefreshCw,
              title: "Retries don't cost extra",
              desc: "If a node fails and you retry it, you're only charged for the nodes that actually ran again, not the full workflow."
            }
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3">
              <div className="p-1.5 h-fit bg-primary/10 rounded-lg flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-foreground mb-4">Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.key;
            const Icon = plan.icon;
            return (
              <div
                key={plan.key}
                className={`relative bg-card rounded-xl p-5 border transition-colors ${
                  plan.highlight
                    ? "border-primary shadow-lg shadow-primary/10"
                    : isCurrent
                    ? "border-border bg-muted/30"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`w-4 h-4 ${plan.color}`} />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{plan.label}</span>
                </div>

                <div className="mb-1">
                  <span className="text-2xl font-bold text-foreground">${plan.price}</span>
                  <span className="text-xs text-muted-foreground"> /mo</span>
                </div>
                <p className="text-[10px] text-muted-foreground mb-4">
                  {plan.computeSeconds} compute-sec/mo
                </p>

                <ul className="space-y-2 mb-5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] text-foreground">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="w-full py-1.5 text-center border border-border rounded-lg text-xs text-muted-foreground">
                    Current plan
                  </div>
                ) : plan.key === "free" ? null : (
                  <button
                    onClick={() => handleUpgrade(plan.key)}
                    disabled={checkoutMutation.isPending}
                    className={`w-full py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                      plan.highlight
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border border-primary text-primary hover:bg-primary/10"
                    } disabled:opacity-50`}
                  >
                    {checkoutMutation.isPending ? (
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>Upgrade <ArrowRight className="w-3 h-3" /></>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Manage subscription (paid plans) */}
      {isPaidPlan && (
        <div className="bg-card border border-border rounded-xl p-5 mb-8">
          <p className="text-sm font-semibold text-foreground mb-1">Manage subscription</p>
          <p className="text-xs text-muted-foreground mb-4">
            Update payment method, view invoices, or cancel your subscription.
          </p>
          <button
            className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors font-medium disabled:opacity-60"
            onClick={handlePortal}
            disabled={portalMutation.isPending}
          >
            {portalMutation.isPending ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Opening portal…
              </>
            ) : (
              <>Open billing portal <ArrowRight className="w-3.5 h-3.5" /></>
            )}
          </button>
        </div>
      )}

      {/* Link to pricing calculator */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-xl p-5 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">See how much you'd save vs Zapier & n8n</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Interactive calculator — enter your usage to see the exact cost difference
          </p>
        </div>
        <Link href="/pricing">
          <button className="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
            View calculator <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </Link>
      </div>

      <div className="pt-4 border-t border-border">
        <Link href="/dashboard">
          <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            ← Back to dashboard
          </span>
        </Link>
      </div>
    </div>
  );
}
