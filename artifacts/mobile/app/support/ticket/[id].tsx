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
import { showAlert } from "@/lib/alert";

const BRAND = Colors.brand;

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

const STATUS_COLORS: Record<string, string> = {
  open: "#1a7f1a",
  in_progress: "#0066cc",
  resolved: "#888",
  closed: "#888",
};

export default function TicketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
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
  }, [id]);

  useEffect(() => {
    fetchData();

    // Realtime subscription for new messages
    const channel = supabase
      .channel(`ticket-${id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "support_messages",
        filter: `ticket_id=eq.${id}`,
      }, (payload) => {
        const newMsg = payload.new as Message;
        if (newMsg.is_internal) return;
        setMessages((prev) => [...prev, newMsg]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

  async function sendReply() {
    if (!reply.trim() || !user || !id) return;
    if (ticket?.status === "closed") {
      showAlert("Ticket Closed", "This ticket has been closed. Please open a new support request.");
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
      // Re-open ticket if resolved
      if (ticket?.status === "resolved") {
        await supabase.from("support_tickets").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", id);
        setTicket((prev) => prev ? { ...prev, status: "open" } : prev);
      }
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
    setSending(false);
  }

  if (loading) {
    return (
      <View style={[st.root, { backgroundColor: colors.background }]}>
        <View style={[st.header, { paddingTop: insets.top + 12, backgroundColor: BRAND }]}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={st.headerTitle}>Support Ticket</Text>
        </View>
        <ActivityIndicator style={{ flex: 1 }} color={BRAND} />
      </View>
    );
  }

  const statusColor = STATUS_COLORS[ticket?.status || "open"];
  const shortId = id?.split("-")[0].toUpperCase();

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 12, backgroundColor: BRAND }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={st.headerTextCol}>
          <Text style={st.headerTitle} numberOfLines={1}>{ticket?.subject || "Ticket"}</Text>
          <Text style={st.headerSub}>#{shortId}</Text>
        </View>
        <View style={[st.statusBadgeHeader, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
          <Text style={st.statusBadgeText}>{ticket?.status?.replace("_", " ").toUpperCase()}</Text>
        </View>
      </View>

      {/* Ticket info strip */}
      <View style={[st.infoStrip, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={st.infoItem}>
          <Ionicons name="folder-outline" size={13} color={colors.textMuted} />
          <Text style={[st.infoText, { color: colors.textMuted }]} numberOfLines={1}>{ticket?.category}</Text>
        </View>
        <View style={st.infoItem}>
          <View style={[st.dot, { backgroundColor: statusColor }]} />
          <Text style={[st.infoText, { color: statusColor, fontFamily: "Inter_600SemiBold" }]}>{ticket?.status?.replace("_", " ")}</Text>
        </View>
        <View style={st.infoItem}>
          <Ionicons name="time-outline" size={13} color={colors.textMuted} />
          <Text style={[st.infoText, { color: colors.textMuted }]}>{ticket ? new Date(ticket.created_at).toLocaleDateString() : ""}</Text>
        </View>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 8 }}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={st.noMsgs}>
              <Text style={[st.noMsgsText, { color: colors.textMuted }]}>No messages yet — start by describing your issue.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isUser = item.sender_type === "user";
            const isSystem = item.sender_type === "system";

            if (isSystem) {
              return (
                <View style={st.systemMsg}>
                  <Text style={[st.systemMsgText, { color: colors.textMuted }]}>{item.message}</Text>
                </View>
              );
            }

            const senderName = isUser ? "You" : (item.sender?.display_name || "AfuChat Support");

            return (
              <View style={[st.msgRow, isUser ? st.msgRowUser : st.msgRowStaff]}>
                {!isUser && (
                  <View style={[st.avatarCircle, { backgroundColor: BRAND }]}>
                    <Text style={st.avatarText}>S</Text>
                  </View>
                )}
                <View style={st.msgCol}>
                  <Text style={[st.senderName, { color: isUser ? BRAND : colors.textMuted }]}>{senderName}</Text>
                  <View style={[st.bubble, isUser ? st.bubbleUser : { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[st.bubbleText, { color: isUser ? "#fff" : colors.text }]}>{item.message}</Text>
                  </View>
                  <Text style={[st.msgTime, { color: colors.textMuted }]}>{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
              </View>
            );
          }}
        />

        {/* Reply input */}
        {ticket?.status !== "closed" ? (
          <View style={[st.inputBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8, backgroundColor: colors.background }]}>
            <TextInput
              style={[st.replyInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={reply}
              onChangeText={setReply}
              placeholder="Write a message..."
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
        ) : (
          <View style={[st.closedBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
            <Text style={[st.closedText, { color: colors.textMuted }]}>This ticket is closed. Open a new ticket if you need further help.</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTextCol: { flex: 1 },
  headerTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  statusBadgeHeader: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  infoStrip: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  infoItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  infoText: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  noMsgs: { padding: 32, alignItems: "center" },
  noMsgsText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  systemMsg: { alignItems: "center", padding: 8 },
  systemMsgText: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  msgRow: { flexDirection: "row", gap: 8, maxWidth: "90%" },
  msgRowUser: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  msgRowStaff: { alignSelf: "flex-start" },
  avatarCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 20 },
  avatarText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  msgCol: { flex: 1 },
  senderName: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 3, textAlign: "left" },
  bubble: { borderRadius: 14, padding: 12, borderWidth: StyleSheet.hairlineWidth },
  bubbleUser: { backgroundColor: BRAND, borderColor: "transparent" },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 3 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", padding: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  replyInput: { flex: 1, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 100 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  closedBar: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  closedText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
});
