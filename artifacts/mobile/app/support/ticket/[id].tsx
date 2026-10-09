import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
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
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { ChatBubbleSkeleton } from "@/components/ui/Skeleton";
import { showAlert } from "@/lib/alert";

const BRAND_FALLBACK = Colors.brand;

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  email: string;
  created_at: string;
};

type Message = {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_type: "user" | "staff" | "ai" | "system";
  message: string;
  is_internal: boolean;
  created_at: string;
  sender?: { display_name: string; handle: string; avatar_url: string | null } | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  open:        { label: "Open",        color: "#34C759", bg: "#34C75920", icon: "radio-button-on" },
  in_progress: { label: "In Progress", color: "#007AFF", bg: "#007AFF20", icon: "sync-circle" },
  resolved:    { label: "Resolved",    color: "#8E8E93", bg: "#8E8E9320", icon: "checkmark-circle" },
  closed:      { label: "Closed",      color: "#636366", bg: "#63636620", icon: "lock-closed" },
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "#8E8E93", normal: "#007AFF", high: "#FF9500", urgent: "#FF3B30",
};

function AiTypingIndicator({ colors }: { colors: any }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 350, useNativeDriver: true }),
        ])
      );

    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 180);
    const a3 = pulse(dot3, 360);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={[st.aiTypingWrap, { backgroundColor: "#7C3AED10", borderColor: "#7C3AED25" }]}>
      <LinearGradient colors={["#7C3AED", "#6D28D9"]} style={st.aiTypingIcon}>
        <Ionicons name="bulb-outline" size={10} color="#fff" />
      </LinearGradient>
      <Text style={[st.aiTypingLabel, { color: "#7C3AED" }]}>AI is drafting a reply</Text>
      <View style={st.dotsRow}>
        {[dot1, dot2, dot3].map((d, i) => (
          <Animated.View key={i} style={[st.dot, { opacity: d, backgroundColor: "#7C3AED" }]} />
        ))}
      </View>
    </View>
  );
}

