import { runAfterIdle } from "./runAfterIdle";
import { getLiveSupabaseSession, supabase } from "./supabase";
import {
  getPendingMessages,
  removePendingMessage,
  onConnectivityChange,
  isOnline,
} from "./offlineStore";
import { drainQueue, startSyncQueue, stopSyncQueue } from "./storage/syncQueue";
import {
  getPendingLocalMessages,
  markMessageSynced,
  getLocalMessageCount,
  saveMessages,
} from "./storage/localMessages";

let syncing = false;
const MAX_ITEMS_PER_SYNC = 10;

export async function syncPendingMessages(): Promise<void> {
  if (syncing || !isOnline()) return;
  syncing = true;

  try {
    const session = await getLiveSupabaseSession();
    if (!session) return;

    // 1. Sync legacy AsyncStorage pending messages
    const pending = (await getPendingMessages()).filter(
      (msg) => msg.sender_id === session.user.id,
    );
    for (const msg of pending.slice(0, MAX_ITEMS_PER_SYNC)) {
      try {
        // Deduplication: check if a message with the same content+chat+sender
        // was already inserted (e.g., sent on a previous retry before the ack
        // arrived). If found, just remove from queue without re-inserting.
        const { data: existing } = await supabase
          .from("messages")
          .select("id")
          .eq("chat_id", msg.chat_id)
          .eq("sender_id", msg.sender_id)
          .eq("encrypted_content", msg.encrypted_content)
          .gte("sent_at", new Date(Date.now() - 60_000).toISOString())
          .maybeSingle();

        if (existing) {
          await removePendingMessage(msg.id);
          continue;
        }

        const { error } = await supabase.from("messages").insert({
          chat_id: msg.chat_id,
          sender_id: msg.sender_id,
          encrypted_content: msg.encrypted_content,
        });
        if (!error) {
          await removePendingMessage(msg.id);
        }
      } catch {
        // Keep this item for the next bounded pass. A single malformed row or
        // transient native/HTTP error must not abort the remaining queue.
      }
    }

    // 2. Sync SQLite pending messages (primary path)
    const localPending = (await getPendingLocalMessages()).filter(
      (msg) => msg.sender_id === session.user.id,
    );
    for (const msg of localPending.slice(0, MAX_ITEMS_PER_SYNC)) {
      try {
        // Deduplication: same guard as above
        const { data: existing } = await supabase
          .from("messages")
          .select("id")
          .eq("chat_id", msg.conversation_id)
          .eq("sender_id", msg.sender_id)
          .eq("encrypted_content", msg.content)
          .gte("sent_at", new Date(Date.now() - 60_000).toISOString())
          .maybeSingle();

        if (existing) {
          await markMessageSynced(msg.id, existing.id);
          continue;
        }

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
        }
      } catch {
        // Leave the row pending. The next connectivity/interval pass can retry.
      }
    }

    // 3. Drain offline action queue (likes, bookmarks, follows, etc.)
    // Drain only a bounded amount per pass. The queue retries on the next
    // connectivity event or interval instead of monopolising the JS bridge
    // after a long offline period.
    await drainQueue(MAX_ITEMS_PER_SYNC);
  } catch {
    // A failed pass must remain recoverable through the next retry trigger.
  } finally {
    // Never leave the global lock held after a SQLite or network exception.
    syncing = false;
  }
}

let realtimeReconnecting = false;

async function reconnectRealtime(): Promise<void> {
  if (realtimeReconnecting) return;
  realtimeReconnecting = true;
  try {
    if (!(await getLiveSupabaseSession())) return;
    await supabase.realtime.disconnect();
    await supabase.realtime.connect();
  } catch {
    // A later connectivity event or the next app foreground can retry.
  } finally {
    realtimeReconnecting = false;
  }
}

let unsubscribe: (() => void) | null = null;
const onlineListeners: Array<() => void> = [];

export function addOnlineListener(fn: () => void): () => void {
  onlineListeners.push(fn);
  // A screen can mount after NetInfo has already reported the initial online
  // state. In that case it would otherwise wait for the next connectivity
  // transition and look offline until the next network change.
  if (isOnline()) {
    setTimeout(() => {
      if (onlineListeners.includes(fn) && isOnline()) {
        try { fn(); } catch {}
      }
    }, 0);
  }
  return () => {
    const idx = onlineListeners.indexOf(fn);
    if (idx !== -1) onlineListeners.splice(idx, 1);
  };
}

// ── Periodic retry while online ────────────────────────────────────────────────
// If the device has pending messages and comes online, we sync immediately.
// This interval acts as a safety net — it re-tries every 30 s in case the
// first attempt silently failed (e.g., server was momentarily unreachable).
let _retryInterval: ReturnType<typeof setInterval> | null = null;

function startRetryInterval(): void {
  if (_retryInterval) return;
  _retryInterval = setInterval(async () => {
    if (!isOnline() || syncing) return;
    try {
      const pending = await getPendingLocalMessages();
      if (pending.length > 0) await syncPendingMessages();
    } catch {}
  }, 30_000);
}

function stopRetryInterval(): void {
  if (_retryInterval) {
    clearInterval(_retryInterval);
    _retryInterval = null;
  }
}

export function startOfflineSync(): void {
  if (unsubscribe) {
    if (isOnline()) {
      void syncPendingMessages();
      void drainQueue(MAX_ITEMS_PER_SYNC);
    }
    return;
  }

  // Keep both offline systems under the same authenticated lifecycle. The root
  // layout must not start either one before Supabase has restored identity.
  startSyncQueue();

  unsubscribe = onConnectivityChange((online) => {
    if (online) {
      void syncPendingMessages();
      reconnectRealtime();
      onlineListeners.forEach((fn) => { try { fn(); } catch {} });
    }
  });

  if (isOnline()) {
    void syncPendingMessages();
  }

  startRetryInterval();
}

export function stopOfflineSync(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  stopRetryInterval();
  stopSyncQueue();
}

/**
 * Proactively pre-caches the last 100 messages for each chat that has no local
 * messages yet. Called after the chat list loads so opening any visible chat
 * works offline, even if it was never opened before.
 *
 * Fire-and-forget — does not affect UI. Skips conversations already cached.
 */
export async function preloadConversationMessages(
  chatIds: string[],
): Promise<void> {
  if (!isOnline() || chatIds.length === 0) return;
  const initialSession = await getLiveSupabaseSession();
  if (!initialSession) return;
  // This is background warm-up, not a requirement for opening chat. Start
  // after current interactions and keep it small so a large chat list cannot
  // monopolise the JS/native bridge or saturate the network.
  await new Promise<void>((resolve) => {
    runAfterIdle(resolve);
  });
  const currentSession = await getLiveSupabaseSession();
  if (currentSession?.user?.id !== initialSession.user.id) return;
  for (const chatId of chatIds.slice(0, 5)) {
    if (!isOnline()) break;
    try {
      const count = await getLocalMessageCount(chatId);
      if (count > 0) continue;

      const { data } = await supabase
        .from("messages")
        .select(
          "id, chat_id, sender_id, encrypted_content, sent_at, attachment_url, attachment_type, reply_to_message_id, edited_at, status",
        )
        .eq("chat_id", chatId)
        .order("sent_at", { ascending: false })
        .limit(30);

      if (data && data.length > 0) {
        await saveMessages(chatId, data);
      }
    } catch {
      // Ignore per-conversation errors — keep going for other chats
    }
  }
}
