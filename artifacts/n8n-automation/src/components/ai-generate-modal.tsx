import { useState, useRef, useEffect } from "react";
import { Sparkles, Loader2, X, Wand2, ChevronRight, AlertCircle } from "lucide-react";

interface GeneratedNode {
  id: string;
  nodeType: string;
  label: string;
  config?: Record<string, unknown>;
}

interface GeneratedEdge {
  source: string;
  target: string;
}

interface GenerateResult {
  nodes: GeneratedNode[];
  edges: GeneratedEdge[];
}

interface AiGenerateModalProps {
  onClose: () => void;
  onApply: (result: GenerateResult) => void;
}

const EXAMPLES = [
  "Send a Slack message every Monday morning with this week's top sales from the database",
  "When a webhook fires, parse the payload, call an AI to summarize it, then email the result",
  "Loop through a list of customers and send a personalized email to each one",
  "On a schedule, query the database and post a daily report to Slack with key metrics",
  "Pause for human approval before sending any outbound email",
];

const NODE_COLORS: Record<string, string> = {
  schedule: "#8b5cf6",
  webhook: "#6366f1",
  http_request: "#3b82f6",
  send_email: "#06b6d4",
  slack_message: "#10b981",
  transform: "#f59e0b",
  filter: "#f97316",
  delay: "#94a3b8",
  approval: "#f97316",
  database_query: "#0ea5e9",
  ai_prompt: "#a855f7",
  set_variable: "#64748b",
  loop: "#ec4899",
  merge: "#14b8a6",
};

export function AiGenerateModal({ onClose, onApply }: AiGenerateModalProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GenerateResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const res = await fetch("/api/ai/generate-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (preview) {
      onApply(preview);
      onClose();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !loading) {
      handleGenerate();
    }
    if (e.key === "Escape") onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border flex-shrink-0">
          <div className="w-8 h-8 bg-primary/15 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">AI Workflow Generator</h2>
            <p className="text-[11px] text-muted-foreground">Describe what you want to automate</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1 text-muted-foreground hover:text-foreground rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Prompt input */}
          <div>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Every morning, pull today's orders from the database, summarize them with AI, and post the report to Slack…"
              rows={4}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1.5">
              ⌘+Enter to generate
            </p>
          </div>

          {/* Examples */}
          {!preview && !loading && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Try an example</p>
              <div className="space-y-1.5">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(ex)}
                    className="w-full text-left text-xs text-muted-foreground hover:text-foreground bg-muted/20 hover:bg-muted/40 rounded-lg px-3 py-2 transition-colors flex items-start gap-2"
                  >
                    <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary/60" />
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              </div>
              <p className="text-sm text-muted-foreground">Designing your workflow…</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">Generation failed</p>
                <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Generated workflow preview</p>
                <span className="text-[10px] text-muted-foreground">{preview.nodes.length} nodes · {preview.edges.length} connections</span>
              </div>

              {/* Node list */}
              <div className="bg-background border border-border rounded-xl divide-y divide-border overflow-hidden">
                {preview.nodes.map((node, i) => (
                  <div key={node.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: NODE_COLORS[node.nodeType] ?? "#94a3b8" }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-foreground">{node.label}</span>
                      <span className="text-[10px] text-muted-foreground ml-2 font-mono">{node.nodeType}</span>
                    </div>
                    {i < preview.nodes.length - 1 && (
                      <div className="flex-shrink-0 text-muted-foreground">
                        {preview.edges.some(e => e.source === node.id) ? (
                          <ChevronRight className="w-3 h-3" />
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  setPreview(null);
                  setPrompt("");
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← Try a different prompt
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-border flex-shrink-0">
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <div className="ml-auto flex gap-2">
            {!preview ? (
              <button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className="flex items-center gap-2 bg-primary text-primary-foreground text-xs font-medium px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                Generate Workflow
              </button>
            ) : (
              <>
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-lg border border-border hover:bg-muted/30 transition-colors text-foreground"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Regenerate
                </button>
                <button
                  onClick={handleApply}
                  className="flex items-center gap-2 bg-primary text-primary-foreground text-xs font-medium px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Add to Canvas
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
