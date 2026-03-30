import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import { emailUserStaffReply } from "../lib/email";

const router = Router();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/support/inbound-email
 * Webhook endpoint for Resend inbound email processing.
 * When a user replies to a support email thread, Resend POSTs here.
 * We parse the ticket ID from the To address (support+<ticketId>@afuchat.com)
 * and append the reply to the ticket thread.
 */
router.post("/support/inbound-email", async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    logger.info({ from: payload?.from }, "[support] Inbound email received");

    // Extract ticket ID from "To" address: support+<uuid>@afuchat.com
    const toAddresses: string[] = payload?.to || [];
    let ticketId: string | null = null;
    for (const addr of toAddresses) {
      const match = addr.match(/support\+([0-9a-f-]{36})@afuchat\.com/i);
      if (match) { ticketId = match[1]; break; }
    }

    if (!ticketId) {
      res.status(200).json({ ok: true, note: "No ticket ID found in To address" });
      return;
    }

    const admin = getAdmin();

    // Verify ticket exists
    const { data: ticket, error: ticketErr } = await admin
      .from("support_tickets")
      .select("id, user_id, status, subject")
      .eq("id", ticketId)
      .single();

    if (ticketErr || !ticket) {
      res.status(200).json({ ok: true, note: "Ticket not found" });
      return;
    }

    const messageBody = (payload?.text || payload?.html_body || "").trim();
    if (!messageBody) {
      res.status(200).json({ ok: true, note: "Empty message" });
      return;
    }

    // Insert user reply message
    await admin.from("support_messages").insert({
      ticket_id: ticketId,
      sender_id: ticket.user_id,
      sender_type: "user",
      message: messageBody.substring(0, 5000),
    });

    // Update ticket status back to open if it was resolved
    if (ticket.status === "resolved") {
      await admin.from("support_tickets").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", ticketId);
    }

    logger.info({ ticketId }, "[support] Inbound email added to ticket");
    res.status(200).json({ ok: true });
  } catch (err: any) {
    logger.error(err, "[support] Inbound email error");
    res.status(200).json({ ok: true }); // Always 200 to Resend webhook
  }
});

/**
 * POST /api/support/staff-reply
 * Called from admin dashboard when staff submits a reply.
 * Authenticated route — staff member must be admin or support_staff.
 */
router.post("/support/staff-reply", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const jwt = authHeader.slice(7);
    const admin = getAdmin();

    const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !user) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    // Check staff permissions
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin, is_support_staff, display_name, handle")
      .eq("id", user.id)
      .single();

    if (!profile || (!(profile as any).is_admin && !(profile as any).is_support_staff)) {
      res.status(403).json({ error: "Forbidden: not support staff" });
      return;
    }

    const { ticketId, message, isInternal = false, newStatus } = req.body;
    if (!ticketId || !message) {
      res.status(400).json({ error: "ticketId and message required" });
      return;
    }

    // Insert staff message
    await admin.from("support_messages").insert({
      ticket_id: ticketId,
      sender_id: user.id,
      sender_type: "staff",
      message: String(message).substring(0, 5000),
      is_internal: Boolean(isInternal),
    });

    // Update ticket status if provided
    const updates: any = { updated_at: new Date().toISOString() };
    if (newStatus) updates.status = newStatus;
    if (newStatus === "in_progress" || newStatus === "resolved") {
      updates.assigned_to = user.id;
    }
    if (newStatus === "resolved") updates.resolved_at = new Date().toISOString();
    await admin.from("support_tickets").update(updates).eq("id", ticketId);

    // Send email to user (if not internal note)
    if (!isInternal) {
      const { data: ticket } = await admin
        .from("support_tickets")
        .select("email, subject")
        .eq("id", ticketId)
        .single();

      if ((ticket as any)?.email) {
        const staffName = (profile as any).display_name || (profile as any).handle || "AfuChat Support";
        emailUserStaffReply({
          to: (ticket as any).email,
          ticketId,
          ticketSubject: (ticket as any).subject,
          staffName,
          replyText: message,
        }).catch((e) => logger.error(e, "[support] emailUserStaffReply failed"));
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    logger.error(err, "[support] staff-reply error");
    res.status(500).json({ error: "Internal error", detail: err.message });
  }
});

/**
 * PATCH /api/support/ticket/:id
 * Update ticket status, priority, assignment — staff only.
 */
router.patch("/support/ticket/:id", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
    const jwt = authHeader.slice(7);
    const admin = getAdmin();

    const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !user) { res.status(401).json({ error: "Invalid token" }); return; }

    const { data: profile } = await admin.from("profiles").select("is_admin, is_support_staff").eq("id", user.id).single();
    if (!profile || (!(profile as any).is_admin && !(profile as any).is_support_staff)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const allowedFields = ["status", "priority", "assigned_to"];
    const updates: any = { updated_at: new Date().toISOString() };
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    if (updates.status === "resolved") updates.resolved_at = new Date().toISOString();

    await admin.from("support_tickets").update(updates).eq("id", req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Internal error", detail: err.message });
  }
});

export default router;
