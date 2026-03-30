import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
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
  user_id: string | null;
  email: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  user?: { display_name: string; handle: string; avatar_url: string | null } | null;
};

type Message = {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_type: "user" | "staff" | "system";
  message: string;
  is_internal: boolean;
  created_at: string;
  sender?: { display_name: string; handle: string } | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: "Open", color: "#1a7f1a", bg: "#e3f9e5" },
  in_progress: { label: "In Progress", color: "#0066cc", bg: "#e5f5ff" },
  resolved: { label: "Resolved", color: "#888", bg: "#f0f0f0" },
  closed: { label: "Closed", color: "#555", bg: "#e0e0e0" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "#888" },
  normal: { label: "Normal", color: "#444" },
  high: { label: "High", color: "#FF9500" },
  urgent: { label: "Urgent", color: "#FF3B30" },
};

export default function SupportDashboard() {
  const { colors } = useTheme();
  const { profile, user } = useAuth();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  // Guard: only admins and support staff
  const isStaff = profile?.is_admin || profile?.is_support_staff;

  const [filterStatus, setFilterStatus] = useState<string>("open");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active thread
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [changeStatusModal, setChangeStatusModal] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState({ open: 0, in_progress: 0, resolved: 0, total: 0 });

  const fetchStats = useCallback(async () => {
    const { data } = await supabase.from("support_tickets").select("status");
    if (!data) return;
    const counts = { open: 0, in_progress: 0, resolved: 0, total: data.length };
    for (const r of data) {
      if (r.status in counts) (counts as any)[r.status]++;
    }
    setStats(counts);
  }, []);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const query = supabase
      .from("support_tickets")
      .select("*, user:profiles!support_tickets_user_id_fkey(display_name, handle, avatar_url)")
      .order("updated_at", { ascending: false });

    if (filterStatus !== "all") query.eq("status", filterStatus);

    const { data } = await query;
    setTickets((data || []) as Ticket[]);
    setLoading(false);
  }, [filterStatus]);

  const openThread = useCallback(async (ticket: Ticket) => {
    setActiveTicket(ticket);
    setThreadLoading(true);
    const { data } = await supabase
      .from("support_messages")
      .select("*, sender:profiles!support_messages_sender_id_fkey(display_name, handle)")
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true });
    setMessages((data || []) as Message[]);
    setThreadLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 200);
  }, []);

  useEffect(() => {
    fetchStats();
    fetchTickets();
  }, [fetchStats, fetchTickets]);

  // Realtime updates on ticket table
  useEffect(() => {
    const channel = supabase
      .channel("support-dashboard")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_tickets" }, () => {
        fetchTickets(); fetchStats();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets" }, (p) => {
        const updated = p.new as Ticket;
        setTickets((prev) => prev.map((t) => t.id === updated.id ? { ...t, ...updated } : t));
        if (activeTicket?.id === updated.id) setActiveTicket((prev) => prev ? { ...prev, ...updated } : prev);
        fetchStats();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (p) => {
        const msg = p.new as Message;
        if (msg.ticket_id === activeTicket?.id) {
          setMessages((prev) => [...prev, msg]);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        }
        fetchTickets();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeTicket?.id, fetchTickets, fetchStats]);

  async function sendReply() {
    if (!reply.trim() || !user || !activeTicket) return;
    setSending(true);
    const text = reply.trim();
    setReply("");

    const { error } = await supabase.from("support_messages").insert({
      ticket_id: activeTicket.id,
      sender_id: user.id,
      sender_type: "staff",
      message: text,
      is_internal: isInternal,
    });

    if (error) {
      showAlert("Error", "Failed to send reply");
      setReply(text);
    } else {
      // Update ticket to in_progress if it was open
      if (activeTicket.status === "open" && !isInternal) {
        await supabase.from("support_tickets").update({ status: "in_progress", assigned_to: user.id, updated_at: new Date().toISOString() }).eq("id", activeTicket.id);
      } else {
        await supabase.from("support_tickets").update({ updated_at: new Date().toISOString() }).eq("id", activeTicket.id);
      }
    }
    setSending(false);
  }

  async function updateStatus(newStatus: string) {
    if (!activeTicket) return;
    const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === "resolved") updates.resolved_at = new Date().toISOString();
    await supabase.from("support_tickets").update(updates).eq("id", activeTicket.id);
    setActiveTicket((prev) => prev ? { ...prev, status: newStatus } : prev);
    setChangeStatusModal(false);
    fetchStats();
  }

  async function updatePriority(priority: string) {
    if (!activeTicket) return;
    await supabase.from("support_tickets").update({ priority, updated_at: new Date().toISOString() }).eq("id", activeTicket.id);
    setActiveTicket((prev) => prev ? { ...prev, priority } : prev);
    setTickets((prev) => prev.map((t) => t.id === activeTicket.id ? { ...t, priority } : t));
  }

  if (!isStaff) {
    return (
      <View style={[st.root, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="lock-closed" size={52} color={colors.textMuted} />
        <Text style={[st.emptyTitle, { color: colors.text, marginTop: 16 }]}>Access Restricted</Text>
        <Text style={[st.emptySub, { color: colors.textMuted }]}>This dashboard is only accessible to support staff.</Text>
        <TouchableOpacity style={[st.pill, { borderColor: BRAND, marginTop: 20 }]} onPress={() => router.back()}>
          <Text style={[st.pillText, { color: BRAND }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 12, backgroundColor: BRAND }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.iconBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>Support Dashboard</Text>
          <Text style={st.headerSub}>
            {stats.open} open · {stats.in_progress} in progress · {stats.total} total
          </Text>
        </View>
      </View>

      <View style={st.splitPane}>
        {/* Left: Ticket list */}
        <View style={[st.leftPane, { borderRightColor: colors.border }]}>
          {/* Stats bar */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[st.statBar, { borderBottomColor: colors.border }]} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
            {[
              { key: "all", label: "All", count: stats.total },
              { key: "open", label: "Open", count: stats.open },
              { key: "in_progress", label: "In Progress", count: stats.in_progress },
              { key: "resolved", label: "Resolved", count: stats.resolved },
            ].map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[st.statChip, { backgroundColor: filterStatus === s.key ? BRAND : colors.surface, borderColor: filterStatus === s.key ? BRAND : colors.border }]}
                onPress={() => setFilterStatus(s.key)}
              >
                <Text style={[st.statChipText, { color: filterStatus === s.key ? "#fff" : colors.text }]}>{s.label} ({s.count})</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? (
            <View style={st.centered}><ActivityIndicator color={BRAND} /></View>
          ) : (
            <FlatList
              data={tickets}
              keyExtractor={(t) => t.id}
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await fetchTickets(); setRefreshing(false); }}
              contentContainerStyle={{ padding: 8 }}
              ListEmptyComponent={
                <View style={st.emptySmall}>
                  <Ionicons name="checkmark-circle-outline" size={36} color={colors.textMuted} />
                  <Text style={[st.emptySmallText, { color: colors.textMuted }]}>No {filterStatus === "all" ? "" : filterStatus} tickets</Text>
                </View>
              }
              renderItem={({ item }) => {
                const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.open;
                const pCfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
                const isActive = activeTicket?.id === item.id;
                const shortId = item.id.split("-")[0].toUpperCase();
                return (
                  <TouchableOpacity
                    style={[st.ticketItem, { backgroundColor: isActive ? BRAND + "15" : colors.surface, borderColor: isActive ? BRAND : colors.border }]}
                    onPress={() => openThread(item)}
                  >
                    <View style={st.ticketItemTop}>
                      <Text style={[st.ticketIdSmall, { color: colors.textMuted }]}>#{shortId}</Text>
                      <View style={[st.statusPill, { backgroundColor: cfg.bg }]}>
                        <Text style={[st.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    </View>
                    <Text style={[st.ticketSubjectSmall, { color: colors.text }]} numberOfLines={1}>{item.subject}</Text>
                    <Text style={[st.ticketMetaSmall, { color: colors.textMuted }]} numberOfLines={1}>
                      {item.user?.display_name || item.email} · <Text style={{ color: pCfg.color }}>{pCfg.label}</Text>
                    </Text>
                    <Text style={[st.ticketTime, { color: colors.textMuted }]}>{new Date(item.updated_at).toLocaleDateString()}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>

        {/* Right: Thread view */}
        <View style={st.rightPane}>
          {!activeTicket ? (
            <View style={st.noTicket}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
              <Text style={[st.noTicketText, { color: colors.textMuted }]}>Select a ticket to view the thread</Text>
            </View>
          ) : (
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
              {/* Thread header */}
              <View style={[st.threadHeader, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.threadSubject, { color: colors.text }]} numberOfLines={1}>{activeTicket.subject}</Text>
                  <Text style={[st.threadMeta, { color: colors.textMuted }]}>
                    {activeTicket.user?.display_name || activeTicket.email} · {activeTicket.category}
                  </Text>
                </View>
                <View style={st.threadActions}>
                  {/* Priority selector */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                      <TouchableOpacity
                        key={key}
                        style={[st.microPill, { borderColor: activeTicket.priority === key ? cfg.color : colors.border }]}
                        onPress={() => updatePriority(key)}
                      >
                        <Text style={[st.microPillText, { color: cfg.color }]}>{cfg.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity style={[st.statusBtn, { backgroundColor: STATUS_CONFIG[activeTicket.status]?.bg || "#eee" }]} onPress={() => setChangeStatusModal(true)}>
                    <Text style={[st.statusBtnText, { color: STATUS_CONFIG[activeTicket.status]?.color || "#444" }]}>
                      {STATUS_CONFIG[activeTicket.status]?.label || activeTicket.status}
                    </Text>
                    <Ionicons name="chevron-down" size={12} color={STATUS_CONFIG[activeTicket.status]?.color || "#444"} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Messages */}
              {threadLoading ? (
                <View style={st.centered}><ActivityIndicator color={BRAND} /></View>
              ) : (
                <FlatList
                  ref={listRef}
                  data={messages}
                  keyExtractor={(m) => m.id}
                  contentContainerStyle={{ padding: 16, gap: 12 }}
                  ListEmptyComponent={
                    <View style={st.noMsgs}>
                      <Text style={[st.noMsgsText, { color: colors.textMuted }]}>No messages in this ticket</Text>
                    </View>
                  }
                  renderItem={({ item }) => {
                    const isUser = item.sender_type === "user";
                    const isSystem = item.sender_type === "system";

                    if (isSystem) {
                      return <View style={st.systemMsg}><Text style={[st.systemMsgText, { color: colors.textMuted }]}>{item.message}</Text></View>;
                    }

                    const senderName = isUser
                      ? (item.sender?.display_name || activeTicket?.user?.display_name || activeTicket?.email || "User")
                      : (item.sender?.display_name || "Staff");

                    return (
                      <View style={[st.msgRow, isUser ? st.msgRowLeft : st.msgRowRight]}>
                        <View style={[st.avatar, { backgroundColor: isUser ? "#FF9500" : BRAND }]}>
                          <Text style={st.avatarText}>{senderName[0]?.toUpperCase()}</Text>
                        </View>
                        <View style={st.msgCol}>
                          <View style={st.msgMeta}>
                            <Text style={[st.msgSender, { color: colors.textMuted }]}>{senderName}</Text>
                            {item.is_internal && (
                              <View style={[st.internalBadge, { backgroundColor: "#FFF3CD" }]}>
                                <Text style={{ fontSize: 10, color: "#856404", fontFamily: "Inter_600SemiBold" }}>Internal Note</Text>
                              </View>
                            )}
                            <Text style={[st.msgTime, { color: colors.textMuted }]}>{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                          </View>
                          <View style={[st.bubble, item.is_internal ? { backgroundColor: "#FFFBEB", borderColor: "#FFC107" } : isUser ? { backgroundColor: "#F5F5F5", borderColor: colors.border } : { backgroundColor: BRAND + "18", borderColor: BRAND + "30" }]}>
                            <Text style={[st.bubbleText, { color: colors.text }]}>{item.message}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  }}
                />
              )}

              {/* Reply bar */}
              <View style={[st.replyBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 8, backgroundColor: colors.background }]}>
                <View style={st.replyToggle}>
                  <TouchableOpacity
                    style={[st.toggleBtn, !isInternal && { backgroundColor: BRAND }]}
                    onPress={() => setIsInternal(false)}
                  >
                    <Text style={[st.toggleBtnText, { color: !isInternal ? "#fff" : colors.textMuted }]}>Reply to User</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.toggleBtn, isInternal && { backgroundColor: "#FFC107" }]}
                    onPress={() => setIsInternal(true)}
                  >
                    <Text style={[st.toggleBtnText, { color: isInternal ? "#fff" : colors.textMuted }]}>Internal Note</Text>
                  </TouchableOpacity>
                </View>
                <View style={st.replyRow}>
                  <TextInput
                    style={[st.replyInput, { backgroundColor: colors.surface, borderColor: isInternal ? "#FFC107" : colors.border, color: colors.text }]}
                    value={reply}
                    onChangeText={setReply}
                    placeholder={isInternal ? "Add internal note (not sent to user)..." : "Write reply to user..."}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    maxLength={5000}
                  />
                  <TouchableOpacity
                    style={[st.sendBtn, { backgroundColor: reply.trim() ? (isInternal ? "#FFC107" : BRAND) : colors.border }]}
                    onPress={sendReply}
                    disabled={sending || !reply.trim()}
                  >
                    {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          )}
        </View>
      </View>

      {/* Change Status Modal */}
      <Modal visible={changeStatusModal} transparent animationType="fade" onRequestClose={() => setChangeStatusModal(false)}>
        <TouchableOpacity style={st.modalOverlay} activeOpacity={1} onPress={() => setChangeStatusModal(false)}>
          <View style={[st.statusModal, { backgroundColor: colors.surface }]}>
            <Text style={[st.modalTitle, { color: colors.text }]}>Change Status</Text>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <TouchableOpacity
                key={key}
                style={[st.statusOption, activeTicket?.status === key && { backgroundColor: cfg.bg }]}
                onPress={() => updateStatus(key)}
              >
                <View style={[st.statusDot, { backgroundColor: cfg.color }]} />
                <Text style={[st.statusOptionText, { color: cfg.color }]}>{cfg.label}</Text>
                {activeTicket?.status === key && <Ionicons name="checkmark" size={16} color={cfg.color} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  splitPane: { flex: 1, flexDirection: "row" },
  leftPane: { width: 280, borderRightWidth: StyleSheet.hairlineWidth },
  rightPane: { flex: 1 },
  statBar: { maxHeight: 52 },
  statChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  statChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptySmall: { padding: 32, alignItems: "center", gap: 8 },
  emptySmallText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  ticketItem: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginBottom: 6, gap: 3 },
  ticketItemTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ticketIdSmall: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statusPill: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  statusPillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  ticketSubjectSmall: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  ticketMetaSmall: { fontSize: 11, fontFamily: "Inter_400Regular" },
  ticketTime: { fontSize: 10, fontFamily: "Inter_400Regular" },
  noTicket: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  noTicketText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  threadHeader: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  threadSubject: { fontSize: 16, fontFamily: "Inter_700Bold" },
  threadMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  threadActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  microPill: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4 },
  microPillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statusBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  noMsgs: { padding: 32, alignItems: "center" },
  noMsgsText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  systemMsg: { alignItems: "center", padding: 6 },
  systemMsgText: { fontSize: 11, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  msgRow: { flexDirection: "row", gap: 10, maxWidth: "90%" },
  msgRowLeft: { alignSelf: "flex-start" },
  msgRowRight: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 18 },
  avatarText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  msgCol: { flex: 1 },
  msgMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  msgSender: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  internalBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular" },
  bubble: { borderRadius: 12, padding: 12, borderWidth: 1 },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  replyBar: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  replyToggle: { flexDirection: "row", gap: 4 },
  toggleBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: "center" },
  toggleBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  replyRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  replyInput: { flex: 1, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 100 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  statusModal: { borderRadius: 16, padding: 20, width: 280, gap: 4 },
  modalTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 12 },
  statusOption: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusOptionText: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  pill: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 10 },
  pillText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
