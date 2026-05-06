const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

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

  const dbHeaders = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    "Content-Type": "application/json",
  };

  const profileResp = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=is_admin&id=eq.${userId}&limit=1`,
    { headers: dbHeaders },
  );
  if (!profileResp.ok) return json({ error: "Unauthorized" }, 401);
  const profiles = await profileResp.json();
  if (!profiles?.[0]?.is_admin) return json({ error: "Admin access required" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { title, body: msgBody, target = "all" } = body || {};
  if (!title?.trim() || !msgBody?.trim()) return json({ error: "title and body are required" }, 400);

  let profilesUrl = `${supabaseUrl}/rest/v1/profiles?select=id,expo_push_token&expo_push_token=not.is.null&account_deleted=eq.false`;
  if (target === "premium") {
    profilesUrl = `${supabaseUrl}/rest/v1/profiles?select=id,expo_push_token,user_subscriptions!inner(id)&expo_push_token=not.is.null&account_deleted=eq.false&user_subscriptions.is_active=eq.true`;
  }

  const allProfilesResp = await fetch(profilesUrl, { headers: dbHeaders });
  if (!allProfilesResp.ok) return json({ error: "Failed to fetch profiles" }, 500);
  const allProfiles: any[] = await allProfilesResp.json();

  const allIds = allProfiles.map((p) => p.id);
  const total = allIds.length;
  if (total === 0) return json({ sent: 0, total: 0, message: "No eligible users with push tokens" });

  const prefsResp = await fetch(
    `${supabaseUrl}/rest/v1/notification_preferences?select=user_id,push_enabled&user_id=in.(${allIds.join(",")})`,
    { headers: dbHeaders },
  );
  const prefs: any[] = prefsResp.ok ? await prefsResp.json() : [];
  const disabledSet = new Set<string>(prefs.filter((p) => p.push_enabled === false).map((p) => p.user_id));

  const eligibleProfiles = allProfiles.filter((p) => !disabledSet.has(p.id));
  const tokens = eligibleProfiles.map((p) => p.expo_push_token).filter(Boolean);
  if (!tokens.length) return json({ sent: 0, total, message: "All users have push disabled" });

  const tokenToUserId = new Map<string, string>();
  for (const p of eligibleProfiles) tokenToUserId.set(p.expo_push_token, p.id);

  const messages = tokens.map((token: string) => ({
    to: token,
    title: title.trim().substring(0, 100),
    body: msgBody.trim().substring(0, 200),
    data: { type: "broadcast" },
    sound: "default",
    badge: 1,
    priority: "high",
    channelId: "default",
  }));

  let sent = 0;
  const invalidTokens: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const pushResp = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      });
      if (pushResp.ok) {
        const result = await pushResp.json();
        (result.data || []).forEach((ticket: any, idx: number) => {
          if (ticket.status === "ok") sent++;
          else if (ticket.details?.error === "DeviceNotRegistered") {
            const t = chunk[idx]?.to;
            if (t) invalidTokens.push(t);
          }
        });
      }
    } catch (e) {
      console.error("[broadcast] chunk error:", e);
    }
  }

  if (invalidTokens.length > 0) {
    const staleIds = invalidTokens.map((t) => tokenToUserId.get(t)).filter(Boolean);
    if (staleIds.length) {
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=in.(${staleIds.join(",")})`, {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify({ expo_push_token: null }),
      });
    }
  }

  return json({ sent, total: tokens.length, message: `Broadcast sent to ${sent} of ${tokens.length} eligible devices` });
});
