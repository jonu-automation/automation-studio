import { Link, useLocation } from "wouter";
import { LayoutDashboard, GitBranch, Activity, Zap, CreditCard, LogOut, User, KeyRound, Cpu, Calculator, ClipboardCheck, Shield, Server, ChevronRight, Bot, LayoutTemplate } from "lucide-react";
import { useClerk, useUser } from "@/lib/auth";
import { useGetAuthMe, useGetBillingUsage, getGetBillingUsageQueryKey } from "@workspace/api-client-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workflows", label: "Workflows", icon: GitBranch },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/executions", label: "Executions", icon: Activity },
  { href: "/approvals", label: "Approvals", icon: ClipboardCheck },
  { href: "/credentials", label: "Credentials", icon: KeyRound },
  { href: "/settings/sso", label: "SSO setup", icon: Shield },
  { href: "/settings/self-host", label: "Hosting guide", icon: Server },
  { href: "/settings/mcp", label: "MCP (experimental)", icon: Bot },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { data: me } = useGetAuthMe();
  const { data: usage } = useGetBillingUsage({ query: { queryKey: getGetBillingUsageQueryKey() } });

  function isActive(href: string) {
    if (href === "/dashboard") return location === "/dashboard" || location === "/";
    return location.startsWith(href);
  }

  const isEditor = location.startsWith("/workflows/") && location !== "/workflows/new" && location !== "/workflows";
  const isNewWorkflow = location === "/workflows/new";
  const isEditorPage = isEditor || isNewWorkflow;

  const isPaidPlan = ["hobby", "pro", "team"].includes(me?.plan ?? "");
  const isPro = me?.plan === "pro" || me?.plan === "team";
  const computeUsed = usage?.computeSecondsUsed ?? 0;
  const computeLimit = usage?.computeSecondsLimit ?? 5000;
  const computePercent = usage?.percentUsed ?? 0;
  const displayName = user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ?? "User";
  const email = user?.emailAddresses?.[0]?.emailAddress ?? "";

  function formatK(n: number) {
    return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {import.meta.env.VITE_LOCAL_MODE === "true" && <div className="fixed bottom-3 right-3 z-50 rounded-md border border-amber-500/30 bg-background px-3 py-2 text-xs text-amber-300">Local workspace · only on this computer</div>}
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold text-sidebar-foreground leading-tight">Automation</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Studio</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}>
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                  {active && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
                </div>
              </Link>
            );
          })}

          <Link href="/billing">
            <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
              location === "/billing"
                ? "bg-primary text-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}>
              <CreditCard className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-medium">{import.meta.env.VITE_LOCAL_MODE === "true" ? "Execution usage" : "Billing"}</span>
              {!isPro && (
                <span className="ml-auto text-[9px] font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">FREE</span>
              )}
              {isPro && import.meta.env.VITE_LOCAL_MODE !== "true" && (
                <span className="ml-auto text-[9px] font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded">PRO</span>
              )}
            </div>
          </Link>
        </nav>

        {/* Compute usage indicator */}
        <div className="px-3 py-3 border-t border-sidebar-border">
          <Link href="/billing">
            <div className="flex items-center justify-between mb-1.5 cursor-pointer group">
              <div className="flex items-center gap-1">
                <Cpu className="w-2.5 h-2.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">Compute</span>
              </div>
              <span className="text-[10px] font-semibold text-foreground">{formatK(computeUsed)}s / {formatK(computeLimit)}s</span>
            </div>
          </Link>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${computePercent > 80 ? "bg-red-500" : computePercent > 60 ? "bg-amber-500" : "bg-primary"}`}
              style={{ width: `${Math.max(computePercent, 2)}%` }}
            />
          </div>
          {computePercent > 80 && (
            <Link href="/billing">
              <p className="text-[10px] text-primary mt-1.5 cursor-pointer hover:underline">Upgrade plan →</p>
            </Link>
          )}
        </div>

        {/* Pricing link */}
        <div className="px-3 pb-1">
          <Link href="/pricing">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent cursor-pointer transition-colors">
              <Calculator className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">Project scope</span>
            </div>
          </Link>
        </div>

        {/* New workflow button */}
        <div className="px-3 pb-2 border-t border-sidebar-border pt-2">
          <Link href="/workflows/new">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent cursor-pointer transition-colors group">
              <div className="w-5 h-5 border border-dashed border-muted-foreground rounded group-hover:border-primary group-hover:text-primary flex items-center justify-center transition-colors">
                <span className="text-xs leading-none">+</span>
              </div>
              <span className="text-xs font-medium">New Workflow</span>
            </div>
          </Link>
        </div>

        {/* User footer */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt={displayName} className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <User className="w-3.5 h-3.5 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">{displayName}</p>
              <p className="text-[10px] text-muted-foreground truncate">{email}</p>
            </div>
            <button
              onClick={() => signOut({ redirectUrl: "/" })}
              disabled={import.meta.env.VITE_LOCAL_MODE === "true"}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <main className={`flex-1 ${isEditorPage ? "overflow-hidden flex flex-col" : "overflow-y-auto"}`}>
        {children}
      </main>
    </div>
  );
}
