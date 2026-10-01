import { Router } from "express";
import OpenAI from "openai";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

function getOpenAIClient(): OpenAI {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  try {
    // @ts-ignore — Replit-managed integration proxy, only available inside Replit
    const { openai } = require("@workspace/integrations-openai-ai-server");
    return openai;
  } catch {
    throw new Error(
      "No OpenAI API key configured. Set the OPENAI_API_KEY environment variable."
    );
  }
}

const SYSTEM_PROMPT = `You are an expert workflow automation designer. Given a user's description, generate a visual workflow with nodes and edges.

Return ONLY a valid JSON object with this exact shape:
{
  "nodes": [
    {
      "id": "string (unique, e.g. n1, n2...)",
      "nodeType": "string (see allowed types below)",
      "label": "string (friendly name)",
      "config": {} // optional object with node-specific config
    }
  ],
  "edges": [
    {
      "source": "node id",
      "target": "node id"
    }
  ]
}

Allowed nodeType values and their purpose:
- "schedule" — trigger: run on a cron schedule (config: cronExpression e.g. "0 9 * * 1")
- "webhook" — trigger: receive HTTP webhook (no special config needed)
- "http_request" — make an HTTP request (config: url, method "GET"/"POST"/"PUT"/"DELETE", headers {}, body {})
- "send_email" — send an email (config: to, subject, body)
- "slack_message" — send a Slack message (config: channel e.g. "#general", message)
- "transform" — transform/reshape data with JS (config: code — a JS expression returning the new value)
- "filter" — conditionally route data (config: condition — a JS boolean expression)
- "delay" — pause execution (config: delaySeconds e.g. 300)
- "approval" — pause for human approval (config: approvers ["email@example.com"], message, deadline "24h")
- "database_query" — run a SQL query (config: query, database "postgres")
- "ai_prompt" — call an LLM (config: prompt, model "gpt-4o")
- "set_variable" — set workflow variables (config: variables { key: "value" })
- "loop" — loop over items (config: items "{{data.results}}")
- "merge" — merge multiple branches into one (no special config)

Rules:
- Always start with exactly ONE trigger node (schedule, webhook, or manual)  
- Keep workflows focused: 3-8 nodes is ideal
- Use realistic but generic config values (e.g. placeholder URLs like "https://api.example.com/endpoint")
- Label nodes clearly and concisely
- Only create edges that make logical sense in the workflow
- If the description mentions a condition or branch, use a filter node
- If it mentions approval or review, use an approval node
- For AI/LLM steps, use ai_prompt node type
- Never add nodes that aren't in the allowed list`;

router.post(
  "/generate-workflow",
  requireAuth,
  async (req, res) => {
    const { prompt } = req.body as { prompt?: string };

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
      res.status(400).json({ error: "prompt is required (min 3 chars)" });
      return;
    }

    let client: OpenAI;
    try {
      client = getOpenAIClient();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(503).json({ error: message });
      return;
    }

    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Generate a workflow automation for: "${prompt.trim()}"\n\nReturn only the JSON object, no markdown, no explanation.`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? "";

      const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

      let parsed: { nodes: unknown[]; edges: unknown[] };
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        res.status(500).json({ error: "AI returned malformed JSON", raw });
        return;
      }

      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        res.status(500).json({ error: "AI response missing nodes/edges arrays" });
        return;
      }

      res.json({ nodes: parsed.nodes, edges: parsed.edges });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: `AI generation failed: ${message}` });
    }
  }
);

export default router;
