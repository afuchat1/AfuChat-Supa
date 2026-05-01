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
import { supabase } from "@/lib/supabase";

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

// ─── Guest suggestions ─────────────────────────────────────────────────────────
const GUEST_SUGGESTIONS = ["What is AfuChat?", "How do I sign up?", "What features are free?"];

// ─── Auth suggestions ──────────────────────────────────────────────────────────
const AUTH_SUGGESTIONS = ["Write me a post", "Help edit my bio", "What's my balance?", "Who should I follow?"];

// ─── Welcome messages ──────────────────────────────────────────────────────────
const WELCOME_GUEST: Message = {
  role: "ai",
  text: "Hi! I'm AfuAI 👋 I can tell you all about AfuChat and help you get started. Sign in to unlock the full experience!",
};

const WELCOME_AUTH: Message = {
  role: "ai",
  text: "Hi! I'm AfuAI — I know your account, chats, wallet, communities, and more. Ask me anything!",
};

// ─── System prompts ────────────────────────────────────────────────────────────
const SYSTEM_GUEST =
  `You are AfuAI, the friendly guide for AfuChat — Uganda's social super-app. Speaking with a visitor who is NOT signed in. ` +
  `Only help with: what AfuChat is, its features, signing up/logging in, and public information. ` +
  `For anything else say: "I can help with that once you sign in! For now, let me help you get started with AfuChat." ` +
  `Keep replies under 80 words. Be warm and encouraging.`;

function buildAuthSystemPrompt(userContext: string): string {
  return `You are AfuAI, a capable AI assistant built into AfuChat — Uganda's social super-app. You can help with anything: writing, coding, advice, analysis, creative tasks, and more.

You have full access to this user's AfuChat account data below. Reference it when the user asks about their chats, contacts, balance, followers, communities, or any account detail.

${userContext}

RULES:
- Be direct, concise, and genuinely helpful.
- Use the account data to give personalised answers (e.g. "You have X Nexa", "Your last chat was with @Y").
- Keep the sidebar widget replies short (under 150 words). For long content suggest opening the full AfuAI chat.
- Never expose raw IDs in your response — use names/handles instead.
- Respond in the same language the user writes in.`;
}

