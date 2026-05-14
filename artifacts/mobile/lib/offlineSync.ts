import { supabase } from "./supabase";
import {
  getPendingMessages,
  removePendingMessage,
  onConnectivityChange,
  isOnline,
} from "./offlineStore";
import { drainQueue } from "./storage/syncQueue";
import { getPendingLocalMessages, markMessageSynced, getLocalMessageCount, saveMessages } from "./storage/localMessages";

let syncing = false;

export async function syncPendingMessages(): Promise<void> {
  if (syncing || !isOnline()) return;
  syncing = true;

  try {
    // 1. Sync legacy AsyncStorage pending messages
    const pending = await getPendingMessages();
    for (const msg of pending) {
      const { error } = await supabase.from("messages").insert({
        chat_id: msg.chat_id,
        sender_id: msg.sender_id,
        encrypted_content: msg.encrypted_content,
      });
      if (!error) {
        await removePendingMessage(msg.id);
      }
    }

    // 2. Sync SQLite pending messages (new path)
    const localPending = await getPendingLocalMessages();
    for (const msg of localPending) {
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
    }

    // 3. Drain offline action queue (likes, bookmarks, follows, etc.)
    await drainQueue();
  } catch {}

  syncing = false;
}

let realtimeReconnecting = false;

async function reconnectRealtime(): Promise<void> {
  if (realtimeReconnecting) return;
  realtimeReconnecting = true;
  try {
    await supabase.realtime.disconnect();
    await supabase.realtime.connect();
  } catch {}
  realtimeReconnecting = false;
}

let unsubscribe: (() => void) | null = null;
const onlineListeners: Array<() => void> = [];

export function addOnlineListener(fn: () => void): () => void {
  onlineListeners.push(fn);
  return () => {
    const idx = onlineListeners.indexOf(fn);
    if (idx !== -1) onlineListeners.splice(idx, 1);
  };
}

export function startOfflineSync(): void {
  if (unsubscribe) return;

  unsubscribe = onConnectivityChange((online) => {
    if (online) {
      syncPendingMessages();
      reconnectRealtime();
      onlineListeners.forEach((fn) => { try { fn(); } catch {} });
    }
  });

  if (isOnline()) {
    syncPendingMessages();
  }
}

export function stopOfflineSync(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

/**
 * Proactively pre-caches the last 100 messages for each chat that has no local
 * messages yet. Called after the chat list loads so opening any visible chat
 * works offline, even if it was never opened before.
 *
 * Fire-and-forget — does not affect UI. Skips conversations already cached.
 */
export async function preloadConversationMessages(chatIds: string[]): Promise<void> {
  if (!isOnline() || chatIds.length === 0) return;
  for (const chatId of chatIds) {
    try {
      // Skip conversations that already have messages in SQLite
      const count = await getLocalMessageCount(chatId);
      if (count > 0) continue;

      const { data } = await supabase
        .from("messages")
        .select("id, chat_id, sender_id, encrypted_content, sent_at, attachment_url, attachment_type, reply_to_message_id, edited_at, status")
        .eq("chat_id", chatId)
        .order("sent_at", { ascending: false })
        .limit(100);

      if (data && data.length > 0) {
        await saveMessages(chatId, data);
      }
    } catch {
      // Ignore per-conversation errors — keep going for other chats
    }
  }
}
