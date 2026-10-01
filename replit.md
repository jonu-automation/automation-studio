# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### Automation Studio (`artifacts/n8n-automation`)
- n8n-inspired visual workflow automation builder
- React + Vite + `@xyflow/react` v12 for the node canvas (do NOT add `reactflow` v11 — duplicate React instances)
- Routes: `/` (dashboard), `/workflows` (list), `/workflows/new` (create), `/workflows/:id` (edit canvas), `/credentials` (stored credentials), `/executions` (log), `/executions/:id` (detail)
- Features: drag-and-drop node editor, visual workflow canvas, BFS execution engine, real-time stats, real email (Resend), real Slack webhooks, cron scheduling, per-workflow webhook URLs, stored credentials

#### Phase 2 Features (fully complete)
- **Credentials system**: `credentials` table in DB; CRUD API at `/api/credentials`; `/credentials` page in frontend with per-type forms (Resend, Slack, HTTP header, generic)
- **Real email via Resend**: Email nodes call Resend API if a `resend` credential is found; falls back to simulated if not
- **Real Slack**: Slack nodes POST to the stored webhook URL; falls back to simulated if no credential
- **Cron scheduling**: `scheduler.ts` uses `node-cron`; registers jobs for all active workflows with schedule nodes; `onWorkflowToggled()` must be called when a workflow is toggled
- **Webhook triggers**: `webhookToken` column on workflows; POST `/api/webhooks/:token` is public (no auth); token generated on workflow creation
- **Improved node config panel**: Per-type form fields (URL/method for HTTP, credential selectors for email/Slack, cron presets for schedule, webhook URL copy for webhook nodes)

#### Phase 3 — 5 Competitive Differentiators (all complete)

**T001 — Compute-Time Billing**
- 4 plan tiers: Free (5k compute-sec/mo), Hobby $12 (50k), Pro $39 (500k), Team $99 (5M)
- `compute_ms_used` + `compute_ms_reset_at` on users table
- Executor accumulates actual node compute ms, skips idle node types (wait/delay/webhook/schedule/approval/manual)
- GET `/api/billing/usage` returns current compute seconds, plan limits, reset date
- Billing page: usage bar + 4 plan cards; sidebar "Compare pricing" link

**T002 — Human-in-the-Loop Approval Nodes**
- `approval_requests` table (id, executionId, nodeId, approvers[], deadline, status, approveToken, rejectToken)
- `paused_at_node_id`, `resume_context` (jsonb), `waiting_for_approval` on executions table
- Approval node type in executor: creates DB record, emits `workflow:paused`, pauses execution
- GET `/api/approvals` — list pending approvals for current user; POST `/api/approvals/:id/respond` — approve/reject and resume or terminate execution
- GET `/api/approvals/:id/quick?action=approve|reject&token=...` — public email-link approval (no auth needed)
- Frontend: `/approvals` page with pending/responded tabs; sidebar link; palette node "Human-in-the-Loop"

**T003 — Pricing Comparison Calculator**
- `/pricing` is a public route (no auth)
- Interactive sliders: steps/workflow, runs/month, avg seconds/step
- Live cost comparison: Zapier vs n8n Cloud vs n8n Self-Hosted vs Automation Studio
- Savings percentages, break-even analysis, CTA buttons

**T004 — Real-Time Execution Logs (SSE)**
- `executionEvents.ts` — in-memory event bus with 5-min buffer per execution
- Executor emits `workflow:start`, `node:start`, `node:complete`, `workflow:done`, `workflow:paused`
- GET `/api/executions/:id/stream` — SSE stream; replays buffered events for late clients
- Frontend: `LiveExecutionLog` component renders as bottom panel in workflow editor after each run; shows per-node status icons, durations, output previews, error details; collapsible

**T005 — AI Workflow Generator**
- Uses Replit OpenAI integration (no user API key needed); billed to Replit credits
- POST `/api/ai/generate-workflow { prompt }` — GPT-5.2 generates `{ nodes, edges }` JSON
- 14 supported node types; system prompt includes all allowed types and realistic config values
- Frontend: "Generate with AI" button (purple, sparkle icon) in workflow editor toolbar
- Opens `AiGenerateModal` with textarea + 5 curated example prompts; ⌘+Enter to generate
- Shows node list preview with color-coded types before applying; Regenerate + "Add to Canvas" buttons
- `onApplyAiWorkflow` maps generated nodes to ReactFlow nodes with color coding and auto-layout
- AI route at `artifacts/api-server/src/routes/ai.ts`; OpenAI client from `lib/integrations-openai-ai-server`

#### Phase 4 — Pre-VPS Deployment Features (all complete)

