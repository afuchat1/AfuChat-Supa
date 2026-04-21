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
  useWindowDimensions,
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

const BRAND_FALLBACK = Colors.brand;

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

const PRIORITY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  low: { label: "Low", color: "#8a8a8a", icon: "arrow-down-outline" },
  normal: { label: "Normal", color: "#444", icon: "remove-outline" },
  high: { label: "High", color: "#FF9500", icon: "arrow-up-outline" },
  urgent: { label: "Urgent", color: "#FF3B30", icon: "alert-circle-outline" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SupportDashboard() {
  const { colors } = useTheme();
  const BRAND = colors.accent;
  const { profile, user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList>(null);

  const isTablet = width >= 768;
  const isStaff = profile?.is_admin || profile?.is_support_staff;

  const [filterStatus, setFilterStatus] = useState<string>("open");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [changeStatusModal, setChangeStatusModal] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [showThread, setShowThread] = useState(false);

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
    setShowThread(true);
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

  useEffect(() => {
    const channel = supabase
      .channel("support-dashboard-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_tickets" }, () => {
        fetchTickets(); fetchStats();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets" }, (p) => {
        const updated = p.new as Ticket;
        setTickets((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
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
    setTickets((prev) => prev.map((t) => (t.id === activeTicket.id ? { ...t, priority } : t)));
  }

  if (!isStaff) {
    return (
      <View style={[st.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[st.header, { backgroundColor: BRAND, paddingTop: 12 }]}>
          <TouchableOpacity onPress={() => router.back()} style={st.iconBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={st.headerTitle}>Support Dashboard</Text>
        </View>
        <View style={st.centered}>
          <View style={[st.lockCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="lock-closed" size={48} color={colors.textMuted} />
            <Text style={[st.lockTitle, { color: colors.text }]}>Access Restricted</Text>
            <Text style={[st.lockSub, { color: colors.textMuted }]}>This dashboard is only accessible to support staff and administrators.</Text>
            <TouchableOpacity style={[st.lockBtn, { backgroundColor: BRAND }]} onPress={() => router.back()}>
              <Text style={st.lockBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const renderTicketList = () => (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[st.filterBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
      >
        {[
          { key: "all", label: "All", count: stats.total },
          { key: "open", label: "Open", count: stats.open },
          { key: "in_progress", label: "In Progress", count: stats.in_progress },
          { key: "resolved", label: "Resolved", count: stats.resolved },
        ].map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[
              st.filterChip,
              { backgroundColor: filterStatus === s.key ? BRAND : colors.surface, borderColor: filterStatus === s.key ? BRAND : colors.border },
            ]}
            onPress={() => setFilterStatus(s.key)}
          >
            <Text style={[st.filterChipText, { color: filterStatus === s.key ? "#fff" : colors.text }]}>
              {s.label}
            </Text>
            <View style={[st.filterBadge, { backgroundColor: filterStatus === s.key ? "rgba(255,255,255,0.25)" : colors.border }]}>
              <Text style={[st.filterBadgeText, { color: filterStatus === s.key ? "#fff" : colors.textMuted }]}>{s.count}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={st.centered}><ActivityIndicator color={BRAND} size="large" /></View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await fetchTickets(); setRefreshing(false); }}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: insets.bottom + 20 }}
          ListEmptyComponent={
            <View style={st.emptyList}>
              <Ionicons name="checkmark-circle-outline" size={44} color={colors.textMuted} />
              <Text style={[st.emptyListTitle, { color: colors.text }]}>All clear!</Text>
              <Text style={[st.emptyListSub, { color: colors.textMuted }]}>No {filterStatus === "all" ? "" : filterStatus} tickets right now.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.open;
            const pCfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
            const isActive = isTablet && activeTicket?.id === item.id;
            const shortId = item.id.split("-")[0].toUpperCase();
            const displayName = item.user?.display_name || item.email;
            const initials = displayName[0]?.toUpperCase() || "?";
            return (
              <TouchableOpacity
                style={[
                  st.ticketCard,
                  { backgroundColor: colors.surface, borderColor: isActive ? BRAND : colors.border },
                  isActive && { borderWidth: 2 },
                ]}
                onPress={() => openThread(item)}
                activeOpacity={0.75}
              >
                <View style={st.ticketCardRow}>
                  <View style={[st.ticketAvatar, { backgroundColor: BRAND + "20" }]}>
                    <Text style={[st.ticketAvatarText, { color: BRAND }]}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={st.ticketTopRow}>
                      <Text style={[st.ticketSubject, { color: colors.text }]} numberOfLines={1}>{item.subject}</Text>
                      <Text style={[st.ticketTime, { color: colors.textMuted }]}>{timeAgo(item.updated_at)}</Text>
                    </View>
                    <Text style={[st.ticketFrom, { color: colors.textMuted }]} numberOfLines={1}>{displayName}</Text>
                  </View>
                </View>
                <View style={st.ticketFooter}>
                  <Text style={[st.ticketId, { color: colors.textMuted }]}>#{shortId}</Text>
                  <Text style={[st.ticketCat, { color: colors.textMuted }]}>{item.category}</Text>
                  <View style={{ flex: 1 }} />
                  <View style={[st.priorityTag, { borderColor: pCfg.color + "60" }]}>
                    <Ionicons name={pCfg.icon as any} size={10} color={pCfg.color} />
                    <Text style={[st.priorityTagText, { color: pCfg.color }]}>{pCfg.label}</Text>
                  </View>
                  <View style={[st.statusTag, { backgroundColor: cfg.bg }]}>
                    <Text style={[st.statusTagText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );

  const renderThread = () => {
    if (!activeTicket) {
      return (
        <View style={[st.emptyThread, { backgroundColor: colors.background }]}>
          <Ionicons name="chatbubbles-outline" size={56} color={colors.textMuted} />
          <Text style={[st.emptyThreadTitle, { color: colors.text }]}>No ticket selected</Text>
          <Text style={[st.emptyThreadSub, { color: colors.textMuted }]}>Tap a ticket from the list to view the conversation.</Text>
        </View>
      );
    }

    const statusCfg = STATUS_CONFIG[activeTicket.status] || STATUS_CONFIG.open;
    const priorityCfg = PRIORITY_CONFIG[activeTicket.priority] || PRIORITY_CONFIG.normal;

    return (
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        {/* Thread sub-header */}
        <View style={[st.threadHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          {!isTablet && (
            <TouchableOpacity onPress={() => setShowThread(false)} style={st.iconBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[st.threadSubject, { color: colors.text }]} numberOfLines={1}>{activeTicket.subject}</Text>
            <Text style={[st.threadMeta, { color: colors.textMuted }]} numberOfLines={1}>
              {activeTicket.user?.display_name || activeTicket.email} · {activeTicket.category}
            </Text>
          </View>
          <TouchableOpacity
            style={[st.statusBtn, { backgroundColor: statusCfg.bg }]}
            onPress={() => setChangeStatusModal(true)}
          >
            <View style={[st.statusDotSmall, { backgroundColor: statusCfg.color }]} />
            <Text style={[st.statusBtnText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            <Ionicons name="chevron-down" size={12} color={statusCfg.color} />
          </TouchableOpacity>
        </View>

        {/* Priority bar */}
        <View style={[st.priorityBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <Ionicons name="flag-outline" size={12} color={colors.textMuted} style={{ marginRight: 8 }} />
          <Text style={[st.priorityBarLabel, { color: colors.textMuted }]}>Priority:</Text>
          {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
            <TouchableOpacity
              key={key}
              style={[
                st.priorityChip,
                {
                  backgroundColor: activeTicket.priority === key ? cfg.color + "20" : "transparent",
                  borderColor: activeTicket.priority === key ? cfg.color : colors.border,
                },
              ]}
              onPress={() => updatePriority(key)}
            >
              <Text style={[st.priorityChipText, { color: activeTicket.priority === key ? cfg.color : colors.textMuted }]}>
                {cfg.label}
              </Text>
            </TouchableOpacity>
          ))}
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
              <View style={st.emptyMsgs}>
                <Ionicons name="mail-outline" size={36} color={colors.textMuted} />
                <Text style={[st.emptyMsgsText, { color: colors.textMuted }]}>No messages yet in this ticket.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isUser = item.sender_type === "user";
              const isSystem = item.sender_type === "system";

              if (isSystem) {
                return (
                  <View style={st.systemMsgRow}>
                    <View style={[st.systemMsgInner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name="information-circle-outline" size={12} color={colors.textMuted} />
                      <Text style={[st.systemMsgText, { color: colors.textMuted }]}>{item.message}</Text>
                    </View>
                  </View>
                );
              }

              const senderName = isUser
                ? (item.sender?.display_name || activeTicket.user?.display_name || activeTicket.email || "User")
                : (item.sender?.display_name || "Support Staff");

              return (
                <View style={[st.msgRow, isUser ? st.msgRowLeft : st.msgRowRight]}>
                  <View style={[st.msgAvatar, { backgroundColor: isUser ? "#FF9500" : BRAND }]}>
                    <Text style={st.msgAvatarText}>{senderName[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={[st.msgContent, isUser ? { alignItems: "flex-start" } : { alignItems: "flex-end" }]}>
                    <View style={st.msgMeta}>
                      <Text style={[st.msgSender, { color: colors.textMuted }]}>{senderName}</Text>
                      {item.is_internal && (
                        <View style={st.internalBadge}>
                          <Ionicons name="eye-off-outline" size={10} color="#856404" />
                          <Text style={st.internalBadgeText}>Internal</Text>
                        </View>
                      )}
                      <Text style={[st.msgTime, { color: colors.textMuted }]}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                    <View
                      style={[
                        st.bubble,
                        item.is_internal
                          ? { backgroundColor: "#FFFBEB", borderColor: "#FFC107", borderWidth: 1 }
                          : isUser
                          ? { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }
                          : { backgroundColor: BRAND + "18", borderColor: BRAND + "30", borderWidth: StyleSheet.hairlineWidth },
                      ]}
                    >
                      <Text style={[st.bubbleText, { color: item.is_internal ? "#5a4000" : colors.text }]}>{item.message}</Text>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Reply bar */}
        <View style={[st.replyBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + (isTablet ? 8 : 4), backgroundColor: colors.background }]}>
          <View style={[st.replyTypeRow, { borderColor: colors.border }]}>
            <TouchableOpacity
              style={[st.replyTypeBtn, !isInternal && { backgroundColor: BRAND }]}
              onPress={() => setIsInternal(false)}
            >
              <Ionicons name="send-outline" size={12} color={!isInternal ? "#fff" : colors.textMuted} />
              <Text style={[st.replyTypeBtnText, { color: !isInternal ? "#fff" : colors.textMuted }]}>Reply to User</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.replyTypeBtn, isInternal && { backgroundColor: "#FFC107" }]}
              onPress={() => setIsInternal(true)}
            >
              <Ionicons name="eye-off-outline" size={12} color={isInternal ? "#fff" : colors.textMuted} />
              <Text style={[st.replyTypeBtnText, { color: isInternal ? "#fff" : colors.textMuted }]}>Internal Note</Text>
            </TouchableOpacity>
          </View>
          <View style={st.replyInputRow}>
            <TextInput
              style={[
                st.replyInput,
                {
                  backgroundColor: colors.surface,
                  borderColor: isInternal ? "#FFC107" : colors.border,
                  color: colors.text,
                },
              ]}
              value={reply}
              onChangeText={setReply}
              placeholder={isInternal ? "Add internal note (not visible to user)…" : "Write reply to user…"}
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
    );
  };

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Top header */}
      <View style={[st.header, { paddingTop: insets.top + 10, backgroundColor: BRAND }]}>
        <TouchableOpacity
          onPress={!isTablet && showThread ? () => setShowThread(false) : () => router.back()}
          style={st.iconBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>
            {!isTablet && showThread && activeTicket ? activeTicket.subject : "Support Dashboard"}
          </Text>
          <Text style={st.headerSub}>
            {!isTablet && showThread && activeTicket
              ? `#${activeTicket.id.split("-")[0].toUpperCase()} · ${STATUS_CONFIG[activeTicket.status]?.label || activeTicket.status}`
              : `${stats.open} open · ${stats.in_progress} in progress · ${stats.total} total`}
          </Text>
        </View>
        {(!isTablet || !showThread) && (
          <View style={[st.staffBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#fff" />
            <Text style={st.staffBadgeText}>Staff</Text>
          </View>
        )}
      </View>

      {/* Body: split on tablet, single-view on phone */}
      {isTablet ? (
        <View style={st.splitPane}>
          <View style={[st.listPane, { borderRightColor: colors.border }]}>
            {renderTicketList()}
          </View>
          <View style={st.threadPane}>
            {renderThread()}
          </View>
        </View>
      ) : showThread ? (
        renderThread()
      ) : (
        renderTicketList()
      )}

      {/* Status change modal */}
      <Modal visible={changeStatusModal} transparent animationType="fade" onRequestClose={() => setChangeStatusModal(false)}>
        <TouchableOpacity style={st.modalOverlay} activeOpacity={1} onPress={() => setChangeStatusModal(false)}>
          <View style={[st.statusModal, { backgroundColor: colors.surface }]}>
            <Text style={[st.modalTitle, { color: colors.text }]}>Change Status</Text>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <TouchableOpacity
                key={key}
                style={[
                  st.statusOption,
                  activeTicket?.status === key && { backgroundColor: cfg.bg },
                ]}
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
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 14, gap: 10,
  },
  headerTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  staffBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  staffBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },

  splitPane: { flex: 1, flexDirection: "row" },
  listPane: { width: 320, borderRightWidth: StyleSheet.hairlineWidth },
  threadPane: { flex: 1 },

  filterBar: { maxHeight: 54 },
  filterChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 20, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  filterChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  filterBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  filterBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },

  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  ticketCard: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 12, gap: 8,
  },
  ticketCardRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  ticketAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  ticketAvatarText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  ticketTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  ticketSubject: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  ticketFrom: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  ticketTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  ticketFooter: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  ticketId: { fontSize: 10, fontFamily: "Inter_700Bold" },
  ticketCat: { fontSize: 11, fontFamily: "Inter_400Regular", textTransform: "capitalize", flex: 1 },
  priorityTag: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2,
  },
  priorityTagText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statusTag: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusTagText: { fontSize: 10, fontFamily: "Inter_700Bold" },

  emptyList: { padding: 48, alignItems: "center", gap: 8 },
  emptyListTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyListSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  threadHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  threadSubject: { fontSize: 15, fontFamily: "Inter_700Bold" },
  threadMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  statusBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
  },
  statusBtnText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  statusDotSmall: { width: 7, height: 7, borderRadius: 4 },

  priorityBar: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  priorityBarLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginRight: 2 },
  priorityChip: {
    borderRadius: 20, borderWidth: 1.5,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  priorityChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  emptyThread: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 40 },
  emptyThreadTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyThreadSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },

  emptyMsgs: { padding: 40, alignItems: "center", gap: 8 },
  emptyMsgsText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  systemMsgRow: { alignItems: "center" },
  systemMsgInner: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 20, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  systemMsgText: { fontSize: 11, fontFamily: "Inter_400Regular", fontStyle: "italic" },

  msgRow: { flexDirection: "row", gap: 8, maxWidth: "88%" },
  msgRowLeft: { alignSelf: "flex-start" },
  msgRowRight: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  msgAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 20 },
  msgAvatarText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  msgContent: { flex: 1 },
  msgMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  msgSender: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  internalBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#FFF3CD", borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  internalBadgeText: { fontSize: 10, color: "#856404", fontFamily: "Inter_600SemiBold" },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular" },
  bubble: { borderRadius: 14, padding: 12 },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },

  replyBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  replyTypeRow: { flexDirection: "row", gap: 6 },
  replyTypeBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  replyTypeBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  replyInputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  replyInput: {
    flex: 1, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontFamily: "Inter_400Regular",
    maxHeight: 120, minHeight: 44,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  statusModal: { width: "100%", borderRadius: 16, overflow: "hidden" },
  modalTitle: { fontSize: 15, fontFamily: "Inter_700Bold", padding: 16, paddingBottom: 8 },
  statusOption: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.06)" },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusOptionText: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },

  lockCard: {
    margin: 32, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth,
    padding: 32, alignItems: "center", gap: 10,
  },
  lockTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 8 },
  lockSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  lockBtn: { marginTop: 12, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  lockBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
