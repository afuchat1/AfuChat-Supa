import { Hono } from "hono";
import type { Env } from "../types";
import { callEngagera } from "../lib/engagera";
import { createPublicDbClient, firstRow } from "../lib/public-db";
import { getSupabaseUser, bearerToken } from "../lib/function-auth";

const functions = new Hono<{ Bindings: Env }>();

function jsonError(c: any, message: string, status: 400 | 401 | 403 | 404 | 422 | 500 | 501 | 502 | 503) {
  return c.json({ error: message }, status);
}

function normaliseAiContent(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

async function readJson(c: any): Promise<Record<string, any>> {
  return await c.req.json().catch(() => ({}));
}

// GET/POST /v1/status
functions.on(["GET", "POST"], "/status", async (c) => {
  const checks = await Promise.all([
    (async () => {
      const started = Date.now();
      try {
        const response = await fetch(
          `${(c.env.AFUCHAT_SUPABASE_URL ?? c.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/profiles?select=id&limit=1`,
          {
            headers: {
              apikey: c.env.AFUCHAT_SUPABASE_ANON_KEY ?? "",
              Accept: "application/json",
            },
          },
        );
        return {
          name: "supabase",
          ok: response.ok,
          latency_ms: Date.now() - started,
          message: response.ok ? undefined : `HTTP ${response.status}`,
        };
      } catch (error) {
        return { name: "supabase", ok: false, latency_ms: Date.now() - started, message: error instanceof Error ? error.message : "unavailable" };
      }
    })(),
    Promise.resolve({ name: "cloudflare_worker", ok: true, latency_ms: 0 }),
    Promise.resolve({ name: "r2", ok: true, latency_ms: 0 }),
  ]);
  const hasOutage = checks.some((check) => !check.ok);
  return c.json({
    ok: !hasOutage,
    timestamp: new Date().toISOString(),
    services: Object.fromEntries(checks.map((check) => [check.name, check])),
  });
});

// POST /v1/auth-resolve-identifier
functions.post("/auth-resolve-identifier", async (c) => {
  const body = await readJson(c);
  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  if (!identifier) return jsonError(c, "identifier is required", 400);
  if (identifier.includes("@")) return c.json({ email: identifier.toLowerCase() });

  const db = createPublicDbClient(c.env);
  const encoded = encodeURIComponent(identifier);
  try {
    const byHandle = await db.select<{ email?: string }>(
      "profiles",
      `select=email&handle=eq.${encoded}&limit=1`,
    );
    const match = firstRow(byHandle);
    if (match?.email) return c.json({ email: match.email });
  } catch {
    // Older profile schemas may not expose handle through PostgREST.
  }

  try {
    const byPhone = await db.select<{ email?: string }>(
      "profiles",
      `select=email&phone=eq.${encoded}&limit=1`,
    );
    const match = firstRow(byPhone);
    if (match?.email) return c.json({ email: match.email });
  } catch {
    // Phone matching is advisory; login still reports invalid credentials.
  }
  return c.json({ email: null });
});

// POST /v1/ai/chat
functions.post("/ai/chat", async (c) => {
  const body = await readJson(c);
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError(c, "messages array is required", 400);
  }
  try {
    const result = await callEngagera(c.env, {
      messages: body.messages,
      model: typeof body.model === "string" ? body.model : "engagera-pro",
      stream: false,
      ...(typeof body.max_tokens === "number" ? { max_tokens: body.max_tokens } : {}),
    });
    if (!result.response.ok) return jsonError(c, "AI service unavailable", 502);
    return c.json({ message: { role: "assistant", content: result.content }, content: result.content });
  } catch (error) {
    console.error("[ai-chat]", error);
    return jsonError(c, "AI service is not configured", 503);
  }
});

