// ─── Offline Action Queue ──────────────────────────────────────────────────────
// All user actions taken while offline are enqueued here and replayed once the
// device reconnects. Exactly how Instagram/WhatsApp defer network operations.

import { getDB } from "./db";
import {
  postAfuChatMessage,
  setAfuChatBookmark,
  setAfuChatFollow,
  setAfuChatMessageReaction,
  setAfuChatMessageStatus,
  setAfuChatPostLike,
} from "@/lib/afuchatApi";
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
        if (typeof payload.post_id !== "string" || typeof payload.user_id !== "string") return false;
        const { error } = await setAfuChatPostLike(payload.post_id, true, payload.user_id);
        return !error || error.code === "409";
      }
      case "unlike_post": {
        if (typeof payload.post_id !== "string" || typeof payload.user_id !== "string") return false;
        const { error } = await setAfuChatPostLike(payload.post_id, false, payload.user_id);
        return !error || error.code === "409";
      }
      case "bookmark_post": {
        if (typeof payload.post_id !== "string" || typeof payload.user_id !== "string") return false;
        const { error } = await setAfuChatBookmark(payload.post_id, true, payload.user_id);
        // If the active account changed before this queued action drained, do
        // not apply it to the new account or let it block the shared queue.
        return !error || error.code === "409";
      }
      case "unbookmark_post": {
        if (typeof payload.post_id !== "string" || typeof payload.user_id !== "string") return false;
        const { error } = await setAfuChatBookmark(payload.post_id, false, payload.user_id);
        // A stale account-scoped queue item is discarded rather than replayed
        // against whichever account happens to be signed in now.
        return !error || error.code === "409";
      }
      case "follow_user": {
        if (typeof payload.follower_id !== "string" || typeof payload.following_id !== "string") return false;
        const { error } = await setAfuChatFollow(
          payload.following_id,
          true,
          payload.follower_id,
        );
        return !error || error.code === "409";
      }
      case "unfollow_user": {
        if (typeof payload.follower_id !== "string" || typeof payload.following_id !== "string") return false;
        const { error } = await setAfuChatFollow(
          payload.following_id,
          false,
          payload.follower_id,
        );
        return !error || error.code === "409";
      }
      case "mark_read": {
        const messageIds = Array.isArray(payload.message_ids)
          ? payload.message_ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
          : [];
        if (messageIds.length === 0) return true;
        const { error } = await setAfuChatMessageStatus({
          messageIds,
          expectedUserId: payload.user_id,
          readReceipts: payload.read_receipts !== false,
        });
        return !error || error.code === "409";
      }
      case "add_reaction": {
        const { error } = await setAfuChatMessageReaction({
          messageId: payload.message_id,
          reaction: payload.emoji,
          active: true,
          expectedUserId: payload.user_id,
        });
        return !error || error.code === "409";
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
        const { data, error } = await postAfuChatMessage({
          chat_id: msg.conversation_id,
          client_message_id: msg.id,
          encrypted_content: msg.content ?? "",
          expected_user_id: msg.sender_id,
        });
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
