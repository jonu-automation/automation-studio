import { useEffect, useState } from "react";
import { Bot, Copy, Check, RefreshCw, Trash2, Sparkles, Terminal, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function SettingsMcp() {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const mcpUrl = `${origin}/api/mcp`;

  useEffect(() => { void load(); }, []);

  async function load() {
    try {
      const res = await fetch("/api/mcp/key", { credentials: "include" });
      const data = await res.json();
      setKey(data.key ?? null);
    } catch {
      toast.error("Failed to load MCP key");
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/mcp/key", { method: "POST", credentials: "include" });
      const data = await res.json();
      setKey(data.key);
      toast.success("MCP key generated");
    } catch {
      toast.error("Failed to generate key");
    } finally {
      setGenerating(false);
    }
  }

  async function rotate() {
    if (!confirm("Rotate the key? Any AI assistants using the old key will stop working.")) return;
    await generate();
  }

  async function revoke() {
    if (!confirm("Revoke the key? AI assistants will lose access to your workflows.")) return;
    await fetch("/api/mcp/key", { method: "DELETE", credentials: "include" });
    setKey(null);
    toast.success("Key revoked");
  }

  function copy(field: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }

  const requestExample = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, null, 2);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <p className="mb-6 rounded-lg border border-amber-500/30 p-3 text-sm text-amber-300">Experimental HTTP JSON-RPC endpoint. Listing and calling workflows can be tested directly; connection to Claude, Cursor or other AI clients has not been validated.</p>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-primary/15 rounded-xl flex items-center justify-center flex-shrink-0">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            MCP Server
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-0.5 rounded">
              <Sparkles className="w-2.5 h-2.5 inline mr-0.5" />New
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Expose your workflows as tools to AI assistants like Claude Desktop, Cursor, and Cline.
            They can list, describe, and execute any of your workflows on your behalf.
          </p>
        </div>
      </div>

      {/* Key card */}
      <div className="border border-border bg-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Personal Access Token</h2>
          {key && (
            <div className="flex items-center gap-2">
              <button onClick={rotate} disabled={generating}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors disabled:opacity-50">
                <RefreshCw className={`w-3 h-3 ${generating ? "animate-spin" : ""}`} /> Rotate
              </button>
              <button onClick={revoke}
                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-500/10 transition-colors">
                <Trash2 className="w-3 h-3" /> Revoke
              </button>
            </div>
          )}
        </div>

        {key ? (
          <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
            <code className="font-mono text-xs text-foreground flex-1 truncate">{key}</code>
            <button onClick={() => copy("key", key)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors flex-shrink-0">
              {copiedField === "key" ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
            </button>
          </div>
        ) : (
          <button onClick={generate} disabled={generating}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50">
            {generating ? "Generating…" : "Generate MCP Key"}
          </button>
        )}

        {key && (
          <div className="flex items-start gap-2 text-[11px] text-amber-300/80 bg-amber-400/5 border border-amber-400/20 rounded-lg p-2.5">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>Treat this token like a password. Anyone with it can run your workflows. Rotate immediately if exposed.</span>
          </div>
        )}
      </div>

      {/* Endpoint card */}
      <div className="border border-border bg-card rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">MCP Endpoint</h2>
        <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
          <Terminal className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <code className="font-mono text-xs text-foreground flex-1 truncate">{mcpUrl}</code>
          <button onClick={() => copy("url", mcpUrl)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors flex-shrink-0">
            {copiedField === "url" ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">JSON-RPC 2.0 over HTTP. Methods: <code>initialize</code>, <code>tools/list</code>, <code>tools/call</code>.</p>
      </div>

      <div className="border border-border bg-card rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold">Example request body</h2>
        <p className="text-xs text-muted-foreground">Send a POST request to the endpoint above with Content-Type: application/json and Authorization: Bearer YOUR_KEY. Initialize, list tools and call a selected workflow using JSON-RPC.</p>
        <pre className="bg-background border border-border rounded-lg p-3 text-xs overflow-x-auto">{requestExample}</pre>
        <button onClick={() => copy("request", requestExample)} className="text-xs text-primary">{copiedField === "request" ? "Copied" : "Copy request body"}</button>
      </div>

      {/* What can the AI do */}
      <div className="border border-border bg-card rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Available endpoint operations</h2>
        <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
          <li>Discover all your saved workflows by name and description</li>
          <li>Execute any workflow with custom input data</li>
          <li>Receive structured output, errors, and execution metadata</li>
          <li>Inspect status and results from a workflow call</li>
        </ul>
        <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
          Each workflow is exposed as <code>workflow_&lt;id&gt;_&lt;slug&gt;</code>. Add a clear <strong>description</strong>
          to your workflows so the AI knows when to call them.
        </p>
      </div>
    </div>
  );
}
