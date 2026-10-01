import { Server, Lock, Download, ExternalLink, CheckCircle2, Terminal, Copy, Check } from "lucide-react";
import { useGetAuthMe } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useState } from "react";

function ContactSalesBanner({ plan }: { plan: string }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="border border-border bg-card rounded-2xl p-8 text-center">
        <div className="w-12 h-12 bg-muted/50 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">Self-hosting requires the Team plan</h2>
        <p className="text-sm text-muted-foreground mb-1">
          You're on the <span className="font-semibold capitalize text-foreground">{plan}</span> plan.
        </p>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Deploy Automation Studio on your own infrastructure — VPS, bare metal, or private cloud.
          Full Docker Compose stack with Nginx reverse proxy and SSL out of the box.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-sm mx-auto mb-6">
          {[
            "Full Docker Compose stack",
            "Nginx + Let's Encrypt SSL",
            "Air-gapped / private network support",
            "Bring your own database",
            "No data leaves your infrastructure",
            "Priority support & SLA",
          ].map(f => (
            <div key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
              <span>{f}</span>
            </div>
          ))}
        </div>

        <a
          href="mailto:sales@automationstudio.dev?subject=Self-Hosting%20Inquiry"
          className="inline-flex items-center gap-2 bg-foreground hover:bg-foreground/90 text-background font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
        >
          Contact Sales
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        <p className="text-[10px] text-muted-foreground mt-3">
          Or{" "}
          <Link href="/billing" className="text-primary hover:underline">upgrade to Team</Link>{" "}
          to unlock self-hosting instantly.
        </p>
      </div>
    </div>
  );
}

const DOCKER_COMPOSE = `version: "3.9"

services:
  api:
    image: ghcr.io/automationstudio/api-server:latest
    restart: unless-stopped
    environment:
      DATABASE_URL: \${DATABASE_URL}
      SESSION_SECRET: \${SESSION_SECRET}
      CLERK_SECRET_KEY: \${CLERK_SECRET_KEY}
      STRIPE_SECRET_KEY: \${STRIPE_SECRET_KEY}
      PORT: 3001
    depends_on:
      - db

  web:
    image: ghcr.io/automationstudio/web:latest
    restart: unless-stopped
    environment:
      VITE_CLERK_PUBLISHABLE_KEY: \${VITE_CLERK_PUBLISHABLE_KEY}
      VITE_API_URL: https://\${DOMAIN}/api
    depends_on:
      - api

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: automation_studio
      POSTGRES_USER: \${POSTGRES_USER:-studio}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - certbot_certs:/etc/letsencrypt:ro
    depends_on:
      - api
      - web

  certbot:
    image: certbot/certbot
    volumes:
      - certbot_certs:/etc/letsencrypt
    command: >
      certonly --webroot --webroot-path=/var/www/html
      --email \${SSL_EMAIL} --agree-tos --no-eff-email
      -d \${DOMAIN}

volumes:
  postgres_data:
  certbot_certs:
`;

const ENV_EXAMPLE = `# Automation Studio — Self-Hosted .env
DOMAIN=your-domain.com
SSL_EMAIL=admin@your-domain.com

# Database
POSTGRES_USER=studio
POSTGRES_PASSWORD=change_me_to_something_strong

DATABASE_URL=postgresql://studio:\${POSTGRES_PASSWORD}@db:5432/automation_studio

# Auth (Clerk)
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...

# Sessions
SESSION_SECRET=change_me_to_64_random_chars

# Stripe (optional — for billing features)
STRIPE_SECRET_KEY=sk_live_...
`;

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-mono text-muted-foreground">{label}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono text-foreground overflow-x-auto bg-background leading-relaxed whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

