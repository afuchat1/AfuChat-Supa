// ─── Offline Action Queue ──────────────────────────────────────────────────────
// All user actions taken while offline are enqueued here and replayed once the
// device reconnects. Exactly how Instagram/WhatsApp defer network operations.

import { getDB } from "./db";
import { supabase } from "@/lib/supabase";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";

export type QueueActionType =
  | "send_message"
  | "like_post"
  | "unlike_post"
  | "bookmark_post"
  | "unbookmark_post"
  | "follow_user"
  | "unfollow_user"
  | "add_reaction"
  | "mark_read"
  | "delete_message";

export type QueueItem = {
  id: string;
  action_type: QueueActionType;
  payload: Record<string, any>;
  created_at: number;
  retry_count: number;
  last_error: string | null;
};

// ─── Enqueue ───────────────────────────────────────────────────────────────────

export async function enqueue(
  actionType: QueueActionType,
  payload: Record<string, any>,
): Promise<string> {
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO offline_queue (id, action_type, payload, created_at, retry_count, last_error)
       VALUES (?, ?, ?, ?, 0, NULL)`,
      [id, actionType, JSON.stringify(payload), Date.now()],
    );
  } catch {}
  return id;
}

// ─── Drain ─────────────────────────────────────────────────────────────────────

let _draining = false;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry(retryCount: number): void {
  if (!_listenerRegistered || _retryTimer) return;
  const delay = Math.min(15 * 60_000, 5_000 * 2 ** Math.min(retryCount, 7));
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    void drainQueue();
  }, delay);
}

export async function drainQueue(maxItems = 50): Promise<void> {
  if (_draining || !isOnline()) return;
  _draining = true;

  try {
    const db = await getDB();
    const limit = Number.isFinite(maxItems)
      ? Math.max(1, Math.min(50, Math.floor(maxItems)))
      : 50;
    const items = await db.getAllAsync<QueueItem>(
      `SELECT * FROM offline_queue ORDER BY created_at ASC LIMIT ${limit}`,
    );

    for (const item of items) {
      let payload: Record<string, any> = {};
      try { payload = JSON.parse(item.payload as unknown as string); } catch {}

      const success = await executeAction(item.action_type, payload);
      if (success) {
        await db.runAsync("DELETE FROM offline_queue WHERE id = ?", [item.id]);
      } else {
        const retries = (item.retry_count ?? 0) + 1;
        // Network outages, expired tokens, and temporary RLS failures are not
        // safe reasons to delete a user's action. Keep it durable and retry
        // with backoff; only a confirmed success removes the item.
        await db.runAsync(
          "UPDATE offline_queue SET retry_count = ?, last_error = ? WHERE id = ?",
          [retries, "retry", item.id],
        );
        scheduleRetry(retries);
        // Do not hammer the bridge/network or process later actions out of
        // order while the oldest item is failing.
        break;
      }
    }
  } catch {
  } finally {
    _draining = false;
  }
}

async function executeAction(
  type: QueueActionType,
  payload: Record<string, any>,
): Promise<boolean> {
  try {
    switch (type) {
      case "like_post": {
        const { error } = await supabase.from("post_acknowledgments").upsert({
          post_id: payload.post_id,
          user_id: payload.user_id,
        }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
        return !error;
      }
      case "unlike_post": {
        const { error } = await supabase
          .from("post_acknowledgments")
          .delete()
          .eq("post_id", payload.post_id)
          .eq("user_id", payload.user_id);
        return !error;
      }
      case "bookmark_post": {
        const { error } = await supabase.from("bookmarks").insert({
          post_id: payload.post_id,
          user_id: payload.user_id,
        });
        return !error;
      }
      case "unbookmark_post": {
        const { error } = await supabase
          .from("bookmarks")
          .delete()
          .eq("post_id", payload.post_id)
          .eq("user_id", payload.user_id);
        return !error;
      }
      case "follow_user": {
        const { error } = await supabase.from("follows").insert({
          follower_id: payload.follower_id,
          following_id: payload.following_id,
        });
        return !error;
      }
      case "unfollow_user": {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", payload.follower_id)
          .eq("following_id", payload.following_id);
        return !error;
      }
      case "mark_read": {
        const messageIds = Array.isArray(payload.message_ids)
          ? payload.message_ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
          : [];
        if (messageIds.length === 0) return true;
        const now = new Date().toISOString();
        const rows = messageIds.map((messageId) => ({
          message_id: messageId,
          user_id: payload.user_id,
          delivered_at: now,
          ...(payload.read_receipts !== false ? { read_at: now } : {}),
        }));
        const { error } = await supabase
          .from("message_status")
          .upsert(rows, { onConflict: "message_id,user_id" });
        return !error;
      }
      case "add_reaction": {
        const { error } = await supabase.from("message_reactions").insert({
          message_id: payload.message_id,
          user_id: payload.user_id,
          emoji: payload.emoji,
        });
        return !error;
      }
      case "send_message": {
        // Pending messages are primarily tracked via the SQLite messages table
        // (is_pending=1) and synced by offlineSync.ts. If a send_message entry
        // lands in the offline queue, look up the SQLite row and send it now.
        const { getPendingLocalMessages, markMessageSynced } = await import("./localMessages");
        const pending = await getPendingLocalMessages();
        // Prefer the exact local row. Falling back to the first message in a
        // conversation can send the wrong pending message when two sends are
        // queued together.
        const msg = payload.local_id
          ? pending.find((m) => m.id === payload.local_id)
          : pending.find((m) =>
              m.conversation_id === payload.conversation_id &&
              (payload.content == null || m.content === payload.content),
            );
        if (!msg) return true; // already sent or not found — remove from queue
        const { data, error } = await supabase
          .from("messages")
          .insert({
            chat_id: msg.conversation_id,
            sender_id: msg.sender_id,
            encrypted_content: msg.content,
          })
          .select("id")
          .single();
        if (!error && data?.id) {
          await markMessageSynced(msg.id, data.id);
          return true;
        }
        return false;
      }
      default:
        return true;
    }
  } catch {
    return false;
  }
}

export async function getQueueSize(): Promise<number> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM offline_queue",
    );
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

// ─── Auto-drain when network returns ──────────────────────────────────────────

let _listenerRegistered = false;
let _queueUnsubscribe: (() => void) | null = null;

export function startSyncQueue(): void {
  if (_listenerRegistered) return;
  _listenerRegistered = true;

  _queueUnsubscribe = onConnectivityChange((online) => {
    if (online) drainQueue();
  });

  if (isOnline()) drainQueue();
}

export function stopSyncQueue(): void {
  _queueUnsubscribe?.();
  _queueUnsubscribe = null;
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
  _listenerRegistered = false;
}
