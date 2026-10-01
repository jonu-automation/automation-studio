import { useState } from "react";
import { KeyRound, Plus, Trash2, Eye, EyeOff, CheckCircle, AlertCircle, Mail, MessageSquare, Globe, Shield } from "lucide-react";
import {
  useListCredentials,
  useCreateCredential,
  useDeleteCredential,
  getListCredentialsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const CREDENTIAL_TYPES = [
  {
    value: "resend",
    label: "Resend (Email)",
    icon: Mail,
    color: "#3b82f6",
    description: "Send real emails via Resend API",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", placeholder: "re_..." },
      { key: "defaultFrom", label: "Default From Address", type: "text", placeholder: "noreply@yourdomain.com", optional: true },
    ],
  },
  {
    value: "slack_webhook",
    label: "Slack Incoming Webhook",
    icon: MessageSquare,
    color: "#8b5cf6",
    description: "Send real messages to Slack channels",
    fields: [
      { key: "url", label: "Webhook URL", type: "password", placeholder: "https://hooks.slack.com/services/..." },
    ],
  },
  {
    value: "http_header",
    label: "HTTP Authorization Header",
    icon: Globe,
    color: "#f97316",
    description: "Add auth headers to HTTP Request nodes",
    fields: [
      { key: "headerName", label: "Header Name", type: "text", placeholder: "Authorization" },
      { key: "headerValue", label: "Header Value", type: "password", placeholder: "Bearer your-token" },
    ],
  },
  {
    value: "generic",
    label: "Generic / API Key",
    icon: Shield,
    color: "#22c55e",
    description: "Store any API key or secret for later use",
    fields: [
      { key: "apiKey", label: "API Key / Secret", type: "password", placeholder: "your-secret-value" },
    ],
  },
];

export default function Credentials() {
  const qc = useQueryClient();
  const { data: credentialsRaw, isLoading } = useListCredentials({
    query: { queryKey: getListCredentialsQueryKey() },
  });
  const credentials = Array.isArray(credentialsRaw) ? credentialsRaw : [];

  const createCredential = useCreateCredential();
  const deleteCredential = useDeleteCredential();

  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState(CREDENTIAL_TYPES[0].value);
  const [name, setName] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentType = CREDENTIAL_TYPES.find(t => t.value === selectedType) ?? CREDENTIAL_TYPES[0];

  function resetForm() {
    setName("");
    setFieldValues({});
    setError(null);
    setShowForm(false);
  }

  async function handleCreate() {
    if (!name.trim()) { setError("Name is required"); return; }
    const required = currentType.fields.filter(f => !f.optional);
    for (const f of required) {
      if (!fieldValues[f.key]?.trim()) { setError(`${f.label} is required`); return; }
    }

    setSaving(true);
    setError(null);
    try {
      await createCredential.mutateAsync({
        data: {
          name: name.trim(),
          credentialType: selectedType,
          data: fieldValues as Record<string, unknown>,
        },
      });
      qc.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save credential");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      await deleteCredential.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
    } finally {
      setDeleting(null);
    }
  }

  const typeInfo: Record<string, typeof CREDENTIAL_TYPES[0]> = {};
  for (const t of CREDENTIAL_TYPES) typeInfo[t.value] = t;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Credentials</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Store API keys and secrets once, use them across all your workflows
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Credential
        </button>
      </div>

      {/* Explanation banners */}
      <div className="grid grid-cols-1 gap-3 mb-6">
        {CREDENTIAL_TYPES.map(t => {
          const Icon = t.icon;
          return (
            <div key={t.value} className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border">
              <div className="p-1.5 rounded-lg flex-shrink-0" style={{ background: `${t.color}15` }}>
                <Icon className="w-4 h-4" style={{ color: t.color }} />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="mb-6 bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">New Credential</h2>

          {/* Type selector */}
          <div className="mb-4">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {CREDENTIAL_TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    onClick={() => { setSelectedType(t.value); setFieldValues({}); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                      selectedType === t.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs font-medium">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div className="mb-3">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={`e.g. My ${currentType.label}`}
              className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Dynamic fields */}
          {currentType.fields.map(f => (
            <div key={f.key} className="mb-3">
              <label className="text-xs font-medium text-muted-foreground">
                {f.label}
                {f.optional && <span className="ml-1 text-muted-foreground/60">(optional)</span>}
              </label>
              <input
                type={f.type === "password" ? "password" : "text"}
                value={fieldValues[f.key] ?? ""}
                onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              />
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 mb-3">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Credential"}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Credentials list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : credentials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-muted/50 rounded-2xl flex items-center justify-center mb-4">
            <KeyRound className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No credentials yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Add a credential to enable real email and Slack integrations</p>
        </div>
      ) : (
        <div className="space-y-2">
          {credentials.map(cred => {
            const t = typeInfo[cred.credentialType] ?? CREDENTIAL_TYPES[3];
            const Icon = t?.icon ?? KeyRound;
            return (
              <div key={cred.id} className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl">
                <div className="p-2 rounded-lg flex-shrink-0" style={{ background: `${t.color}15` }}>
                  <Icon className="w-4 h-4" style={{ color: t.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{cred.name}</p>
                  <p className="text-xs text-muted-foreground">{t.label}</p>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-emerald-400">Stored</span>
                  <button
                    onClick={() => handleDelete(cred.id)}
                    disabled={deleting === cred.id}
                    className="ml-2 p-1.5 text-muted-foreground hover:text-red-400 transition-colors rounded-md hover:bg-red-400/10"
                    title="Delete credential"
                  >
                    {deleting === cred.id ? (
                      <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
