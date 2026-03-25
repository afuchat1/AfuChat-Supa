import { supabase } from "./supabase";
import {
  getPendingMessages,
  removePendingMessage,
  onConnectivityChange,
  isOnline,
} from "./offlineStore";

let syncing = false;

export async function syncPendingMessages(): Promise<void> {
  if (syncing || !isOnline()) return;
  syncing = true;

  try {
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
