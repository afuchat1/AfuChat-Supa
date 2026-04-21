import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { AFUAI_BOT_ID } from "@/lib/afuAiBot";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";

const BRAND = "#00BCD4";

type Message = {
  id: string;
  sender_id: string;
  encrypted_content: string;
  sent_at: string;
};

type Suggestion = { id: string; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] };

const SUGGESTIONS: Suggestion[] = [
  { id: "s1", label: "Write a professional bio for me",   icon: "person-outline" },
  { id: "s2", label: "Summarize the latest tech news",    icon: "newspaper-outline" },
  { id: "s3", label: "Help me draft a message",           icon: "chatbubble-outline" },
  { id: "s4", label: "Explain blockchain to me simply",   icon: "bulb-outline" },
  { id: "s5", label: "Give me 5 business ideas",          icon: "briefcase-outline" },
  { id: "s6", label: "Write a creative short story",      icon: "library-outline" },
];

function timeStr(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Bubble({
  msg,
  isMe,
  colors,
  accent,
}: {
  msg: Message;
  isMe: boolean;
  colors: any;
  accent: string;
}) {
  return (
    <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowAI]}>
      {!isMe && (
        <View style={[styles.aiBadge, { backgroundColor: accent }]}>
          <Ionicons name="sparkles" size={12} color="#fff" />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isMe
            ? [styles.bubbleMe, { backgroundColor: accent }]
            : [styles.bubbleAI, { backgroundColor: colors.surface, borderColor: colors.border }],
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            { color: isMe ? "#fff" : colors.text },
          ]}
        >
          {msg.encrypted_content}
        </Text>
        <Text style={[styles.bubbleTime, { color: isMe ? "rgba(255,255,255,0.65)" : colors.textMuted }]}>
          {timeStr(msg.sent_at)}
        </Text>
      </View>
    </View>
  );
}

export function DesktopAISection() {
  const { colors, accent } = useTheme();
  const { user, profile } = useAuth();
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!user) return;
    initChat();
  }, [user?.id]);

  async function initChat() {
    if (!user) return;
    setLoading(true);
    try {
      const { data: chatId } = await supabase.rpc("get_or_create_direct_chat", {
        other_user_id: AFUAI_BOT_ID,
      });
      if (!chatId) { setLoading(false); return; }
      setChatId(chatId);
      await loadMessages(chatId);
    } catch {
      setLoading(false);
    }
  }

  async function loadMessages(id: string) {
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, encrypted_content, sent_at")
      .eq("chat_id", id)
      .order("sent_at", { ascending: true })
      .limit(100);

    setMessages(data ?? []);
    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
  }

  useEffect(() => {
    if (!chatId) return;
    const ch = supabase
      .channel(`ai-chat-${chatId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, (p) => {
        setMessages((prev) => [...prev, p.new as Message]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || !chatId || !user || sending) return;
    setInput("");
    setSending(true);
    try {
      await supabase.from("messages").insert({
        chat_id: chatId,
        sender_id: user.id,
        encrypted_content: content,
      });
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: any) {
    if (Platform.OS === "web" && e.nativeEvent?.key === "Enter" && !e.nativeEvent?.shiftKey) {
      e.preventDefault?.();
      send();
    }
  }

  if (!user) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Ionicons name="sparkles" size={52} color={accent} />
          <Text style={[styles.centerTitle, { color: colors.text }]}>AfuAI Assistant</Text>
          <Text style={[styles.centerSub, { color: colors.textMuted }]}>Sign in to chat with AfuAI</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.aiAvatar, { backgroundColor: accent }]}>
          <Ionicons name="sparkles" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>AfuAI</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>Your intelligent assistant</Text>
        </View>
        <View style={[styles.liveDot, { backgroundColor: "#34C759" }]} />
        <Text style={[styles.liveLabel, { color: "#34C759" }]}>Online</Text>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={52}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={accent} size="large" />
          </View>
        ) : messages.length === 0 ? (
          <ScrollView contentContainerStyle={styles.emptyArea} showsVerticalScrollIndicator={false}>
            <View style={[styles.emptyIcon, { backgroundColor: accent + "18" }]}>
              <Ionicons name="sparkles" size={40} color={accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Ask AfuAI anything</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              Get help with writing, research, ideas, coding, and much more.
            </Text>
            <View style={styles.suggestGrid}>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => send(s.label)}
                  activeOpacity={0.8}
                  style={[styles.suggestBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Ionicons name={s.icon} size={16} color={accent} />
                  <Text style={[styles.suggestLabel, { color: colors.text }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.msgList}
            showsVerticalScrollIndicator={false}
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => (
              <Bubble
                msg={item}
                isMe={item.sender_id === user.id}
                colors={colors}
                accent={accent}
              />
            )}
          />
        )}

        {/* Input */}
        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          {messages.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickSuggests}
            >
              {SUGGESTIONS.slice(0, 4).map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => send(s.label)}
                  activeOpacity={0.8}
                  style={[styles.quickSuggestPill, { backgroundColor: accent + "14", borderColor: accent + "40" }]}
                >
                  <Text style={[styles.quickSuggestText, { color: accent }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              onKeyPress={handleKey}
              placeholder="Message AfuAI..."
              placeholderTextColor={colors.textMuted}
              multiline
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            />
            <TouchableOpacity
              onPress={() => send()}
              activeOpacity={0.8}
              disabled={!input.trim() || sending}
              style={[styles.sendBtn, { backgroundColor: input.trim() ? accent : colors.border }]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="arrow-up" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
            AfuAI can make mistakes. Verify important info.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create<any>({
  root: { flex: 1, flexDirection: "column" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  centerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  centerSub: { fontSize: 14, fontFamily: "Inter_400Regular" },

  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  aiAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  emptyArea: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 8, textAlign: "center" },
  emptySub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 32 },
  suggestGrid: { width: "100%", gap: 10, maxWidth: 700 },
  suggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestLabel: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },

  msgList: { padding: 20, gap: 6 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 6, maxWidth: "72%" },
  bubbleRowMe: { alignSelf: "flex-end", justifyContent: "flex-end" },
  bubbleRowAI: { alignSelf: "flex-start", gap: 8 },
  aiBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bubble: { borderRadius: 14, padding: 12, maxWidth: 560 },
  bubbleMe: {},
  bubbleAI: { borderWidth: StyleSheet.hairlineWidth },
  bubbleText: { fontSize: 14.5, fontFamily: "Inter_400Regular", lineHeight: 21 },
  bubbleTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 6, textAlign: "right" },

  inputBar: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    flexShrink: 0,
  },
  quickSuggests: { gap: 8, paddingBottom: 10 },
  quickSuggestPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  quickSuggestText: { fontSize: 12.5, fontFamily: "Inter_500Medium" },
  inputRow: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  input: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14.5,
    fontFamily: "Inter_400Regular",
    maxHeight: 140,
    minHeight: 44,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  disclaimer: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8 },
});
