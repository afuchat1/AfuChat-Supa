/**
 * GlobalInboxListener — root-level real-time message receiver.
 *
 * Lives inside <AuthProvider> in _layout.tsx so it is always mounted while
 * the user is logged in, regardless of which screen is visible.
 *
 * What it does:
 *  1. Subscribes to the `user-inbox:${userId}` Supabase Broadcast channel.
 *     Senders publish here immediately after the DB insert (~20 ms delivery).
 *  2. Emits every incoming message to globalMessageEvents so chat/[id].tsx
 *     can pick it up as a fast path (before the Postgres Changes event fires).
 *  3. Auto-reconnects on CLOSED / CHANNEL_ERROR with exponential backoff
 *     (max 15 s) so the ~20 ms fast path survives network hiccups.
 *
 * Each accepted inbox message is also acknowledged to Supabase as delivered.
 * This remains distinct from the recipient opening or reading the chat.
 */

import { useCallback, useEffect, useRef } from "react";
import { runAfterIdle } from "@/lib/runAfterIdle";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { emitIncomingMessage, IncomingMessage } from "@/lib/globalMessageEvents";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { acknowledgeMessagesDelivered } from "@/lib/messageReceipts";
import { saveMessages } from "@/lib/storage/localMessages";

export function GlobalInboxListener() {
  const { user, isAuthenticated } = useAuth();
  const recentIds = useRef(new Set<string>());
  const evictionTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  const handlePayload = useCallback(async (payload: any) => {
    const msg = payload as IncomingMessage;
    if (!msg?.id || !msg?.chat_id || !msg?.sender_id) return;
    if (msg.sender_id === userIdRef.current) return;

    // Deduplicate — broadcast may fire more than once if sender re-tries
    if (recentIds.current.has(msg.id)) return;
    recentIds.current.add(msg.id);
    const timer = setTimeout(() => {
      recentIds.current.delete(msg.id);
      evictionTimers.current.delete(msg.id);
    }, 15_000);
    evictionTimers.current.set(msg.id, timer);

    // Persist at the app root, not only from an open chat screen. This keeps
    // received messages available offline before the user enters the thread.
    await saveMessages(msg.chat_id, [msg]);

    const recipientId = userIdRef.current;
    if (recipientId) {
      void acknowledgeMessagesDelivered([msg.id], recipientId);
    }

    // Emit to global event bus → chat/[id].tsx fast path picks it up
    emitIncomingMessage(msg);
  }, []);

  // ── Supabase Broadcast subscription with auto-reconnect ────────────────────
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    let destroyed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    let currentChannel: ReturnType<typeof supabase.channel> | null = null;
    let online = isOnline();

    // React effects can be re-entered during auth transitions or dev Strict
    // Mode. Evict a channel left behind by the previous effect before adding
    // handlers; Supabase caches channels by topic.
    const staleChannel = supabase
      .getChannels()
      .find((channel) => channel.topic === `realtime:user-inbox:${user.id}`);
    if (staleChannel) {
      supabase.removeChannel(staleChannel).catch(() => {});
    }

    const connect = () => {
      if (destroyed || !online || currentChannel) return;

      const ch = supabase
        .channel(`user-inbox:${user.id}`, {
          config: { broadcast: { self: false } },
        })
        .on("broadcast", { event: "new_message" }, ({ payload }) => {
          handlePayload(payload);
        });

      // Assign before subscribe. A fast terminal status can otherwise arrive
      // before currentChannel is set and leave the failed channel registered.
      currentChannel = ch;
      ch.subscribe((status: string) => {
          if (currentChannel !== ch) return;
          if (status === "SUBSCRIBED") {
            retryCount = 0;
          } else if (
            status === "CLOSED" ||
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            if (currentChannel) {
              supabase.removeChannel(currentChannel).catch(() => {});
              currentChannel = null;
            }
            if (!destroyed) {
              const delay = Math.min(500 * Math.pow(2, retryCount), 15_000);
              retryCount = Math.min(retryCount + 1, 6);
              scheduleConnect(delay);
            }
          }
        });
    };

    const scheduleConnect = (delay: number) => {
      if (destroyed || !online || reconnectTimer || currentChannel) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const idleTask = runAfterIdle(() => {
      // Let the initial route and its primary data requests settle before
      // opening another realtime channel on release Android builds.
      scheduleConnect(2000);
    });
    const connectivityCleanup = onConnectivityChange((nextOnline) => {
      online = nextOnline;
      if (!online) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = null;
        if (currentChannel) {
          supabase.removeChannel(currentChannel).catch(() => {});
          currentChannel = null;
        }
        return;
      }
      retryCount = 0;
      scheduleConnect(250);
    });

    return () => {
      destroyed = true;
      idleTask.cancel();
      connectivityCleanup();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (currentChannel) supabase.removeChannel(currentChannel).catch(() => {});
      recentIds.current.clear();
      evictionTimers.current.forEach((timer) => clearTimeout(timer));
      evictionTimers.current.clear();
    };
  }, [isAuthenticated, user?.id, handlePayload]);

  return null;
}
