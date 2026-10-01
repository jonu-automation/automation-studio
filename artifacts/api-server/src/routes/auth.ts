import { Router, type IRouter } from "express";
import { requireAuth, upsertUser, getUser } from "../middlewares/requireAuth";
import { db, usersTable } from "@workspace/db";
import { PLAN_LIMITS, type Plan } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  await upsertUser(req.userId);
  const user = await getUser(req.userId);
  if (!user) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }

  const plan = (user.plan ?? "free") as Plan;
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  const now = new Date();
  const resetAt = new Date(user.runsResetAt);
  const needsReset = now.getFullYear() !== resetAt.getFullYear() ||
    now.getMonth() !== resetAt.getMonth();

  const runsThisMonth = needsReset ? 0 : user.runsThisMonth;

  res.json({
    id: user.id,
    email: user.email,
    plan,
    planLabel: limits.label,
    runsThisMonth,
    maxRunsPerMonth: limits.maxRunsPerMonth === Infinity ? -1 : limits.maxRunsPerMonth,
    maxWorkflows: limits.maxWorkflows === Infinity ? -1 : limits.maxWorkflows,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
  });
});

export default router;
