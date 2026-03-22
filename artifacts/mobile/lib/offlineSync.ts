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

let unsubscribe: (() => void) | null = null;

export function startOfflineSync(): void {
  if (unsubscribe) return;

  unsubscribe = onConnectivityChange((online) => {
    if (online) {
      syncPendingMessages();
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
