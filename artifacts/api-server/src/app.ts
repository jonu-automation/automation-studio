import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import rateLimit from "express-rate-limit";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./lib/webhookHandlers";
import { localMode } from "./lib/runtime";

const app: Express = express();

// Trust the Replit / reverse-proxy X-Forwarded-For header so
// rate-limiting and IP detection work correctly behind the proxy.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

if (localMode) {
  app.use((req, res, next) => {
    const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
    const origin = req.header("origin");
    let allowedOrigin = !origin;
    try { if (origin) allowedOrigin = allowedHosts.has(new URL(origin).hostname); } catch { allowedOrigin = false; }
    if (!allowedHosts.has(req.hostname) || !allowedOrigin || req.header("sec-fetch-site") === "cross-site") {
      res.status(403).json({ error: "Local mode accepts loopback requests only." });
      return;
    }
    next();
  });
} else {
  app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
  app.use(clerkMiddleware());
}

app.use(cors({ credentials: true, origin: true }));


// LemonSqueezy webhook MUST be before express.json() to receive raw Buffer
app.post(
  "/api/lemonsqueezy/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["x-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing x-signature header" });
      return;
    }
    const sig = Array.isArray(signature) ? signature[0] : signature;
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "LemonSqueezy webhook error");
      res.status(400).json({ error: msg });
    }
  },
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── Health check (no auth, no rate limit — used by Docker & load balancers) ───
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Global: 200 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
  skip: (req) => req.path.startsWith("/webhooks"), // webhooks are exempt (path is relative to /api mount)
});

// Strict: execution endpoint — 20 runs per minute per IP
const executionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Execution rate limit reached. Max 20 workflow runs per minute." },
});

// AI generation — 30 requests per minute per IP
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "AI generation rate limit reached. Max 30 requests per minute." },
});

app.use("/api", globalLimiter);
app.use("/api/executions", executionLimiter);
app.use("/api/ai", aiLimiter);

app.use("/api", router);

export default app;
