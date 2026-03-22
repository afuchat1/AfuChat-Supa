import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

type AiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const QUICK_PROMPTS = [
  { label: "Translate", icon: "language-outline" as const, prompt: "Translate the following to " },
  { label: "Write a post", icon: "create-outline" as const, prompt: "Help me write a social media post about " },
  { label: "Summarize", icon: "document-text-outline" as const, prompt: "Summarize the following: " },
  { label: "Ideas", icon: "bulb-outline" as const, prompt: "Give me creative ideas for " },
];

export default function AiChatScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");

    const userMsg: AiMessage = { id: `u_${Date.now()}`, role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();
      const aiMsg: AiMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: data.reply || "Sorry, something went wrong.",
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `e_${Date.now()}`, role: "assistant", content: "Could not connect to AI. Please try again." },
      ]);
    }
    setLoading(false);
  }, [input, messages, loading]);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.aiIcon, { backgroundColor: Colors.brand }]}>
            <Ionicons name="sparkles" size={16} color="#fff" />
          </View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>AI Assistant</Text>
        </View>
        <TouchableOpacity onPress={() => { setMessages([]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
          <Ionicons name="refresh-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.msgRow, item.role === "user" ? styles.msgRowUser : styles.msgRowAi]}>
            {item.role === "assistant" && (
              <View style={[styles.aiBubbleIcon, { backgroundColor: Colors.brand }]}>
                <Ionicons name="sparkles" size={12} color="#fff" />
              </View>
            )}
            <View style={[
              styles.bubble,
              item.role === "user"
                ? { backgroundColor: Colors.brand }
                : { backgroundColor: colors.surface },
            ]}>
              <Text style={[
                styles.bubbleText,
                { color: item.role === "user" ? "#fff" : colors.text },
              ]}>
                {item.content}
              </Text>
            </View>
          </View>
        )}
        contentContainerStyle={messages.length === 0 ? styles.emptyContainer : { paddingVertical: 16, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: Colors.brand + "15" }]}>
              <Ionicons name="sparkles" size={48} color={Colors.brand} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>AfuChat AI</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Your personal AI assistant. Ask me anything!
            </Text>
            <View style={styles.quickPrompts}>
              {QUICK_PROMPTS.map((p) => (
                <TouchableOpacity
                  key={p.label}
                  style={[styles.quickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setInput(p.prompt)}
                >
                  <Ionicons name={p.icon} size={16} color={Colors.brand} />
                  <Text style={[styles.quickLabel, { color: colors.text }]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
      />

      {loading && (
        <View style={[styles.typingRow]}>
          <View style={[styles.aiBubbleIcon, { backgroundColor: Colors.brand }]}>
            <Ionicons name="sparkles" size={12} color="#fff" />
          </View>
          <View style={[styles.typingBubble, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="small" color={Colors.brand} />
            <Text style={[styles.typingText, { color: colors.textMuted }]}>Thinking...</Text>
          </View>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
          <View style={[styles.inputField, { backgroundColor: colors.inputBg }]}>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Ask AI anything..."
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
          </View>
          {input.trim().length > 0 ? (
            <TouchableOpacity style={[styles.sendBtn, { backgroundColor: Colors.brand }]} onPress={() => sendMessage()} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptyContainer: { flexGrow: 1 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  quickPrompts: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16, justifyContent: "center" },
  quickBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  quickLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  msgRow: { paddingHorizontal: 12, marginVertical: 4 },
  msgRowUser: { alignItems: "flex-end" },
  msgRowAi: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  aiBubbleIcon: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: "78%" },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  typingRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8, paddingBottom: 8 },
  typingBubble: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  typingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  inputBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  inputField: { flex: 1, borderRadius: 22, paddingHorizontal: 14, minHeight: 40, maxHeight: 100, justifyContent: "center" },
  input: { fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 8 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
