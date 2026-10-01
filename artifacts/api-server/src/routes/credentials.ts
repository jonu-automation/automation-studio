import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, credentialsTable } from "@workspace/db";
import { requireAuth, upsertUser } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { sealCredential } from "../lib/vault";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/credentials", async (req, res): Promise<void> => {
  await upsertUser(req.userId);
  const creds = await db
    .select({
      id: credentialsTable.id,
      name: credentialsTable.name,
      credentialType: credentialsTable.type,
      createdAt: credentialsTable.createdAt,
    })
    .from(credentialsTable)
    .where(eq(credentialsTable.userId, req.userId));

  res.json(creds);
});

router.post("/credentials", async (req, res): Promise<void> => {
  await upsertUser(req.userId);
  const { name, credentialType, data } = req.body as {
    name?: string;
    credentialType?: string;
    data?: Record<string, unknown>;
  };

  if (!name || !credentialType || !data) {
    res.status(400).json({ error: "invalid_body", message: "name, credentialType and data are required" });
    return;
  }

  const [created] = await db
    .insert(credentialsTable)
    .values({ userId: req.userId, name, type: credentialType, data: await sealCredential(data) })
    .returning({
      id: credentialsTable.id,
      name: credentialsTable.name,
      credentialType: credentialsTable.type,
      createdAt: credentialsTable.createdAt,
    });

  res.status(201).json(created);
});

router.delete("/credentials/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid_id", message: "ID must be an integer" });
    return;
  }

  const [deleted] = await db
    .delete(credentialsTable)
    .where(and(eq(credentialsTable.id, id), eq(credentialsTable.userId, req.userId)))
    .returning({ id: credentialsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "not_found", message: "Credential not found" });
    return;
  }

  logger.info({ credentialId: id, userId: req.userId }, "Credential deleted");
  res.status(204).send();
});

export default router;
