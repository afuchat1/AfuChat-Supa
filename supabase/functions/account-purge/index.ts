import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PURGE_SECRET = Deno.env.get("ACCOUNT_PURGE_SECRET");
    if (!PURGE_SECRET) {
      return json({ error: "Purge endpoint not configured" }, 503);
    }

    const body = await req.json();
    const { secret } = body;
    if (!secret || secret !== PURGE_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = new Date().toISOString();

    const { data: expiredProfiles, error: fetchErr } = await supabase
      .from("profiles")
      .select("id, handle, display_name")
      .not("scheduled_deletion_at", "is", null)
      .lte("scheduled_deletion_at", now);

    if (fetchErr) {
      return json({ error: fetchErr.message }, 500);
    }

    if (!expiredProfiles || expiredProfiles.length === 0) {
      return json({ purged: 0, message: "No expired accounts to purge" });
    }

    const purgedIds: string[] = [];

    for (const profile of expiredProfiles) {
      const uid = profile.id;

      const deletions = [
        { table: "moments", filter: { user_id: uid } },
        { table: "moment_likes", filter: { user_id: uid } },
        { table: "moment_comments", filter: { user_id: uid } },
        { table: "stories", filter: { user_id: uid } },
        { table: "story_views", filter: { viewer_id: uid } },
        { table: "chat_members", filter: { user_id: uid } },
        { table: "messages", filter: { sender_id: uid } },
        { table: "channel_members", filter: { user_id: uid } },
        { table: "user_subscriptions", filter: { user_id: uid } },
        { table: "notifications", filter: { user_id: uid } },
      ];

      const errors: string[] = [];
      for (const del of deletions) {
        const { error: delErr } = await supabase.from(del.table).delete().match(del.filter);
        if (delErr) errors.push(`${del.table}: ${delErr.message}`);
      }

      const orDeletions = [
        { table: "follows", filter: `follower_id.eq.${uid},following_id.eq.${uid}` },
        { table: "contacts", filter: `user_id.eq.${uid},contact_id.eq.${uid}` },
        { table: "xp_transfers", filter: `sender_id.eq.${uid},receiver_id.eq.${uid}` },
        { table: "acoin_transactions", filter: { user_id: uid } },
        { table: "red_envelopes", filter: { sender_id: uid } },
      ];

      for (const del of orDeletions) {
        const filter = del.filter;
        let delErr;
        if (typeof filter === "string") {
          ({ error: delErr } = await supabase.from(del.table).delete().or(filter));
        } else {
          ({ error: delErr } = await supabase.from(del.table).delete().match(filter));
        }
        if (delErr) errors.push(`${del.table}: ${delErr.message}`);
      }

      if (errors.length > 0) {
        console.error(`Partial deletion failures for ${uid}:`, errors);
      }

      await supabase.from("profiles").update({
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
      }).eq("id", uid);

      try {
        await supabase.auth.admin.deleteUser(uid);
      } catch (authErr) {
        console.error(`Failed to delete auth user ${uid}:`, authErr);
      }

      purgedIds.push(uid);
    }

    return json({
      purged: purgedIds.length,
      ids: purgedIds,
      message: `Purged ${purgedIds.length} account(s)`,
    });
  } catch (err: any) {
    console.error("account-purge error:", err?.message || err);
    return json({ error: err?.message }, 500);
  }
});
