import type { Request, Response, NextFunction } from "express";
import { getUser } from "./requireAuth";

const PLAN_RANK: Record<string, number> = {
  free: 0,
  hobby: 1,
  pro: 2,
  team: 3,
};

export function requirePlan(...allowedPlans: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await getUser(userId);
    const plan = user?.plan ?? "free";

    if (!allowedPlans.includes(plan)) {
      const minPlan = allowedPlans.reduce((best, p) =>
        (PLAN_RANK[p] ?? 0) < (PLAN_RANK[best] ?? 0) ? p : best, allowedPlans[0]);

      res.status(403).json({
        error: "plan_required",
        requiredPlans: allowedPlans,
        currentPlan: plan,
        minPlan,
        upgradeUrl: "/billing",
        message: `This feature requires a ${minPlan} plan or higher. You are currently on the ${plan} plan.`,
      });
      return;
    }

    next();
  };
}
