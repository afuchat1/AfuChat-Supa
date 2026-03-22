import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: { display_name: string; avatar_url: string | null };
};

type ConvInfo = {
  is_group: boolean;
  group_name: string | null;
  other_name: string;
  other_avatar: string | null;
  other_id: string;
};

function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ msg, isMe, showAvatar, showTime }: {
  msg: Message;
  isMe: boolean;
  showAvatar: boolean;
  showTime: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
      {!isMe && (
        <View style={styles.avatarSlot}>
          {showAvatar ? (
            <Avatar
              uri={msg.sender?.avatar_url}
              name={msg.sender?.display_name}
              size={32}
            />
          ) : null}
        </View>
      )}
      <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther]}>
        {!isMe && showAvatar && (
          <Text style={[styles.senderName, { color: colors.textSecondary }]}>
            {msg.sender?.display_name}
          </Text>
        )}
        <View
          style={[
            styles.bubble,
            isMe
              ? { backgroundColor: Colors.brand }
              : { backgroundColor: colors.bubbleIncoming },
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              { color: isMe ? "#fff" : colors.bubbleIncomingText },
            ]}
          >
            {msg.content}
          </Text>
        </View>
        {showTime && (
          <Text style={[styles.msgTime, { color: colors.textMuted }, isMe && styles.msgTimeMe]}>
            {formatMsgTime(msg.created_at)}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [convInfo, setConvInfo] = useState<ConvInfo | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const loadConversation = useCallback(async () => {
    if (!id || !user) return;

    const { data: conv } = await supabase
      .from("conversations")
      .select(`
        is_group, group_name,
        conversation_members(user_id, profiles(id, display_name, avatar_url))
      `)
      .eq("id", id)
      .single();

    if (conv) {
      const others = (conv.conversation_members || []).filter(
        (m: any) => m.user_id !== user.id
      );
      const other = others[0]?.profiles;
      setConvInfo({
        is_group: !!conv.is_group,
        group_name: conv.group_name,
        other_name: other?.display_name || "Unknown",
        other_avatar: other?.avatar_url || null,
        other_id: other?.id || "",
      });
    }
  }, [id, user]);

  const loadMessages = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("messages")
      .select(`
        id, conversation_id, sender_id, content, created_at,
        profiles!messages_sender_id_fkey(display_name, avatar_url)
      `)
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      setMessages(
        data.map((m: any) => ({
          id: m.id,
          conversation_id: m.conversation_id,
          sender_id: m.sender_id,
          content: m.content,
          created_at: m.created_at,
          sender: m.profiles,
        }))
      );
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadConversation();
    loadMessages();

    const subscription = supabase
      .channel(`chat:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", newMsg.sender_id)
            .single();
          setMessages((prev) => [{ ...newMsg, sender: profile as any }, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, [id, loadConversation, loadMessages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || !user || sending) return;
    setSending(true);
    setInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const now = new Date().toISOString();
    const tempId = `temp_${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: id,
      sender_id: user.id,
      content: text,
      created_at: now,
      sender: { display_name: "You", avatar_url: null },
    };
    setMessages((prev) => [optimistic, ...prev]);

    const { data: msg } = await supabase
      .from("messages")
      .insert({ conversation_id: id, sender_id: user.id, content: text })
      .select()
      .single();

    if (msg) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, id: msg.id, created_at: msg.created_at } : m))
      );
      await supabase
        .from("conversations")
        .update({ last_message: text, last_message_at: now })
        .eq("id", id);
    }
    setSending(false);
  }

  const title = convInfo?.is_group ? convInfo.group_name : convInfo?.other_name;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Avatar
          uri={convInfo?.other_avatar}
          name={title || undefined}
          size={36}
        />
        <View style={styles.headerInfo}>
          <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>
            {title || "Chat"}
          </Text>
        </View>
        <TouchableOpacity style={styles.headerAction}>
          <Ionicons name="call-outline" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerAction}>
          <Ionicons name="videocam-outline" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerAction}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          inverted
          renderItem={({ item, index }) => {
            const isMe = item.sender_id === user?.id;
            const next = messages[index - 1];
            const prev = messages[index + 1];
            const showAvatar = !isMe && (!next || next.sender_id !== item.sender_id);
            const showTime = !prev || prev.sender_id !== item.sender_id ||
              new Date(item.created_at).getTime() - new Date(prev.created_at).getTime() > 120000;
            return (
              <MessageBubble
                msg={item}
                isMe={isMe}
                showAvatar={showAvatar}
                showTime={showTime}
              />
            );
          }}
          contentContainerStyle={{ paddingVertical: 12, flexDirection: "column-reverse" }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
            },
          ]}
        >
          <TouchableOpacity style={styles.inputAction}>
            <Ionicons name="add-circle-outline" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={[styles.inputField, { backgroundColor: colors.inputBg }]}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Message"
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
          </View>
          {input.trim().length > 0 ? (
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: Colors.brand }]}
              onPress={sendMessage}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="arrow-up" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.inputAction}>
              <Ionicons name="mic-outline" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  headerAction: { padding: 4 },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  msgRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    marginVertical: 2,
  },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },
  avatarSlot: { width: 36, marginRight: 6, justifyContent: "flex-end" },
  bubbleWrap: { maxWidth: "72%" },
  bubbleWrapMe: { alignItems: "flex-end" },
  bubbleWrapOther: { alignItems: "flex-start" },
  senderName: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 2, marginLeft: 4 },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  bubbleText: { fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 22 },
  msgTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, marginLeft: 4 },
  msgTimeMe: { marginLeft: 0, marginRight: 4 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  inputAction: { paddingBottom: 6 },
  inputField: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxHeight: 120,
  },
  input: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
});
