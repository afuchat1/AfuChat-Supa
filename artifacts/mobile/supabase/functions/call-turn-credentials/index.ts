import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN_TTL_SECONDS = 3600;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

function hasTurnServer(iceServers: unknown): boolean {
  if (!Array.isArray(iceServers)) return false;
  return iceServers.some((server) => {
    const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
    const hasTurnUrl = urls.some((url: unknown) =>
      typeof url === "string" && url.toLowerCase().startsWith("turn:")
    );
    return hasTurnUrl &&
      typeof server?.username === "string" &&
      typeof server?.credential === "string";
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Authorization required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const apiKey = Deno.env.get("TWILIO_API_KEY") ?? "";
  const apiSecret = Deno.env.get("TWILIO_API_SECRET") ?? "";
  if (!supabaseUrl || !anonKey) {
    return json({ error: "Call authentication is unavailable" }, 503);
  }
  if (!accountSid || !apiKey || !apiSecret) {
    return json({ error: "Secure call relay is not configured" }, 503);
  }

  const auth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await auth.auth.getUser();
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  const body = await request.json().catch(() => null);
  const callId = typeof body?.callId === "string" ? body.callId.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(callId)) {
    return json({ error: "A valid call ID is required" }, 400);
  }

  const { data: call, error: callError } = await auth
    .from("calls")
    .select("id, caller_id, callee_id, status")
    .eq("id", callId)
    .maybeSingle();
  if (
    callError ||
    !call ||
    ![call.caller_id, call.callee_id].includes(authData.user.id) ||
    !["initiated", "ringing", "active"].includes(call.status)
  ) {
    return json({ error: "Call is not available to this user" }, 403);
  }

  const form = new URLSearchParams({ Ttl: String(TOKEN_TTL_SECONDS) });
  const credentials = btoa(`${apiKey}:${apiSecret}`);
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Tokens.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    },
  ).catch(() => null);

  if (!response?.ok) {
    console.error("[call-turn-credentials] Twilio token request failed");
    return json({ error: "Could not create secure call relay credentials" }, 502);
  }

  const providerData = await response.json().catch(() => null);
  const iceServers = providerData?.ice_servers ?? providerData?.iceServers;
  if (!hasTurnServer(iceServers)) {
    console.error("[call-turn-credentials] Provider returned no TURN server");
    return json({ error: "Secure call relay credentials were incomplete" }, 502);
  }

  return json({
    iceServers,
    expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
  });
});
