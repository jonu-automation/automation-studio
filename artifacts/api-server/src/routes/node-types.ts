import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const NODE_TYPES = [
  {
    type: "webhook",
    label: "Webhook",
    category: "Triggers",
    description: "Trigger workflow via HTTP webhook",
    color: "#f97316",
    icon: "Webhook",
    configSchema: { url: { type: "string", label: "Webhook URL" } },
  },
  {
    type: "schedule",
    label: "Schedule",
    category: "Triggers",
    description: "Run workflow on a schedule (cron)",
    color: "#f97316",
    icon: "Clock",
    configSchema: { cron: { type: "string", label: "Cron expression" } },
  },
  {
    type: "manual",
    label: "Manual Trigger",
    category: "Triggers",
    description: "Manually trigger the workflow",
    color: "#f97316",
    icon: "Play",
    configSchema: {},
  },
  {
    type: "http_request",
    label: "HTTP Request",
    category: "Actions",
    description: "Make an HTTP request to any URL",
    color: "#3b82f6",
    icon: "Globe",
    configSchema: {
      method: { type: "select", label: "Method", options: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
      url: { type: "string", label: "URL" },
      headers: { type: "json", label: "Headers" },
      body: { type: "json", label: "Body" },
    },
  },
  {
    type: "email",
    label: "Send Email",
    category: "Actions",
    description: "Send an email message",
    color: "#3b82f6",
    icon: "Mail",
    configSchema: {
      to: { type: "string", label: "To" },
      subject: { type: "string", label: "Subject" },
      body: { type: "text", label: "Body" },
    },
  },
  {
    type: "slack",
    label: "Slack Message",
    category: "Actions",
    description: "Send a message to Slack",
    color: "#3b82f6",
    icon: "MessageSquare",
    configSchema: {
      channel: { type: "string", label: "Channel" },
      message: { type: "text", label: "Message" },
    },
  },
  {
    type: "database_query",
    label: "Database Query",
    category: "Data",
    description: "Execute a SQL query",
    color: "#8b5cf6",
    icon: "Database",
    configSchema: {
      query: { type: "text", label: "SQL Query" },
    },
  },
  {
    type: "transform",
    label: "Transform Data",
    category: "Data",
    description: "Transform data with JavaScript",
    color: "#8b5cf6",
    icon: "Code2",
    configSchema: {
      code: { type: "code", label: "JavaScript Code" },
    },
  },
  {
    type: "filter",
    label: "Filter",
    category: "Logic",
    description: "Filter data based on conditions",
    color: "#22c55e",
    icon: "Filter",
    configSchema: {
      condition: { type: "string", label: "Condition" },
    },
  },
  {
    type: "if_else",
    label: "If/Else",
    category: "Logic",
    description: "Branch workflow based on condition",
    color: "#22c55e",
    icon: "GitBranch",
    configSchema: {
      condition: { type: "string", label: "Condition expression" },
    },
  },
  {
    type: "wait",
    label: "Wait",
    category: "Logic",
    description: "Pause execution for a set duration",
    color: "#22c55e",
    icon: "Timer",
    configSchema: {
      duration: { type: "number", label: "Duration (ms)" },
    },
  },
  {
    type: "set_variable",
    label: "Set Variable",
    category: "Utilities",
    description: "Set or update a variable value",
    color: "#64748b",
    icon: "Variable",
    configSchema: {
      name: { type: "string", label: "Variable name" },
      value: { type: "string", label: "Value" },
    },
  },
  {
    type: "json_parse",
    label: "Parse JSON",
    category: "Utilities",
    description: "Parse a JSON string into an object",
    color: "#64748b",
    icon: "FileJson",
    configSchema: {
      input: { type: "string", label: "Input field" },
    },
  },
  {
    type: "google_sheets",
    label: "Google Sheets",
    category: "Integrations",
    description: "Read or append rows to a Google Sheet",
    color: "#10b981",
    icon: "Sheet",
    configSchema: {
      operation: { type: "select", label: "Operation", options: ["append", "read"] },
      spreadsheetId: { type: "string", label: "Spreadsheet ID" },
      range: { type: "string", label: "Range (e.g. Sheet1!A:C)" },
      values: { type: "json", label: "Values (for append) — array of arrays" },
      credentialName: { type: "string", label: "Credential name (google_sheets)" },
    },
  },
  {
    type: "openai",
    label: "OpenAI Chat",
    category: "Integrations",
    description: "Send a prompt to OpenAI and get a completion",
    color: "#10b981",
    icon: "Sparkles",
    configSchema: {
      model: { type: "select", label: "Model", options: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"] },
      systemPrompt: { type: "text", label: "System prompt" },
      userPrompt: { type: "text", label: "User prompt" },
      temperature: { type: "number", label: "Temperature (0-2)" },
      credentialName: { type: "string", label: "Credential name (openai)" },
    },
  },
  {
    type: "notion",
    label: "Notion",
    category: "Integrations",
    description: "Create a page in a Notion database",
    color: "#10b981",
    icon: "FileText",
    configSchema: {
      databaseId: { type: "string", label: "Database ID" },
      properties: { type: "json", label: "Properties (Notion property object)" },
      content: { type: "text", label: "Page content (markdown, optional)" },
      credentialName: { type: "string", label: "Credential name (notion)" },
    },
  },
  {
    type: "airtable",
    label: "Airtable",
    category: "Integrations",
    description: "Create a record in an Airtable table",
    color: "#10b981",
    icon: "Table",
    configSchema: {
      baseId: { type: "string", label: "Base ID" },
      tableName: { type: "string", label: "Table name" },
      fields: { type: "json", label: "Fields object" },
      credentialName: { type: "string", label: "Credential name (airtable)" },
    },
  },
  {
    type: "discord",
    label: "Discord Message",
    category: "Integrations",
    description: "Send a message to Discord via webhook",
    color: "#10b981",
    icon: "MessageCircle",
    configSchema: {
      webhookUrl: { type: "string", label: "Webhook URL (or use credential)" },
      content: { type: "text", label: "Message content" },
      username: { type: "string", label: "Override username (optional)" },
      credentialName: { type: "string", label: "Credential name (discord_webhook)" },
    },
  },
  {
    type: "approval",
    label: "Approval Gate",
    category: "Human-in-the-Loop",
    description: "Pause execution and wait for a human to approve or reject",
    color: "#f97316",
    icon: "ClipboardCheck",
    configSchema: {
      title: { type: "string", label: "Approval title" },
      message: { type: "text", label: "Instructions for approver" },
      approverEmails: { type: "string", label: "Approver emails (comma-separated)" },
      deadlineHours: { type: "number", label: "Deadline (hours)" },
    },
  },
];

router.get("/node-types", requireAuth, async (_req, res): Promise<void> => {
  res.json(NODE_TYPES);
});

export default router;
