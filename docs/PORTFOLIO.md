# Automation Studio — portfolio presentation

## Upwork entry draft

**Title:** Automation Studio — Visual Workflow Builder

**Role:** Full-stack development and testing

**Description:**
Visual workflow automation application built with React, TypeScript, Express and PostgreSQL. Includes a node editor, conditional routing, webhook and scheduled triggers, human approvals, execution logs and workflow version history. A persistent local demo runs without paid services. Integration credentials are encrypted; external services and AI generation use provider keys.

**Skills:** TypeScript, React, Node.js, API Integration, Workflow Automation

## Demonstration walkthrough

1. Open the landing page at http://127.0.0.1:3000 and explain the project scope.
2. Open Workflows → Portfolio: Lead qualification. Inspect the five nodes and True/False branches.
3. Click Run. The sample score of 85 follows Qualified lead; Nurture lead is skipped. Inspect the node results in the execution panel.
4. Select Sample lead and change the score to 20. Click Run directly: the editor saves the current canvas before running. Nurture lead runs and Qualified lead is skipped.
5. Restore the score to 85. Save or Run, then open History to show saved versions.
6. Open Portfolio: Report approval and click Run. It pauses at Review report.
7. Open Approvals and approve the report. Open Executions to inspect the completed result; the report remains available after resumption. A separate run can demonstrate rejection.

For the Upwork portfolio, use screenshots of the visual editor, conditional execution results, approval step and final report. Use a full-width desktop browser. The landing-page animation is illustrative; execution screenshots should show actual results. Exclude provider keys and personal client data. No video is required.

## Recreate the examples

With the local server running, use another terminal:

~~~sh
pnpm demo:seed
~~~

The command adds the two example workflows only when their names are absent. JSON files in examples/ can also be imported from the interface.

## Claims supported by this demonstration

- Visual editing, save-before-run, conditional routing and skipped branch visibility.
- Execution history, node output and event replay.
- Approval pause/resume and rejection.
- Version saving/restoration, webhook activation and cron scheduling.
- Credential encryption and API responses that omit stored secrets.
- Direct authenticated HTTP JSON-RPC workflow calls through an experimental MCP endpoint.

## Features requiring further verification or implementation

Real email, Slack, Sheets, Notion, Airtable, Discord and OpenAI calls require provider keys and end-to-end provider tests. Complete SSO sign-in, database query execution and production Docker hosting are unfinished. Claude/Cursor interoperability and public multi-user operation are not certified by the local demonstration. No exclusivity, feature parity or price superiority over n8n or Zapier is claimed.

The workspace is currently local; publishing the GitHub repository and a public demonstration remains a separate step.
