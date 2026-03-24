import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

const PURGE_SECRET = process.env.ACCOUNT_PURGE_SECRET || "afuchat-purge-2024";

router.post("/account-purge", async (req, res) => {
  try {
    const { secret } = req.body;
    if (secret !== PURGE_SECRET) {
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

      await Promise.all([
        supabase.from("moments").delete().eq("user_id", uid),
        supabase.from("moment_likes").delete().eq("user_id", uid),
        supabase.from("moment_comments").delete().eq("user_id", uid),
        supabase.from("stories").delete().eq("user_id", uid),
        supabase.from("story_views").delete().eq("viewer_id", uid),
        supabase.from("follows").delete().or(`follower_id.eq.${uid},following_id.eq.${uid}`),
        supabase.from("contacts").delete().or(`user_id.eq.${uid},contact_id.eq.${uid}`),
        supabase.from("chat_members").delete().eq("user_id", uid),
        supabase.from("messages").delete().eq("sender_id", uid),
        supabase.from("channel_members").delete().eq("user_id", uid),
        supabase.from("xp_transfers").delete().or(`sender_id.eq.${uid},receiver_id.eq.${uid}`),
        supabase.from("acoin_transactions").delete().eq("user_id", uid),
        supabase.from("user_subscriptions").delete().eq("user_id", uid),
        supabase.from("notifications").delete().eq("user_id", uid),
        supabase.from("red_envelopes").delete().eq("sender_id", uid),
      ]);

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