export default function TicketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const BRAND = colors.accent;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [showAiTyping, setShowAiTyping] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    const [{ data: t }, { data: msgs }] = await Promise.all([
      supabase
        .from("support_tickets")
        .select("id, subject, category, status, priority, email, created_at")
        .eq("id", id)
        .single(),
      supabase
        .from("support_messages")
        .select("id, ticket_id, sender_id, sender_type, message, is_internal, created_at, sender:profiles!support_messages_sender_id_fkey(display_name, handle, avatar_url)")
        .eq("ticket_id", id)
        .eq("is_internal", false)
        .order("created_at", { ascending: true }),
    ]);
    if (t) setTicket(t as Ticket);
    if (msgs) setMessages(msgs as unknown as Message[]);
    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 200);
  }, [id]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`user-ticket-${id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "afuchat",
        table: "support_messages",
        filter: `ticket_id=eq.${id}`,
      }, (payload) => {
        const newMsg = payload.new as Message;
        if (newMsg.is_internal) return;
        setShowAiTyping(false);
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === newMsg.id);
          return exists ? prev : [...prev, newMsg];
        });
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "afuchat",
        table: "support_tickets",
        filter: `id=eq.${id}`,
      }, (payload) => {
        setTicket((prev) => prev ? { ...prev, ...(payload.new as Ticket) } : prev);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

  // Show AI typing indicator for brand-new tickets (no non-user messages yet)
  useEffect(() => {
    if (!loading && messages.length > 0) {
      const hasNonUserMsg = messages.some(m => m.sender_type !== "user");
      if (!hasNonUserMsg) {
        const ticketAgeMs = ticket ? Date.now() - new Date(ticket.created_at).getTime() : Infinity;
        if (ticketAgeMs < 120_000) {
          setShowAiTyping(true);
          // Auto-hide after 45s if no AI message arrives
          const t = setTimeout(() => setShowAiTyping(false), 45_000);
          return () => clearTimeout(t);
        }
      }
    }
  }, [loading, messages, ticket]);

  async function sendReply() {
    if (!reply.trim() || !user || !id) return;
    if (ticket?.status === "closed") {
      showAlert("Ticket Closed", "This ticket is closed. Please open a new support request if you need further help.");
      return;
    }
    setSending(true);
    const text = reply.trim();
    setReply("");

    const { error } = await supabase.from("support_messages").insert({
      ticket_id: id,
      sender_id: user.id,
      sender_type: "user",
      message: text,
    });

    if (error) {
      showAlert("Error", "Failed to send message. Please try again.");
      setReply(text);
    } else if (ticket?.status === "resolved") {
      await supabase
        .from("support_tickets")
        .update({ status: "open", updated_at: new Date().toISOString() })
        .eq("id", id);
      setTicket((prev) => prev ? { ...prev, status: "open" } : prev);
    }
    setSending(false);
  }

  const statusCfg = STATUS_CONFIG[ticket?.status || "open"];
  const shortId = id?.split("-")[0].toUpperCase();

  if (loading) {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={[BRAND, BRAND + "CC"]}
          style={[st.header, { paddingTop: insets.top + 8 }]}
        >
          <TouchableOpacity onPress={() => router.back()} style={st.iconBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={st.headerTitle}>Support Ticket</Text>
        </LinearGradient>
        <View style={{ padding: 14, gap: 12 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <ChatBubbleSkeleton key={i} align={i % 2 === 0 ? "right" : "left"} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* ── Header ──────────────────────────────────────── */}
      <LinearGradient
        colors={[BRAND, BRAND + "CC"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[st.header, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={st.iconBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle} numberOfLines={1}>{ticket?.subject || "Support Ticket"}</Text>
          <Text style={st.headerSub}>#{shortId}</Text>
        </View>
        <View style={[st.statusChip, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
          <Ionicons name={statusCfg?.icon as any ?? "radio-button-on"} size={11} color="#fff" />
          <Text style={st.statusChipText}>{ticket?.status?.replace("_", " ").toUpperCase()}</Text>
        </View>
      </LinearGradient>

      {/* ── Info strip ──────────────────────────────────── */}
      <View style={[st.infoStrip, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={st.infoChip}>
          <Ionicons name="folder" size={12} color={colors.textMuted} />
          <Text style={[st.infoChipText, { color: colors.textMuted }]} numberOfLines={1}>
            {ticket?.category?.replace(/_/g, " ")}
          </Text>
        </View>
        <View style={st.infoSep} />
        <View style={st.infoChip}>
          <View style={[st.infoDot, { backgroundColor: statusCfg?.color ?? "#888" }]} />
          <Text style={[st.infoChipText, { color: statusCfg?.color ?? "#888", fontFamily: "Inter_600SemiBold" }]}>
            {ticket?.status?.replace("_", " ")}
          </Text>
        </View>
        <View style={st.infoSep} />
        <View style={st.infoChip}>
          <View style={[st.infoDot, { backgroundColor: PRIORITY_COLOR[ticket?.priority ?? "normal"] ?? "#007AFF" }]} />
          <Text style={[st.infoChipText, { color: colors.textMuted, textTransform: "capitalize" }]}>
            {ticket?.priority ?? "normal"}
          </Text>
        </View>
        <View style={st.infoSep} />
        <View style={st.infoChip}>
          <Ionicons name="calendar" size={12} color={colors.textMuted} />
          <Text style={[st.infoChipText, { color: colors.textMuted }]}>
            {ticket ? new Date(ticket.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""}
          </Text>
        </View>
      </View>

      {/* ── Messages ────────────────────────────────────── */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 12 }}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            <View style={[st.threadBanner, { backgroundColor: BRAND + "10", borderColor: BRAND + "28" }]}>
              <Ionicons name="information-circle" size={15} color={BRAND} />
              <Text style={[st.threadBannerText, { color: BRAND }]}>
                Replies appear here and via email. Our AI drafts an instant reply; a human reviews and follows up.
              </Text>
            </View>
          }
          ListFooterComponent={showAiTyping ? <AiTypingIndicator colors={colors} /> : null}
          ListEmptyComponent={
            <View style={st.emptyMsgs}>
              <Ionicons name="chatbubble" size={36} color={colors.textMuted} />
              <Text style={[st.emptyMsgsText, { color: colors.textMuted }]}>
                No messages yet. Add more context below to help us assist you faster.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isUser = item.sender_type === "user";
            const isSystem = item.sender_type === "system";
            const isAi = item.sender_type === "ai";

            // ── System pill ────────────────────────────────
            if (isSystem) {
              return (
                <View style={st.systemRow}>
                  <View style={[st.systemPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="information-circle" size={11} color={colors.textMuted} />
                    <Text style={[st.systemText, { color: colors.textMuted }]}>{item.message}</Text>
                  </View>
                </View>
              );
            }

            // ── AI draft bubble ────────────────────────────
            if (isAi) {
              return (
                <View style={st.aiBubbleWrap}>
                  <View style={st.aiAvatarRow}>
                    <LinearGradient colors={["#7C3AED", "#6D28D9"]} style={st.aiAvatar}>
                      <Ionicons name="bulb-outline" size={12} color="#fff" />
                    </LinearGradient>
                    <View style={st.aiLabelRow}>
                      <Text style={st.aiLabelName}>AI Assistant</Text>
                      <View style={st.aiDraftTag}>
                        <Text style={st.aiDraftTagText}>Draft · Pending review</Text>
                      </View>
                    </View>
                    <Text style={[st.msgTime, { color: colors.textMuted, marginLeft: "auto" }]}>
                      {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                  <View style={[st.aiBubble, { backgroundColor: "#7C3AED0D", borderColor: "#7C3AED30" }]}>
                    <Text style={[st.aiBubbleText, { color: colors.text }]}>{item.message}</Text>
                  </View>
                  <Text style={[st.aiDisclaimer, { color: colors.textMuted }]}>
                    AI-generated · A human support agent is reviewing this reply
                  </Text>
                </View>
              );
            }

            // ── User / Staff bubble ────────────────────────
            const senderName = isUser
              ? "You"
              : (item.sender?.display_name || "AfuChat Support");
            const msgTime = new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            return (
              <View style={[st.msgRow, isUser ? st.msgRowUser : st.msgRowStaff]}>
                {!isUser && (
                  <View style={[st.avatar, { backgroundColor: BRAND }]}>
                    <Ionicons name="headset" size={13} color="#fff" />
                  </View>
                )}
                <View style={[st.msgCol, isUser && { alignItems: "flex-end" }]}>
                  <Text style={[st.senderLabel, { color: isUser ? BRAND : colors.textMuted }]}>
                    {senderName}
                  </Text>
                  <View
                    style={[
                      st.bubble,
                      isUser
                        ? { backgroundColor: BRAND }
                        : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 0.5 },
                    ]}
                  >
                    <Text style={[st.bubbleText, { color: isUser ? "#fff" : colors.text }]}>
                      {item.message}
                    </Text>
                  </View>
                  <Text style={[st.msgTime, { color: colors.textMuted }]}>{msgTime}</Text>
                </View>
                {isUser && (
                  <View style={[st.avatar, { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border }]}>
                    <Ionicons name="person" size={13} color={BRAND} />
                  </View>
                )}
              </View>
            );
          }}
        />

        {/* ── Reply bar / Closed notice ────────────────── */}
        {ticket?.status === "closed" ? (
          <View style={[st.closedBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8, backgroundColor: colors.surface }]}>
            <View style={[st.closedIcon, { backgroundColor: colors.background }]}>
              <Ionicons name="lock-closed" size={15} color={colors.textMuted} />
            </View>
            <Text style={[st.closedText, { color: colors.textMuted }]}>
              Ticket closed. Open a new ticket if you need further help.
            </Text>
          </View>
        ) : (
          <View style={[
            st.inputBar,
            { paddingBottom: insets.bottom + 8 },
          ]}>
            <View style={[
              st.replyPill,
              { backgroundColor: colors.inputBg, borderColor: colors.border,
                ...Platform.select({
                  web: { boxShadow: "0 2px 14px rgba(0,0,0,0.13)" } as any,
                  default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.13, shadowRadius: 8, elevation: 4 },
                }),
              },
            ]}>
              <TextInput
                style={[st.replyInput, { color: colors.text }]}
                value={reply}
                onChangeText={setReply}
                placeholder="Write a message…"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={2000}
              />
            </View>
            <TouchableOpacity
              style={[
                st.sendBtn,
                { backgroundColor: reply.trim() ? BRAND : colors.border },
              ]}
              onPress={sendReply}
              disabled={sending || !reply.trim()}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={17} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12, gap: 10,
  },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  statusChipText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },

  infoStrip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 9,
    
  },
  infoChip: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  infoChipText: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  infoSep: { width: 0.5, height: 12, backgroundColor: "#ccc8", marginHorizontal: 2 },
  infoDot: { width: 7, height: 7, borderRadius: 3.5 },

  threadBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderRadius: 12, borderWidth: 0.5,
    padding: 11, marginBottom: 8,
  },
  threadBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  emptyMsgs: { padding: 40, alignItems: "center", gap: 10 },
  emptyMsgsText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  systemRow: { alignItems: "center" },
  systemPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 20, borderWidth: 0.5,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  systemText: { fontSize: 11, fontFamily: "Inter_400Regular", fontStyle: "italic" },

  aiBubbleWrap: { alignSelf: "flex-start", maxWidth: "90%", gap: 5 },
  aiAvatarRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiAvatar: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  aiLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiLabelName: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#7C3AED" },
  aiDraftTag: {
    borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2,
    backgroundColor: "#7C3AED18",
  },
  aiDraftTagText: { fontSize: 10, fontFamily: "Inter_500Medium", color: "#7C3AED" },
  aiBubble: {
    borderTopLeftRadius: 3, borderTopRightRadius: 16,
    borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
    borderWidth: 1, padding: 13,
  },
  aiBubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  aiDisclaimer: { fontSize: 10, fontFamily: "Inter_400Regular", fontStyle: "italic", paddingLeft: 34 },

  aiTypingWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 0.5,
    padding: 10, marginTop: 6, alignSelf: "flex-start",
  },
  aiTypingIcon: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  aiTypingLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  dotsRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },

  msgRow: { flexDirection: "row", gap: 8, maxWidth: "88%" },
  msgRowUser: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  msgRowStaff: { alignSelf: "flex-start" },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center", marginTop: 22,
  },
  msgCol: { flex: 1 },
  senderLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  bubble: { borderRadius: 16, padding: 12 },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 4 },

  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    padding: 12, paddingTop: 10, 
  },
  replyPill: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 0.5,
    overflow: "hidden",
    justifyContent: "center",
    ...Platform.select({
      web: { boxShadow: "0 4px 20px rgba(0,0,0,0.13)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.13, shadowRadius: 12, elevation: 8 },
    }),
  },
  replyInput: {
    flex: 1,
    paddingHorizontal: 16, paddingVertical: 11,
    fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 110,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },

  closedBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, 
  },
  closedIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  closedText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
