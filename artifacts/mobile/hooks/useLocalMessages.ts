// ─── useLocalMessages ──────────────────────────────────────────────────────────
// Permanent local-first hook: ALL messages load from SQLite on device instantly.
// Delta sync: only messages NEWER than the newest stored one are fetched.
// Already-stored messages are NEVER re-downloaded.
// Older messages (pagination) are fetched on demand and stored permanently too.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLocalMessages,
  saveMessages,
  getNewestMessageDate,
  getOldestMessageDate,
  type LocalMessage,
} from "@/lib/storage/localMessages";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { supabase } from "@/lib/supabase";

export type { LocalMessage };

export function useLocalMessages(
  conversationId: string | undefined,
  userId: string | undefined,
  pageSize = 100,
) {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const oldestOnDeviceRef = useRef<string | null>(null);

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

  // Step 1: Render everything on device instantly — no network at all
  const loadLocal = useCallback(async () => {
    if (!conversationId) return;
    const local = await getLocalMessages(conversationId, pageSize);
    if (local.length > 0) {
      setMessages(local);
      setLoading(false);
    }
    // Track oldest message on device for "load more" pagination
    oldestOnDeviceRef.current = await getOldestMessageDate(conversationId);
  }, [conversationId, pageSize]);

  // Step 2: Delta sync — only fetch messages NEWER than what's already stored
  const syncNewFromServer = useCallback(async () => {
    if (!conversationId || !isOnline()) return;
    try {
      // Get cursor: newest message already on device
      const newestStored = await getNewestMessageDate(conversationId);

      // Build query: if we have stored messages, only fetch newer ones
      let query = supabase
        .from("messages")
        .select("id, chat_id, sender_id, encrypted_content, sent_at, reply_to_message_id, attachment_url, attachment_type, edited_at")
        .eq("chat_id", conversationId)
        .order("sent_at", { ascending: false })
        .limit(pageSize);

      if (newestStored) {
        // Only fetch messages sent AFTER our newest stored message
        query = query.gt("sent_at", newestStored);
      }

      const { data } = await query;
      if (!data?.length) {
        setLoading(false);
        return;
      }

      // Save permanently (INSERT OR IGNORE — never re-downloads existing)
      await saveMessages(conversationId, data);

      // Merge new messages into state
      const newMsgs = data.map(mapRow).reverse();
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const pending = prev.filter((m) => m.is_pending);
        const brand_new = newMsgs.filter((m) => !existingIds.has(m.id));
        const serverIds = new Set(newMsgs.map((m) => m.id));
        const pendingOnly = pending.filter((m) => !serverIds.has(m.id));
        if (brand_new.length === 0) return prev;
        return [...prev.filter((m) => !m.is_pending), ...brand_new, ...pendingOnly];
      });
      setLoading(false);

      // If server had no stored cursor (first sync), check if there are older messages
      if (!newestStored) {
        setHasMore(data.length >= pageSize);
      }
    } catch {}
  }, [conversationId, pageSize, mapRow]);

  // Step 3: Load older messages from device first, then from server if needed
  const loadMore = useCallback(async () => {
    if (!conversationId || loadingMore) return;
    setLoadingMore(true);
    try {
      // First try to load from device (free — no network)
      const oldestDisplayed = messages[0]?.sent_at;
      if (oldestDisplayed) {
        const olderOnDevice = await getLocalMessages(conversationId, pageSize, oldestDisplayed);
        if (olderOnDevice.length > 0) {
          setMessages((prev) => [...olderOnDevice, ...prev]);
          oldestOnDeviceRef.current = olderOnDevice[0]?.sent_at ?? null;
          setHasMore(olderOnDevice.length >= pageSize);
          setLoadingMore(false);
          return;
        }
      }

      // Nothing older on device — fetch from server and store permanently
      if (!isOnline()) { setHasMore(false); setLoadingMore(false); return; }
      const cursor = messages[0]?.sent_at;
      if (!cursor) { setLoadingMore(false); return; }

      const { data } = await supabase
        .from("messages")
        .select("id, chat_id, sender_id, encrypted_content, sent_at, reply_to_message_id, attachment_url, attachment_type, edited_at")
        .eq("chat_id", conversationId)
        .lt("sent_at", cursor)
        .order("sent_at", { ascending: false })
        .limit(pageSize);

      if (data?.length) {
        const older = data.map(mapRow).reverse();
        setMessages((prev) => [...older, ...prev]);
        setHasMore(data.length >= pageSize);
        // Store permanently on device
        await saveMessages(conversationId, data);
      } else {
        setHasMore(false);
      }
    } catch {
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, loadingMore, messages, pageSize, mapRow]);

  useEffect(() => {
    if (!conversationId) return;
    setMessages([]);
    setLoading(true);
    setHasMore(false);
    loadLocal().then(() => syncNewFromServer());
  }, [conversationId]);

  // Delta sync on reconnect — only fetches new messages, not everything
  useEffect(() => {
    if (!conversationId) return;
    return onConnectivityChange((online) => {
      if (online) syncNewFromServer();
    });
  }, [conversationId, syncNewFromServer]);

  const addOptimisticMessage = useCallback((msg: LocalMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const resolveOptimistic = useCallback((localId: string, serverMsg: LocalMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === localId ? serverMsg : m)));
  }, []);

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    syncNewFromServer,
    addOptimisticMessage,
    resolveOptimistic,
  };
}
