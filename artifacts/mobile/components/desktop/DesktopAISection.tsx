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
import {
  DesktopButton,
  DesktopEmptyState,
  DesktopIconButton,
  DesktopLoadingState,
  DesktopPageHeader,
  DesktopPanel,
  DesktopSectionShell,
  useDesktopTheme,
} from "./ui";

type Message = {
  id: string;
  sender_id: string;
  encrypted_content: string;
  sent_at: string;
};

type Suggestion = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
};

const SUGGESTIONS: Suggestion[] = [
  { id: "s1", label: "Write a professional bio for me", icon: "person-outline" },
  { id: "s2", label: "Summarize the latest tech news", icon: "newspaper-outline" },
  { id: "s3", label: "Help me draft a message", icon: "chatbubble-outline" },
  { id: "s4", label: "Explain blockchain to me simply", icon: "bulb-outline" },
  { id: "s5", label: "Give me 5 business ideas", icon: "briefcase-outline" },
  { id: "s6", label: "Write a creative short story", icon: "library-outline" },
];

function timeStr(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Bubble({ msg, isMe }: { msg: Message; isMe: boolean }) {
  const t = useDesktopTheme();
  return (
    <View
      style={[
        styles.bubbleRow,
        isMe ? styles.bubbleRowMe : styles.bubbleRowAI,
      ]}
    >
      {!isMe && (
        <View style={[styles.aiBadge, { backgroundColor: t.accent }]}>
          <Ionicons name="sparkles" size={12} color="#fff" />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isMe
            ? { backgroundColor: t.accent }
            : {
                backgroundColor: t.panelBgRaised,
                borderColor: t.border,
                borderWidth: StyleSheet.hairlineWidth,
              },
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            { color: isMe ? "#fff" : t.text },
          ]}
        >
          {msg.encrypted_content}
        </Text>
        <Text
          style={[
            styles.bubbleTime,
            { color: isMe ? "rgba(255,255,255,0.7)" : t.textMuted },
          ]}
        >
          {timeStr(msg.sent_at)}
        </Text>
      </View>
    </View>
  );
}

export function DesktopAISection() {
  const t = useDesktopTheme();
  const { user } = useAuth();
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
      const { data: cid } = await supabase.rpc("get_or_create_direct_chat", {
        other_user_id: AFUAI_BOT_ID,
      });
      if (!cid) {
        setLoading(false);
        return;
      }
      setChatId(cid);
      await loadMessages(cid);
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
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (p) => {
          setMessages((prev) => [...prev, p.new as Message]);
          setTimeout(
            () => listRef.current?.scrollToEnd({ animated: true }),
            60,
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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
    if (
      Platform.OS === "web" &&
      e.nativeEvent?.key === "Enter" &&
      !e.nativeEvent?.shiftKey
    ) {
      e.preventDefault?.();
      send();
    }
  }

  if (!user) {
    return (
      <DesktopSectionShell>
        <DesktopPanel flex={1}>
          <DesktopEmptyState
            icon="sparkles"
            title="AfuAI Assistant"
            subtitle="Sign in to chat with AfuAI."
          />
        </DesktopPanel>
      </DesktopSectionShell>
    );
  }

  return (
    <DesktopSectionShell>
      <DesktopPanel flex={1}>
        <DesktopPageHeader
          icon="sparkles"
          title="AfuAI"
          subtitle="Your intelligent assistant"
          right={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: t.success,
                }}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: "Inter_600SemiBold",
                  color: t.success,
                }}
              >
                Online
              </Text>
            </View>
          }
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={52}
        >
          {loading ? (
            <DesktopLoadingState />
          ) : messages.length === 0 ? (
            <ScrollView
              contentContainerStyle={styles.emptyArea}
              showsVerticalScrollIndicator={false}
            >
              <View
                style={[styles.emptyIcon, { backgroundColor: t.accent + "18" }]}
              >
                <Ionicons name="sparkles" size={40} color={t.accent} />
              </View>
              <Text style={[styles.emptyTitle, { color: t.text }]}>
                Ask AfuAI anything
              </Text>
              <Text style={[styles.emptySub, { color: t.textMuted }]}>
                Get help with writing, research, ideas, coding, and much more.
              </Text>
              <View style={styles.suggestGrid}>
                {SUGGESTIONS.map((s) => (
                  <SuggestionRow
                    key={s.id}
                    label={s.label}
                    icon={s.icon}
                    onPress={() => send(s.label)}
                  />
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
              onLayout={() =>
                listRef.current?.scrollToEnd({ animated: false })
              }
              renderItem={({ item }) => (
                <Bubble msg={item} isMe={item.sender_id === user.id} />
              )}
            />
          )}

          {/* Input area */}
          <View
            style={{
              paddingHorizontal: 18,
              paddingTop: 10,
              paddingBottom: 14,
              backgroundColor: t.panelHeaderBg,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: t.border,
              flexShrink: 0,
            }}
          >
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
                    activeOpacity={0.85}
                    style={[
                      styles.quickSuggestPill,
                      {
                        backgroundColor: t.accent + "14",
                        borderColor: t.accent + "40",
                      },
                    ]}
                  >
                    <Text
                      style={[styles.quickSuggestText, { color: t.accent }]}
                    >
                      {s.label}
                    </Text>
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
                placeholderTextColor={t.textMuted}
                multiline
                style={[
                  styles.input,
                  {
                    backgroundColor: t.inputBg,
                    borderColor: t.inputBorder,
                    color: t.text,
                    ...(Platform.OS === "web"
                      ? ({ outlineStyle: "none" } as any)
                      : null),
                  },
                ]}
              />
              <DesktopIconButton
                icon={sending ? "hourglass" : "arrow-up"}
                onPress={() => send()}
                size={42}
                variant="filled"
                color="#fff"
                style={{
                  backgroundColor: input.trim() ? t.accent : t.chipBg,
                  opacity: input.trim() && !sending ? 1 : 0.6,
                }}
              />
            </View>
            <Text style={[styles.disclaimer, { color: t.textMuted }]}>
              AfuAI can make mistakes. Verify important info.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </DesktopPanel>
    </DesktopSectionShell>
  );
}

function SuggestionRow({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
}) {
  const t = useDesktopTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 12,
        backgroundColor: t.panelBgRaised,
        borderColor: t.border,
        borderWidth: StyleSheet.hairlineWidth,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          backgroundColor: t.accent + "14",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={16} color={t.accent} />
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          fontFamily: "Inter_500Medium",
          color: t.text,
        }}
      >
        {label}
      </Text>
      <Ionicons name="arrow-up-outline" size={14} color={t.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create<any>({
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
  emptyTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  emptySub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 32,
    maxWidth: 460,
  },
  suggestGrid: { width: "100%", gap: 10, maxWidth: 720 },

  msgList: { padding: 22, gap: 6 },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 6,
    maxWidth: "72%",
  },
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
  bubbleText: {
    fontSize: 14.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  bubbleTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    textAlign: "right",
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
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14.5,
    fontFamily: "Inter_400Regular",
    maxHeight: 140,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
  },
  disclaimer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
  },
});
