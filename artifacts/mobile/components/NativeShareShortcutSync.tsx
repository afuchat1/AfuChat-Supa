import { useEffect } from "react";
import { InteractionManager } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { getAfuChatConversations } from "@/lib/afuchatApi";
import { getLocalConversations, type LocalConversation } from "@/lib/storage/localConversations";
import { updateNativeShareShortcuts, type ShareShortcutChat } from "@/lib/nativeShareShortcuts";

function conversationToShortcut(conversation: Partial<LocalConversation> & Record<string, any>): ShareShortcutChat | null {
  if (!conversation.id || conversation.kind === "notes" || !conversation.last_message_at) return null;
  const isGroup = !!conversation.is_group || !!conversation.is_channel;
  const label = isGroup
    ? (conversation.name || (conversation.is_channel ? "Channel" : "Group chat"))
    : (conversation.other_display_name || "Chat");
  return {
    chatId: String(conversation.id),
    label,
    lastMessageAt: conversation.last_message_at,
    // Direct chats use the other participant's profile image. Group/channel
    // chats use their conversation image.
    avatarUrl: isGroup ? (conversation.avatar_url || null) : (conversation.other_avatar || null),
    isGroup,
    isChannel: !!conversation.is_channel,
  };
}

function serverRowToShortcut(row: any): ShareShortcutChat | null {
  return conversationToShortcut({
    id: row.chat_id,
    name: row.chat_name,
    is_group: row.is_group,
    is_channel: row.is_channel,
    other_display_name: row.other_display_name,
    other_avatar: row.other_avatar,
    avatar_url: row.avatar_url,
    // A chat updated by membership/pin changes is not a recent conversation.
    // Shortcuts must represent chats with an actual message only.
    last_message_at: row.last_message_at,
  });
}

/**
 * Keeps Android Direct Share targets warm even when the user has not opened
 * the chats tab in this app session. The local cache is published first and
 * the server list replaces it when available.
 */
export default function NativeShareShortcutSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      updateNativeShareShortcuts([]);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const interaction = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        void (async () => {
          try {
            const cached = await getLocalConversations();
            if (cancelled) return;
            updateNativeShareShortcuts(
              cached
                 .filter((conversation) => !!conversation.last_message_at)
                 .sort((a, b) => Date.parse(b.last_message_at || "") - Date.parse(a.last_message_at || ""))
                .map((conversation) => conversationToShortcut(conversation))
                .filter(Boolean) as ShareShortcutChat[],
            );

            const { data } = await getAfuChatConversations();
            if (cancelled) return;
            updateNativeShareShortcuts(
              ((data ?? []) as any[])
                 .filter((row) => !row.is_archived && row.last_message_at)
                .sort((a, b) => {
                  const aTime = new Date(a.last_message_at || a.chat_updated_at || 0).getTime();
                  const bTime = new Date(b.last_message_at || b.chat_updated_at || 0).getTime();
                  return bTime - aTime;
                })
                .map(serverRowToShortcut)
                .filter(Boolean) as ShareShortcutChat[],
            );
          } catch {
            // The cached targets are sufficient for offline/background use.
          }
        })();
      }, 1800);
    });

    return () => {
      cancelled = true;
      interaction.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [user?.id]);

  return null;
}