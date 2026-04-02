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
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
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
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export function DesktopChatView({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const flatRef = useRef<FlatList>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const other = others[0]?.profiles;
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
      setMessages(msgRes.data.map((m: any) => ({
        ...m,
        sender: m.profiles,
      })));
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
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatId, user]);

  useEffect(() => {
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 300);
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
  const avatar = chatInfo
    ? chatInfo.is_group || chatInfo.is_channel ? chatInfo.avatar_url : chatInfo.other_avatar
    : null;

  let prevDate = "";

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user?.id;
    const dateLabel = formatDate(item.sent_at);
    const showDate = dateLabel !== prevDate;
    prevDate = dateLabel;

    return (
      <>
        {showDate && (
          <View style={styles.dateRow}>
            <View style={[styles.datePill, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.dateText, { color: colors.textMuted }]}>{dateLabel}</Text>
            </View>
          </View>
        )}
        <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
          {!isMe && (
            <Avatar
              uri={item.sender?.avatar_url || null}
              name={item.sender?.display_name || "?"}
              size={28}
            />
          )}
          <View style={[
            styles.bubble,
            isMe
              ? { backgroundColor: colors.accent, borderBottomRightRadius: 4 }
              : { backgroundColor: isDark ? "#2a2a2e" : "#f0f0f5", borderBottomLeftRadius: 4 },
          ]}>
            {!isMe && chatInfo?.is_group && (
              <Text style={[styles.senderName, { color: colors.accent }]}>{item.sender?.display_name}</Text>
            )}
            {item.message_type === "image" && item.media_url ? (
              <Image source={{ uri: item.media_url }} style={styles.msgImage} resizeMode="cover" />
            ) : (
              <Text style={[styles.msgText, { color: isMe ? "#fff" : colors.text }]}>
                {item.encrypted_content}
              </Text>
            )}
            <Text style={[styles.msgTime, { color: isMe ? "rgba(255,255,255,0.6)" : colors.textMuted }]}>
              {formatTime(item.sent_at)}
            </Text>
          </View>
          {isMe && <View style={{ width: 28 }} />}
        </View>
      </>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
        </TouchableOpacity>
        <Avatar uri={avatar} name={displayName || "Chat"} size={36} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>
              {displayName || "Chat"}
            </Text>
            {chatInfo?.is_verified && <VerifiedBadge isVerified size={14} />}
          </View>
          {chatInfo?.is_group ? (
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>Group</Text>
          ) : chatInfo?.is_channel ? (
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>Channel</Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={() => router.push({ pathname: "/chat/[id]", params: { id: chatId } })}
          hitSlop={8}
        >
          <Ionicons name="expand-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Text style={{ fontSize: 40 }}>👋</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Say hello to {displayName}
              </Text>
            </View>
          }
        />
      )}

      <KeyboardAvoidingView behavior="padding">
        <View style={[styles.inputRow, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBg }]}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Message…"
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={4000}
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
            />
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.accent : colors.backgroundSecondary }]}
            onPress={sendMessage}
            disabled={!text.trim() || sending}
          >
            <Ionicons name="send" size={16} color={text.trim() ? "#fff" : colors.textMuted} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "column" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  headerAction: { padding: 4 },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  messageList: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  dateRow: { alignItems: "center", marginVertical: 8 },
  datePill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  dateText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginVertical: 2 },
  msgRowMe: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "72%",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 18,
    gap: 2,
  },
  senderName: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.brand, marginBottom: 2 },
  msgText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  msgImage: { width: 200, height: 150, borderRadius: 10, marginBottom: 2 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular", alignSelf: "flex-end" },
  emptyMessages: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 40,
    maxHeight: 120,
    justifyContent: "center",
  },
  input: { fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 100 },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
