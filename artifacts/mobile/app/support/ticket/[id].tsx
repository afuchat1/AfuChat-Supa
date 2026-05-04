import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
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
  sender_type: "user" | "staff" | "system";
  message: string;
  is_internal: boolean;
  created_at: string;
  sender?: { display_name: string; handle: string; avatar_url: string | null } | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: "Open", color: "#1a7f1a", bg: "#e3f9e5" },
  in_progress: { label: "In Progress", color: "#0066cc", bg: "#e5f5ff" },
  resolved: { label: "Resolved", color: "#888", bg: "#f0f0f0" },
  closed: { label: "Closed", color: "#555", bg: "#e0e0e0" },
};

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

  const fetchData = useCallback(async () => {
    if (!id) return;
    const [{ data: t }, { data: msgs }] = await Promise.all([
      supabase.from("support_tickets").select("*").eq("id", id).single(),
      supabase
        .from("support_messages")
        .select("*, sender:profiles!support_messages_sender_id_fkey(display_name, handle, avatar_url)")
        .eq("ticket_id", id)
        .eq("is_internal", false)
        .order("created_at", { ascending: true }),
    ]);
    if (t) setTicket(t as Ticket);
    if (msgs) setMessages(msgs as Message[]);
    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 200);
  }, [id]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel(`user-ticket-${id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "support_messages",
        filter: `ticket_id=eq.${id}`,
      }, (payload) => {
        const newMsg = payload.new as Message;
        if (newMsg.is_internal) return;
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === newMsg.id);
          return exists ? prev : [...prev, newMsg];
        });
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "support_tickets",
        filter: `id=eq.${id}`,
      }, (payload) => {
        setTicket((prev) => prev ? { ...prev, ...(payload.new as Ticket) } : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

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
    } else {
      if (ticket?.status === "resolved") {
        await supabase.from("support_tickets").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", id);
        setTicket((prev) => prev ? { ...prev, status: "open" } : prev);
      }
    }
    setSending(false);
  }

  const statusCfg = STATUS_CONFIG[ticket?.status || "open"];
  const shortId = id?.split("-")[0].toUpperCase();

  if (loading) {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <View style={[st.header, { backgroundColor: BRAND, paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => router.back()} style={st.iconBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={st.headerTitle}>Support Ticket</Text>
        </View>
        <View style={{ padding: 12, gap: 10 }}>{[1,2,3,4,5].map(i => <ChatBubbleSkeleton key={i} />)}</View>
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { backgroundColor: BRAND, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.iconBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle} numberOfLines={1}>{ticket?.subject || "Support Ticket"}</Text>
          <Text style={st.headerSub}>#{shortId}</Text>
        </View>
        <View style={[st.statusBadge, { backgroundColor: "rgba(255,255,255,0.22)" }]}>
          <View style={st.statusDot} />
          <Text style={st.statusBadgeText}>{ticket?.status?.replace("_", " ").toUpperCase()}</Text>
        </View>
      </View>

      {/* Info strip */}
      <View style={[st.infoStrip, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={st.infoChip}>
          <Ionicons name="folder-outline" size={13} color={colors.textMuted} />
          <Text style={[st.infoChipText, { color: colors.textMuted }]} numberOfLines={1}>
            {ticket?.category?.replace(/_/g, " ")}
          </Text>
        </View>
        <View style={st.infoSep} />
        <View style={st.infoChip}>
          <View style={[st.infoDot, { backgroundColor: statusCfg?.color || "#888" }]} />
          <Text style={[st.infoChipText, { color: statusCfg?.color || "#888", fontFamily: "Inter_600SemiBold" }]}>
            {ticket?.status?.replace("_", " ")}
          </Text>
        </View>
        <View style={st.infoSep} />
        <View style={st.infoChip}>
          <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
          <Text style={[st.infoChipText, { color: colors.textMuted }]}>
            {ticket ? new Date(ticket.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""}
          </Text>
        </View>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 52 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 12 }}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            <View style={[st.threadNotice, { backgroundColor: BRAND + "12", borderColor: BRAND + "30" }]}>
              <Ionicons name="information-circle-outline" size={16} color={BRAND} />
              <Text style={[st.threadNoticeText, { color: BRAND }]}>
                Our support team will review your request and respond here and via email.
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={st.emptyMsgs}>
              <Ionicons name="chatbubble-outline" size={36} color={colors.textMuted} />
              <Text style={[st.emptyMsgsText, { color: colors.textMuted }]}>
                No messages yet. Add more details below to help us assist you faster.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isUser = item.sender_type === "user";
            const isSystem = item.sender_type === "system";

            if (isSystem) {
              return (
                <View style={st.systemMsgRow}>
                  <View style={[st.systemMsgPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="information-circle-outline" size={12} color={colors.textMuted} />
                    <Text style={[st.systemMsgText, { color: colors.textMuted }]}>{item.message}</Text>
                  </View>
                </View>
              );
            }

            const senderName = isUser ? "You" : (item.sender?.display_name || "AfuChat Support");
            const msgTime = new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            return (
              <View style={[st.msgRow, isUser ? st.msgRowUser : st.msgRowStaff]}>
                {!isUser && (
                  <View style={[st.avatar, { backgroundColor: BRAND }]}>
                    <Ionicons name="headset" size={14} color="#fff" />
                  </View>
                )}
                <View style={st.msgCol}>
                  <Text style={[st.senderLabel, { color: isUser ? BRAND : colors.textMuted, textAlign: isUser ? "right" : "left" }]}>
                    {senderName}
                  </Text>
                  <View
                    style={[
                      st.bubble,
                      isUser
                        ? { backgroundColor: BRAND, borderColor: "transparent" }
                        : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
                    ]}
                  >
                    <Text style={[st.bubbleText, { color: isUser ? "#fff" : colors.text }]}>
                      {item.message}
                    </Text>
                  </View>
                  <Text style={[st.msgTime, { color: colors.textMuted, textAlign: isUser ? "right" : "left" }]}>
                    {msgTime}
                  </Text>
                </View>
                {isUser && (
                  <View style={[st.avatar, { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
                    <Ionicons name="person" size={14} color={BRAND} />
                  </View>
                )}
              </View>
            );
          }}
        />

        {/* Reply input / closed notice */}
        {ticket?.status === "closed" ? (
          <View style={[st.closedBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8, backgroundColor: colors.surface }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
            <Text style={[st.closedText, { color: colors.textMuted }]}>
              This ticket is closed. Open a new ticket if you need further assistance.
            </Text>
          </View>
        ) : (
          <View style={[st.inputBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8, backgroundColor: colors.background }]}>
            <TextInput
              style={[st.replyInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={reply}
              onChangeText={setReply}
              placeholder="Write a message…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[st.sendBtn, { backgroundColor: reply.trim() ? BRAND : colors.border }]}
              onPress={sendReply}
              disabled={sending || !reply.trim()}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
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
    paddingHorizontal: 16, paddingBottom: 14, gap: 10,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  statusBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },

  infoStrip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoChip: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1 },
  infoChipText: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  infoSep: { width: StyleSheet.hairlineWidth, height: 14, backgroundColor: "#ccc", marginHorizontal: 4 },
  infoDot: { width: 7, height: 7, borderRadius: 4 },

  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  threadNotice: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 12, marginBottom: 4,
  },
  threadNoticeText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  emptyMsgs: { padding: 40, alignItems: "center", gap: 10 },
  emptyMsgsText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  systemMsgRow: { alignItems: "center" },
  systemMsgPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 20, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  systemMsgText: { fontSize: 11, fontFamily: "Inter_400Regular", fontStyle: "italic" },

  msgRow: { flexDirection: "row", gap: 8, maxWidth: "88%" },
  msgRowUser: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  msgRowStaff: { alignSelf: "flex-start" },
  avatar: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center", marginTop: 20,
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
  replyInput: {
    flex: 1, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 11,
    fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 110,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },

  closedBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 16, borderTopWidth: StyleSheet.hairlineWidth,
  },
  closedText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
