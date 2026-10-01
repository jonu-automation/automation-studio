import { useState, useEffect } from "react";
import { Shield, Lock, AlertTriangle, ExternalLink, Save, Trash2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useGetAuthMe } from "@workspace/api-client-react";
import { toast } from "sonner";
import { Link } from "wouter";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function fetchSsoConfig() {
  const res = await fetch(`${BASE_URL}/api/sso/config`, { credentials: "include" });
  if (res.status === 403) return null;
  if (!res.ok) throw new Error("Failed to load SSO config");
  return res.json();
}

async function saveSsoConfig(data: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}/api/sso/config`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save SSO config");
  return res.json();
}

async function deleteSsoConfig() {
  const res = await fetch(`${BASE_URL}/api/sso/config`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete SSO config");
  return res.json();
}

function UpgradeBanner({ plan }: { plan: string }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="border border-amber-400/30 bg-amber-400/5 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 bg-amber-400/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-amber-400" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">SSO requires Pro or Team plan</h2>
        <p className="text-sm text-muted-foreground mb-1">
          You're on the <span className="font-semibold capitalize text-foreground">{plan}</span> plan.
        </p>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Single Sign-On (SAML & OIDC) lets your team log in with your corporate identity provider.
          Upgrade to unlock it.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-sm mx-auto mb-6">
          {[
            "SAML 2.0 & OIDC support",
            "Works with Okta, Azure AD, Google Workspace",
            "Enforce SSO for your team",
            "Audit log of all SSO events",
          ].map(f => (
            <div key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
              <span>{f}</span>
            </div>
          ))}
        </div>

        <Link href="/billing" className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors">
          Upgrade to Pro
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>

        <p className="text-[10px] text-muted-foreground mt-3">
          Starts at $29/mo · Cancel anytime
        </p>
      </div>
    </div>
  );
}

function FieldRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-4 border-b border-border/50 last:border-0">
      <div>
        <label className="text-sm font-medium text-foreground">{label}</label>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary ${mono ? "font-mono text-xs" : ""}`}
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
    />
  );
}

interface SsoConfig {
  exists: boolean;
  provider: string;
  entityId?: string | null;
  acsUrl?: string | null;
  x509Certificate?: string | null;
  metadataUrl?: string | null;
  oidcClientId?: string | null;
  oidcClientSecret?: string | null;
  oidcIssuerUrl?: string | null;
  enabled: boolean;
}

