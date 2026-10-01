# Automation Studio

A software portfolio project demonstrating a visual workflow automation platform built with React, TypeScript, Express, PostgreSQL/Drizzle and React Flow. Includes editable workflows, conditional routing, schedules, webhook triggers, human approvals, execution logs and version history.

Two self-contained examples demonstrate lead qualification and report approval without provider keys or paid services. The local workspace has passed 19 API integration checks, database persistence checks and compiled API verification. See [verification details](docs/VALIDATION.md).

## Free local workspace

The local workspace uses a persistent embedded PostgreSQL database through [PGlite](https://pglite.dev/docs/filesystems). No Docker, database server, Clerk account or paid subscription is needed. The existing PostgreSQL/Clerk architecture is retained for future hosted deployments.

Requirements: Node.js 24 and pnpm 10 or newer. On Windows use PowerShell, on Linux use your terminal.

~~~sh
pnpm install --frozen-lockfile
pnpm local
~~~

Open http://127.0.0.1:3000. The API listens on 127.0.0.1:8080. Use Ctrl+C to stop both services. Windows users can use start-local.cmd after installing dependencies. The committed initial migration is applied automatically.

The local workspace opens as one local owner with access to all plan-gated screens. This is development access, not production authentication. LOCAL_MODE cannot run with NODE_ENV=production. Both listeners bind to loopback; do not tunnel or expose this mode publicly. Browser requests from foreign origins are rejected.

Data lives in .local/data. Credential values are encrypted with AES-256-GCM; the generated local key is in .local/credential.key. Keep the database and key together when backing up or moving to Kali/Linux. All .local data and keys are ignored by Git. Secrets entered in workflow configuration fields should be moved to the Credentials page instead.

## External integrations

HTTP requests and local transformations work without paid services. Email, Slack, Google Sheets, OpenAI, Notion, Airtable and Discord require your own valid credentials and the respective provider may charge for usage. Missing credentials produce an error; they do not report simulated success. The AI generator requires OPENAI_API_KEY. Billing actions are disabled in local mode. No accounts or paid services are created automatically.

If you want the optional AI generator locally, set OPENAI_API_KEY in the launching terminal before running pnpm local. Keep all real values out of Git.

## Development checks

~~~sh
pnpm typecheck
pnpm test
pnpm build
~~~

The initial migration is generated from lib/db/src/schema and is applied automatically when the local database opens. Commit the generated migration files. Regenerate migrations only after a schema change.

Workflow branches use true/false source handles in the editor. Cycles are rejected. Joins run after predecessors; skipped and failed steps do not activate their descendants. Legacy if/else edges without a source handle are treated as the true branch.

## Project layout

- artifacts/n8n-automation: web interface and editor
- artifacts/api-server: API, scheduler and executor
- lib/db: schema, migrations and database adapters
- lib/api-spec: OpenAPI specification
- lib/api-client-react and lib/api-zod: generated API clients and validation
- tests: regression checks

## Hosting status

Local development is the first verified target. Public multi-user hosting requires a separate review and configuration. The inherited Docker files are not certified for production yet. SSO currently stores configuration but does not implement a complete SAML/OIDC sign-in flow. Database Query and unknown node types fail explicitly until implemented. User code runs in a separate process with a memory cap, VM timeout and no inherited environment secrets, but this is not a hardened production sandbox. Approval-link races, webhook execution limits, outbound request restrictions and billing rules still require production hardening.

## Repository contents

Source, lockfile, migrations, regression checks and documentation are included. Local data, provider secrets, dependency folders and build outputs are excluded.

After starting the local server, run `node scripts/smoke-local.mjs` to verify API saving, both conditional branches, approval pause/resume, run counters and origin checks. It creates and removes only its own verification workflows.

## Portfolio demonstration

After starting the app, run `pnpm demo:seed` in another terminal to add two reusable local workflows. This command leaves existing workflows untouched. Open Workflows and try **Portfolio: Lead qualification** and **Portfolio: Report approval**. Neither requires provider keys.

The editor saves the current canvas before Run and preserves true/false branch handles. Database Query is marked unavailable. Pricing, SSO and hosting pages state their actual development scope.

See [demo walkthrough](docs/PORTFOLIO.md) and [verification report](docs/VALIDATION.md). `pnpm test:local` checks the running API; `pnpm test:db` checks database persistence independently. Provider delivery and external AI generation require separate checks with real credentials.

`pnpm test:compiled` verifies the bundled API with a disposable database after a successful build. The CI workflow also runs these checks and the running-API suite, but has not yet run on GitHub.
