import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const PURGE_SECRET = process.env.ACCOUNT_PURGE_SECRET;

router.post("/account-purge", async (req, res) => {
  try {
    if (!PURGE_SECRET) {
      return res.status(503).json({ error: "Purge endpoint not configured" });
    }
    const { secret } = req.body;
    if (!secret || secret !== PURGE_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const now = new Date().toISOString();

    const { data: expiredProfiles, error: fetchErr } = await supabase
      .from("profiles")
      .select("id, handle, display_name")
      .not("scheduled_deletion_at", "is", null)
      .lte("scheduled_deletion_at", now);

    if (fetchErr) {
      return res.status(500).json({ error: fetchErr.message });
    }

    if (!expiredProfiles || expiredProfiles.length === 0) {
      return res.json({ purged: 0, message: "No expired accounts to purge" });
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
        { table: "acoin_transactions", filter: `user_id.eq.${uid}` },
        { table: "red_envelopes", filter: `sender_id.eq.${uid}` },
      ];

      for (const del of orDeletions) {
        const { error: delErr } = del.filter.includes(",")
          ? await supabase.from(del.table).delete().or(del.filter)
          : await supabase.from(del.table).delete().match({ user_id: uid });
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

    return res.json({
      purged: purgedIds.length,
      ids: purgedIds,
      message: `Purged ${purgedIds.length} account(s)`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
