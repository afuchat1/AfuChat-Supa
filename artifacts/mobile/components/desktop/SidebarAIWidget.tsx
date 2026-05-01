import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { askAi } from "@/lib/aiHelper";
import { useAuth } from "@/context/AuthContext";

type ThemePack = {
  bg: string;
  text: string;
  textMuted: string;
  hoverBg: string;
  activeBg: string;
  divider: string;
  accent: string;
  surface: string;
  inputBg: string;
};

type Message = { role: "ai" | "user"; text: string };

const SUGGESTIONS = [
  "Write me a post",
  "Help edit my bio",
  "Summarize my feed",
  "Generate hashtags",
];

const WELCOME: Message = {
  role: "ai",
  text: "Hi! I'm AfuAI, your personal assistant. Ask me anything or try a suggestion below.",
};

export function SidebarAIWidget({ theme }: { theme: ThemePack }) {
  const { session } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: expanded ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
    if (expanded) {
      setTimeout(() => inputRef.current?.focus(), 220);
    }
  }, [expanded]);

  useEffect(() => {
    if (expanded) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages, expanded]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setInput("");
      setSuggestionsOpen(false);
      setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
      setLoading(true);
      try {
        const reply = await askAi(
          trimmed,
          "You are AfuAI, a helpful assistant inside AfuChat — a social super-app. Keep responses short (under 120 words). Be friendly and concise.",
          { fast: true, maxTokens: 200 }
        );
        setMessages((prev) => [...prev, { role: "ai", text: reply }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: "Sorry, I couldn't reach the AI right now. Try again." },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  const openFull = () => {
    setExpanded(false);
    router.push("/ai" as any);
  };

  if (!session) return null;

  return (
    <View style={styles.root}>
      <View style={[styles.divider, { backgroundColor: theme.divider }]} />

      {expanded ? (
        <Animated.View
          style={[
            styles.panel,
            {
              backgroundColor: theme.surface,
              borderColor: theme.divider,
              opacity: fadeAnim,
            },
          ]}
        >
          {/* Panel header */}
          <View style={[styles.panelHeader, { borderBottomColor: theme.divider }]}>
            <View style={styles.panelTitleRow}>
              <Ionicons name="sparkles" size={14} color="#00BCD4" />
              <Text style={[styles.panelTitle, { color: theme.text }]}>AfuAI</Text>
              <View style={[styles.betaBadge, { borderColor: theme.divider }]}>
                <Text style={[styles.betaText, { color: theme.textMuted }]}>BETA</Text>
              </View>
            </View>
            <View style={styles.panelActions}>
              <Pressable
                onPress={openFull}
                hitSlop={8}
                style={({ hovered }: any) => [
                  styles.headerBtn,
                  hovered && { backgroundColor: theme.hoverBg },
                ]}
              >
                <Ionicons name="expand-outline" size={15} color={theme.textMuted} />
              </Pressable>
              <Pressable
                onPress={() => setExpanded(false)}
                hitSlop={8}
                style={({ hovered }: any) => [
                  styles.headerBtn,
                  hovered && { backgroundColor: theme.hoverBg },
                ]}
              >
                <Ionicons name="remove-outline" size={15} color={theme.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            style={styles.msgScroll}
            contentContainerStyle={styles.msgContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((m, i) => (
              <View
                key={i}
                style={[
                  styles.msgRow,
                  m.role === "user" && styles.msgRowUser,
                ]}
              >
                {m.role === "ai" && (
                  <View style={[styles.msgAiBubble, { backgroundColor: theme.hoverBg }]}>
                    <Text style={[styles.msgSender, { color: theme.accent }]}>AfuAI</Text>
                    <Text style={[styles.msgText, { color: theme.text }]}>{m.text}</Text>
                  </View>
                )}
                {m.role === "user" && (
                  <View style={[styles.msgUserBubble, { backgroundColor: "#00BCD4" }]}>
                    <Text style={[styles.msgText, { color: "#fff" }]}>{m.text}</Text>
                  </View>
                )}
              </View>
            ))}
            {loading && (
              <View style={[styles.msgAiBubble, { backgroundColor: theme.hoverBg, marginLeft: 0, marginRight: 24 }]}>
                <Text style={[styles.msgSender, { color: theme.accent }]}>AfuAI</Text>
                <ActivityIndicator size="small" color="#00BCD4" style={{ alignSelf: "flex-start", marginTop: 2 }} />
              </View>
            )}
          </ScrollView>

          {/* Quick suggestions */}
          {suggestionsOpen && messages.length <= 1 && (
            <View style={[styles.suggestionsWrap, { borderTopColor: theme.divider }]}>
              <Pressable
                onPress={() => setSuggestionsOpen(false)}
                style={styles.suggestToggle}
              >
                <Ionicons
                  name={suggestionsOpen ? "chevron-up" : "chevron-down"}
                  size={12}
                  color={theme.textMuted}
                />
              </Pressable>
              <View style={styles.chips}>
                {SUGGESTIONS.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => send(s)}
                    style={({ hovered }: any) => [
                      styles.chip,
                      {
                        backgroundColor: hovered ? theme.hoverBg : "transparent",
                        borderColor: theme.divider,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: theme.text }]}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Input row */}
          <View style={[styles.inputRow, { borderTopColor: theme.divider, backgroundColor: theme.bg }]}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg }]}
              placeholder="Ask anything…"
              placeholderTextColor={theme.textMuted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => send(input)}
              returnKeyType="send"
              blurOnSubmit={false}
              maxLength={400}
              {...(Platform.OS === "web"
                ? {
                    onKeyPress: (e: any) => {
                      if (e.nativeEvent?.key === "Enter" && !e.nativeEvent?.shiftKey) {
                        e.preventDefault?.();
                        send(input);
                      }
                    },
                  }
                : {})}
            />
            <Pressable
              onPress={() => send(input)}
              disabled={!input.trim() || loading}
              style={[
                styles.sendBtn,
                {
                  backgroundColor: input.trim() && !loading ? "#00BCD4" : theme.hoverBg,
                },
              ]}
            >
              <Ionicons
                name="send"
                size={13}
                color={input.trim() && !loading ? "#fff" : theme.textMuted}
              />
            </Pressable>
          </View>
        </Animated.View>
      ) : (
        /* Collapsed pill */
        <Pressable
          onPress={() => setExpanded(true)}
          style={({ hovered, pressed }: any) => [
            styles.collapsedPill,
            {
              backgroundColor: pressed
                ? theme.activeBg
                : hovered
                  ? theme.hoverBg
                  : "transparent",
            },
          ]}
        >
          <Ionicons name="sparkles-outline" size={17} color="#00BCD4" />
          <Text style={[styles.collapsedText, { color: theme.text }]}>
            Ask AfuAI…
          </Text>
          <Ionicons name="chevron-up" size={13} color={theme.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 0,
  },
  divider: {
    height: 1,
    marginVertical: 8,
    marginHorizontal: 4,
  },
  collapsedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    marginHorizontal: 0,
  },
  collapsedText: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
  },
  panel: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginHorizontal: 6,
    marginBottom: 6,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  panelTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  panelTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  betaBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  betaText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  panelActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  headerBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  msgScroll: {
    maxHeight: 200,
  },
  msgContent: {
    padding: 10,
    gap: 8,
  },
  msgRow: {
    alignItems: "flex-start",
  },
  msgRowUser: {
    alignItems: "flex-end",
  },
  msgAiBubble: {
    borderRadius: 10,
    padding: 8,
    maxWidth: "90%",
    gap: 2,
  },
  msgUserBubble: {
    borderRadius: 10,
    padding: 8,
    maxWidth: "85%",
  },
  msgSender: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  msgText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  suggestionsWrap: {
    borderTopWidth: 1,
    paddingTop: 4,
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  suggestToggle: {
    alignItems: "center",
    paddingVertical: 3,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 6,
    maxHeight: 72,
  },
  sendBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
