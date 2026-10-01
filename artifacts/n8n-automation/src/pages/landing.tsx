import { Link } from "wouter";
import {
  Zap, GitBranch, Activity, ClipboardCheck, Sparkles,
  ChevronRight, Play, CheckCircle2, Clock, ArrowRight,
  ShieldCheck, History, Server, Bot, LayoutTemplate,
  Globe, Database, MessageSquare, Sheet,
} from "lucide-react";
import WorkflowPreview from "@/components/workflow-preview";

const DIFFERENTIATORS = [
  {
    icon: Bot,
    badge: "MCP server",
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    border: "border-violet-400/20",
    title: "Workflow tools over JSON-RPC",
    desc: "List and call workflows through an authenticated HTTP JSON-RPC endpoint. Individual AI client compatibility is experimental.",
  },
  {
    icon: Sparkles,
    badge: "AI-powered",
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    border: "border-purple-400/20",
    title: "Generate workflows with AI",
    desc: 'Describe your automation in plain English. AI designs the full workflow — nodes, connections, and config. Click "Add to Canvas" and you\'re done.',
  },
  {
    icon: Clock,
    badge: "Execution metrics",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
    title: "Inspect execution time",
    desc: "Inspect node duration, workflow status and execution history. This portfolio workspace does not charge for workflow runs.",
  },
  {
    icon: ClipboardCheck,
    badge: "Human-in-the-loop",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
    title: "Approval nodes built in",
    desc: "Pause a workflow and approve or reject it from the approvals inbox. Optional email notifications require a configured email provider.",
  },
  {
    icon: Activity,
    badge: "Real-time",
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    border: "border-blue-400/20",
    title: "Live execution logs",
    desc: "Watch every node run in real time. See output, duration, and errors as they happen — streamed directly into the editor.",
  },
  {
    icon: History,
    badge: "Version control",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    border: "border-cyan-400/20",
    title: "Full workflow version history",
    desc: "Save workflow versions, inspect earlier configurations and restore them from the editor history panel.",
  },
  {
    icon: ShieldCheck,
    badge: "Credentials",
    color: "text-indigo-400",
    bg: "bg-indigo-400/10",
    border: "border-indigo-400/20",
    title: "Encrypted integration credentials",
    desc: "Store integration keys separately from workflow logic. Credential data is encrypted at rest and scoped to the workspace owner.",
  },
  {
    icon: Server,
    badge: "Self-hostable",
    color: "text-rose-400",
    bg: "bg-rose-400/10",
    border: "border-rose-400/20",
    title: "Run a local workspace",
    desc: "Run the editor and API locally with a persistent embedded database. Hosted deployment and Docker configuration need separate validation.",
  },
];


const FEATURED_TEMPLATES = [
  { icon: Sparkles, name: "Daily AI News Digest → Slack", desc: "Fetch headlines at 9am, summarize with GPT, post to Slack.", category: "AI", color: "text-violet-400 bg-violet-400/10" },
  { icon: Sheet, name: "Form Submission → Sheets + Email", desc: "Log every form entry to Google Sheets and send a confirmation.", category: "Lead Capture", color: "text-emerald-400 bg-emerald-400/10" },
  { icon: Bot, name: "AI Lead Scoring → Notion + Slack", desc: "Score inbound leads 1-10 with GPT, log to CRM, alert sales on hot leads.", category: "AI", color: "text-violet-400 bg-violet-400/10" },
  { icon: Globe, name: "GitHub Issue → Notion Database", desc: "Every new GitHub issue becomes a tracked page in your Notion bug tracker.", category: "Dev Tools", color: "text-cyan-400 bg-cyan-400/10" },
  { icon: Database, name: "Demo: Lead qualification", desc: "Route a sample lead by score. Runs locally without provider keys.", category: "Reporting", color: "text-emerald-400 bg-emerald-400/10" },
  { icon: MessageSquare, name: "Stripe Payment → Discord", desc: "Celebrate every successful payment with a message to your Discord.", category: "Notifications", color: "text-amber-400 bg-amber-400/10" },
];

const MCP_CONFIG = `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}`;

