const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function authedUserId(req: Request, supabaseUrl: string, serviceKey: string): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!jwt) return null;
  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: serviceKey },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Service not configured" }, 503);

  const userId = await authedUserId(req, supabaseUrl, serviceKey);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const contactId = String(body?.contactId || "").trim();
  if (!contactId) return json({ error: "contactId is required" }, 400);

  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const chatResp = await fetch(`${supabaseUrl}/rest/v1/chats`, {
    method: "POST",
    headers,
    body: JSON.stringify({ is_group: false, created_by: userId, user_id: userId }),
  });
  if (!chatResp.ok) {
    const err = await chatResp.text();
    return json({ error: "Failed to create chat", detail: err }, 500);
  }
  const chats = await chatResp.json();
  const chat = Array.isArray(chats) ? chats[0] : chats;
  if (!chat?.id) return json({ error: "Failed to create chat" }, 500);

  const memberResp = await fetch(`${supabaseUrl}/rest/v1/chat_members`, {
    method: "POST",
    headers,
    body: JSON.stringify([
      { chat_id: chat.id, user_id: userId },
      { chat_id: chat.id, user_id: contactId },
    ]),
  });
  if (!memberResp.ok) {
    await fetch(`${supabaseUrl}/rest/v1/chats?id=eq.${chat.id}`, { method: "DELETE", headers });
    const err = await memberResp.text();
    return json({ error: "Failed to add members", detail: err }, 500);
  }

  return json({ chatId: chat.id });
});
