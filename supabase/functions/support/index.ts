const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function authedUser(req: Request, supabaseUrl: string, serviceKey: string): Promise<any | null> {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!jwt) return null;
  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: serviceKey },
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function sendStaffReplyEmail(
  supabaseUrl: string,
  serviceKey: string,
  to: string,
  ticketId: string,
  subject: string,
  staffName: string,
  replyText: string,
) {
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!resendKey) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `AfuChat Support <support+${ticketId}@afuchat.com>`,
      to: [to],
      subject: `Re: ${subject}`,
      text: `${staffName} replied to your support ticket:\n\n${replyText}\n\n---\nTo reply, just respond to this email.`,
    }),
  }).catch((e) => console.error("[support] email send failed:", e));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Service not configured" }, 503);

  const dbHeaders = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() || "";

  if (action === "inbound-email" && req.method === "POST") {
    let payload: any;
    try { payload = await req.json(); } catch { return json({ ok: true }); }

    const toAddresses: string[] = payload?.to || [];
    let ticketId: string | null = null;
    for (const addr of toAddresses) {
      const match = addr.match(/support\+([0-9a-f-]{36})@afuchat\.com/i);
      if (match) { ticketId = match[1]; break; }
    }
    if (!ticketId) return json({ ok: true, note: "No ticket ID" });

    const ticketResp = await fetch(
      `${supabaseUrl}/rest/v1/support_tickets?select=id,user_id,status,subject&id=eq.${ticketId}&limit=1`,
      { headers: dbHeaders },
    );
    if (!ticketResp.ok) return json({ ok: true });
    const tickets = await ticketResp.json();
    const ticket = tickets?.[0];
    if (!ticket) return json({ ok: true, note: "Ticket not found" });

    const messageBody = (payload?.text || payload?.html_body || "").trim();
    if (!messageBody) return json({ ok: true, note: "Empty message" });

    await fetch(`${supabaseUrl}/rest/v1/support_messages`, {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify({
        ticket_id: ticketId,
        sender_id: ticket.user_id,
        sender_type: "user",
        message: messageBody.substring(0, 5000),
      }),
    });

    if (ticket.status === "resolved") {
      await fetch(`${supabaseUrl}/rest/v1/support_tickets?id=eq.${ticketId}`, {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify({ status: "open", updated_at: new Date().toISOString() }),
      });
    }

    return json({ ok: true });
  }

  if (action === "staff-reply" && req.method === "POST") {
    const user = await authedUser(req, supabaseUrl, serviceKey);
    if (!user?.id) return json({ error: "Unauthorized" }, 401);

    const profileResp = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=is_admin,is_support_staff,display_name,handle&id=eq.${user.id}&limit=1`,
      { headers: dbHeaders },
    );
    const profiles = profileResp.ok ? await profileResp.json() : [];
    const profile = profiles?.[0];
    if (!profile?.is_admin && !profile?.is_support_staff) return json({ error: "Forbidden: not support staff" }, 403);

    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { ticketId, message, isInternal = false, newStatus } = body || {};
    if (!ticketId || !message) return json({ error: "ticketId and message required" }, 400);

    await fetch(`${supabaseUrl}/rest/v1/support_messages`, {
      method: "POST",
      headers: dbHeaders,
      body: JSON.stringify({
        ticket_id: ticketId,
        sender_id: user.id,
        sender_type: "staff",
        message: String(message).substring(0, 5000),
        is_internal: Boolean(isInternal),
      }),
    });

    const updates: any = { updated_at: new Date().toISOString() };
    if (newStatus) updates.status = newStatus;
    if (newStatus === "in_progress" || newStatus === "resolved") updates.assigned_to = user.id;
    if (newStatus === "resolved") updates.resolved_at = new Date().toISOString();

    await fetch(`${supabaseUrl}/rest/v1/support_tickets?id=eq.${ticketId}`, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify(updates),
    });

    if (!isInternal) {
      const ticketResp = await fetch(
        `${supabaseUrl}/rest/v1/support_tickets?select=email,subject&id=eq.${ticketId}&limit=1`,
        { headers: dbHeaders },
      );
      if (ticketResp.ok) {
        const tickets = await ticketResp.json();
        const ticket = tickets?.[0];
        if (ticket?.email) {
          const staffName = profile.display_name || profile.handle || "AfuChat Support";
          sendStaffReplyEmail(supabaseUrl, serviceKey, ticket.email, ticketId, ticket.subject, staffName, message);
        }
      }
    }

    return json({ ok: true });
  }

  if (action === req.url.split("/").filter(Boolean).slice(-2, -1)[0] && req.method === "PATCH") {
    const user = await authedUser(req, supabaseUrl, serviceKey);
    if (!user?.id) return json({ error: "Unauthorized" }, 401);

    const profileResp = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=is_admin,is_support_staff&id=eq.${user.id}&limit=1`,
      { headers: dbHeaders },
    );
    const profiles = profileResp.ok ? await profileResp.json() : [];
    const profile = profiles?.[0];
    if (!profile?.is_admin && !profile?.is_support_staff) return json({ error: "Forbidden" }, 403);

    let body: any;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const id = url.pathname.split("/ticket/")[1]?.split("/")[0];
    if (!id) return json({ error: "Missing ticket ID" }, 400);

    const allowed = ["status", "priority", "assigned_to"];
    const updates: any = { updated_at: new Date().toISOString() };
    for (const f of allowed) { if (body[f] !== undefined) updates[f] = body[f]; }
    if (updates.status === "resolved") updates.resolved_at = new Date().toISOString();

    await fetch(`${supabaseUrl}/rest/v1/support_tickets?id=eq.${id}`, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify(updates),
    });

    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
});
