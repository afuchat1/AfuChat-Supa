/**
 * Global real-time message event bus.
 *
 * Architecture:
 * - GlobalInboxListener (root component) receives messages via Supabase Broadcast
 *   on the `user-inbox:${userId}` channel.  Every message sent to the user is
 *   published there by the sender's chat screen right after the DB insert.
 *   This gives ~20 ms delivery regardless of which screen the recipient is on.
 *
 * - emitIncomingMessage() fans the message out to:
 *   a) any screen subscribed to that specific chat_id (chat/[id].tsx fast path)
 *   b) global subscribers (e.g. the chat-list screen for preview/badge updates)
 *
 * - Postgres Changes subscription in chat/[id].tsx remains as the durable
 *   fallback — it catches messages that arrive while the broadcast channel was
 *   not yet established (first open, reconnect) or when the user was offline.
 */

import { supabase } from "./supabase";

export type IncomingMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  encrypted_content: string | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  attachment_mime_type?: string | null;
  attachment_size?: number | null;
  sent_at: string;
  reply_to_message_id?: string | null;
  sender_display_name?: string;
  sender_avatar_url?: string | null;
  sender_handle?: string;
};

type MessageListener = (msg: IncomingMessage) => void;

const _chatListeners = new Map<string, Set<MessageListener>>();
const _globalListeners = new Set<MessageListener>();

/** Subscribe to messages arriving for a specific chat_id. Returns unsubscribe fn. */
export function subscribeToChat(chatId: string, fn: MessageListener): () => void {
  if (!_chatListeners.has(chatId)) _chatListeners.set(chatId, new Set());
  _chatListeners.get(chatId)!.add(fn);
  return () => {
    _chatListeners.get(chatId)?.delete(fn);
    if (_chatListeners.get(chatId)?.size === 0) _chatListeners.delete(chatId);
  };
}

/** Subscribe to ALL incoming messages across every chat. Returns unsubscribe fn. */
export function subscribeGlobal(fn: MessageListener): () => void {
  _globalListeners.add(fn);
  return () => _globalListeners.delete(fn);
}

/**
 * Emit an incoming message to all interested listeners.
 * Called by GlobalInboxListener when a broadcast arrives and by any code that
 * wants to inject a message into the event bus (e.g., after a delta-sync).
 */
export function emitIncomingMessage(msg: IncomingMessage): void {
  _globalListeners.forEach((fn) => { try { fn(msg); } catch {} });
  _chatListeners.get(msg.chat_id)?.forEach((fn) => { try { fn(msg); } catch {} });
}

// ─── Broadcast sender pool ─────────────────────────────────────────────────
// Long-lived channels for broadcasting to other users' inboxes.
// Reuse established channels instead of creating one per send.

const _senderChannels = new Map<string, ReturnType<typeof supabase.channel>>();
const _senderReady    = new Map<string, boolean>();
const _senderQueue    = new Map<string, Array<object>>();

/**
 * Broadcast a message payload to a specific user's inbox channel.
 * Fire-and-forget — never throws.  Uses a pooled channel per recipient.
 */
export function broadcastToUserInbox(recipientId: string, payload: IncomingMessage): void {
  try {
    const channelName = `user-inbox:${recipientId}`;

    if (!_senderChannels.has(recipientId)) {
      const ch = supabase.channel(channelName, {
        config: { broadcast: { ack: false } },
      });
      _senderChannels.set(recipientId, ch);
      _senderReady.set(recipientId, false);
      _senderQueue.set(recipientId, []);

      ch.subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          _senderReady.set(recipientId, true);
          const queued = _senderQueue.get(recipientId) ?? [];
          _senderQueue.set(recipientId, []);
          queued.forEach((p) => {
            ch.send({ type: "broadcast", event: "new_message", payload: p }).catch(() => {});
          });
        }
      });
    }

    const ch = _senderChannels.get(recipientId)!;
    if (_senderReady.get(recipientId)) {
      ch.send({ type: "broadcast", event: "new_message", payload }).catch(() => {});
    } else {
      (_senderQueue.get(recipientId) ?? []).push(payload);
    }
  } catch {}
}

/** Release all pooled sender channels (call on logout). */
export function cleanupBroadcastPool(): void {
  _senderChannels.forEach((ch) => {
    try { supabase.removeChannel(ch); } catch {}
  });
  _senderChannels.clear();
  _senderReady.clear();
  _senderQueue.clear();
}
