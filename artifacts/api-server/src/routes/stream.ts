import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, executionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { subscribeToExecution, getBufferedEvents } from "../lib/executionEvents";

const router = Router();

// GET /api/executions/:id/stream — SSE stream of live execution events (auth + ownership required)
router.get("/executions/:id/stream", requireAuth, async (req, res) => {
  const executionId = Number(req.params.id);
  if (isNaN(executionId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }

  // Verify this execution belongs to the authenticated user before opening the stream
  const [execution] = await db
    .select({ id: executionsTable.id })
    .from(executionsTable)
    .where(and(eq(executionsTable.id, executionId), eq(executionsTable.userId, req.userId)));

  if (!execution) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // Set SSE headers after ownership check passes
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  function send(data: object) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  // Replay buffered events first (catch up if execution already started)
  const buffered = getBufferedEvents(executionId);
  for (const event of buffered) {
    send(event);
  }

  // If execution already done (workflow:done in buffer), close connection
  const alreadyDone = buffered.some(
    e => e.eventType === "workflow:done" || e.eventType === "workflow:paused",
  );
  if (alreadyDone) {
    res.end();
    return;
  }

  // Subscribe to live events
  const unsubscribe = subscribeToExecution(executionId, (event) => {
    send(event);
    // Close stream when workflow finishes or pauses
    if (event.eventType === "workflow:done" || event.eventType === "workflow:paused") {
      res.end();
    }
  });

  // Clean up on client disconnect
  req.on("close", () => {
    unsubscribe();
  });
});

export default router;
