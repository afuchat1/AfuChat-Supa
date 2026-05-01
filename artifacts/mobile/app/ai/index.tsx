import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { askAi } from "@/lib/aiHelper";
import { AFUAI_BOT_ID } from "@/lib/afuAiBot";
import { useTheme } from "@/hooks/useTheme";
import { AiRedirectSkeleton } from "@/components/ui/Skeleton";

// ─── Guest system prompt ──────────────────────────────────────────────────────
// Restricts the AI to AfuChat guidance, auth flows, and public information only.
const GUEST_SYSTEM_PROMPT = `You are AfuAI, the friendly AI assistant built into AfuChat — Uganda's social super-app. You are currently speaking with a visitor who is not yet signed in.

Your role is to:
1. Help visitors understand what AfuChat is and what it offers (social feed, real-time chat, stories, wallet, marketplace, mini-apps, communities, AfuAI, etc.)
2. Guide them through signing up or logging in — including email/password registration, Google sign-in, and Telegram sign-in.
3. Answer questions about AfuChat's public features, the Discover feed, public profiles, communities, the marketplace, and the app's terms, privacy policy, and about page.
4. Encourage them to create an account so they can unlock the full experience.

Rules:
- Do NOT answer questions unrelated to AfuChat (no general coding help, essay writing, etc.) — politely redirect them: "I can help with that once you sign in! For now, let me help you get started with AfuChat."
- If asked about private data (messages, wallet balance, contacts, etc.), explain that those are only available after signing in and offer to guide them there.
- Keep replies concise, warm, and encouraging. No bullet-point walls — write naturally.
- Never claim to be powered by a third party. You are AfuAI.`;

const GUEST_WELCOME = `Hi there! 👋 I'm AfuAI, your guide to AfuChat.

I can help you understand what AfuChat offers, walk you through signing up or logging in, and answer questions about our public features.

What would you like to know?`;

// ─── Quick-suggestion chips shown to guest users ──────────────────────────────
const GUEST_CHIPS = [
  "What is AfuChat?",
  "How do I sign up?",
  "What can I do here?",
  "Tell me about the wallet",
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// ─── Guest AI chat ─────────────────────────────────────────────────────────────
function GuestAiChat() {
  const { colors } = useTheme();
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "assistant", content: GUEST_WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      scrollToBottom();

      try {
        // Build conversation context (skip the static welcome message)
        const history = messages
          .filter((m) => m.id !== "welcome")
          .slice(-8)
          .map((m) => `${m.role === "user" ? "User" : "AfuAI"}: ${m.content}`)
          .join("\n");

        const prompt = history
          ? `Conversation so far:\n${history}\n\nUser: ${trimmed}`
          : trimmed;

        const reply = await askAi(prompt, GUEST_SYSTEM_PROMPT, {
          fast: false,
          maxTokens: 400,
        });

        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", content: reply },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-err-${Date.now()}`,
            role: "assistant",
            content: "Sorry, I couldn't reach the AI right now. Please try again.",
          },
        ]);
      } finally {
        setLoading(false);
        scrollToBottom();
      }
    },
    [loading, messages, scrollToBottom]
  );

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View
        style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: colors.accent }]
            : [styles.bubbleAi, { backgroundColor: colors.backgroundSecondary }],
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            { color: isUser ? "#fff" : colors.text },
          ]}
        >
          {item.content}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <View style={[styles.avatarCircle, { backgroundColor: colors.accent + "22" }]}>
          <Ionicons name="sparkles" size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.headerName, { color: colors.text }]}>AfuAI</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>
            Your AfuChat guide · Sign in for full access
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.signInBtn, { backgroundColor: colors.accent }]}
          onPress={() => router.push("/(auth)/login")}
          activeOpacity={0.8}
        >
          <Text style={styles.signInBtnText}>Sign in</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={scrollToBottom}
      />

      {/* Loading indicator */}
      {loading && (
        <View style={[styles.typingRow, { paddingHorizontal: 16, paddingBottom: 4 }]}>
          <View style={[styles.avatarCircle, { width: 28, height: 28, backgroundColor: colors.accent + "22" }]}>
            <Ionicons name="sparkles" size={13} color={colors.accent} />
          </View>
          <View style={[styles.typingBubble, { backgroundColor: colors.backgroundSecondary }]}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        </View>
      )}

      {/* Suggestion chips (shown while no user message sent yet) */}
      {messages.length === 1 && (
        <View style={styles.chipsRow}>
          {GUEST_CHIPS.map((chip) => (
            <TouchableOpacity
              key={chip}
              style={[styles.chip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
              onPress={() => sendMessage(chip)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>{chip}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.backgroundSecondary, color: colors.text }]}
          placeholder="Ask me anything about AfuChat…"
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => sendMessage(input)}
          returnKeyType="send"
          multiline
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            { backgroundColor: input.trim() ? colors.accent : colors.backgroundSecondary },
          ]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          activeOpacity={0.8}
        >
          <Ionicons
            name="send"
            size={16}
            color={input.trim() ? "#fff" : colors.textMuted}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Main export: auth-aware redirect ─────────────────────────────────────────
export default function AiScreen() {
  const { user, loading: authLoading } = useAuth();
  const { colors } = useTheme();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!user) return;
    setRedirecting(true);
    supabase
      .rpc("get_or_create_direct_chat", { other_user_id: AFUAI_BOT_ID })
      .then(({ data: chatId }) => {
        if (chatId) {
          router.replace(`/chat/${chatId}` as any);
        } else {
          router.back();
        }
      })
      .catch(() => setRedirecting(false));
  }, [user]);

  // Show skeleton while: (a) auth is still initialising, (b) logged-in user is
  // being redirected to their personal bot chat
  if (authLoading || user || redirecting) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AiRedirectSkeleton />
      </View>
    );
  }

  // Auth resolved, no session → show guest AI chat
  return <GuestAiChat />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  signInBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  signInBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  messageList: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 2,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typingBubble: {
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 120,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
