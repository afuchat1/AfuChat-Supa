import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";

type Message = {
  id: string;
  sender_id: string;
  encrypted_content: string;
  sent_at: string;
  attachment_type?: string;
  attachment_url?: string;
  sender?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    is_verified?: boolean;
  } | null;
};

type ChatInfo = {
  id: string;
  name: string | null;
  is_group: boolean;
  is_channel: boolean;
  avatar_url: string | null;
  other_display_name: string;
  other_avatar: string | null;
  other_id: string;
  is_verified: boolean;
  is_organization_verified: boolean;
  other_last_seen: string | null;
};

function formatLastSeen(ts: string | null | undefined): { text: string; isOnline: boolean } {
  if (!ts) return { text: "Offline", isOnline: false };
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 2 * 60 * 1000) return { text: "Online", isOnline: true };
  if (diff < 60 * 60 * 1000) return { text: `Last seen ${Math.floor(diff / 60000)}m ago`, isOnline: false };
  if (diff < 24 * 60 * 60 * 1000) return { text: `Last seen ${Math.floor(diff / 3600000)}h ago`, isOnline: false };
  return { text: `Last seen ${new Date(ts).toLocaleDateString()}`, isOnline: false };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

const BRAND = "#00BCD4";
const ONLINE_GREEN = "#34C759";

