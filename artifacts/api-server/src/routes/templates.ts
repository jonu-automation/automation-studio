import { Router, type IRouter } from "express";
import { db, workflowsTable } from "@workspace/db";
import { requireAuth, upsertUser } from "../middlewares/requireAuth";
import type { Request, Response } from "express";

const router: IRouter = Router();

type TemplateNode = {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
};
type TemplateEdge = { id: string; source: string; target: string; sourceHandle?: string };
type Template = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  highlight?: string;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
};

const n = (id: string, type: string, label: string, x: number, y: number, config: Record<string, unknown> = {}): TemplateNode =>
  ({ id, type, label, x, y, config });
const e = (source: string, target: string): TemplateEdge =>
  ({ id: `e_${source}_${target}`, source, target });

const TEMPLATES: Template[] = [
  {
    id: "portfolio-lead-routing", name: "Demo: Lead qualification",
    description: "A complete local example: sample lead, conditional routing and structured results. No credentials or external services required.",
    category: "Lead Capture", icon: "GitBranch", difficulty: "Beginner", highlight: "Runs locally without API keys",
    nodes: [
      n("start", "manual", "Start demo", 80, 200),
      n("lead", "transform", "Sample lead", 300, 200, { code: 'const output = { name: "Alex", email: "alex@example.invalid", score: 85, source: "Portfolio demo" };' }),
      n("qualify", "if_else", "Score at least 50?", 550, 200, { condition: "input.score >= 50" }),
      n("qualified", "transform", "Qualified lead", 810, 100, { code: 'const output = { lead: input.data.name, score: input.data.score, route: "qualified", nextAction: "Schedule a discovery call" };' }),
      n("nurture", "transform", "Nurture lead", 810, 320, { code: 'const output = { lead: input.data.name, score: input.data.score, route: "nurture", nextAction: "Follow up later" };' }),
    ],
    edges: [e("start", "lead"), e("lead", "qualify"), { ...e("qualify", "qualified"), sourceHandle: "true" }, { ...e("qualify", "nurture"), sourceHandle: "false" }],
  },
  {
    id: "portfolio-approval", name: "Demo: Review before publishing",
    description: "Prepare a sample report, pause for a decision in the approvals inbox and continue after approval. No email provider required.",
    category: "Reporting", icon: "ClipboardCheck", difficulty: "Beginner", highlight: "Local human approval demo",
    nodes: [
      n("start", "manual", "Start report", 80, 200),
      n("draft", "transform", "Prepare report", 300, 200, { code: 'const output = { title: "Weekly activity", leads: 12, qualified: 4, sample: true };' }),
      n("review", "approval", "Review report", 540, 200, { title: "Review the sample weekly report", message: "This is a portfolio demonstration. Approve to continue; reject to stop.", approvalMode: "any" }),
      n("done", "transform", "Record approval", 800, 200, { code: 'const output = { status: "reviewed", approved: input.approved, report: input.$nodes.draft, sample: true };' }),
    ], edges: [e("start", "draft"), e("draft", "review"), e("review", "done")],
  },
  {
    id: "ai-news-digest",
    name: "Daily AI News Digest → Slack",
    description: "Every morning at 9am, fetch the top tech headlines, summarize them with GPT, and post the digest to your team Slack channel.",
    category: "AI",
    icon: "Newspaper",
    difficulty: "Beginner",
    highlight: "Showcases AI summarization",
    nodes: [
      n("trig", "schedule", "Every morning 9am", 100, 200, { cron: "0 9 * * *" }),
      n("fetch", "http_request", "Fetch HN top stories", 360, 200, { method: "GET", url: "https://hacker-news.firebaseio.com/v0/topstories.json" }),
      n("ai", "openai", "Summarize with GPT", 620, 200, { model: "gpt-4o-mini", systemPrompt: "You are a tech news editor. Write a concise 5-bullet summary.", userPrompt: "Summarize today's top stories: {{fetch.body}}" }),
      n("post", "slack", "Post to Slack", 880, 200, { channel: "#general", message: "📰 *Today's AI News*\n{{ai.content}}" }),
    ],
    edges: [e("trig", "fetch"), e("fetch", "ai"), e("ai", "post")],
  },
  {
    id: "form-to-sheets",
    name: "Form Submission → Google Sheets + Email",
    description: "Receive form submissions via webhook, log them to a Google Sheet, and send a confirmation email to the submitter.",
    category: "Lead Capture",
    icon: "ClipboardList",
    difficulty: "Beginner",
    nodes: [
      n("trig", "webhook", "Form webhook", 100, 200, { url: "/webhook/form-submission" }),
      n("sheet", "google_sheets", "Log to Sheet", 360, 120, { operation: "append", spreadsheetId: "YOUR_SHEET_ID", range: "Submissions!A:D", values: '[["{{trig.body.name}}","{{trig.body.email}}","{{trig.body.message}}","{{trig.body.timestamp}}"]]' }),
      n("email", "email", "Send confirmation", 360, 280, { to: "{{trig.body.email}}", subject: "Thanks for reaching out!", body: "Hi {{trig.body.name}},\n\nWe got your message and will reply shortly." }),
    ],
    edges: [e("trig", "sheet"), e("trig", "email")],
  },
  {
    id: "ai-support-triage",
    name: "AI Customer Support Triage",
    description: "Classify incoming support tickets with GPT (urgent/normal/spam), then route urgent ones to Slack and the rest to your help desk email.",
    category: "AI",
    icon: "Headphones",
    difficulty: "Intermediate",
    highlight: "AI-powered routing",
    nodes: [
      n("trig", "webhook", "Ticket webhook", 100, 200, { url: "/webhook/support" }),
      n("classify", "openai", "Classify urgency", 360, 200, { model: "gpt-4o-mini", systemPrompt: "Classify the support ticket as exactly one of: URGENT, NORMAL, or SPAM. Reply with only that word.", userPrompt: "Subject: {{trig.body.subject}}\n\n{{trig.body.message}}" }),
      n("branch", "if_else", "Is urgent?", 620, 200, { condition: "{{classify.content}} === 'URGENT'" }),
      n("urgent", "slack", "Alert on-call", 880, 100, { channel: "#support-urgent", message: "🚨 Urgent ticket from {{trig.body.email}}: {{trig.body.subject}}" }),
      n("normal", "email", "Forward to help desk", 880, 300, { to: "support@example.com", subject: "[New ticket] {{trig.body.subject}}", body: "{{trig.body.message}}" }),
    ],
    edges: [e("trig", "classify"), e("classify", "branch"), e("branch", "urgent"), e("branch", "normal")],
  },
  {
    id: "stripe-to-discord",
    name: "Stripe Payment → Discord Celebration",
    description: "Whenever Stripe sends a successful payment webhook, post a celebratory message to your team Discord channel.",
    category: "Notifications",
    icon: "PartyPopper",
    difficulty: "Beginner",
    nodes: [
      n("trig", "webhook", "Stripe webhook", 100, 200, { url: "/webhook/stripe" }),
      n("filter", "if_else", "Is successful charge?", 360, 200, { condition: "{{trig.body.type}} === 'charge.succeeded'" }),
      n("notify", "discord", "Post to Discord", 620, 200, { content: "💰 New payment! ${{trig.body.data.object.amount}} from {{trig.body.data.object.billing_details.email}}", username: "Cha-Ching Bot" }),
    ],
    edges: [e("trig", "filter"), e("filter", "notify")],
  },
  {
    id: "github-to-notion",
    name: "GitHub Issue → Notion Database",
    description: "When a new GitHub issue is opened, automatically create a corresponding page in your Notion bug tracker.",
    category: "Dev Tools",
    icon: "Bug",
    difficulty: "Intermediate",
    nodes: [
      n("trig", "webhook", "GitHub webhook", 100, 200, { url: "/webhook/github" }),
      n("filter", "if_else", "Is new issue?", 360, 200, { condition: "{{trig.body.action}} === 'opened'" }),
      n("notion", "notion", "Create Notion page", 620, 200, { databaseId: "YOUR_DB_ID", properties: '{"Name":{"title":[{"text":{"content":"{{trig.body.issue.title}}"}}]},"Status":{"select":{"name":"Open"}}}', content: "{{trig.body.issue.body}}\n\nLink: {{trig.body.issue.html_url}}" }),
    ],
    edges: [e("trig", "filter"), e("filter", "notion")],
  },
  {
    id: "weekly-sales-report",
    name: "Weekly AI Sales Report",
    description: "Every Monday at 8am, query the database for last week's sales, ask GPT to write an executive summary, and email it to leadership.",
    category: "Reporting",
    icon: "TrendingUp",
    difficulty: "Intermediate",
    highlight: "DB → AI → Email pipeline",
    nodes: [
      n("trig", "schedule", "Mondays 8am", 100, 200, { cron: "0 8 * * 1" }),
      n("query", "database_query", "Last week sales", 360, 200, { query: "SELECT product, SUM(amount) AS total, COUNT(*) AS orders FROM sales WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY product ORDER BY total DESC LIMIT 10;" }),
      n("ai", "openai", "Generate insights", 620, 200, { model: "gpt-4o", systemPrompt: "You are a CFO. Write a concise weekly sales summary highlighting trends, wins, and concerns.", userPrompt: "Sales data: {{query.rows}}" }),
      n("email", "email", "Email leadership", 880, 200, { to: "leadership@example.com", subject: "Weekly Sales Report — {{trig.timestamp}}", body: "{{ai.content}}" }),
    ],
    edges: [e("trig", "query"), e("query", "ai"), e("ai", "email")],
  },
  {
    id: "expense-approval",
    name: "Expense Approval Workflow",
    description: "Employee submits an expense via webhook. If over $500, route to manager for approval before reimbursing. Under $500 auto-approved.",
    category: "Human-in-the-Loop",
    icon: "ClipboardCheck",
    difficulty: "Advanced",
    highlight: "Uses approval gate",
    nodes: [
      n("trig", "webhook", "Expense form", 100, 200, { url: "/webhook/expense" }),
      n("branch", "if_else", "Over $500?", 360, 200, { condition: "{{trig.body.amount}} > 500" }),
      n("approve", "approval", "Manager approval", 620, 100, { title: "Expense approval: ${{trig.body.amount}}", message: "{{trig.body.employee}} requests reimbursement for: {{trig.body.description}}", approverEmails: "manager@example.com", deadlineHours: 48 }),
      n("notify-mgr", "email", "Notify employee (approved)", 880, 100, { to: "{{trig.body.email}}", subject: "Expense approved", body: "Your ${{trig.body.amount}} expense has been approved." }),
      n("notify-auto", "email", "Auto-approve", 620, 300, { to: "{{trig.body.email}}", subject: "Expense auto-approved", body: "Your ${{trig.body.amount}} expense was auto-approved (under $500 limit)." }),
    ],
    edges: [e("trig", "branch"), e("branch", "approve"), e("approve", "notify-mgr"), e("branch", "notify-auto")],
  },
  {
    id: "ai-lead-scoring",
    name: "AI Lead Scoring → CRM + Slack",
    description: "Score new leads from your website with GPT (1-10), log all leads to Notion, and ping sales in Slack only for hot leads (score ≥ 8).",
    category: "AI",
    icon: "Target",
    difficulty: "Advanced",
    highlight: "AI + multi-output routing",
    nodes: [
      n("trig", "webhook", "New lead webhook", 100, 200, { url: "/webhook/new-lead" }),
      n("score", "openai", "Score lead 1-10", 360, 200, { model: "gpt-4o-mini", systemPrompt: "You are a B2B sales qualifier. Reply with ONLY a single integer 1-10 representing fit and intent.", userPrompt: "Company: {{trig.body.company}}\nRole: {{trig.body.role}}\nMessage: {{trig.body.message}}" }),
      n("log", "notion", "Log to CRM", 620, 100, { databaseId: "YOUR_CRM_DB", properties: '{"Name":{"title":[{"text":{"content":"{{trig.body.name}}"}}]},"Score":{"number":{{score.content}}},"Company":{"rich_text":[{"text":{"content":"{{trig.body.company}}"}}]}}' }),
      n("hot", "if_else", "Hot lead?", 620, 300, { condition: "Number({{score.content}}) >= 8" }),
      n("alert", "slack", "Alert sales", 880, 300, { channel: "#sales-hot-leads", message: "🔥 Hot lead ({{score.content}}/10): {{trig.body.name}} from {{trig.body.company}}" }),
    ],
    edges: [e("trig", "score"), e("score", "log"), e("score", "hot"), e("hot", "alert")],
  },
  {
    id: "twitter-to-airtable",
    name: "Twitter Mentions → Airtable Tracker",
    description: "Capture mentions of your brand from a webhook (Twitter/X API or Make integration) and log each one as a row in Airtable for community tracking.",
    category: "Social",
    icon: "Twitter",
    difficulty: "Beginner",
    nodes: [
      n("trig", "webhook", "Mention webhook", 100, 200, { url: "/webhook/twitter-mention" }),
      n("save", "airtable", "Save to Airtable", 360, 200, { baseId: "YOUR_BASE_ID", tableName: "Mentions", fields: '{"Author":"{{trig.body.user.screen_name}}","Tweet":"{{trig.body.text}}","URL":"{{trig.body.url}}","Sentiment":""}' }),
    ],
    edges: [e("trig", "save")],
  },
  {
    id: "ai-standup-prompt",
    name: "AI-Generated Daily Standup",
    description: "Every weekday at 9:30am, GPT generates a fresh standup question (based on the day) and posts it to Slack to kick off the team's async standup.",
    category: "Team",
    icon: "Coffee",
    difficulty: "Beginner",
    nodes: [
      n("trig", "schedule", "Weekdays 9:30am", 100, 200, { cron: "30 9 * * 1-5" }),
      n("ai", "openai", "Generate prompt", 360, 200, { model: "gpt-4o-mini", systemPrompt: "You are a friendly team lead. Generate ONE creative async standup question for engineers. Keep it short and warm.", userPrompt: "Today is {{trig.timestamp}}. Give me one standup question." }),
      n("post", "slack", "Post to standup channel", 620, 200, { channel: "#standup", message: "☕ Good morning team!\n\n{{ai.content}}\n\nReply in thread 👇" }),
    ],
    edges: [e("trig", "ai"), e("ai", "post")],
  },
];

router.get("/templates", async (_req, res): Promise<void> => {
  res.json(TEMPLATES.map(({ nodes, edges, ...meta }) => ({
    ...meta,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  })));
});

router.get("/templates/:id", async (req, res): Promise<void> => {
  const t = TEMPLATES.find((x) => x.id === req.params.id);
  if (!t) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(t);
});

router.post("/templates/:id/use", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const t = TEMPLATES.find((x) => x.id === req.params.id);
  if (!t) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  const userId = req.userId!;
  await upsertUser(userId, undefined);
  const [created] = await db.insert(workflowsTable).values({
    userId,
    name: t.name,
    description: t.description,
    nodes: t.nodes as object,
    edges: t.edges as object,
    active: false,
  }).returning();
  res.status(201).json({ id: created.id, name: created.name, templateId: t.id });
});

export default router;
