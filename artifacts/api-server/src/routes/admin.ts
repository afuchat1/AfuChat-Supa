import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import { SUPABASE_URL } from "../lib/constants";

const router = Router();

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const supabaseUrl = SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// POST /api/admin/broadcast-push
// Body: { title: string; body: string; target: "all" | "premium" }
// Headers: Authorization: Bearer <supabase-jwt>
router.post("/admin/broadcast-push", async (req, res) => {
  try {
    if (!supabaseUrl || !serviceKey) {
      return res.status(503).json({ error: "Supabase not configured" });
    }

    const authHeader = req.headers.authorization || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) {
      return res.status(401).json({ error: "Missing authorization token" });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is an admin
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!(profile as any)?.is_admin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { title, body, target = "all" } = req.body as {
      title: string;
      body: string;
      target?: "all" | "premium";
    };

    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "title and body are required" });
    }

    // Fetch profiles with push tokens
    let query = admin
      .from("profiles")
      .select("id, expo_push_token")
      .not("expo_push_token", "is", null)
      .eq("account_deleted", false);

    if (target === "premium") {
      // Join via user_subscriptions
      query = admin
        .from("profiles")
        .select("id, expo_push_token, user_subscriptions!inner(id)")
        .not("expo_push_token", "is", null)
        .eq("account_deleted", false)
        .eq("user_subscriptions.is_active", true);
    }

    const { data: profiles, error: profileErr } = await query;
    if (profileErr) {
      logger.error(profileErr, "[broadcast] Failed to fetch profiles");
      return res.status(500).json({ error: profileErr.message });
    }

    const allIds = (profiles || []).map((p: any) => p.id);
    const total = allIds.length;

    if (total === 0) {
      return res.json({ sent: 0, total: 0, message: "No eligible users with push tokens" });
    }

    // Check notification preferences — respect global push_enabled flag
    const { data: prefs } = await admin
      .from("notification_preferences")
      .select("user_id, push_enabled")
      .in("user_id", allIds);

    const disabledSet = new Set<string>(
      (prefs || [])
        .filter((p: any) => p.push_enabled === false)
        .map((p: any) => p.user_id)
    );

    const eligibleProfiles = (profiles || []).filter(
      (p: any) => !disabledSet.has(p.id)
    );

    const tokens: string[] = eligibleProfiles
      .map((p: any) => p.expo_push_token as string)
      .filter(Boolean);

    if (tokens.length === 0) {
      return res.json({ sent: 0, total, message: "All users have push disabled" });
    }

    // Send in chunks of 100 (Expo limit)
    const messages = tokens.map((token) => ({
      to: token,
      title: title.trim().substring(0, 100),
      body: body.trim().substring(0, 200),
      data: { type: "broadcast" },
      sound: "default",
      badge: 1,
      priority: "high",
      channelId: "default",
    }));

    const chunks: typeof messages[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      chunks.push(messages.slice(i, i + 100));
    }

    let sent = 0;
    const invalidTokens: string[] = [];
    const tokenToUserId = new Map<string, string>();
    for (const p of eligibleProfiles as any[]) tokenToUserId.set(p.expo_push_token, p.id);

    for (const chunk of chunks) {
      try {
        const pushRes = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(chunk),
        });
        if (pushRes.ok) {
          const result = await pushRes.json();
          (result.data || []).forEach((ticket: any, idx: number) => {
            if (ticket.status === "ok") {
              sent++;
            } else if (ticket.details?.error === "DeviceNotRegistered") {
              const t = chunk[idx]?.to;
              if (t) invalidTokens.push(t);
            }
          });
        } else {
          logger.error({ status: pushRes.status }, "[broadcast] Expo API error");
        }
      } catch (chunkErr) {
        logger.error(chunkErr, "[broadcast] chunk send error");
      }
    }

    // Clean up stale tokens
    if (invalidTokens.length > 0) {
      const staleIds = invalidTokens
        .map((t) => tokenToUserId.get(t))
        .filter(Boolean) as string[];
      if (staleIds.length > 0) {
        await admin.from("profiles").update({ expo_push_token: null }).in("id", staleIds);
        logger.info({ count: staleIds.length }, "[broadcast] Cleared stale token(s)");
      }
    }

    logger.info({ sent, total: tokens.length, target }, "[broadcast] Push broadcast complete");

    return res.json({
      sent,
      total: tokens.length,
      message: `Broadcast sent to ${sent} of ${tokens.length} eligible devices`,
    });
  } catch (err: any) {
    logger.error(err, "[broadcast] Unexpected error");
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

export default router;
