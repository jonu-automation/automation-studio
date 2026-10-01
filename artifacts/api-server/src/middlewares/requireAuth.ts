import { requestAuth, localMode } from "../lib/runtime";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { PLAN_LIMITS, type Plan } from "@workspace/db/schema";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = requestAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  next();
}

export async function upsertUser(userId: string, email?: string): Promise<void> {
  await db
    .insert(usersTable)
    .values({ id: userId, email: email ?? (localMode ? "owner@localhost" : null), plan: localMode ? "team" : "free" })
    .onConflictDoNothing();
}

export async function getUser(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user ?? null;
}

export async function checkAndIncrementRunLimit(userId: string): Promise<{ allowed: boolean; user: typeof usersTable.$inferSelect | null; limit: number; used: number }> {
  const user = await getUser(userId);
  if (!user) return { allowed: false, user: null, limit: 0, used: 0 };

  const plan = (user.plan ?? "free") as Plan;
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const maxRuns = limits.maxRunsPerMonth;

  const now = new Date();
  const resetAt = new Date(user.runsResetAt);
  const needsReset = now.getFullYear() !== resetAt.getFullYear() ||
    now.getMonth() !== resetAt.getMonth();

  if (needsReset) {
    await db.update(usersTable)
      .set({ runsThisMonth: 1, runsResetAt: now })
      .where(eq(usersTable.id, userId));
    return { allowed: true, user, limit: maxRuns === Infinity ? -1 : maxRuns, used: 1 };
  }

  if (maxRuns !== Infinity && user.runsThisMonth >= maxRuns) {
    return { allowed: false, user, limit: maxRuns, used: user.runsThisMonth };
  }

  await db.update(usersTable)
    .set({ runsThisMonth: sql`${usersTable.runsThisMonth} + 1` })
    .where(eq(usersTable.id, userId));

  return {
    allowed: true,
    user,
    limit: maxRuns === Infinity ? -1 : maxRuns,
    used: user.runsThisMonth + 1,
  };
}
