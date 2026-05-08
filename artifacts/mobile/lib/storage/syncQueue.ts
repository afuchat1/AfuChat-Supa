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

export async function drainQueue(): Promise<void> {
  if (_draining || !isOnline()) return;
  _draining = true;

  try {
    const db = await getDB();
    const items = await db.getAllAsync<QueueItem>(
      "SELECT * FROM offline_queue ORDER BY created_at ASC LIMIT 50",
    );

    for (const item of items) {
      let payload: Record<string, any> = {};
      try { payload = JSON.parse(item.payload as unknown as string); } catch {}

      const success = await executeAction(item.action_type, payload);
      if (success) {
        await db.runAsync("DELETE FROM offline_queue WHERE id = ?", [item.id]);
      } else {
        const retries = (item.retry_count ?? 0) + 1;
        if (retries >= 5) {
          // Give up after 5 retries
          await db.runAsync("DELETE FROM offline_queue WHERE id = ?", [item.id]);
        } else {
          await db.runAsync(
            "UPDATE offline_queue SET retry_count = ?, last_error = ? WHERE id = ?",
            [retries, "retry", item.id],
          );
        }
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
        const { error } = await supabase.from("post_likes").insert({
          post_id: payload.post_id,
          user_id: payload.user_id,
        });
        return !error;
      }
      case "unlike_post": {
        const { error } = await supabase
          .from("post_likes")
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
        await supabase
          .from("chat_read_receipts")
          .upsert({ chat_id: payload.chat_id, user_id: payload.user_id, read_at: new Date().toISOString() });
        return true;
      }
      case "add_reaction": {
        const { error } = await supabase.from("message_reactions").insert({
          message_id: payload.message_id,
          user_id: payload.user_id,
          emoji: payload.emoji,
        });
        return !error;
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
export function startSyncQueue(): void {
  if (_listenerRegistered) return;
  _listenerRegistered = true;

  onConnectivityChange((online) => {
    if (online) drainQueue();
  });

  if (isOnline()) drainQueue();
}
