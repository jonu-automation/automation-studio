import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, approvalRequestsTable, executionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { resumeWorkflowFromApproval } from "../lib/executor";

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

const router = Router();

// GET /api/approvals — list pending + recent approvals for the current user
router.get("/", requireAuth, async (req, res) => {
  const userId = req.userId;
  const rows = await db
    .select()
    .from(approvalRequestsTable)
    .where(eq(approvalRequestsTable.userId, userId))
    .orderBy(desc(approvalRequestsTable.createdAt))
    .limit(50);

  res.json(rows);
});

// POST /api/approvals/:id/respond — approve or reject (authenticated)
router.post("/:id/respond", requireAuth, async (req, res) => {
  const userId = req.userId;
  const approvalId = Number(req.params.id);
  const { decision, responseNote, deciderEmail } = req.body as {
    decision: "approved" | "rejected";
    responseNote?: string;
    deciderEmail?: string;
  };

  if (!decision || !["approved", "rejected"].includes(decision)) {
    res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
    return;
  }

  const [approval] = await db
    .select()
    .from(approvalRequestsTable)
    .where(and(eq(approvalRequestsTable.id, approvalId), eq(approvalRequestsTable.userId, userId)));

  if (!approval) {
    res.status(404).json({ error: "Approval request not found" });
    return;
  }

  if (approval.status !== "pending") {
    res.status(409).json({ error: "Approval request already responded to", status: approval.status });
    return;
  }

  const email = deciderEmail ?? req.userId;

  await resumeWorkflowFromApproval(approvalId, decision, email, responseNote);
  res.json({ success: true, decision });
});

// GET /api/approvals/:id/quick?token=...&action=approve|reject — one-click from email link
router.get("/:id/quick", async (req, res) => {
  const approvalId = Number(req.params.id);
  const { token, action } = req.query as { token?: string; action?: string };

  if (!token || !action || !["approve", "reject"].includes(action)) {
    res.status(400).send("Invalid approval link");
    return;
  }

  const [approval] = await db
    .select()
    .from(approvalRequestsTable)
    .where(eq(approvalRequestsTable.id, approvalId));

  if (!approval) {
    res.status(404).send("Approval request not found");
    return;
  }

  if (approval.status !== "pending") {
    res.status(200).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2>Already responded</h2>
      <p>This approval request has already been <strong>${escHtml(approval.status)}</strong>.</p>
      </body></html>
    `);
    return;
  }

  const isApprove = action === "approve";

  // For multi-approver modes ("all" / "sequential"): identify the approver by their individual token
  const pendingApprovers = (approval.pendingApprovers as Array<{ email: string; approveToken: string; rejectToken: string }> | null) ?? [];
  let approverEmail = "email-link";

  if (pendingApprovers.length > 0) {
    // Find which approver's token this is
    const matchedAp = pendingApprovers.find(
      ap => ap.approveToken === token || ap.rejectToken === token
    );
    if (!matchedAp) {
      res.status(403).send("Invalid or expired token");
      return;
    }
    // Verify the token matches the intended action
    const expectedToken = isApprove ? matchedAp.approveToken : matchedAp.rejectToken;
    if (token !== expectedToken) {
      res.status(403).send("Wrong token for this action");
      return;
    }
    approverEmail = matchedAp.email;
  } else {
    // "any" mode: use shared token
    const expectedToken = isApprove ? approval.approveToken : approval.rejectToken;
    if (token !== expectedToken) {
      res.status(403).send("Invalid or expired token");
      return;
    }
  }

  const decision = isApprove ? "approved" : "rejected";
  await resumeWorkflowFromApproval(approvalId, decision, approverEmail, undefined);

  const safeTitle = escHtml(approval.title ?? "");
  const safeDecision = escHtml(decision);
  res.status(200).send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f172a;color:#f8fafc">
    <div style="max-width:400px;margin:0 auto">
    <div style="width:64px;height:64px;border-radius:50%;background:${isApprove ? "#22c55e" : "#ef4444"};margin:0 auto 24px;display:flex;align-items:center;justify-content:center;font-size:32px">
    ${isApprove ? "&#x2713;" : "&#x2717;"}
    </div>
    <h2 style="margin:0 0 12px">${isApprove ? "Approved!" : "Rejected"}</h2>
    <p style="color:#94a3b8">${safeTitle} has been ${safeDecision}. The workflow will ${isApprove ? "continue automatically." : "stop here."}</p>
    </div>
    </body></html>
  `);
});

export { router as approvalsRouter };
