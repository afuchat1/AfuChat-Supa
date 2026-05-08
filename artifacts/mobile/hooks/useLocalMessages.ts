// ─── useLocalMessages ──────────────────────────────────────────────────────────
// Local-first hook: renders messages from SQLite instantly, then background-
// syncs from Supabase. Exactly how WhatsApp shows messages before server ACK.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLocalMessages,
  saveMessages,
  trimMessages,
  type LocalMessage,
} from "@/lib/storage/localMessages";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { supabase } from "@/lib/supabase";

export type { LocalMessage };

export function useLocalMessages(
  conversationId: string | undefined,
  userId: string | undefined,
  limit = 60,
) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const oldestCursorRef = useRef<string | null>(null);

  const mapRow = useCallback(
    (m: any): LocalMessage => ({
      id: m.id,
      conversation_id: m.chat_id ?? conversationId ?? "",
      sender_id: m.sender_id,
      content: m.encrypted_content ?? m.content ?? null,
      attachment_url: m.attachment_url ?? null,
      attachment_type: m.attachment_type ?? null,
      reply_to_id: m.reply_to_message_id ?? null,
      status: m.status ?? "sent",
      sent_at: m.sent_at,
      edited_at: m.edited_at ?? null,
      is_pending: m._pending ?? false,
      synced: true,
    }),
    [conversationId],
  );

  // Step 1: Load from SQLite (zero network)
  const loadLocal = useCallback(async () => {
    if (!conversationId) return;
    const local = await getLocalMessages(conversationId, limit);
    if (local.length > 0) {
      setMessages(local);
      setLoading(false);
    }
  }, [conversationId, limit]);

  // Step 2: Sync from Supabase
  const syncFromServer = useCallback(async () => {
    if (!conversationId || !isOnline()) return;
    try {
      const { data } = await supabase
        .from("messages")
        .select("id, chat_id, sender_id, encrypted_content, sent_at, reply_to_message_id, attachment_url, attachment_type, edited_at")
        .eq("chat_id", conversationId)
        .order("sent_at", { ascending: false })
        .limit(limit);

      if (data) {
        const mapped = data.map(mapRow).reverse();
        setMessages((prev) => {
          const pending = prev.filter((m) => m.is_pending);
          const serverIds = new Set(mapped.map((m) => m.id));
          const pendingOnly = pending.filter((m) => !serverIds.has(m.id));
          return [...pendingOnly, ...mapped];
        });
        setLoading(false);
        oldestCursorRef.current = data.length > 0 ? data[data.length - 1].sent_at : null;
        setHasMore(data.length >= limit);
        await saveMessages(conversationId, data);
        await trimMessages(conversationId, 200);
      }
    } catch {}
  }, [conversationId, limit, mapRow]);

  // Load more (pagination)
  const loadMore = useCallback(async () => {
    if (!conversationId || !isOnline() || loadingMore || !hasMore || !oldestCursorRef.current) return;
    setLoadingMore(true);
    try {
      const { data } = await supabase
        .from("messages")
        .select("id, chat_id, sender_id, encrypted_content, sent_at, reply_to_message_id, attachment_url, attachment_type, edited_at")
        .eq("chat_id", conversationId)
        .lt("sent_at", oldestCursorRef.current)
        .order("sent_at", { ascending: false })
        .limit(limit);

      if (data?.length) {
        const older = data.map(mapRow).reverse();
        setMessages((prev) => [...older, ...prev]);
        oldestCursorRef.current = data[data.length - 1].sent_at;
        setHasMore(data.length >= limit);
        await saveMessages(conversationId, data);
      } else {
        setHasMore(false);
      }
    } catch {
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, loadingMore, hasMore, limit, mapRow]);

  useEffect(() => {
    if (!conversationId) return;
    setMessages([]);
    setLoading(true);
    loadLocal().then(() => syncFromServer());
  }, [conversationId]);

  // Re-sync on reconnect
  useEffect(() => {
    if (!conversationId) return;
    return onConnectivityChange((online) => {
      if (online) syncFromServer();
    });
  }, [conversationId, syncFromServer]);

  // Add a new message to local state (optimistic insert)
  const addOptimisticMessage = useCallback((msg: LocalMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Resolve optimistic message with server id
  const resolveOptimistic = useCallback((localId: string, serverMsg: LocalMessage) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === localId ? serverMsg : m)),
    );
  }, []);

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    syncFromServer,
    addOptimisticMessage,
    resolveOptimistic,
  };
}
