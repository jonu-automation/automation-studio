import { Router, type IRouter } from "express";
import { requireAuth, upsertUser } from "../middlewares/requireAuth";
import { db, usersTable } from "@workspace/db";
import { getPlanLimit, getComputeSecondsUsed, PLAN_LIMITS } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requestAuth, localMode } from "../lib/runtime";
import {
  createCheckout,
  getVariantId,
  getCustomerPortalUrl,
} from "../lib/lemonSqueezyClient";

const router: IRouter = Router();

function getAppBaseUrl(req: import("express").Request): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]}`;
  return `${req.protocol}://${req.get("host")}`;
}

router.post("/billing/checkout", requireAuth, async (req, res): Promise<void> => {
  if (localMode) { res.status(409).json({ error: "Payments are disabled in local mode; all local features are available." }); return; }
  try {
    await upsertUser(req.userId);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId));
    if (!user) { res.status(404).json({ error: "user_not_found" }); return; }

    const { planKey } = req.body as { planKey?: string };
    if (!planKey || !["hobby", "pro", "team"].includes(planKey)) {
      res.status(400).json({ error: "planKey required: hobby, pro, or team" });
      return;
    }

    const variantId = getVariantId(planKey as "hobby" | "pro" | "team");

    const auth = requestAuth(req);
    const email = (auth as { sessionClaims?: { email?: string } }).sessionClaims?.email
      ?? user.email
      ?? "";

    const base = getAppBaseUrl(req);
    const checkoutUrl = await createCheckout(
      variantId,
      email,
      req.userId,
      `${base}/billing?success=1`,
      `${base}/billing?canceled=1`,
    );

    res.json({ url: checkoutUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Checkout error");
    res.status(500).json({ error: msg });
  }
});

router.post("/billing/portal", requireAuth, async (req, res): Promise<void> => {
  if (localMode) { res.status(409).json({ error: "Payments are disabled in local mode." }); return; }
  try {
    await upsertUser(req.userId);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId));
    if (!user) { res.status(404).json({ error: "user_not_found" }); return; }

    const auth = requestAuth(req);
    const email = (auth as { sessionClaims?: { email?: string } }).sessionClaims?.email
      ?? user.email
      ?? "";

    if (!email) { res.status(400).json({ error: "no_email" }); return; }

    const portalUrl = await getCustomerPortalUrl(email);
    if (!portalUrl) {
      res.status(400).json({ error: "no_subscription" });
      return;
    }

    res.json({ url: portalUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Portal error");
    res.status(500).json({ error: msg });
  }
});

router.get("/billing/usage", requireAuth, async (req, res): Promise<void> => {
  await upsertUser(req.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId));
  if (!user) { res.status(404).json({ error: "user_not_found" }); return; }

  const plan = user.plan ?? "free";
  const limits = getPlanLimit(plan);
  const computeMsUsed = user.computeMsUsed ?? 0;
  const computeSecondsUsed = getComputeSecondsUsed(computeMsUsed);
  const computeSecondsLimit = limits.maxComputeSecondsPerMonth;
  const resetAt = user.computeMsResetAt ?? user.runsResetAt;

  res.json({
    plan,
    planLabel: limits.label,
    computeSecondsUsed,
    computeSecondsLimit: computeSecondsLimit === Infinity ? null : computeSecondsLimit,
    computeMsUsed,
    percentUsed: computeSecondsLimit === Infinity
      ? 0
      : Math.min(100, Math.round((computeSecondsUsed / computeSecondsLimit) * 100)),
    runsThisMonth: user.runsThisMonth ?? 0,
    resetAt: resetAt?.toISOString() ?? null,
    price: limits.price,
  });
});

router.get("/billing/products", requireAuth, async (_req, res): Promise<void> => {
  const plans = (["hobby", "pro", "team"] as const).map((key) => {
    const limits = PLAN_LIMITS[key];
    return {
      plan_key: key,
      product_name: limits.label,
      product_description: null,
      price_monthly: limits.price,
      currency: "usd",
      variant_id: process.env[`LEMONSQUEEZY_${key.toUpperCase()}_VARIANT_ID`] ?? null,
    };
  });
  res.json({ data: plans });
});

export default router;
