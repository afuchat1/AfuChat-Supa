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
  message_type: string;
  media_url?: string;
  sender?: { display_name: string; avatar_url: string | null; is_verified?: boolean };
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
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

export function DesktopChatView({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const flatRef = useRef<FlatList>(null);

  const wa = isDark
    ? {
        bg: "#0b1014",
        surface: "#1f2c34",
        inputBg: "#2a3942",
        bubbleOut: "#005c4b",
        bubbleOutText: "#e9edef",
        bubbleIn: "#1f2c34",
        bubbleInText: "#e9edef",
        text: "#e9edef",
        muted: "#8696a0",
        border: "#2a3942",
        brand: "#00BCD4",
        datePill: "rgba(17,27,33,0.85)",
        datePillText: "#8696a0",
        headerBg: "#1f2c34",
        inputBarBg: "#1f2c34",
      }
    : {
        bg: "#efeae2",
        surface: "#f0f2f5",
        inputBg: "#ffffff",
        bubbleOut: "#d9fdd3",
        bubbleOutText: "#111b21",
        bubbleIn: "#ffffff",
        bubbleInText: "#111b21",
        text: "#111b21",
        muted: "#667781",
        border: "#d1d7db",
        brand: "#00a884",
        datePill: "rgba(225,221,214,0.92)",
        datePillText: "#667781",
        headerBg: "#f0f2f5",
        inputBarBg: "#f0f2f5",
      };

  const loadChat = useCallback(async () => {
    if (!user) return;
    const [chatRes, msgRes] = await Promise.all([
      supabase
        .from("chats")
        .select(`id, name, is_group, is_channel, avatar_url,
          chat_members(user_id, profiles(id, display_name, avatar_url, is_verified))`)
        .eq("id", chatId)
        .single(),
      supabase
        .from("messages")
        .select(`id, sender_id, encrypted_content, sent_at, message_type, media_url,
          profiles!messages_sender_id_fkey(display_name, avatar_url, is_verified)`)
        .eq("chat_id", chatId)
        .order("sent_at", { ascending: true })
        .limit(100),
    ]);

    if (chatRes.data) {
      const c = chatRes.data;
      const others = (c.chat_members || []).filter((m: any) => m.user_id !== user.id);
      const profileRaw = others[0]?.profiles;
      const other: any = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
      setChatInfo({
        id: c.id,
        name: c.name,
        is_group: !!c.is_group,
        is_channel: !!c.is_channel,
        avatar_url: c.avatar_url,
        other_display_name: other?.display_name || "User",
        other_avatar: other?.avatar_url || null,
        other_id: other?.id || "",
        is_verified: !!other?.is_verified,
      });
    }

    if (msgRes.data) {
      setMessages(msgRes.data.map((m: any) => ({ ...m, sender: m.profiles })));
    }

    setLoading(false);
  }, [chatId, user]);

  useEffect(() => { loadChat(); }, [loadChat]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`desktop-chat:${chatId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}`,
      }, async (payload) => {
        const msg = payload.new as Message;
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url, is_verified")
          .eq("id", msg.sender_id)
          .single();
        setMessages((prev) => [...prev, { ...msg, sender: profile || undefined }]);
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatId, user]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 250);
    }
  }, [messages.length]);

  async function sendMessage() {
    if (!text.trim() || !user || sending) return;
    setSending(true);
    const content = text.trim();
    setText("");
    await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: user.id,
      encrypted_content: content,
      message_type: "text",
      sent_at: new Date().toISOString(),
    });
    await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
    setSending(false);
  }

  const displayName = chatInfo
    ? chatInfo.is_group || chatInfo.is_channel ? chatInfo.name : chatInfo.other_display_name
    : null;
  const avatarUri = chatInfo
    ? chatInfo.is_group || chatInfo.is_channel ? chatInfo.avatar_url : chatInfo.other_avatar
    : null;

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.sender_id === user?.id;
    const dateLabel = formatDate(item.sent_at);
    const showDate = index === 0 || dateLabel !== formatDate(messages[index - 1]?.sent_at ?? "");
    const prevMsg = messages[index - 1];
    const nextMsg = messages[index + 1];
    const isFirstInGroup = !prevMsg || prevMsg.sender_id !== item.sender_id;
    const isLastInGroup = !nextMsg || nextMsg.sender_id !== item.sender_id;
    const marginTop = isFirstInGroup ? 8 : 1;

    return (
      <View>
        {showDate && (
          <View style={st.dateRow}>
            <View style={[st.datePill, { backgroundColor: wa.datePill }]}>
              <Text style={[st.dateText, { color: wa.datePillText }]}>{dateLabel}</Text>
            </View>
          </View>
        )}
        <View
          style={[
            st.msgRow,
            isMe ? st.msgRowMe : st.msgRowOther,
            { marginTop },
          ]}
        >
          {!isMe && (
            <View style={st.avatarSlot}>
              {isLastInGroup ? (
                <Avatar uri={avatarUri} name={item.sender?.display_name || "?"} size={32} />
              ) : (
                <View style={{ width: 32 }} />
              )}
            </View>
          )}
          <View
            style={[
              st.bubble,
              isMe
                ? [st.bubbleMe, { backgroundColor: wa.bubbleOut }]
                : [st.bubbleOther, { backgroundColor: wa.bubbleIn }],
              isMe && isLastInGroup && st.bubbleMeTail,
              !isMe && isLastInGroup && st.bubbleOtherTail,
            ]}
          >
            {!isMe && chatInfo?.is_group && isFirstInGroup && (
              <Text style={[st.senderName, { color: wa.brand }]} numberOfLines={1}>
                {item.sender?.display_name}
              </Text>
            )}
            {item.message_type === "image" && item.media_url ? (
              <Image source={{ uri: item.media_url }} style={st.msgImage} resizeMode="cover" />
            ) : (
              <View style={st.msgContent}>
                <Text style={[st.msgText, { color: isMe ? wa.bubbleOutText : wa.bubbleInText }]}>
                  {item.encrypted_content}
                </Text>
                <Text style={[st.msgTime, { color: isMe ? "rgba(233,237,239,0.65)" : wa.muted }]}>
                  {formatTime(item.sent_at)}
                  {isMe && (
                    <Text style={{ color: wa.brand }}>{sending ? "" : " ✓✓"}</Text>
                  )}
                </Text>
              </View>
            )}
          </View>
          {isMe && <View style={{ width: 4 }} />}
        </View>
      </View>
    );
  };

  return (
    <View style={[st.root, { backgroundColor: wa.bg }]}>
      <View style={[st.header, { backgroundColor: wa.headerBg, borderBottomColor: wa.border }]}>
        <TouchableOpacity onPress={onClose} style={st.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={wa.muted} />
        </TouchableOpacity>
        <Avatar uri={avatarUri} name={displayName || "Chat"} size={38} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={[st.headerName, { color: wa.text }]} numberOfLines={1}>
              {displayName || "Chat"}
            </Text>
            {chatInfo?.is_verified && <VerifiedBadge isVerified size={14} />}
          </View>
          <Text style={[st.headerSub, { color: wa.brand }]}>
            {chatInfo?.is_group ? "Group chat" : chatInfo?.is_channel ? "Channel" : "tap here for contact info"}
          </Text>
        </View>
        <TouchableOpacity style={st.headerIcon} hitSlop={8}>
          <Ionicons name="videocam-outline" size={22} color={wa.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={st.headerIcon} hitSlop={8}>
          <Ionicons name="call-outline" size={20} color={wa.muted} />
        </TouchableOpacity>
        <TouchableOpacity style={st.headerIcon} hitSlop={8}>
          <Ionicons name="search-outline" size={20} color={wa.muted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={st.loadingCenter}>
          <ActivityIndicator color={wa.brand} size="large" />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={st.messageList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={st.emptyState}>
              <View style={[st.emptyIconWrap, { backgroundColor: wa.brand + "20" }]}>
                <Ionicons name="lock-closed-outline" size={28} color={wa.brand} />
              </View>
              <Text style={[st.emptyTitle, { color: wa.text }]}>
                {displayName ? `Say hello to ${displayName}` : "No messages yet"}
              </Text>
              <Text style={[st.emptySub, { color: wa.muted }]}>
                Messages are end-to-end encrypted
              </Text>
            </View>
          }
        />
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[st.inputBar, { backgroundColor: wa.inputBarBg, borderTopColor: wa.border }]}>
          <TouchableOpacity style={st.inputAction} hitSlop={8}>
            <Ionicons name="happy-outline" size={24} color={wa.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={st.inputAction} hitSlop={8}>
            <Ionicons name="attach-outline" size={24} color={wa.muted} />
          </TouchableOpacity>
          <View style={[st.inputPill, { backgroundColor: wa.inputBg }]}>
            <TextInput
              style={[st.input, { color: wa.text }]}
              placeholder="Type a message"
              placeholderTextColor={wa.muted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={4000}
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
            />
          </View>
          <TouchableOpacity
            style={[st.sendBtn, { backgroundColor: wa.brand }]}
            onPress={sendMessage}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name={text.trim() ? "send" : "mic-outline"} size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, flexDirection: "column" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingHorizontal: 4 },
  headerName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  headerIcon: { padding: 6 },

  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },

  messageList: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16 },

  dateRow: { alignItems: "center", marginVertical: 10 },
  datePill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  dateText: { fontSize: 11, fontFamily: "Inter_500Medium" },

  msgRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 4 },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },

  avatarSlot: { width: 36, marginRight: 4, alignItems: "center", justifyContent: "flex-end" },

  bubble: {
    maxWidth: "72%",
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 6,
    borderRadius: 16,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  bubbleMe: { borderBottomRightRadius: 16 },
  bubbleOther: { borderBottomLeftRadius: 16 },
  bubbleMeTail: { borderBottomRightRadius: 4 },
  bubbleOtherTail: { borderBottomLeftRadius: 4 },

  senderName: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 3 },

  msgContent: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: 6 },
  msgText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, flexShrink: 1 },
  msgImage: { width: 200, height: 150, borderRadius: 10, marginBottom: 2 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular", marginBottom: 1, flexShrink: 0, marginLeft: "auto" as any },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
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
    paddingVertical: Platform.OS === "web" ? 8 : 6,
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
    marginBottom: 0,
  },
});