export default function Landing() {
  const localMode = import.meta.env.VITE_LOCAL_MODE === "true";
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">Automation</span>
            <span className="text-sm font-bold text-primary ml-1">Studio</span>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors cursor-pointer">Features</a>
          <a href="#mcp" className="hover:text-foreground transition-colors cursor-pointer">MCP</a>
          <a href="#templates" className="hover:text-foreground transition-colors cursor-pointer">Templates</a>
          <a href="#scope" className="hover:text-foreground transition-colors cursor-pointer">Project scope</a>
        </nav>
        <div className="flex items-center gap-3">
          {!localMode && <Link href={localMode ? "/workflows" : "/sign-in"}>
            <button className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5">Sign in</button>
          </Link>}
          <Link href={localMode ? "/dashboard" : "/sign-up"}>
            <button className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors">
              {localMode ? "Open workspace" : "Get started free"}
            </button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-24 pb-20 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-3 py-1 text-xs font-medium text-violet-400 mb-6">
          <Bot className="w-3 h-3" /> Visual workflow automation · Portfolio project
        </div>
        <h1 className="text-5xl font-bold text-foreground leading-tight mb-6">
          Workflow automation that thinks.{" "}
          <span className="text-primary">Build, run and inspect</span>
          {" "}—{" "}
          <span className="text-violet-400">with optional AI assistance.</span>
        </h1>
        <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-2xl mx-auto">
          A visual editor, conditional branches, human approvals and execution history.
          Explore a working local workspace, with optional integrations and an experimental
          <strong className="text-foreground"> MCP-compatible workflow endpoint</strong>.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href={localMode ? "/dashboard" : "/sign-up"}>
            <button className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
              Open workspace <ChevronRight className="w-4 h-4" />
            </button>
          </Link>
          <Link href={localMode ? "/workflows" : "/sign-in"}>
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-border px-6 py-3 rounded-lg transition-colors">
              <Play className="w-3.5 h-3.5" /> {localMode ? "View workflows" : "Sign in"}
            </button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mt-4">Portfolio workspace · No subscription checkout · External services may have their own costs</p>

        <WorkflowPreview />
      </section>

      {/* Social proof strip */}
      <div className="border-y border-border py-4 bg-card">
        <div className="max-w-4xl mx-auto px-6 flex flex-wrap items-center justify-center gap-8 text-xs text-muted-foreground font-medium">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Visual workflow editor</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Starter templates</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Experimental MCP endpoint</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Persistent local data</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Execution metrics</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Encrypted credentials</span>
        </div>
      </div>

      {/* MCP section — the wedge */}
      <section id="mcp" className="px-6 py-24 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-3 py-1 text-xs font-medium text-violet-400 mb-4">
              <Bot className="w-3 h-3" /> Experimental integration
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-4 leading-tight">
              Your AI assistant can now take real action
            </h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Automation Studio includes an experimental{" "}
              <strong className="text-foreground">MCP (Model Context Protocol) server</strong>.
              Workflows can be listed and called through authenticated JSON-RPC requests.
              Compatibility with individual AI clients requires separate testing.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Generate your API key in Settings → MCP Server",
                "Use the endpoint with an HTTP JSON-RPC client",
                "List the available workflow tools and call a selected tool",
                "Structured results (status, output, errors) come straight back",
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-3 text-sm text-foreground">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ul>
            <Link href={localMode ? "/settings/mcp" : "/sign-up"}>
              <button className="inline-flex items-center gap-2 text-sm font-medium bg-violet-600 text-white px-5 py-2.5 rounded-lg hover:bg-violet-700 transition-colors">
                Try MCP server mode <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
              <span className="text-xs text-muted-foreground ml-2 font-mono">Example JSON-RPC request</span>
            </div>
            <pre className="text-xs font-mono text-muted-foreground p-5 overflow-auto leading-relaxed">
              <code>
                {MCP_CONFIG.split("\n").map((line, i) => {
                  const isKey = line.includes('"') && line.includes(':') && !line.includes('//');
                  const isString = line.match(/"[^"]*"$/);
                  const isComment = line.trim().startsWith('//');
                  if (isComment) return <span key={i} className="text-muted-foreground/40">{line}{"\n"}</span>;
                  if (isKey) {
                    const parts = line.split(':');
                    return (
                      <span key={i}>
                        <span className="text-blue-400">{parts[0]}</span>
                        <span className="text-foreground">:</span>
                        <span className={isString ? "text-emerald-400" : "text-foreground"}>{parts.slice(1).join(':')}</span>
                        {"\n"}
                      </span>
                    );
                  }
                  return <span key={i}>{line}{"\n"}</span>;
                })}
              </code>
            </pre>
            <div className="px-5 py-4 bg-violet-500/5 border-t border-violet-500/20">
              <p className="text-xs text-violet-400">
                Send to /api/mcp with your bearer key. This is a request example; no AI client connection is implied.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="px-6 py-20 bg-card border-y border-border">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-foreground mb-3">Everything a developer needs</h2>
          <p className="text-center text-sm text-muted-foreground mb-12 max-w-xl mx-auto">
            Explore the editor, execution engine and approval flow.
            External integrations require your own credentials; AI generation requires an OpenAI key.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {DIFFERENTIATORS.map((f) => (
              <div key={f.title} className={`bg-background border rounded-xl p-6 ${f.border}`}>
                <div className={`w-9 h-9 ${f.bg} rounded-lg flex items-center justify-center mb-3`}>
                  <f.icon className={f.color} style={{ width: "18px", height: "18px" }} />
                </div>
                <div className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mb-2 ${f.bg} ${f.color}`}>
                  {f.badge}
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1.5">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Templates showcase */}
      <section id="templates" className="px-6 py-20 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-3 py-1 text-xs font-medium text-primary mb-4">
            <LayoutTemplate className="w-3 h-3" /> Starter templates included
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">Don't start from scratch</h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Use a template as a starting point and review its configuration before running. External services require credentials; database query nodes are not implemented.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {FEATURED_TEMPLATES.map((t) => (
            <div key={t.name} className="border border-border rounded-xl p-5 bg-card hover:border-primary/30 transition-colors group">
              <div className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mb-3 ${t.color}`}>
                <t.icon style={{ width: "10px", height: "10px" }} />
                {t.category}
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1 leading-tight">{t.name}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center">
          <Link href="/templates">
            <button className="inline-flex items-center gap-2 text-sm font-medium text-primary border border-primary/30 px-5 py-2.5 rounded-lg hover:bg-primary/5 transition-colors">
              Browse templates <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        </div>
      </section>

      <section id="scope" className="px-6 py-20 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-4">Explore the portfolio workspace</h2>
        <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-8">
          This project demonstrates visual workflow development, conditional execution, approval pauses and execution history.
          It is an independent portfolio project in the workflow automation category alongside tools such as n8n and Zapier.
          No feature parity, affiliation or price advantage is claimed.
        </p>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { title: "Try locally", text: "Create and run workflows without an external database or subscription. Local data persists between restarts." },
            { title: "Connect your services", text: "Email, messaging and AI integrations use your own provider keys. Provider limits and costs apply." },
            { title: "Development scope", text: "SSO login, production Docker deployment and database query execution are unfinished. MCP client compatibility remains experimental." },
          ].map(item => <div key={item.title} className="bg-card border border-border rounded-xl p-6"><h3 className="font-semibold mb-2">{item.title}</h3><p className="text-sm text-muted-foreground">{item.text}</p></div>)}
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Ready to give your AI an action layer?
          </h2>
          <p className="text-muted-foreground mb-8">
            Explore the editor and inspect real execution results.
            This workspace is presented as a software development portfolio project.
          </p>
          <Link href={localMode ? "/dashboard" : "/sign-up"}>
            <button className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-lg font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 text-sm">
              Open workspace <ChevronRight className="w-4 h-4" />
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-5 h-5 bg-primary rounded flex items-center justify-center">
            <Zap className="w-3 h-3 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-foreground">Automation Studio</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Visual workflows · Optional AI generation · Experimental MCP endpoint · Human approvals · Execution history
        </p>
      </footer>
    </div>
  );
}
