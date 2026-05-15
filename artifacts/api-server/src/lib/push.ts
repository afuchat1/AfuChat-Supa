/**
 * Server-side Expo push notification sender.
 *
 * Uses the Supabase service role key to read expo_push_token from the
 * profiles table without RLS restrictions, then POSTs to the Expo push
 * API. All pushes originate from the always-running Express server so
 * they are delivered even when the sender's mobile app is closed.
 */

import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./constants";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Batch receipts endpoint — used for error checking (optional, fire-and-forget)
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function channelId(type?: string): string {
  switch (type) {
    case "message":   return "messages";
    case "call":      return "calls";
    case "follow":
    case "like":
    case "reply":
    case "mention":   return "social";
    case "order":
    case "escrow":
    case "payment":   return "marketplace";
    default:          return "default";
  }
}

export type PushPayload = {
  /** Supabase user ID of the recipient */
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Expo notification category (determines action buttons) */
  categoryIdentifier?: string;
};

/**
 * Send a single push notification.
 * Looks up the recipient's expo_push_token server-side (service role).
 * Returns true if the push was accepted by Expo, false otherwise.
 */
export async function sendPush(payload: PushPayload): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.warn("[push] Missing Supabase config — push skipped");
    return false;
  }

  try {
    const admin = getAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("expo_push_token")
      .eq("id", payload.userId)
      .single();

    const token = (profile as any)?.expo_push_token as string | null | undefined;
    if (!token) {
      logger.debug({ userId: payload.userId }, "[push] No expo_push_token — skipping");
      return false;
    }

    const type = payload.data?.type;

    const message: Record<string, unknown> = {
      to: token,
      title: payload.title,
      body: payload.body,
      data: { recipientUserId: payload.userId, ...(payload.data ?? {}) },
      badge: 1,
      sound: "default",
      priority: type === "call" ? "high" : "normal",
      channelId: channelId(type),
      ttl: type === "call" ? 30 : 604800,
      expiration: Math.floor(Date.now() / 1000) + (type === "call" ? 30 : 604800),
    };

    if (payload.categoryIdentifier) message.categoryIdentifier = payload.categoryIdentifier;

    if (type === "message" && payload.data?.chatId) {
      message.collapseId  = `chat_${payload.data.chatId}`;
      message["thread-id"] = payload.data.chatId;
    }
    if (type === "call") {
      message.collapseId = `call_${payload.data?.callId ?? payload.userId}`;
    }

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(message),
    });

    const json = await res.json() as any;
    if (json?.data?.status === "error") {
      logger.warn({ userId: payload.userId, err: json.data.message }, "[push] Expo error");
      return false;
    }

    logger.info({ userId: payload.userId, type }, "[push] Sent OK");
    return true;
  } catch (err) {
    logger.error({ err, userId: payload.userId }, "[push] Failed");
    return false;
  }
}

/**
 * Save or update an Expo push token for a user.
 * Called by the /api/push/register-token route.
 */
export async function savePushToken(userId: string, token: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const admin = getAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ expo_push_token: token })
    .eq("id", userId);
  if (error) logger.warn({ userId, err: error.message }, "[push] savePushToken failed");
}