export default function SettingsSso() {
  const { data: me } = useGetAuthMe();
  const plan = (me as unknown as { plan?: string })?.plan ?? "free";
  const hasAccess = plan === "pro" || plan === "team";

  const [config, setConfig] = useState<SsoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [provider, setProvider] = useState("saml");
  const [entityId, setEntityId] = useState("");
  const [acsUrl, setAcsUrl] = useState("");
  const [x509Certificate, setX509Certificate] = useState("");
  const [metadataUrl, setMetadataUrl] = useState("");
  const [oidcClientId, setOidcClientId] = useState("");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcIssuerUrl, setOidcIssuerUrl] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!hasAccess) { setLoading(false); return; }
    fetchSsoConfig()
      .then(cfg => {
        if (cfg) {
          setConfig(cfg);
          setProvider(cfg.provider ?? "saml");
          setEntityId(cfg.entityId ?? "");
          setAcsUrl(cfg.acsUrl ?? "");
          setX509Certificate(cfg.x509Certificate ?? "");
          setMetadataUrl(cfg.metadataUrl ?? "");
          setOidcClientId(cfg.oidcClientId ?? "");
          setOidcClientSecret(cfg.oidcClientSecret ?? "");
          setOidcIssuerUrl(cfg.oidcIssuerUrl ?? "");
          setEnabled(cfg.enabled ?? false);
        }
      })
      .catch(() => toast.error("Failed to load SSO config"))
      .finally(() => setLoading(false));
  }, [hasAccess]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveSsoConfig({ provider, entityId, acsUrl, x509Certificate, metadataUrl, oidcClientId, oidcClientSecret, oidcIssuerUrl, enabled });
      toast.success("SSO configuration saved");
      setConfig(prev => ({ ...(prev ?? { exists: false }), exists: true, enabled } as SsoConfig));
    } catch {
      toast.error("Failed to save SSO config");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Remove SSO configuration? Users will need to log in with email/password.")) return;
    try {
      await deleteSsoConfig();
      setConfig(null);
      setProvider("saml"); setEntityId(""); setAcsUrl(""); setX509Certificate(""); setMetadataUrl("");
      setOidcClientId(""); setOidcClientSecret(""); setOidcIssuerUrl(""); setEnabled(false);
      toast.success("SSO configuration removed");
    } catch {
      toast.error("Failed to remove SSO config");
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
          <Shield className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">SSO / Enterprise Auth</h1>
          <p className="mt-3 rounded-lg border border-amber-500/30 p-3 text-sm text-amber-300">Configuration preview only. SAML/OIDC sign-in is not implemented. Saving this form does not enable enterprise authentication.</p>
          <p className="text-xs text-muted-foreground">Configure SAML 2.0 or OIDC for your organization</p>
        </div>
        {hasAccess && (
          <div className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${
            config?.enabled
              ? "bg-emerald-400/10 border-emerald-400/20 text-emerald-400"
              : "bg-muted/30 border-border text-muted-foreground"
          }`}>
            {config?.enabled ? <><CheckCircle2 className="w-3.5 h-3.5" /> Configuration saved</> : "SSO Disabled"}
          </div>
        )}
      </div>

      {!hasAccess ? (
        <UpgradeBanner plan={plan} />
      ) : loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Enable toggle + provider */}
          <div className="border border-border rounded-xl p-5 bg-card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">SSO Provider</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Choose your identity provider protocol</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
                <div
                  onClick={() => setEnabled(e => !e)}
                  className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${enabled ? "bg-emerald-500" : "bg-muted"}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow mt-0.5 transition-transform ${enabled ? "translate-x-5" : "translate-x-1"}`} />
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {["saml", "oidc"].map(p => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`border rounded-lg px-4 py-3 text-left transition-colors ${
                    provider === p
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border hover:border-border/80 text-muted-foreground"
                  }`}
                >
                  <div className="text-sm font-semibold uppercase">{p}</div>
                  <div className="text-[10px] mt-0.5">
                    {p === "saml" ? "Works with Okta, Azure AD, OneLogin, ADFS" : "Works with Google, Auth0, Okta, Keycloak"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* SAML fields */}
          {provider === "saml" && (
            <div className="border border-border rounded-xl p-5 bg-card">
              <h2 className="text-sm font-semibold text-foreground mb-4">SAML 2.0 Configuration</h2>
              <div>
                <FieldRow label="Metadata URL" description="Import settings automatically from your IdP">
                  <TextInput value={metadataUrl} onChange={setMetadataUrl} placeholder="https://your-idp.com/metadata.xml" />
                  <p className="text-[10px] text-muted-foreground mt-1">Provide metadata URL <em>or</em> fill the fields below manually</p>
                </FieldRow>
                <FieldRow label="Entity ID" description="Your SP Entity ID / Audience URI">
                  <TextInput value={entityId} onChange={setEntityId} placeholder="https://yourdomain.com" mono />
                </FieldRow>
                <FieldRow label="ACS URL" description="Assertion Consumer Service URL">
                  <TextInput value={acsUrl} onChange={setAcsUrl} placeholder="https://yourdomain.com/sso/saml/callback" mono />
                </FieldRow>
                <FieldRow label="X.509 Certificate" description="IdP public signing certificate">
                  <TextArea value={x509Certificate} onChange={setX509Certificate}
                    placeholder={"-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----"} rows={5} />
                </FieldRow>
              </div>
            </div>
          )}

          {/* OIDC fields */}
          {provider === "oidc" && (
            <div className="border border-border rounded-xl p-5 bg-card">
              <h2 className="text-sm font-semibold text-foreground mb-4">OIDC Configuration</h2>
              <div>
                <FieldRow label="Issuer URL" description="Your IdP's OIDC discovery base URL">
                  <TextInput value={oidcIssuerUrl} onChange={setOidcIssuerUrl} placeholder="https://accounts.google.com" mono />
                </FieldRow>
                <FieldRow label="Client ID">
                  <TextInput value={oidcClientId} onChange={setOidcClientId} placeholder="your-client-id" mono />
                </FieldRow>
                <FieldRow label="Client Secret">
                  <input
                    type="password"
                    value={oidcClientSecret}
                    onChange={e => setOidcClientSecret(e.target.value)}
                    placeholder={config?.oidcClientSecret ? "••••••••  (stored)" : "your-client-secret"}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </FieldRow>
              </div>
            </div>
          )}

          {/* Advanced */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setShowAdvanced(a => !a)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            >
              <span>Advanced / Testing</span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showAdvanced && (
              <div className="px-5 py-4 border-t border-border bg-muted/10 space-y-3 text-xs text-muted-foreground">
                <p>This form stores configuration only. End-to-end SSO login is not available in this version.</p>
                <p>For Okta: set <code className="bg-muted px-1 rounded">SAML 2.0 App</code> → ACS URL above, Entity ID above.</p>
                <p>For Azure AD: set <code className="bg-muted px-1 rounded">Enterprise App</code> → Identifier = Entity ID, Reply URL = ACS URL.</p>
                <p>For Google Workspace: set <code className="bg-muted px-1 rounded">SAML App</code> → ACS URL and Entity ID above.</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <div>
              {config?.exists && (
                <button onClick={handleDelete} className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Remove configuration
                </button>
              )}
            </div>
            <div className="flex gap-3">
              {!config?.exists && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3 h-3" />
                  Not yet configured — SSO inactive
                </div>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
