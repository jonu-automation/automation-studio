# Portfolio verification report

Date: 2026-10-01. Targets: Windows local workspace and GitHub Actions on Ubuntu, Node.js 24, persistent PGlite database, local API and Vite interface.

| Check | Result | Evidence |
| --- | --- | --- |
| Workspace TypeScript checks | Passed; latest API and frontend changes separately rechecked | scripts/workspace-check.mjs; frontend tsc |
| Core regression tests | 4 passed | tests/core.test.ts |
| Database migration and persistence | Passed | scripts/check-db.mjs: 7 tables, first open, reopen, repeated migration |
| Running API integration checks | 19 passed | scripts/smoke-local.mjs |
| Editor: change score without Save, then Run | Passed in browser | Current score executed; opposite branch skipped |
| Editor: preserve branch handles after saving | Passed in browser | Both true and false routes preserved across canvas save |
| Report approval through UI | Passed in browser | Pause, inbox decision, final reviewed output containing the report |
| Production build | Final build passed in user's PowerShell | API bundled; Vite built 3299 modules; sourcemap warning did not fail build |
| External provider delivery and AI generation | Not verified with real credentials | No paid-provider calls were made |
| Compiled API runtime | Passed with final build, including all 19 integration checks | scripts/check-compiled.mjs: isolated fresh database, save, transform output 42, full API suite |
| GitHub CI on Linux | Passed | [Verified run](https://github.com/jonu-automation/automation-studio/actions/runs/36935264280): frozen install, TypeScript, regression tests, database persistence, build, compiled API and running API suite |
| Public application deployment | Not verified | Source repository is public; the application runs locally |

## API coverage

1. True/false routing and run counters.
2. Workflow version saving and restoration.
3. Human approval pause and resume.
4. Human rejection stops execution.
5. Missing provider credentials return a real error.
6. Credential creation/listing omits secret data.
7. Filter skip propagation and successful passage.
8. Inactive webhook rejection and activated webhook execution.
9. Event-stream replay of completed execution.
10. Native workflow import removes direct credential fields.
11. Unimplemented/unknown nodes fail explicitly.
12. MCP rejects unauthenticated calls.
13. Authenticated JSON-RPC initialize, list and call.
14. HTTP request node receives a real local API response.
15. Cron scheduler executes an activated workflow.
16. Local mode rejects a foreign Origin.
17. Execution history combines workflow and status filters.
18. The local lead template executes both routes after editing.
19. The local report template preserves report data after approval.

Core tests additionally check DAG joins and cycle rejection, skipped branch propagation, restricted/time-limited code evaluation and encrypted credential round-trip/tamper detection. These are development checks, not certification of a hardened production sandbox.

## Reproduce

~~~sh
pnpm typecheck
pnpm test
pnpm test:db
pnpm build
~~~

With pnpm local running in a separate terminal:

~~~sh
pnpm test:local
~~~

The API checks create and remove their own verification workflows and a fake credential. They add run activity to the local usage counters. The MCP test uses an existing local key when available; otherwise it creates a temporary key and revokes it afterwards.

The restarted local API passed all 19 checks, including combined history filters and both local templates.

Final build of the latest source and dependency manifest completed successfully in PowerShell. The compiled API is also checked with an isolated database.
