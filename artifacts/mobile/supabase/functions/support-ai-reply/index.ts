// support-ai-reply — Engagera-powered support ticket auto-responder.
//
// Called directly by the client (via supabase.functions.invoke) immediately
// after the user submits a support ticket and its first message.
//
// Flow:
//   1. Verify the caller is authenticated (JWT required).
//   2. Fetch the ticket + all user messages for context.
//   3. Build a focused system prompt based on the ticket category.
//   4. Call Engagera AI for a helpful, tailored draft reply.
//   5. Insert the reply as a `sender_type = "ai"` message.
//   6. Set `has_ai_draft = true` on the ticket.
//
// Required secrets (set via `supabase secrets set`):
//   ENGAGERA_API_KEY   — Engagera API key
//   SUPABASE_SERVICE_ROLE_KEY is auto-injected by the Supabase runtime.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const ENGAGERA_API_KEY  = Deno.env.get("ENGAGERA_API_KEY") ?? "";
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")     ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// SUPABASE_ANON_KEY is auto-injected by the Supabase runtime — used as the
// Bearer token when calling another edge function on the same project.
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ENGAGERA_BASE     = `${SUPABASE_URL}/functions/v1`;

// ─── Category-aware hints for the system prompt ──────────────────────────────
const CATEGORY_HINTS: Record<string, string> = {
  account:     "The user has an account or login issue. Help them recover access, reset credentials, or explain account-related settings.",
  payments:    "The user has a payments or ACoins issue. Be clear about what you can verify and advise on refund timelines (7 days, case-by-case).",
  marketplace: "The user has an AfuMarket or order issue. Explain the escrow process and typical resolution steps.",
  messages:    "The user has a messaging issue. Troubleshoot connectivity, media sharing, or encryption concerns.",
  content:     "The user has a content, post, or story issue. Explain moderation policies or technical limitations.",
  safety:      "The user has a safety or privacy concern. Be empathetic and direct them to the correct escalation path.",
  technical:   "The user has a technical issue (crash, bug, or performance problem). Ask for device info if missing and explain next steps.",
  general:     "The user has a general question or feedback. Be friendly and informative.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ── 1. Auth check ────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
      console.error("[support-ai-reply] Supabase function secrets are incomplete");
      return json({ error: "Support service is not configured" }, 500);
    }
    if (!ENGAGERA_API_KEY) {
      console.error("[support-ai-reply] ENGAGERA_API_KEY secret not set");
      return json({ error: "AI service not configured" }, 500);
    }

    let body: { ticket_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const ticketId = typeof body.ticket_id === "string" ? body.ticket_id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketId)) {
      return json({ error: "A valid ticket_id is required" }, 400);
    }

    // Verify the caller and ticket ownership before using the service role.
    const accessToken = authHeader.slice("Bearer ".length).trim();
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── 2. Fetch the caller-owned ticket + messages ──────────────────────────
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: ticket, error: ticketError } = await admin
      .from("support_tickets")
      .select("id, user_id, subject, category, priority, has_ai_draft")
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketError) {
      console.error("[support-ai-reply] Ticket lookup failed:", ticketError.message);
      return json({ error: "Could not load support ticket" }, 500);
    }
    if (!ticket) {
      return json({ error: "Ticket not found" }, 404);
    }
    if (ticket.user_id !== authData.user.id) {
      return json({ error: "You cannot request an AI reply for this ticket" }, 403);
    }

    const { data: messages, error: messagesError } = await admin
      .from("support_messages")
      .select("sender_type, message")
      .eq("ticket_id", ticketId)
      .eq("is_internal", false)
      .order("created_at", { ascending: true });
    if (messagesError) {
      console.error("[support-ai-reply] Message lookup failed:", messagesError.message);
      return json({ error: "Could not load ticket messages" }, 500);
    }

    // Skip if AI already drafted a reply (idempotency guard)
    if (ticket.has_ai_draft) {
      return json({ ok: true, skipped: true });
    }
    // Recover safely if the AI message was saved but the flag update failed.
    if ((messages ?? []).some((message) => message.sender_type === "ai")) {
      const { error: flagError } = await admin
        .from("support_tickets")
        .update({ has_ai_draft: true })
        .eq("id", ticketId);
      if (flagError) {
        console.error("[support-ai-reply] Could not repair AI draft flag:", flagError.message);
        return json({ error: "AI reply exists but ticket status could not be updated" }, 500);
      }
      return json({ ok: true, skipped: true });
    }

    // Build the user conversation for context
    const userMessages = (messages ?? []).filter((m) => m.sender_type === "user");
    if (!userMessages.length) {
      return json({ error: "No user messages yet" }, 422);
    }

    // ── 3. Build AI prompt ───────────────────────────────────────────────────
    const categoryHint = CATEGORY_HINTS[ticket.category ?? "general"] ?? CATEGORY_HINTS.general;
    const isPriority   = ticket.priority === "urgent" || ticket.priority === "high";

    const systemPrompt = `You are a helpful, professional customer support agent for AfuChat — a mobile social and messaging platform.

${categoryHint}

Guidelines:
- Be warm, concise, and solution-focused. Keep replies under 200 words unless more detail is clearly needed.
- If you can resolve the issue immediately, do so with clear steps.
- If you need more information, ask ONE specific clarifying question.
- If the issue requires a human agent, acknowledge the problem, set expectations (human follow-up within 2–4 hours), and provide any self-help steps the user can take now.
- Never make up specific order IDs, amounts, or account details you cannot verify.
- Sign off as "AfuChat Support AI" — never claim to be human.
${isPriority ? "- This ticket is marked as high/urgent priority. Acknowledge the urgency and reassure the user their issue is escalated." : ""}

Ticket subject: "${ticket.subject}"
Category: ${ticket.category ?? "general"}`;

    // Pass the conversation thread so AI has full context
    const engMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      ...userMessages.map((m) => ({ role: "user", content: m.message })),
    ];

    // ── 4. Call Engagera ─────────────────────────────────────────────────────
    // When one edge function calls another on the same Supabase project it must
    // supply Authorization: Bearer <anon-key>, otherwise the target returns 401.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    let engRes: Response;
    try {
      engRes = await fetch(`${ENGAGERA_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "x-engagera-api-key": ENGAGERA_API_KEY,
        },
        body: JSON.stringify({
          messages: engMessages,
          model: "engagera-pro",
          stream: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!engRes.ok) {
      console.error("[support-ai-reply] Engagera request failed with status:", engRes.status);
      return json({ error: "AI service unavailable" }, 502);
    }

    let engData: any;
    try {
      engData = await engRes.json();
    } catch {
      console.error("[support-ai-reply] Engagera returned invalid JSON");
      return json({ error: "AI returned an invalid response" }, 502);
    }
    const rawReply = engData?.message?.content ?? engData?.content ?? "";
    const aiReply = typeof rawReply === "string" ? rawReply.trim() : "";

    if (!aiReply) {
      console.error("[support-ai-reply] Empty AI response");
      return json({ error: "AI returned empty response" }, 502);
    }

    // ── 5. Insert AI reply + mark ticket ────────────────────────────────────
    const { error: insertError } = await admin.from("support_messages").insert({
      ticket_id: ticketId,
      sender_id: null,
      sender_type: "ai",
      message: aiReply,
      is_internal: false,
    });
    if (insertError) {
      console.error("[support-ai-reply] AI reply insert failed:", insertError.message);
      return json({ error: "Could not save AI reply" }, 500);
    }

    const { error: updateError } = await admin
      .from("support_tickets")
      .update({ has_ai_draft: true })
      .eq("id", ticketId);
    if (updateError) {
      console.error("[support-ai-reply] AI draft flag update failed:", updateError.message);
      return json({ error: "AI reply was saved but ticket status could not be updated" }, 500);
    }

    return json({ ok: true, reply: aiReply });

  } catch (err) {
    console.error("[support-ai-reply] Unhandled error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