**Feature 1 — Docker Containerization**
- Multi-stage `Dockerfile` (builder → app → web), `docker-compose.yml`, `docker-compose.prod.yml` (Let's Encrypt via nginx-proxy + acme-companion)
- `.env.example`, `docker/entrypoint.sh` (runs drizzle migrations on startup), `nginx.conf`, `nginx.prod.conf` (SSL + security headers)
- `GET /health` endpoint in `app.ts` → `{ status: "ok", uptime, timestamp }`

**Feature 2 — SSO Gated to Pro Plan**
- `sso_configs` DB table (id, userId, provider, clientId, clientSecret, domain, metadataUrl, enabled, createdAt, updatedAt)
- `requirePlan` middleware factory at `artifacts/api-server/src/middlewares/requirePlan.ts`
- SSO routes: `GET/PUT/DELETE /api/sso/config` (pro/team only), `GET /api/sso/status` (any auth)
- Frontend: `/settings/sso` page with upgrade banner for free/hobby + full SAML/OIDC config form for pro/team; SSO nav link in layout.tsx

**Feature 3 — Workflow Version Control**
- `workflow_versions` DB table (id, workflowId, versionNumber, createdBy, changelog, nodes jsonb, edges jsonb, nodeCount, edgeCount, createdAt)
- Auto-saves on PUT `/api/workflows/:id` when nodes or edges change; prunes to last 20 versions per workflow
- `GET /api/workflows/:id/versions` — list all versions (newest first, includes nodeCount/edgeCount)
- `GET /api/workflows/:id/versions/:version` — get full snapshot (nodes + edges) for a version
- `POST /api/workflows/:id/versions/:version/restore` — restore version (creates new version stamp)
- Frontend: "History" button in workflow editor toolbar (appears only for saved workflows); slide-over panel shows version cards with version number, relative timestamp, node/edge counts; "Restore" button on non-current versions; toast notifications

#### Workflow Import / Export
- **Export**: "Export" button in editor toolbar (disabled when canvas is empty). Downloads current workflow as `{name}.json` with nodes, edges, name, description, exportedAt timestamp.
- **Import**: "Import" button in workflows list header (next to "New Workflow"). Accepts `.json` files up to 1MB.
  - Backend: `POST /api/workflows/import` — validates required fields (name, nodes[], edges[]), validates node types, detects circular dependencies, strips credential fields, handles duplicate names (appends "(imported)"), respects plan workflow limits.
  - Frontend: reads file client-side → sends JSON body → on success redirects to editor. If credentials were stripped or unknown node types found, stores warnings in sessionStorage; editor reads them on mount and shows an amber warning banner.
- **JSON format**: same as the workflow DB schema — `{ name, description, nodes: [{id, type, label, x, y, config}], edges: [{id, source, target, sourceHandle?, targetHandle?}] }`

#### Orval mutation call pattern (CRITICAL)
Orval-generated mutations ALL expect `{ data: BodyType<XBody> }` wrapper, NOT the body directly:
```typescript
// CORRECT
createWorkflow.mutateAsync({ data: { name, nodes, edges } })
updateWorkflow.mutateAsync({ id, data: { name, nodes, edges } })
executeWorkflow.mutateAsync({ id, data: { inputData: {} } })
createCredential.mutateAsync({ data: { name, credentialType, data: fieldValues } })

// WRONG — sends empty body to API
createWorkflow.mutateAsync({ name, nodes, edges })
```
Exception: mutations that take ONLY URL params (no body) use the params directly: `deleteCredential.mutateAsync({ id })`, `toggleWorkflow.mutate({ id })`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Authentication & Billing

- **Auth**: Clerk (`@clerk/react` on frontend, `@clerk/express` on backend). ClerkProvider wraps the app in `App.tsx`. All API routes require `requireAuth` middleware.
- **Billing**: Stripe integration is set up but NOT yet connected via the Replit integration system. The code gracefully skips Stripe init if not connected.
  - To connect: Either use the Replit Stripe integration (workspace toolbar → Integrations → Stripe), OR set `STRIPE_SECRET_KEY` as a secret and `VITE_STRIPE_PUBLISHABLE_KEY` in the frontend env.
  - **NOTE**: User dismissed the Replit Stripe connector — ask for `STRIPE_SECRET_KEY` and `VITE_STRIPE_PUBLISHABLE_KEY` if they want payments, OR re-propose the integration.
  - Stripe code lives in: `artifacts/api-server/src/lib/stripeClient.ts`, `webhookHandlers.ts`, `routes/billing.ts`
  - Seed products script: `pnpm --filter @workspace/scripts exec tsx src/seed-products.ts`
- **Plan limits**: Free = 5 workflows, 100 runs/mo; Pro = unlimited. Defined in `lib/db/src/schema/users.ts`
- **Database schema**: `users` table has `stripe_customer_id`, `stripe_subscription_id`, `plan`, `runs_this_month`
