// ─── useLocalConversations ─────────────────────────────────────────────────────
// Local-first hook: renders conversations from SQLite instantly (zero network),
// then background-syncs from Supabase and merges silently.
// This is how WhatsApp/Telegram make the chat list appear before any API call.

import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  getLocalConversations,
  saveConversations,
  hasLocalConversations,
  type LocalConversation,
} from "@/lib/storage/localConversations";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { supabase } from "@/lib/supabase";

export type { LocalConversation };

export function useLocalConversations(userId: string | undefined) {
  const [conversations, setConversations] = useState<LocalConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncedRef = useRef(false);

  // Step 1: Load from SQLite instantly (no network)
  const loadLocal = useCallback(async () => {
    const local = await getLocalConversations();
    if (local.length > 0) {
      setConversations(local);
      setLoading(false);
    }
  }, []);

  // Step 2: Background sync from Supabase
  const syncFromServer = useCallback(async () => {
    if (!userId || !isOnline() || syncing) return;
    setSyncing(true);
    try {
      const { data: memberRows } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", userId);

      if (!memberRows?.length) {
        setLoading(false);
        setSyncing(false);
        return;
      }

      const chatIds = memberRows.map((m: any) => m.chat_id);

      const { data: chatRows } = await supabase
        .from("chats")
        .select(`
          id, name, is_group, is_channel, is_pinned, is_archived, avatar_url, updated_at,
          chat_members(user_id, profiles(id, display_name, avatar_url, is_verified, is_organization_verified, last_seen, show_online_status))
        `)
        .in("id", chatIds)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false });

      if (!chatRows) { setSyncing(false); return; }

      const { data: lastMsgs } = await supabase
        .from("messages")
        .select("id, chat_id, encrypted_content, sent_at, attachment_type, sender_id")
        .in("chat_id", chatIds)
        .order("sent_at", { ascending: false })
        .limit(chatIds.length * 3);

      const lastMsgMap: Record<string, any> = {};
      for (const m of (lastMsgs ?? [])) {
        if (!lastMsgMap[m.chat_id]) {
          let preview = m.encrypted_content || "";
          if (m.attachment_type === "story_reply" && preview.startsWith("storyUserId:")) {
            const pipeIdx = preview.indexOf("|");
            preview = pipeIdx >= 0 ? `📸 ${preview.slice(pipeIdx + 1)}` : "📸 Story";
          }
          lastMsgMap[m.chat_id] = {
            last_message: preview,
            last_message_at: m.sent_at,
            last_message_is_mine: m.sender_id === userId,
          };
        }
      }

      const items = chatRows.map((c: any) => {
        const others = (c.chat_members ?? []).filter((m: any) => m.user_id !== userId);
        const other = others[0]?.profiles;
        const lm = lastMsgMap[c.id] ?? {};
        return {
          id: c.id,
          name: c.name ?? null,
          is_group: !!c.is_group,
          is_channel: !!c.is_channel,
          other_id: other?.id ?? null,
          other_display_name: other?.display_name ?? null,
          other_avatar: other?.avatar_url ?? null,
          last_message: lm.last_message ?? null,
          last_message_at: lm.last_message_at ?? c.updated_at ?? null,
          last_message_is_mine: lm.last_message_is_mine ?? false,
          last_message_status: "sent",
          is_pinned: !!c.is_pinned,
          is_archived: !!c.is_archived,
          avatar_url: c.avatar_url ?? null,
          unread_count: 0,
          is_verified: !!other?.is_verified,
          is_organization_verified: !!other?.is_organization_verified,
          other_last_seen: other?.last_seen ?? null,
          other_show_online: other?.show_online_status !== false,
          cached_at: Date.now(),
        } satisfies LocalConversation;
      });

      items.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime();
      });

      setConversations(items);
      setLoading(false);
      await saveConversations(items);
      syncedRef.current = true;
    } catch {
    } finally {
      setSyncing(false);
    }
  }, [userId, syncing]);

  useEffect(() => {
    if (!userId) return;
    loadLocal().then(() => syncFromServer());
  }, [userId]);

  // Re-sync when network returns
  useEffect(() => {
    if (!userId) return;
    return onConnectivityChange((online) => {
      if (online) syncFromServer();
    });
  }, [userId, syncFromServer]);

  // Re-sync when app comes to foreground
  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") syncFromServer();
    });
    return () => sub.remove();
  }, [userId, syncFromServer]);

  return { conversations, loading, syncing, refresh: syncFromServer };
}