// POST /v1/ai/reply
functions.post("/ai/reply", async (c) => {
  const body = await readJson(c);
  if (body.audioUrl && !Array.isArray(body.messages)) {
    return jsonError(c, "Audio transcription is not configured on the Worker", 501);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError(c, "messages array is required", 400);
  }
  const maxTokens = typeof body.max_tokens === "number" && body.max_tokens > 0
    ? body.max_tokens
    : body.fast ? 300 : 2048;
  try {
    const result = await callEngagera(c.env, {
      messages: body.messages,
      model: "engagera-2.1",
      max_tokens: maxTokens,
      stream: false,
    });
    if (!result.response.ok || !result.content) {
      return c.json({ reply: "I'm having trouble connecting to AfuAI right now. Please try again in a moment." });
    }
    return c.json({ reply: result.content });
  } catch (error) {
    console.error("[ai-reply]", error);
    return c.json({ reply: "AI service is not configured. Please try again later." }, 503);
  }
});

// POST /v1/ai/transcribe
functions.post("/ai/transcribe", async (c) =>
  jsonError(c, "Audio transcription is not configured on the Worker", 501)
);

// POST /v1/ai/lens
functions.post("/ai/lens", async (c) => {
  const body = await readJson(c);
  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
  if (!imageBase64) return jsonError(c, "imageBase64 is required", 400);
  const mimeType = typeof body.mimeType === "string" && body.mimeType.startsWith("image/")
    ? body.mimeType
    : "image/jpeg";
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const systemPrompt = `You are an expert AI vision identification system powered by AfuChat.
Respond with ONLY valid JSON with exactly these fields:
title (string, max 60 chars), description (string, 2-3 sentences), facts (string[] with 3-5 facts),
category (one of food, plant, animal, place, product, person, artwork, text, object, other),
searchQuery (string, max 80 chars), confidence (high, medium, low), answer (string).
${query ? `Answer the user's question: "${query}"` : "Use an empty answer because no question was asked."}`;
  try {
    const result = await callEngagera(c.env, {
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: "text", text: query ? `Identify the image and answer: "${query}"` : "Identify and describe this image." },
          ],
        },
      ],
      model: "engagera-pro",
      stream: false,
    });
    if (!result.response.ok) return jsonError(c, "Vision service unavailable", 502);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(normaliseAiContent(result.content));
    } catch {
      parsed = {
        title: "Analysis Result",
        description: result.content.slice(0, 300) || "Image analyzed.",
        facts: [],
        category: "other",
        searchQuery: "image identification",
        confidence: "low",
        answer: query ? result.content : "",
      };
    }
    return c.json({
      title: String(parsed.title || "Unknown").slice(0, 60),
      description: String(parsed.description || "No description available."),
      facts: Array.isArray(parsed.facts) ? parsed.facts.slice(0, 5).map(String) : [],
      category: String(parsed.category || "other"),
      searchQuery: String(parsed.searchQuery || parsed.title || "image identification").slice(0, 80),
      confidence: ["high", "medium", "low"].includes(String(parsed.confidence)) ? parsed.confidence : "medium",
      answer: String(parsed.answer ?? ""),
    });
  } catch (error) {
    console.error("[ai-lens]", error);
    return jsonError(c, "Vision service is not configured", 503);
  }
});

