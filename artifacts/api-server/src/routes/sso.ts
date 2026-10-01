import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { ssoConfigsTable } from "@workspace/db/schema";
import { requireAuth } from "../middlewares/requireAuth";
import { requirePlan } from "../middlewares/requirePlan";

const router: IRouter = Router();

const ssoGuard = [requireAuth, requirePlan("pro", "team")];

// GET /api/sso/config — fetch current user's SSO config
router.get("/sso/config", ...ssoGuard, async (req, res): Promise<void> => {
  const [config] = await db
    .select()
    .from(ssoConfigsTable)
    .where(eq(ssoConfigsTable.userId, req.userId));

  if (!config) {
    res.json({ exists: false, provider: "saml", enabled: false });
    return;
  }

  // Never return the raw OIDC client secret
  res.json({
    exists: true,
    id: config.id,
    provider: config.provider,
    entityId: config.entityId,
    acsUrl: config.acsUrl,
    x509Certificate: config.x509Certificate,
    metadataUrl: config.metadataUrl,
    oidcClientId: config.oidcClientId,
    oidcClientSecret: config.oidcClientSecret ? "••••••••" : null,
    oidcIssuerUrl: config.oidcIssuerUrl,
    enabled: config.enabled,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  });
});

// PUT /api/sso/config — create or update SSO config
router.put("/sso/config", ...ssoGuard, async (req, res): Promise<void> => {
  const {
    provider,
    entityId,
    acsUrl,
    x509Certificate,
    metadataUrl,
    oidcClientId,
    oidcClientSecret,
    oidcIssuerUrl,
    enabled,
  } = req.body as Record<string, string | boolean | undefined>;

  const [existing] = await db
    .select({ id: ssoConfigsTable.id })
    .from(ssoConfigsTable)
    .where(eq(ssoConfigsTable.userId, req.userId));

  const values = {
    userId: req.userId,
    provider: String(provider ?? "saml"),
    entityId: entityId ? String(entityId) : null,
    acsUrl: acsUrl ? String(acsUrl) : null,
    x509Certificate: x509Certificate ? String(x509Certificate) : null,
    metadataUrl: metadataUrl ? String(metadataUrl) : null,
    oidcClientId: oidcClientId ? String(oidcClientId) : null,
    oidcIssuerUrl: oidcIssuerUrl ? String(oidcIssuerUrl) : null,
    enabled: Boolean(enabled),
    updatedAt: new Date(),
    ...(oidcClientSecret && oidcClientSecret !== "••••••••"
      ? { oidcClientSecret: String(oidcClientSecret) }
      : {}),
  };

  let config;
  if (existing) {
    [config] = await db
      .update(ssoConfigsTable)
      .set(values)
      .where(eq(ssoConfigsTable.id, existing.id))
      .returning();
  } else {
    [config] = await db
      .insert(ssoConfigsTable)
      .values(values)
      .returning();
  }

  res.json({ success: true, id: config.id, enabled: config.enabled });
});

// DELETE /api/sso/config — remove SSO config
router.delete("/sso/config", ...ssoGuard, async (req, res): Promise<void> => {
  await db.delete(ssoConfigsTable).where(eq(ssoConfigsTable.userId, req.userId));
  res.json({ success: true });
});

// GET /api/sso/status — lightweight plan check for the UI
router.get("/sso/status", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select({ plan: usersTable.plan })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId));

  const plan = user?.plan ?? "free";
  const hasAccess = plan === "pro" || plan === "team";
  res.json({ plan, hasAccess });
});

export default router;
