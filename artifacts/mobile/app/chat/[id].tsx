import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  chat_id: string;
  sender_id: string;
  encrypted_content: string;
  sent_at: string;
  sender?: { display_name: string; avatar_url: string | null; handle: string };
  reply_to_message_id?: string | null;
  reactions?: { emoji: string; count: number; myReaction: boolean }[];
  status?: string;
};

type ChatInfo = {
  is_group: boolean;
  is_channel: boolean;
  name: string | null;
  other_name: string;
  other_avatar: string | null;
  other_id: string;
  avatar_url: string | null;
};

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ msg, isMe, showAvatar, showTime, onLongPress, onReply, replyPreview }: {
  msg: Message;
  isMe: boolean;
  showAvatar: boolean;
  showTime: boolean;
  onLongPress: (msg: Message) => void;
  onReply: (msg: Message) => void;
  replyPreview?: string | null;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
      {!isMe && (
        <View style={styles.avatarSlot}>
          {showAvatar ? (
            <Avatar uri={msg.sender?.avatar_url} name={msg.sender?.display_name} size={32} />
          ) : null}
        </View>
      )}
      <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther]}>
        {!isMe && showAvatar && (
          <Text style={[styles.senderName, { color: colors.textSecondary }]}>
            {msg.sender?.display_name}
          </Text>
        )}
        {replyPreview && (
          <View style={[styles.replyPreview, { backgroundColor: isMe ? "rgba(255,255,255,0.15)" : colors.inputBg }]}>
            <View style={[styles.replyBar, { backgroundColor: Colors.brand }]} />
            <Text style={[styles.replyPreviewText, { color: isMe ? "rgba(255,255,255,0.8)" : colors.textSecondary }]} numberOfLines={1}>
              {replyPreview}
            </Text>
          </View>
        )}
        <TouchableOpacity
          onLongPress={() => onLongPress(msg)}
          delayLongPress={300}
          activeOpacity={0.8}
          style={[
            styles.bubble,
            isMe ? { backgroundColor: Colors.brand } : { backgroundColor: colors.bubbleIncoming },
          ]}
        >
          <Text style={[styles.bubbleText, { color: isMe ? "#fff" : colors.bubbleIncomingText }]}>
            {msg.encrypted_content}
          </Text>
        </TouchableOpacity>

        {msg.reactions && msg.reactions.length > 0 && (
          <View style={styles.reactionsRow}>
            {msg.reactions.map((r, i) => (
              <View key={i} style={[styles.reactionBadge, r.myReaction && { borderColor: Colors.brand }]}>
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                {r.count > 1 && <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>{r.count}</Text>}
              </View>
            ))}
          </View>
        )}

        <View style={styles.timeStatusRow}>
          {showTime && (
            <Text style={[styles.msgTime, { color: colors.textMuted }, isMe && styles.msgTimeMe]}>
              {formatMsgTime(msg.sent_at)}
            </Text>
          )}
          {isMe && msg.status && (
            <Ionicons
              name={msg.status === "read" ? "checkmark-done" : msg.status === "delivered" ? "checkmark-done-outline" : "checkmark"}
              size={14}
              color={msg.status === "read" ? Colors.brand : colors.textMuted}
              style={{ marginLeft: 4 }}
            />
          )}
        </View>
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
  const [chatInfo, setChatInfo] = useState<ChatInfo | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showReactions, setShowReactions] = useState<Message | null>(null);
  const [showRedEnvelope, setShowRedEnvelope] = useState(false);
  const [envelopeAmount, setEnvelopeAmount] = useState("");
  const [envelopeMsg, setEnvelopeMsg] = useState("");
  const [envelopeCount, setEnvelopeCount] = useState("1");
  const flatListRef = useRef<FlatList>(null);
  const typingTimeout = useRef<any>(null);

  const loadChatInfo = useCallback(async () => {
    if (!id || !user) return;
    const { data: chat } = await supabase
      .from("chats")
      .select(`is_group, is_channel, name, avatar_url, chat_members(user_id, profiles(id, display_name, avatar_url, handle))`)
      .eq("id", id)
      .single();

    if (chat) {
      const others = (chat.chat_members || []).filter((m: any) => m.user_id !== user.id);
      const other = others[0]?.profiles;
      setChatInfo({
        is_group: !!chat.is_group,
        is_channel: !!chat.is_channel,
        name: chat.name,
        other_name: other?.display_name || "Unknown",
        other_avatar: other?.avatar_url || null,
        other_id: other?.id || "",
        avatar_url: chat.avatar_url,
      });
    }
  }, [id, user]);

  const loadMessages = useCallback(async () => {
    if (!id || !user) return;
    const { data } = await supabase
      .from("messages")
      .select(`id, chat_id, sender_id, encrypted_content, sent_at, reply_to_message_id, profiles!messages_sender_id_fkey(display_name, avatar_url, handle)`)
      .eq("chat_id", id)
      .order("sent_at", { ascending: false })
      .limit(50);

    if (data) {
      const msgIds = data.map((m: any) => m.id);

      const [{ data: reactions }, { data: statuses }] = await Promise.all([
        msgIds.length > 0 ? supabase.from("message_reactions").select("message_id, emoji, user_id").in("message_id", msgIds) : { data: [] },
        msgIds.length > 0 ? supabase.from("message_status").select("message_id, status").in("message_id", msgIds) : { data: [] },
      ]);

      const reactionMap: Record<string, { emoji: string; count: number; myReaction: boolean }[]> = {};
      for (const r of (reactions || []) as any[]) {
        if (!reactionMap[r.message_id]) reactionMap[r.message_id] = [];
        const existing = reactionMap[r.message_id].find((x) => x.emoji === r.emoji);
        if (existing) {
          existing.count++;
          if (r.user_id === user.id) existing.myReaction = true;
        } else {
          reactionMap[r.message_id].push({ emoji: r.emoji, count: 1, myReaction: r.user_id === user.id });
        }
      }

      const statusMap: Record<string, string> = {};
      for (const s of (statuses || []) as any[]) {
        if (!statusMap[s.message_id] || s.status === "read") statusMap[s.message_id] = s.status;
      }

      setMessages(
        data.map((m: any) => ({
          id: m.id,
          chat_id: m.chat_id,
          sender_id: m.sender_id,
          encrypted_content: m.encrypted_content,
          sent_at: m.sent_at,
          reply_to_message_id: m.reply_to_message_id,
          sender: m.profiles,
          reactions: reactionMap[m.id] || [],
          status: statusMap[m.id] || (m.sender_id === user.id ? "sent" : undefined),
        }))
      );
    }
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    loadChatInfo();
    loadMessages();

    const msgSub = supabase
      .channel(`chat:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${id}` },
        async (payload) => {
          const newMsg = payload.new as any;
          if (newMsg.sender_id === user?.id) return;
          const { data: profile } = await supabase.from("profiles").select("display_name, avatar_url, handle").eq("id", newMsg.sender_id).single();
          setMessages((prev) => [{ ...newMsg, sender: profile as any, reactions: [], status: undefined }, ...prev]);

          if (user) {
            await supabase.from("message_status").upsert({ message_id: newMsg.id, user_id: user.id, status: "read" }, { onConflict: "message_id,user_id" });
          }
        }
      )
      .subscribe();

    const typingSub = supabase
      .channel(`typing:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "typing_indicators", filter: `chat_id=eq.${id}` },
        async (payload) => {
          const data = payload.new as any;
          if (data.user_id === user?.id) return;
          const { data: typer } = await supabase.from("profiles").select("display_name").eq("id", data.user_id).single();
          const name = typer?.display_name || "Someone";
          if (data.is_typing) {
            setTypingUsers((prev) => prev.includes(name) ? prev : [...prev, name]);
            setTimeout(() => {
              setTypingUsers((prev) => prev.filter((n) => n !== name));
            }, 5000);
          } else {
            setTypingUsers((prev) => prev.filter((n) => n !== name));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgSub);
      supabase.removeChannel(typingSub);
    };
  }, [id, loadChatInfo, loadMessages]);

  function handleTyping() {
    if (!user || !id) return;
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    supabase.from("typing_indicators").upsert({ chat_id: id, user_id: user.id, is_typing: true }, { onConflict: "chat_id,user_id" });
    typingTimeout.current = setTimeout(() => {
      supabase.from("typing_indicators").upsert({ chat_id: id, user_id: user.id, is_typing: false }, { onConflict: "chat_id,user_id" });
    }, 3000);
  }

  async function addReaction(msg: Message, emoji: string) {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowReactions(null);

    const existing = msg.reactions?.find((r) => r.emoji === emoji && r.myReaction);
    if (existing) {
      await supabase.from("message_reactions").delete().eq("message_id", msg.id).eq("user_id", user.id).eq("emoji", emoji);
    } else {
      await supabase.from("message_reactions").insert({ message_id: msg.id, user_id: user.id, emoji });
    }
    loadMessages();
  }

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
      chat_id: id,
      sender_id: user.id,
      encrypted_content: text,
      sent_at: now,
      sender: { display_name: "You", avatar_url: null, handle: "" },
      reply_to_message_id: replyTo?.id || null,
      status: "sending",
    };
    setMessages((prev) => [optimistic, ...prev]);
    setReplyTo(null);

    const insertData: any = { chat_id: id, sender_id: user.id, encrypted_content: text };
    if (replyTo) insertData.reply_to_message_id = replyTo.id;

    const { data: msg, error } = await supabase.from("messages").insert(insertData).select().single();

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      Alert.alert("Send failed", "Could not send message. Try again.");
    } else if (msg) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, id: msg.id, sent_at: msg.sent_at, status: "sent" } : m))
      );
      await supabase.from("chats").update({ updated_at: now }).eq("id", id);
    }
    setSending(false);
    supabase.from("typing_indicators").upsert({ chat_id: id, user_id: user.id, is_typing: false }, { onConflict: "chat_id,user_id" });
  }

  async function sendRedEnvelope() {
    if (!user || !envelopeAmount.trim()) return;
    const amount = parseInt(envelopeAmount);
    const count = parseInt(envelopeCount) || 1;
    if (isNaN(amount) || amount <= 0) { Alert.alert("Invalid amount"); return; }

    const { error } = await supabase.from("red_envelopes").insert({
      sender_id: user.id,
      chat_id: id,
      total_amount: amount,
      remaining_amount: amount,
      total_count: count,
      remaining_count: count,
      message: envelopeMsg.trim() || "Best wishes!",
      split_type: count > 1 ? "random" : "equal",
    });

    if (error) { Alert.alert("Error", error.message); return; }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowRedEnvelope(false);
    setEnvelopeAmount("");
    setEnvelopeMsg("");
    setEnvelopeCount("1");

    await supabase.from("messages").insert({
      chat_id: id,
      sender_id: user.id,
      encrypted_content: `🧧 Red Envelope - ${envelopeMsg.trim() || "Best wishes!"}`,
    });
    loadMessages();
  }

  const replyMap: Record<string, string> = {};
  for (const m of messages) {
    replyMap[m.id] = m.encrypted_content;
  }

  const title = chatInfo?.is_group || chatInfo?.is_channel ? chatInfo.name : chatInfo?.other_name;
  const avatar = chatInfo?.is_group || chatInfo?.is_channel ? chatInfo.avatar_url : chatInfo?.other_avatar;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Avatar uri={avatar} name={title || undefined} size={36} />
        <View style={styles.headerInfo}>
          <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>{title || "Chat"}</Text>
          {typingUsers.length > 0 ? (
            <Text style={[styles.headerSub, { color: Colors.brand }]}>
              {typingUsers.join(", ")} typing...
            </Text>
          ) : chatInfo?.is_channel ? (
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>Channel</Text>
          ) : null}
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

      {loading ? (
        <View style={styles.loadingCenter}><ActivityIndicator color={Colors.brand} /></View>
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
              new Date(item.sent_at).getTime() - new Date(prev.sent_at).getTime() > 120000;
            const replyPreview = item.reply_to_message_id ? replyMap[item.reply_to_message_id] || null : null;
            return (
              <MessageBubble
                msg={item}
                isMe={isMe}
                showAvatar={showAvatar}
                showTime={showTime}
                onLongPress={setShowReactions}
                onReply={setReplyTo}
                replyPreview={replyPreview}
              />
            );
          }}
          contentContainerStyle={{ paddingVertical: 12, flexDirection: "column-reverse" }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {replyTo && (
        <View style={[styles.replyBanner, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={[styles.replyBarAccent, { backgroundColor: Colors.brand }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.replyBannerName, { color: Colors.brand }]}>{replyTo.sender?.display_name}</Text>
            <Text style={[styles.replyBannerText, { color: colors.textSecondary }]} numberOfLines={1}>{replyTo.encrypted_content}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
          <TouchableOpacity style={styles.inputAction} onPress={() => setShowRedEnvelope(true)}>
            <Ionicons name="gift-outline" size={26} color="#FF3B30" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.inputAction}>
            <Ionicons name="add-circle-outline" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={[styles.inputField, { backgroundColor: colors.inputBg }]}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Message"
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={(t) => { setInput(t); handleTyping(); }}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
          </View>
          {input.trim().length > 0 ? (
            <TouchableOpacity style={[styles.sendBtn, { backgroundColor: Colors.brand }]} onPress={sendMessage} disabled={sending}>
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.inputAction}>
              <Ionicons name="mic-outline" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!showReactions} transparent animationType="fade" onRequestClose={() => setShowReactions(null)}>
        <TouchableOpacity style={styles.reactionOverlay} activeOpacity={1} onPress={() => setShowReactions(null)}>
          <View style={[styles.reactionPicker, { backgroundColor: colors.surface }]}>
            {REACTION_EMOJIS.map((emoji) => (
              <TouchableOpacity key={emoji} style={styles.reactionOption} onPress={() => showReactions && addReaction(showReactions, emoji)}>
                <Text style={styles.reactionOptionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.reactionOption} onPress={() => { if (showReactions) { setReplyTo(showReactions); setShowReactions(null); } }}>
              <Ionicons name="arrow-undo" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showRedEnvelope} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>🧧 Red Envelope</Text>
              <TouchableOpacity onPress={() => setShowRedEnvelope(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Amount (XP)" placeholderTextColor={colors.textMuted} value={envelopeAmount} onChangeText={setEnvelopeAmount} keyboardType="numeric" />
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Number of envelopes" placeholderTextColor={colors.textMuted} value={envelopeCount} onChangeText={setEnvelopeCount} keyboardType="numeric" />
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Best wishes!" placeholderTextColor={colors.textMuted} value={envelopeMsg} onChangeText={setEnvelopeMsg} />
            <TouchableOpacity style={styles.redEnvBtn} onPress={sendRedEnvelope}>
              <Text style={styles.redEnvBtnText}>Send Red Envelope</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  headerAction: { padding: 4 },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  msgRow: { flexDirection: "row", paddingHorizontal: 12, marginVertical: 2 },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowOther: { justifyContent: "flex-start" },
  avatarSlot: { width: 36, marginRight: 6, justifyContent: "flex-end" },
  bubbleWrap: { maxWidth: "72%" },
  bubbleWrapMe: { alignItems: "flex-end" },
  bubbleWrapOther: { alignItems: "flex-start" },
  senderName: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 2, marginLeft: 4 },
  replyPreview: { flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 2, gap: 6 },
  replyBar: { width: 3, height: "100%", borderRadius: 2, minHeight: 16 },
  replyPreviewText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleText: { fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 22 },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4, marginLeft: 4 },
  reactionBadge: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.06)", borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "transparent" },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, fontFamily: "Inter_500Medium" },
  timeStatusRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  msgTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginLeft: 4 },
  msgTimeMe: { marginLeft: 0, marginRight: 4 },
  replyBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  replyBarAccent: { width: 3, height: 32, borderRadius: 2 },
  replyBannerName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyBannerText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  inputAction: { paddingBottom: 6 },
  inputField: { flex: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9, maxHeight: 120 },
  input: { fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 22 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  reactionOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.3)" },
  reactionPicker: { flexDirection: "row", borderRadius: 28, paddingHorizontal: 12, paddingVertical: 8, gap: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  reactionOption: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  reactionOptionEmoji: { fontSize: 24 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  modalInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  redEnvBtn: { backgroundColor: "#FF3B30", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  redEnvBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