// POST /v1/push/register
functions.post("/push/register", async (c) => {
  const user = await getSupabaseUser(c);
  if (!user) return jsonError(c, "Invalid session", 401);
  const body = await readJson(c);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const platform = body.platform === "android" || body.platform === "ios" ? body.platform : "";
  if (token.length < 20 || token.length > 4096 || !platform || body.provider !== "fcm" || /^(Expo|Exponent)PushToken\[/.test(token)) {
    return jsonError(c, "A valid native FCM token and platform are required", 400);
  }
  try {
    await createPublicDbClient(c.env).upsert("push_devices", {
      user_id: user.id,
      token,
      platform,
      enabled: body.enabled !== false,
      notification_preferences: body.preferences ?? {},
      last_seen_at: new Date().toISOString(),
    }, "token");
    return c.json({ ok: true });
  } catch (error) {
    console.error("[push-register]", error);
    return jsonError(c, "Could not save push token", 500);
  }
});

const ANDROID_NOTIFICATION_CHANNELS = new Set([
  "messages_notifications_v1",
  "calls_notifications_v1",
  "social_notifications_v1",
  "commerce_notifications_v1",
]);

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function firebaseAccessToken(serviceAccount: Record<string, any>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const keyData = String(serviceAccount.private_key ?? "")
    .replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(keyData), (char) => char.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claim}.${base64Url(new Uint8Array(signature))}`,
  });
  const data = await response.json().catch(() => null) as any;
  if (!response.ok || typeof data?.access_token !== "string") throw new Error("FCM access token request failed");
  return data.access_token;
}

// POST /v1/push/send
functions.post("/push/send", async (c) => {
  const user = await getSupabaseUser(c);
  if (!user) return jsonError(c, "Invalid session", 401);
  const body = await readJson(c);
  if (body.senderId !== user.id) return jsonError(c, "Sender does not match the authenticated user", 403);

  const categoryId = typeof body.categoryId === "string" ? body.categoryId : "message";
  if (!["message", "call", "social", "commerce"].includes(categoryId)) {
    return jsonError(c, "Unsupported notification category", 400);
  }
  const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  const db = createPublicDbClient(c.env);

  try {
    if (categoryId === "message") {
      if (!chatId || !messageId) return jsonError(c, "A chat and message are required", 400);
      const membership = await db.select("chat_members", `select=user_id&chat_id=eq.${encodeURIComponent(chatId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
      const ownMessage = await db.select("messages", `select=id&chat_id=eq.${encodeURIComponent(chatId)}&id=eq.${encodeURIComponent(messageId)}&sender_id=eq.${encodeURIComponent(user.id)}&limit=1`);
      if (!membership.length || !ownMessage.length) return jsonError(c, "Not authorized for this message", 403);
    } else if (categoryId === "call") {
      if (typeof body.callId !== "string" || !body.callId.trim()) return jsonError(c, "A call ID is required", 400);
      if (chatId) {
        const membership = await db.select("chat_members", `select=user_id&chat_id=eq.${encodeURIComponent(chatId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
        if (!membership.length) return jsonError(c, "Not authorized for this call chat", 403);
      }
    }

    const recipientIds = Array.isArray(body.recipientUserIds)
      ? [...new Set(body.recipientUserIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0))]
      : [];
    if (!recipientIds.length) return c.json({ ok: true, sent: 0, attempted: 0 });

    let authorizedRecipients = recipientIds;
    if (chatId) {
      const recipientRows = await db.select<{ user_id: string }>(
        "chat_members",
        `select=user_id&chat_id=eq.${encodeURIComponent(chatId)}&user_id=in.(${recipientIds.map(encodeURIComponent).join(",")})`,
      );
      authorizedRecipients = recipientRows.map((row) => row.user_id);
      if (authorizedRecipients.length !== recipientIds.length) return jsonError(c, "One or more recipients are not members of this chat", 403);
    }

    const devices = await db.select<{ id: string; token: string }>(
      "push_devices",
      `select=id,token&enabled=eq.true&user_id=in.(${authorizedRecipients.map(encodeURIComponent).join(",")})`,
    );
    if (!devices.length) return c.json({ ok: true, sent: 0, attempted: 0 });

    const firebaseJson = c.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? c.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!firebaseJson) return jsonError(c, "FCM is not configured", 503);
    const serviceAccount = JSON.parse(firebaseJson) as Record<string, any>;
    const accessToken = await firebaseAccessToken(serviceAccount);
    const requestedChannel = typeof body.channelId === "string" ? body.channelId : "";
    const channelId = ANDROID_NOTIFICATION_CHANNELS.has(requestedChannel)
      ? requestedChannel
      : "messages_notifications_v1";
    const data = Object.fromEntries(Object.entries({
      ...(body.data ?? {}),
      categoryId,
      chatId,
      messageId,
      notificationId: body.notificationId ?? "",
      route: body.route ?? "",
      entityId: body.entityId ?? "",
      callId: body.callId ?? "",
      callerId: body.callerId ?? body.senderId ?? "",
      callerName: body.callerName ?? body.senderName ?? "",
      callerAvatar: body.callerAvatar ?? body.senderAvatarUrl ?? "",
      senderName: body.senderName ?? "",
    }).map(([key, value]) => [key, String(value ?? "")]));

    let sent = 0;
    for (const device of devices) {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(String(serviceAccount.project_id))}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: {
              title: body.title || body.senderName || "AfuChat",
              body: body.body || "New message",
            },
            data,
            android: {
              priority: "HIGH",
              notification: { channel_id: channelId, sound: "default", click_action: "open" },
            },
          },
        }),
      });
      if (response.ok) sent += 1;
      else if ([404, 410].includes(response.status)) {
        await db.update("push_devices", `id=eq.${encodeURIComponent(device.id)}`, { enabled: false }).catch(() => []);
      }
    }
    return c.json({ ok: true, sent, attempted: devices.length });
  } catch (error) {
    console.error("[push-send]", error);
    return jsonError(c, "Could not deliver push notification", 502);
  }
});

const CATEGORY_HINTS: Record<string, string> = {
  account: "The user has an account or login issue. Help them recover access or explain account settings.",
  payments: "The user has a payments or ACoins issue. Explain what can be verified and refund timelines.",
  marketplace: "The user has an AfuMarket or order issue. Explain escrow and resolution steps.",
  messages: "The user has a messaging issue. Troubleshoot connectivity, media sharing, or encryption concerns.",
  content: "The user has a content, post, or story issue. Explain moderation policies or technical limitations.",
  safety: "The user has a safety or privacy concern. Be empathetic and direct them to escalation.",
  technical: "The user has a technical issue. Ask for device info if missing and explain next steps.",
  general: "The user has a general question or feedback. Be friendly and informative.",
};

// POST /v1/support/ai-reply
functions.post("/support/ai-reply", async (c) => {
  const user = await getSupabaseUser(c);
  if (!user) return jsonError(c, "Unauthorized", 401);
  const body = await readJson(c);
  const ticketId = typeof body.ticket_id === "string" ? body.ticket_id : "";
  if (!ticketId) return jsonError(c, "ticket_id is required", 400);
  const db = createPublicDbClient(c.env);

  try {
    const tickets = await db.select<any>(
      "support_tickets",
      `select=id,user_id,subject,category,priority,has_ai_draft& id=eq.${encodeURIComponent(ticketId)}&limit=1`.replace("& id=", "&id="),
    );
    const ticket = firstRow(tickets);
    if (!ticket) return jsonError(c, "Ticket not found", 404);
    if (ticket.user_id && ticket.user_id !== user.id) return jsonError(c, "Ticket not found", 404);
    if (ticket.has_ai_draft) return c.json({ ok: true, skipped: true });

    const messages = await db.select<any>(
      "support_messages",
      `select=sender_type,message&ticket_id=eq.${encodeURIComponent(ticketId)}&is_internal=eq.false&order=created_at.asc`,
    );
    const userMessages = messages.filter((message) => message.sender_type === "user");
    if (!userMessages.length) return jsonError(c, "No user messages yet", 422);
    const categoryHint = CATEGORY_HINTS[ticket.category ?? "general"] ?? CATEGORY_HINTS.general;
    const systemPrompt = `You are a helpful, professional customer support agent for AfuChat.
${categoryHint}
Keep replies under 200 words, be warm and solution-focused, ask one clarifying question when needed,
never invent account details, and sign off as "AfuChat Support AI".
Ticket subject: "${ticket.subject}" Category: ${ticket.category ?? "general"}
${ticket.priority === "urgent" || ticket.priority === "high" ? "Acknowledge the high priority and explain that human follow-up is expected within 2–4 hours." : ""}`;
    const result = await callEngagera(c.env, {
      messages: [
        { role: "system", content: systemPrompt },
        ...userMessages.map((message) => ({ role: "user", content: String(message.message) })),
      ],
      model: "engagera-pro",
      stream: false,
    });
    if (!result.response.ok || !result.content) return jsonError(c, "AI service unavailable", 502);
    await db.insert("support_messages", {
      ticket_id: ticketId,
      sender_id: null,
      sender_type: "ai",
      message: result.content.trim(),
      is_internal: false,
    });
    await db.update("support_tickets", `id=eq.${encodeURIComponent(ticketId)}`, { has_ai_draft: true });
    return c.json({ ok: true, reply: result.content.trim() });
  } catch (error) {
    console.error("[support-ai-reply]", error);
    return jsonError(c, "AI service is unavailable", 502);
  }
});

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// POST /v1/account/export
functions.post("/account/export", async (c) => {
  const user = await getSupabaseUser(c);
  if (!user) return jsonError(c, "Invalid or expired session", 401);
  const email = user.email;
  if (!email) return jsonError(c, "No email address on this account", 400);
  if (!c.env.RESEND_API_KEY) return jsonError(c, "Email service is not configured", 503);

  const body = await readJson(c);
  const validTypes = new Set(["profile", "posts", "messages", "activity", "transactions"]);
  const selected = (Array.isArray(body.types) ? body.types : ["profile"])
    .filter((value: unknown): value is string => typeof value === "string" && validTypes.has(value));
  if (!selected.length) selected.push("profile");
  const db = createPublicDbClient(c.env);
  const dataPackage: Record<string, unknown> = {};

  await Promise.all(selected.map(async (type) => {
    try {
      if (type === "profile") {
        dataPackage.profile = firstRow(await db.select(
          "profiles",
          `select=id,display_name,handle,bio,avatar_url,country,website_url,xp,acoin,current_grade,is_verified,is_organization_verified,created_at,last_seen&id=eq.${encodeURIComponent(user.id)}&limit=1`,
        )) ?? {};
      } else if (type === "posts") {
        dataPackage.posts = await db.select(
          "posts",
          `select=id,content,post_type,visibility,article_title,image_url,view_count,created_at,post_images(image_url,display_order)&author_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=500`,
        );
      } else if (type === "messages") {
        const rows = await db.select<any>(
          "messages",
          `select=id,chat_id,encrypted_content,created_at,message_type&sender_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=1000`,
        );
        dataPackage.messages = rows.map((message) => ({
          id: message.id,
          chat_id: message.chat_id,
          content: message.encrypted_content,
          type: message.message_type,
          sent_at: message.created_at,
        }));
      } else if (type === "activity") {
        dataPackage.activity = {
          follows: await db.select(
            "follows",
            `select=following_id,created_at&follower_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=200`,
          ),
        };
      } else {
        const [coins, xp] = await Promise.all([
          db.select("acoin_transactions", `select=id,amount,type,note,created_at&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=500`),
          db.select("xp_transfers", `select=id,amount,reason,created_at&or=(sender_id.eq.${encodeURIComponent(user.id)},receiver_id.eq.${encodeURIComponent(user.id)})&order=created_at.desc&limit=200`),
        ]);
        dataPackage.transactions = { acoin: coins, xp };
      }
    } catch (error) {
      console.error(`[account-export:${type}]`, error);
      dataPackage[type] = { error: "Could not fetch this data" };
    }
  }));

  const now = new Date();
  const filename = `afuchat-data-export-${now.toISOString().split("T")[0]}.json`;
  const payload = JSON.stringify({
    exported_at: now.toISOString(),
    user_id: user.id,
    email,
    included_types: selected,
    data: dataPackage,
  }, null, 2);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${c.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "AfuChat <onboarding@resend.dev>",
      to: [email],
      subject: "Your AfuChat data export is ready",
      attachments: [{ filename, content: base64(payload) }],
      html: `<p>Your AfuChat data export is attached as <strong>${filename}</strong>.</p><p>Included data: ${selected.join(", ")}</p>`,
    }),
  });
  if (!response.ok) {
    console.error("[account-export:resend]", response.status, await response.text().catch(() => ""));
    return jsonError(c, "Failed to send export email. Please try again later.", 502);
  }
  return c.json({ ok: true, email });
});

export default functions;