// ─── Fetch context for logged-in user ─────────────────────────────────────────
async function fetchUserContext(userId: string, profile: any): Promise<string> {
  try {
    const [
      { count: followers },
      { count: following },
      { count: posts },
      { data: subData },
      { data: recentChats },
      { data: communities },
      { data: contacts },
      { data: wallet },
    ] = await Promise.all([
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", userId),
      supabase.from("user_subscriptions").select("subscription_plans(name, tier)").eq("user_id", userId).eq("is_active", true).maybeSingle(),
      supabase.from("chats")
        .select("id, type, name, last_message, last_message_at, chat_members!inner(user_id), members:chat_members(profile:profiles(handle, display_name))")
        .eq("chat_members.user_id", userId)
        .order("last_message_at", { ascending: false })
        .limit(6),
      supabase.from("community_members").select("community:communities(name, member_count)").eq("user_id", userId).limit(8),
      supabase.from("follows").select("profile:profiles!follows_following_id_fkey(handle, display_name)").eq("follower_id", userId).limit(10),
      supabase.from("profiles").select("xp, acoin, current_grade, bio, country").eq("id", userId).maybeSingle(),
    ]);

    const premium = subData ? `${(subData as any).subscription_plans?.name} (${(subData as any).subscription_plans?.tier})` : "None";
    const xp = wallet?.xp ?? profile?.xp ?? 0;
    const acoin = wallet?.acoin ?? profile?.acoin ?? 0;

    const chatLines = (recentChats || []).map((c: any) => {
      const others = (c.members || [])
        .map((m: any) => m.profile)
        .filter((p: any) => p && p.handle !== profile?.handle)
        .map((p: any) => `@${p.handle}`)
        .join(", ");
      const name = c.type === "direct" ? (others || "Direct") : (c.name || "Group");
      const snippet = c.last_message ? `"${String(c.last_message).slice(0, 50)}${String(c.last_message).length > 50 ? "…" : ""}"` : "—";
      return `  - ${c.type === "group" ? "[Group] " : ""}${name}: ${snippet}`;
    });

    const communityLines = (communities || []).map((cm: any) =>
      `  - ${cm.community?.name || "Unknown"} (${cm.community?.member_count || 0} members)`
    );

    const contactNames = (contacts || [])
      .map((f: any) => f.profile ? `@${f.profile.handle}` : null)
      .filter(Boolean)
      .join(", ");

    return [
      `USER CONTEXT:`,
      `- Name: ${profile?.display_name} | Handle: @${profile?.handle}`,
      `- Bio: ${wallet?.bio || profile?.bio || "Not set"} | Country: ${wallet?.country || profile?.country || "Not set"}`,
      `- Nexa: ${xp} | ACoin: ${acoin} | Grade: ${wallet?.current_grade || profile?.current_grade || "Newcomer"}`,
      `- Followers: ${followers || 0} | Following: ${following || 0} | Posts: ${posts || 0}`,
      `- Premium: ${premium}`,
      ``,
      `RECENT CHATS:`,
      chatLines.length ? chatLines.join("\n") : "  None",
      ``,
      `COMMUNITIES:`,
      communityLines.length ? communityLines.join("\n") : "  None",
      ``,
      `FOLLOWING: ${contactNames || "None"}`,
    ].join("\n");
  } catch {
    return profile
      ? `USER CONTEXT:\n- Name: ${profile.display_name}\n- Handle: @${profile.handle}\n- Nexa: ${profile.xp || 0} | ACoin: ${profile.acoin || 0}`
      : "";
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────
export function SidebarAIWidget({ theme }: { theme: ThemePack }) {
  const { session, user, profile } = useAuth();
  const isGuest = !session;

  const [expanded, setExpanded] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([isGuest ? WELCOME_GUEST : WELCOME_AUTH]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState<string>(isGuest ? SYSTEM_GUEST : buildAuthSystemPrompt(""));
  const [contextLoaded, setContextLoaded] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const heightAnim = useRef(new Animated.Value(0)).current;

  // Fetch user context once when a logged-in user expands the widget
  useEffect(() => {
    if (isGuest || contextLoaded || !expanded) return;
    if (!user?.id || !profile) return;
    fetchUserContext(user.id, profile).then((ctx) => {
      setSystemPrompt(buildAuthSystemPrompt(ctx));
      setContextLoaded(true);
    });
  }, [expanded, isGuest, contextLoaded, user?.id, profile]);

  // Animate panel height open/close
  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start(() => {
      if (expanded) {
        setTimeout(() => {
          inputRef.current?.focus();
          scrollRef.current?.scrollToEnd({ animated: false });
        }, 50);
      }
    });
  }, [expanded]);

  useEffect(() => {
    if (expanded) scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setInput("");
      setSuggestionsOpen(false);
      setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
      setLoading(true);
      try {
        const reply = await askAi(trimmed, systemPrompt, { fast: true, maxTokens: 250 });
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
    [loading, systemPrompt]
  );

  const openFull = () => {
    setExpanded(false);
    router.push("/ai" as any);
  };

  const panelHeight = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 360],
  });

  return (
    <View style={styles.root}>
      <View style={[styles.divider, { backgroundColor: theme.divider }]} />

      {/* ── Expandable panel — rendered ABOVE the trigger pill ── */}
      <Animated.View
        style={[
          styles.panel,
          {
            height: panelHeight,
            backgroundColor: theme.surface,
            borderColor: theme.divider,
            overflow: "hidden",
          },
        ]}
        pointerEvents={expanded ? "auto" : "none"}
      >
        {/* Panel header */}
        <View style={[styles.panelHeader, { borderBottomColor: theme.divider }]}>
          <View style={styles.panelTitleRow}>
            <Ionicons name="sparkles" size={14} color={theme.accent} />
            <Text style={[styles.panelTitle, { color: theme.text }]}>AfuAI</Text>
            {!isGuest && (
              <View style={[styles.betaBadge, { borderColor: theme.divider }]}>
                <Text style={[styles.betaText, { color: theme.textMuted }]}>BETA</Text>
              </View>
            )}
            {isGuest && (
              <Pressable onPress={() => router.push("/(auth)/login" as any)}>
                <Text style={[styles.signInHint, { color: theme.accent }]}>Sign in for full access →</Text>
              </Pressable>
            )}
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
              <Ionicons name="chevron-down-outline" size={15} color={theme.textMuted} />
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
            <View key={i} style={[styles.msgRow, m.role === "user" && styles.msgRowUser]}>
              {m.role === "ai" ? (
                <View style={[styles.msgAiBubble, { backgroundColor: theme.hoverBg }]}>
                  <Text style={[styles.msgSender, { color: theme.accent }]}>AfuAI</Text>
                  <Text style={[styles.msgText, { color: theme.text }]}>{m.text}</Text>
                </View>
              ) : (
                <View style={[styles.msgUserBubble, { backgroundColor: theme.accent }]}>
                  <Text style={[styles.msgText, { color: "#fff" }]}>{m.text}</Text>
                </View>
              )}
            </View>
          ))}
          {loading && (
            <View style={[styles.msgAiBubble, { backgroundColor: theme.hoverBg }]}>
              <Text style={[styles.msgSender, { color: theme.accent }]}>AfuAI</Text>
              <ActivityIndicator size="small" color={theme.accent} style={{ alignSelf: "flex-start", marginTop: 2 }} />
            </View>
          )}
        </ScrollView>

        {/* Quick suggestions */}
        {suggestionsOpen && messages.length <= 1 && (
          <View style={[styles.suggestionsWrap, { borderTopColor: theme.divider }]}>
            <View style={styles.chips}>
              {(isGuest ? GUEST_SUGGESTIONS : AUTH_SUGGESTIONS).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => send(s)}
                  style={({ hovered }: any) => [
                    styles.chip,
                    { backgroundColor: hovered ? theme.hoverBg : "transparent", borderColor: theme.divider },
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
            placeholder={isGuest ? "Ask about AfuChat…" : "Ask me anything…"}
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
              { backgroundColor: input.trim() && !loading ? theme.accent : theme.hoverBg },
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

      {/* ── Trigger pill — always anchored at the bottom ── */}
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={({ hovered, pressed }: any) => [
          styles.pill,
          {
            backgroundColor: pressed
              ? theme.activeBg
              : hovered
                ? theme.hoverBg
                : "transparent",
          },
        ]}
      >
        <Ionicons name="sparkles-outline" size={17} color={theme.accent} />
        <Text style={[styles.pillText, { color: theme.text }]}>Ask AfuAI…</Text>
        <Ionicons
          name={expanded ? "chevron-down" : "chevron-up"}
          size={13}
          color={theme.textMuted}
        />
      </Pressable>
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
  panel: {
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 6,
    marginBottom: 2,
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
    flex: 1,
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
  signInHint: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
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
    flex: 1,
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
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
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
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  pillText: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
  },
});
