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

async function dbDelete(supabaseUrl: string, headers: Record<string, string>, table: string, filter: string) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/${table}?${filter}`, { method: "DELETE", headers });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error(`[purge] DELETE ${table} failed (${resp.status}): ${txt.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const purgeSecret = Deno.env.get("ACCOUNT_PURGE_SECRET") || "";

  if (!supabaseUrl || !serviceKey) return json({ error: "Service not configured" }, 503);
  if (!purgeSecret) return json({ error: "Purge endpoint not configured" }, 503);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (!body?.secret || body.secret !== purgeSecret) return json({ error: "Unauthorized" }, 401);

  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    "Content-Type": "application/json",
  };

  const now = new Date().toISOString();
  const profilesResp = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id,handle,display_name&scheduled_deletion_at=not.is.null&scheduled_deletion_at=lte.${encodeURIComponent(now)}`,
    { headers },
  );
  if (!profilesResp.ok) return json({ error: "Failed to fetch profiles" }, 500);
  const profiles: any[] = await profilesResp.json();

  if (!profiles.length) return json({ purged: 0, message: "No expired accounts to purge" });

  const purgedIds: string[] = [];

  for (const profile of profiles) {
    const uid = profile.id;

    await Promise.all([
      dbDelete(supabaseUrl, headers, "moments", `user_id=eq.${uid}`),
      dbDelete(supabaseUrl, headers, "moment_likes", `user_id=eq.${uid}`),
      dbDelete(supabaseUrl, headers, "moment_comments", `user_id=eq.${uid}`),
      dbDelete(supabaseUrl, headers, "stories", `user_id=eq.${uid}`),
      dbDelete(supabaseUrl, headers, "story_views", `viewer_id=eq.${uid}`),
      dbDelete(supabaseUrl, headers, "chat_members", `user_id=eq.${uid}`),
      dbDelete(supabaseUrl, headers, "messages", `sender_id=eq.${uid}`),
      dbDelete(supabaseUrl, headers, "channel_members", `user_id=eq.${uid}`),
      dbDelete(supabaseUrl, headers, "user_subscriptions", `user_id=eq.${uid}`),
      dbDelete(supabaseUrl, headers, "notifications", `user_id=eq.${uid}`),
      dbDelete(supabaseUrl, headers, "follows", `or=(follower_id.eq.${uid},following_id.eq.${uid})`),
      dbDelete(supabaseUrl, headers, "contacts", `or=(user_id.eq.${uid},contact_id.eq.${uid})`),
      dbDelete(supabaseUrl, headers, "xp_transfers", `or=(sender_id.eq.${uid},receiver_id.eq.${uid})`),
      dbDelete(supabaseUrl, headers, "acoin_transactions", `user_id=eq.${uid}`),
      dbDelete(supabaseUrl, headers, "red_envelopes", `sender_id=eq.${uid}`),
    ]);

    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${uid}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        display_name: "Deleted User",
        bio: null,
        avatar_url: null,
        banner_url: null,
        handle: `deleted_${uid.substring(0, 8)}`,
        phone_number: null,
        xp: 0,
        acoin: 0,
        country: null,
        website_url: null,
        gender: null,
        date_of_birth: null,
        interests: null,
        onboarding_completed: false,
        expo_push_token: null,
        is_verified: false,
        scheduled_deletion_at: null,
        account_deleted: true,
      }),
    });

    await fetch(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
      method: "DELETE",
      headers,
    }).catch((e) => console.error(`[purge] auth delete failed for ${uid}:`, e));

    purgedIds.push(uid);
  }

  return json({ purged: purgedIds.length, ids: purgedIds, message: `Purged ${purgedIds.length} account(s)` });
});
