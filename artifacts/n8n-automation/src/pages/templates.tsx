import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { LayoutTemplate, Sparkles, ArrowRight, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import { TemplatePreviewModal } from "@/components/template-preview-modal";

type Template = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  highlight?: string;
  nodeCount: number;
  edgeCount: number;
};

const DIFFICULTY_COLOR: Record<string, string> = {
  Beginner: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  Intermediate: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  Advanced: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
};

const CATEGORY_COLOR: Record<string, string> = {
  AI: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "Lead Capture": "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  Notifications: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "Dev Tools": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  Reporting: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "Human-in-the-Loop": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  Social: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  Team: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingId, setUsingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/templates", { credentials: "include" });
      const data = await res.json();
      setTemplates(data);
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }

  async function useTemplate(t: Template) {
    setUsingId(t.id);
    try {
      const res = await fetch(`/api/templates/${t.id}/use`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      toast.success(`Created "${t.name}"`);
      setLocation(`/workflows/${data.id}`);
    } catch {
      toast.error("Failed to create workflow from template");
      setUsingId(null);
    }
  }

  const categories = ["All", ...Array.from(new Set(templates.map((t) => t.category)))];
  const filtered = filter === "All" ? templates : templates.filter((t) => t.category === filter);

  return (
    <>
      {previewId && (
        <TemplatePreviewModal
          templateId={previewId}
          onClose={() => setPreviewId(null)}
        />
      )}

      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <LayoutTemplate className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">Templates</h1>
          </div>
          <p className="text-muted-foreground">
            Start from a blueprint and review its configuration. Local demo templates need no API keys; integration templates require provider credentials. Database query steps are not implemented.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                filter === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/30"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">No templates in this category yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((t) => (
              <div
                key={t.id}
                className="group border border-border rounded-xl p-5 bg-card hover:border-primary/50 hover:shadow-md transition-all flex flex-col"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${CATEGORY_COLOR[t.category] ?? "bg-muted"}`}>
                    {t.category}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded border ${DIFFICULTY_COLOR[t.difficulty]}`}>
                    {t.difficulty}
                  </span>
                </div>

                <h3 className="font-semibold text-lg mb-1 leading-tight">{t.name}</h3>
                <p className="text-sm text-muted-foreground mb-4 flex-1">{t.description}</p>

                {t.highlight && (
                  <div className="flex items-center gap-1.5 text-xs text-primary mb-3">
                    <Sparkles className="h-3 w-3" />
                    <span>{t.highlight}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    {t.nodeCount} nodes · {t.edgeCount} connections
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewId(t.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
                      title="Preview workflow"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </button>
                    <button
                      onClick={() => useTemplate(t)}
                      disabled={usingId === t.id}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:gap-2 transition-all disabled:opacity-50"
                    >
                      {usingId === t.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Creating…
                        </>
                      ) : (
                        <>
                          Use template
                          <ArrowRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
