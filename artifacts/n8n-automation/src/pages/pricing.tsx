import { Link } from "wouter";
export default function Pricing() {
  return <div className="p-8 max-w-3xl mx-auto space-y-6">
    <h1 className="text-3xl font-bold">Project scope</h1>
    <p className="text-muted-foreground">Automation Studio is an independent software portfolio project. The local workspace demonstrates a visual editor, workflow execution, conditional routing, approval pauses, encrypted credentials and version history.</p>
    <div className="bg-card border border-border rounded-xl p-6 space-y-3"><h2 className="text-xl font-semibold">No subscription checkout in the local workspace</h2><p className="text-muted-foreground">Run the workspace locally using your own computer. Optional integrations and AI generation require provider credentials and may incur provider charges.</p></div>
    <div className="bg-card border border-border rounded-xl p-6 space-y-3"><h2 className="text-xl font-semibold">Development status</h2><p className="text-muted-foreground">Production hosting, complete SSO login, database query execution and MCP client interoperability require further work. Existing configuration screens do not establish that those capabilities are production ready.</p></div>
    <p className="text-muted-foreground">n8n and Zapier are established products in the same category. This portfolio makes no claim of exclusivity, feature parity or comparative pricing.</p>
    <Link href="/workflows" className="inline-flex bg-primary text-primary-foreground rounded-lg px-5 py-3">Explore workflows</Link>
  </div>;
}