export function DesktopChatView({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const flatRef = useRef<FlatList>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const c = isDark
    ? {
        bg: "#0d1117",
        header: "#131d24",
        inputBar: "#131d24",
        inputPill: "#1c2b34",
        bubbleOut: "#006d7c",
        bubbleOutText: "#e9edef",
        bubbleIn: "#1c2b34",
        bubbleInText: "#e9edef",
        text: "#e9edef",
        muted: "#8a9ba8",
        border: "#1e2d38",
        datePill: "rgba(13,17,23,0.88)",
        datePillText: "#8a9ba8",
      }
    : {
        bg: "#f2f8fa",
        header: "#ffffff",
        inputBar: "#ffffff",
        inputPill: "#eaf4f7",
        bubbleOut: "#00BCD4",
        bubbleOutText: "#ffffff",
        bubbleIn: "#ffffff",
        bubbleInText: "#111b21",
        text: "#111b21",
        muted: "#667781",
        border: "#dce8ec",
        datePill: "rgba(255,255,255,0.9)",
        datePillText: "#667781",
      };

  const updateMyLastSeen = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", user.id);
  }, [user]);

  const loadChat = useCallback(async () => {
    if (!user) return;
    setError(null);

    try {
      const [chatRes, msgRes] = await Promise.all([
        supabase
          .from("chats")
          .select(`id, name, is_group, is_channel, avatar_url,
            chat_members(user_id, profiles(
              id, display_name, avatar_url,
              is_verified, is_organization_verified,
              last_seen, show_online_status
            ))`)
          .eq("id", chatId)
          .single(),
        supabase
          .from("messages")
          .select("id, sender_id, encrypted_content, sent_at, attachment_type, attachment_url")
          .eq("chat_id", chatId)
          .order("sent_at", { ascending: false })
          .limit(100),
      ]);

      if (chatRes.data) {
        const ch = chatRes.data;
        const others = (ch.chat_members || []).filter((m: any) => m.user_id !== user.id);
        const profileRaw = others[0]?.profiles;
        const other: any = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
        const showPresence = other?.show_online_status !== false;
        setChatInfo({
          id: ch.id,
          name: ch.name,
          is_group: !!ch.is_group,
          is_channel: !!ch.is_channel,
          avatar_url: ch.avatar_url,
          other_display_name: other?.display_name || "User",
          other_avatar: other?.avatar_url || null,
          other_id: other?.id || "",
          is_verified: !!other?.is_verified,
          is_organization_verified: !!other?.is_organization_verified,
          other_last_seen: showPresence ? (other?.last_seen || null) : null,
        });
      }

      const rawMessages: Message[] = (msgRes.data || []).reverse();

      if (rawMessages.length > 0) {
        const senderIds = [...new Set(rawMessages.map((m) => m.sender_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, is_verified")
          .in("id", senderIds);

        const profileMap: Record<string, any> = {};
        for (const p of profiles || []) profileMap[p.id] = p;
        setMessages(rawMessages.map((m) => ({ ...m, sender: profileMap[m.sender_id] || null })));
      } else {
        setMessages([]);
      }
    } catch (err) {
      setError("Could not load messages. Tap to retry.");
    } finally {
      setLoading(false);
    }
  }, [chatId, user]);

  useEffect(() => {
    loadChat();
    updateMyLastSeen();

    heartbeatRef.current = setInterval(updateMyLastSeen, 30_000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [loadChat, updateMyLastSeen]);

  useEffect(() => {
    if (!user) return;
    const chan = supabase
      .channel(`desktop-chat-msgs:${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        async (payload) => {
          const msg = payload.new as Message;
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url, is_verified")
            .eq("id", msg.sender_id)
            .single();
          setMessages((prev) => [...prev, { ...msg, sender: profile || null }]);
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [chatId, user]);

  useEffect(() => {
    if (!chatInfo?.other_id || chatInfo.is_group || chatInfo.is_channel) return;
    const otherId = chatInfo.other_id;
    const chan = supabase
      .channel(`desktop-presence:${otherId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${otherId}` },
        (payload) => {
          const updated: any = payload.new;
          const showPresence = updated?.show_online_status !== false;
          setChatInfo((prev) =>
            prev
              ? { ...prev, other_last_seen: showPresence ? (updated?.last_seen || null) : null }
              : prev
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [chatInfo?.other_id, chatInfo?.is_group, chatInfo?.is_channel]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 200);
    }
  }, [messages.length]);

  async function sendMessage() {
    if (!text.trim() || !user || sending) return;
    setSending(true);
    const content = text.trim();
    setText("");
    const now = new Date().toISOString();
    const { error: insertErr } = await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: user.id,
      encrypted_content: content,
      sent_at: now,
    });
    if (!insertErr) {
      await Promise.all([
        supabase.from("chats").update({ updated_at: now }).eq("id", chatId),
        supabase.from("profiles").update({ last_seen: now }).eq("id", user.id),
      ]);
    }
    setSending(false);
  }

  const displayName = chatInfo
    ? chatInfo.is_group || chatInfo.is_channel ? chatInfo.name : chatInfo.other_display_name
    : null;
  const avatarUri = chatInfo
    ? chatInfo.is_group || chatInfo.is_channel ? chatInfo.avatar_url : chatInfo.other_avatar
    : null;

  const presenceInfo = !chatInfo?.is_group && !chatInfo?.is_channel
    ? formatLastSeen(chatInfo?.other_last_seen)
    : null;

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.sender_id === user?.id;
    const dateLabel = formatDate(item.sent_at);
    const showDate = index === 0 || dateLabel !== formatDate(messages[index - 1]?.sent_at ?? "");
    const nextMsg = messages[index + 1];
    const isLastInGroup = !nextMsg || nextMsg.sender_id !== item.sender_id;
    const prevMsg = messages[index - 1];
    const isFirstInGroup = !prevMsg || prevMsg.sender_id !== item.sender_id;

    return (
      <View>
        {showDate && (
          <View style={st.dateRow}>
            <View style={[st.datePill, { backgroundColor: c.datePill }]}>
              <Text style={[st.dateText, { color: c.datePillText }]}>{dateLabel}</Text>
            </View>
          </View>
        )}
        <View
          style={[
            st.msgRow,
            isMe ? st.msgRowMe : st.msgRowOther,
            { marginTop: isFirstInGroup ? 8 : 2 },
          ]}
        >
          {!isMe && (
            <View style={st.avatarCol}>
              {isLastInGroup ? (
                <Avatar uri={avatarUri} name={item.sender?.display_name || "?"} size={30} />
              ) : (
                <View style={{ width: 30 }} />
              )}
            </View>
          )}
          <View
            style={[
              st.bubble,
              isMe
                ? [{ backgroundColor: c.bubbleOut }, isLastInGroup && st.bubbleMeTail]
                : [{ backgroundColor: c.bubbleIn }, isLastInGroup && st.bubbleOtherTail],
            ]}
          >
            {!isMe && chatInfo?.is_group && isFirstInGroup && item.sender?.display_name && (
              <Text style={[st.senderName, { color: BRAND }]} numberOfLines={1}>
                {item.sender.display_name}
              </Text>
            )}
            {item.attachment_type === "image" && item.attachment_url ? (
              <Image
                source={{ uri: item.attachment_url }}
                style={st.msgImage}
                resizeMode="cover"
              />
            ) : (
              <View style={st.msgBody}>
                <Text
                  style={[st.msgText, { color: isMe ? c.bubbleOutText : c.bubbleInText }]}
                >
                  {item.encrypted_content}
                </Text>
                <Text
                  style={[
                    st.msgMeta,
                    { color: isMe ? "rgba(233,237,239,0.65)" : c.muted },
                  ]}
                >
                  {formatTime(item.sent_at)}
                  {isMe ? "  ✓✓" : ""}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[st.root, { backgroundColor: c.bg }]}>
      <View style={[st.header, { backgroundColor: c.header, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={onClose} style={st.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={c.muted} />
        </TouchableOpacity>

        <View style={{ position: "relative" }}>
          <View style={[st.avatarRing, { borderColor: presenceInfo?.isOnline ? ONLINE_GREEN : "transparent" }]}>
            <Avatar uri={avatarUri} name={displayName || "Chat"} size={36} />
          </View>
          {presenceInfo?.isOnline && (
            <View style={st.onlineDot} />
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={[st.headerName, { color: c.text }]} numberOfLines={1}>
              {displayName || "Chat"}
            </Text>
            {(chatInfo?.is_verified || chatInfo?.is_organization_verified) && (
              <VerifiedBadge
                isVerified={chatInfo.is_verified}
                isOrganizationVerified={chatInfo.is_organization_verified}
                size={14}
              />
            )}
          </View>
          {chatInfo?.is_group ? (
            <Text style={[st.headerSub, { color: c.muted }]}>Group · tap for info</Text>
          ) : chatInfo?.is_channel ? (
            <Text style={[st.headerSub, { color: c.muted }]}>Channel</Text>
          ) : presenceInfo ? (
            <Text
              style={[
                st.headerSub,
                { color: presenceInfo.isOnline ? ONLINE_GREEN : BRAND },
              ]}
            >
              {presenceInfo.text}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity style={st.headerIcon} hitSlop={8}>
          <Ionicons name="videocam-outline" size={22} color={c.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={st.headerIcon} hitSlop={8}>
          <Ionicons name="call-outline" size={20} color={c.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={st.headerIcon} hitSlop={8}>
          <Ionicons name="ellipsis-vertical" size={20} color={c.muted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={BRAND} size="large" />
          <Text style={[st.centerText, { color: c.muted }]}>Loading messages…</Text>
        </View>
      ) : error ? (
        <TouchableOpacity style={st.center} onPress={loadChat}>
          <Ionicons name="refresh-circle-outline" size={44} color={BRAND} />
          <Text style={[st.centerText, { color: c.muted }]}>{error}</Text>
        </TouchableOpacity>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={st.msgList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={st.emptyState}>
              <View style={[st.emptyIconWrap, { backgroundColor: BRAND + "18" }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={36} color={BRAND} />
              </View>
              <Text style={[st.emptyTitle, { color: c.text }]}>
                {displayName ? `Start chatting with ${displayName}` : "No messages yet"}
              </Text>
              <Text style={[st.emptySub, { color: c.muted }]}>
                Say something to begin the conversation
              </Text>
            </View>
          }
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[st.inputBar, { backgroundColor: c.inputBar, borderTopColor: c.border }]}>
          <TouchableOpacity style={st.inputAction} hitSlop={8}>
            <Ionicons name="happy-outline" size={24} color={c.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={st.inputAction} hitSlop={8}>
            <Ionicons name="attach-outline" size={24} color={c.muted} />
          </TouchableOpacity>
          <View style={[st.inputPill, { backgroundColor: c.inputPill }]}>
            <TextInput
              style={[st.input, { color: c.text }]}
              placeholder="Message…"
              placeholderTextColor={c.muted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={4000}
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
            />
          </View>
          <TouchableOpacity
            style={[st.sendBtn, { backgroundColor: text.trim() ? BRAND : c.inputPill }]}
            onPress={sendMessage}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator color={text.trim() ? "#fff" : c.muted} size="small" />
            ) : (
              <Ionicons
                name={text.trim() ? "send" : "mic-outline"}
                size={18}
                color={text.trim() ? "#fff" : c.muted}
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingHorizontal: 2 },
  avatarRing: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 1,
  },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: ONLINE_GREEN,
    borderWidth: 2,
    borderColor: "#131d24",
  },
  headerName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  headerIcon: { padding: 6 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  centerText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  msgList: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 16 },

  dateRow: { alignItems: "center", marginVertical: 10 },
  datePill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 10,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  dateText: { fontSize: 11, fontFamily: "Inter_500Medium" },

  msgRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 2 },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },

  avatarCol: { width: 34, marginRight: 6, alignItems: "center", justifyContent: "flex-end" },

  bubble: {
    maxWidth: "75%",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 18,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  bubbleMeTail: { borderBottomRightRadius: 4 },
  bubbleOtherTail: { borderBottomLeftRadius: 4 },

  senderName: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 3 },

  msgBody: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: 6 },
  msgText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, flex: 1 },
  msgImage: { width: 200, height: 150, borderRadius: 10, marginBottom: 2 },
  msgMeta: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginBottom: 1,
    flexShrink: 0,
    marginLeft: "auto" as any,
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputAction: { paddingBottom: 8, paddingHorizontal: 2 },
  inputPill: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "web" ? 9 : 6,
    minHeight: 42,
    maxHeight: 120,
    justifyContent: "center",
  },
  input: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : {}),
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