const STEPS = [
  {
    n: 1,
    title: "Clone & configure",
    body: "Download the docker-compose.yml and create your .env file from the template below.",
  },
  {
    n: 2,
    title: "Point your DNS",
    body: "Create an A record pointing your domain to your server's IP address. Wait for propagation (usually < 5 min).",
  },
  {
    n: 3,
    title: "Issue SSL certificate",
    body: "Run: docker compose run --rm certbot — this obtains a free Let's Encrypt certificate for your domain.",
    code: "docker compose run --rm certbot",
  },
  {
    n: 4,
    title: "Start the stack",
    body: "Bring up all services in the background.",
    code: "docker compose up -d",
  },
  {
    n: 5,
    title: "Run migrations",
    body: "Apply the database schema on first start.",
    code: "docker compose exec api pnpm --filter @workspace/db run push",
  },
];

export default function SettingsSelfHost() {
  const { data: me } = useGetAuthMe();
  const plan = (me as unknown as { plan?: string })?.plan ?? "free";
  const hasAccess = plan === "team";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <p className="mb-6 rounded-lg border border-amber-500/30 p-3 text-sm text-amber-300">Development guide. The inherited Docker deployment is not validated for production. Use the documented local setup for this portfolio demo.</p>
      <div className="flex items-center gap-3 mb-8">
        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
          <Server className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Self-Hosting / Docker</h1>
          <p className="text-xs text-muted-foreground">Deploy on your own VPS or private infrastructure</p>
        </div>
        {hasAccess && (
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 text-xs font-semibold text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Team plan — Self-hosting enabled
          </div>
        )}
      </div>

      {!hasAccess ? (
        <ContactSalesBanner plan={plan} />
      ) : (
        <div className="space-y-8">
          {/* Quick-start steps */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <h2 className="text-sm font-semibold text-foreground mb-4">Quick-start guide</h2>
            <ol className="space-y-4">
              {STEPS.map(step => (
                <li key={step.n} className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-primary">{step.n}</span>
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-semibold text-foreground">{step.title}</p>
                    <p className="text-xs text-muted-foreground">{step.body}</p>
                    {step.code && (
                      <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 font-mono text-xs text-foreground border border-border">
                        <Terminal className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <code>{step.code}</code>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Downloads */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => {
                const blob = new Blob([DOCKER_COMPOSE], { type: "text/yaml" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "docker-compose.yml"; a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-3 p-4 border border-border hover:border-primary/40 rounded-xl bg-card hover:bg-primary/5 transition-colors text-left group"
            >
              <Download className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">docker-compose.yml</p>
                <p className="text-[11px] text-muted-foreground">Full stack: API, web, Postgres, Nginx, Certbot</p>
              </div>
            </button>

            <button
              onClick={() => {
                const blob = new Blob([ENV_EXAMPLE], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = ".env.example"; a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-3 p-4 border border-border hover:border-primary/40 rounded-xl bg-card hover:bg-primary/5 transition-colors text-left group"
            >
              <Download className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">.env.example</p>
                <p className="text-[11px] text-muted-foreground">Environment variable template</p>
              </div>
            </button>
          </div>

          {/* docker-compose.yml viewer */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">docker-compose.yml</h2>
            <CodeBlock code={DOCKER_COMPOSE} label="docker-compose.yml" />
          </div>

          {/* .env template */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">.env template</h2>
            <CodeBlock code={ENV_EXAMPLE} label=".env.example" />
          </div>

          {/* Notes */}
          <div className="border border-amber-400/20 bg-amber-400/5 rounded-xl p-4 space-y-1.5">
            <p className="text-xs font-semibold text-amber-400">Before you deploy</p>
            <ul className="space-y-1 list-disc list-inside text-xs text-muted-foreground">
              <li>You still need a Clerk application for auth — create one at <a href="https://clerk.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">clerk.com</a> (free tier works fine).</li>
              <li>Stripe keys are only needed if you want to run the billing/upgrade features. Safe to leave blank for self-hosted.</li>
              <li>Make sure ports 80 and 443 are open in your firewall / security group.</li>
              <li>For upgrades: <code className="bg-muted px-1 rounded">docker compose pull && docker compose up -d</code></li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
