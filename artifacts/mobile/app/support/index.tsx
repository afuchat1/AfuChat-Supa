import React, { useCallback, useEffect, useState } from "react";
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
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

const BRAND = Colors.brand;

const CATEGORIES = [
  { id: "account", label: "Account & Login", icon: "person-circle-outline" },
  { id: "payments", label: "Payments & ACoins", icon: "wallet-outline" },
  { id: "marketplace", label: "AfuMarket Orders", icon: "bag-handle-outline" },
  { id: "messages", label: "Messaging", icon: "chatbubbles-outline" },
  { id: "content", label: "Content & Posts", icon: "newspaper-outline" },
  { id: "safety", label: "Safety & Privacy", icon: "shield-checkmark-outline" },
  { id: "technical", label: "Technical Issue", icon: "construct-outline" },
  { id: "general", label: "General Enquiry", icon: "help-circle-outline" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: "Open", color: "#1a7f1a", bg: "#e3f9e5" },
  in_progress: { label: "In Progress", color: "#0066cc", bg: "#e5f5ff" },
  resolved: { label: "Resolved", color: "#888", bg: "#f0f0f0" },
  closed: { label: "Closed", color: "#888", bg: "#f0f0f0" },
};

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
};

export default function SupportCenter() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<"home" | "new" | "tickets">("home");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New ticket form
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(user?.email || "");

  const fetchTickets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("id, subject, category, status, priority, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setTickets(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (tab === "tickets") fetchTickets();
  }, [tab, fetchTickets]);

  async function submitTicket() {
    if (!user || !profile) return;
    if (!category) { showAlert("Required", "Please select a category"); return; }
    if (!subject.trim()) { showAlert("Required", "Please enter a subject"); return; }
    if (!message.trim()) { showAlert("Required", "Please describe your issue"); return; }
    if (!email.trim()) { showAlert("Required", "Please provide your email address"); return; }

    setSubmitting(true);
    try {
      const { data: ticket, error } = await supabase
        .from("support_tickets")
        .insert({
          user_id: user.id,
          email: email.trim(),
          subject: subject.trim(),
          category,
          status: "open",
          priority: "normal",
        })
        .select()
        .single();

      if (error || !ticket) throw new Error(error?.message || "Failed to create ticket");

      // Insert initial message
      await supabase.from("support_messages").insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_type: "user",
        message: message.trim(),
      });

      setSubject(""); setMessage(""); setCategory("");
      showAlert("Ticket Submitted ✅", "Your support request has been submitted. Check your email for confirmation and monitor this page for updates.", [
        { text: "View My Tickets", onPress: () => setTab("tickets") },
        { text: "OK" },
      ]);
    } catch (err: any) {
      showAlert("Error", err.message || "Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { backgroundColor: BRAND, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={st.headerTextCol}>
          <Text style={st.headerTitle}>Support Center</Text>
          <Text style={st.headerSub}>We're here to help</Text>
        </View>
        <TouchableOpacity onPress={() => setTab("tickets")} style={st.backBtn}>
          <Ionicons name="receipt-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={[st.tabs, { borderBottomColor: colors.border }]}>
        {(["home", "new", "tickets"] as const).map((t) => (
          <TouchableOpacity key={t} style={[st.tab, tab === t && { borderBottomColor: BRAND, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
            <Text style={[st.tabText, { color: tab === t ? BRAND : colors.textMuted }]}>
              {t === "home" ? "Help" : t === "new" ? "New Ticket" : "My Tickets"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Home tab */}
      {tab === "home" && (
        <ScrollView style={st.scroll} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 20 }}>
          <View style={[st.heroCard, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 40 }}>💬</Text>
            <Text style={[st.heroTitle, { color: colors.text }]}>How can we help?</Text>
            <Text style={[st.heroSub, { color: colors.textMuted }]}>Our support team typically responds within 2-4 hours</Text>
          </View>

          <Text style={[st.sectionTitle, { color: colors.text }]}>Browse by Topic</Text>
          <View style={st.catGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[st.catCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setCategory(cat.id); setTab("new"); }}
              >
                <View style={[st.catIcon, { backgroundColor: BRAND + "18" }]}>
                  <Ionicons name={cat.icon as any} size={22} color={BRAND} />
                </View>
                <Text style={[st.catLabel, { color: colors.text }]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[st.openTicketBtn, { backgroundColor: BRAND }]}
            onPress={() => setTab("new")}
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={st.openTicketBtnText}>Open a Support Ticket</Text>
          </TouchableOpacity>

          <View style={[st.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="mail-outline" size={18} color={BRAND} />
            <Text style={[st.infoText, { color: colors.textMuted }]}>
              You can also email us directly at{" "}
              <Text style={{ color: BRAND }}>support@afuchat.com</Text>
            </Text>
          </View>
        </ScrollView>
      )}

      {/* New ticket tab */}
      {tab === "new" && (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView style={st.scroll} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 80 }}>
            <Text style={[st.formLabel, { color: colors.textMuted }]}>CATEGORY *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[st.pill, { borderColor: category === cat.id ? BRAND : colors.border, backgroundColor: category === cat.id ? BRAND : colors.surface }]}
                  onPress={() => setCategory(cat.id)}
                >
                  <Text style={[st.pillText, { color: category === cat.id ? "#fff" : colors.text }]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[st.formLabel, { color: colors.textMuted }]}>YOUR EMAIL *</Text>
            <TextInput
              style={[st.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={[st.formLabel, { color: colors.textMuted }]}>SUBJECT *</Text>
            <TextInput
              style={[st.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={subject}
              onChangeText={setSubject}
              placeholder="Brief description of your issue"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[st.formLabel, { color: colors.textMuted }]}>DESCRIBE YOUR ISSUE *</Text>
            <TextInput
              style={[st.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={message}
              onChangeText={setMessage}
              placeholder="Please provide as much detail as possible to help us assist you faster..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </ScrollView>
          <View style={[st.submitBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
            <TouchableOpacity
              style={[st.submitBtn, { backgroundColor: BRAND, opacity: submitting ? 0.7 : 1 }]}
              onPress={submitTicket}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={st.submitBtnText}>Submit Ticket</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* My Tickets tab */}
      {tab === "tickets" && (
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={st.centered}><ActivityIndicator color={BRAND} /></View>
          ) : tickets.length === 0 ? (
            <View style={st.empty}>
              <Ionicons name="chatbubble-ellipses-outline" size={52} color={colors.textMuted} />
              <Text style={[st.emptyTitle, { color: colors.text }]}>No tickets yet</Text>
              <Text style={[st.emptySub, { color: colors.textMuted }]}>When you submit a support request, it will appear here.</Text>
              <TouchableOpacity style={[st.openTicketBtn, { backgroundColor: BRAND, marginTop: 20 }]} onPress={() => setTab("new")}>
                <Text style={st.openTicketBtnText}>Open First Ticket</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={tickets}
              keyExtractor={(t) => t.id}
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}
              refreshing={loading}
              onRefresh={fetchTickets}
              renderItem={({ item }) => {
                const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.open;
                const shortId = item.id.split("-")[0].toUpperCase();
                return (
                  <TouchableOpacity
                    style={[st.ticketCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => router.push(`/support/ticket/${item.id}` as any)}
                  >
                    <View style={st.ticketRow}>
                      <Text style={[st.ticketId, { color: colors.textMuted }]}>#{shortId}</Text>
                      <View style={[st.statusBadge, { backgroundColor: cfg.bg }]}>
                        <Text style={[st.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    </View>
                    <Text style={[st.ticketSubject, { color: colors.text }]} numberOfLines={1}>{item.subject}</Text>
                    <Text style={[st.ticketMeta, { color: colors.textMuted }]}>
                      {item.category} · {new Date(item.updated_at).toLocaleDateString()}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={st.chevron} />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTextCol: { flex: 1 },
  headerTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  scroll: { flex: 1 },
  heroCard: { borderRadius: 16, padding: 24, alignItems: "center", marginBottom: 24, gap: 8 },
  heroTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 12 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  catCard: { width: "47%", borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 8 },
  catIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  catLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  openTicketBtn: { borderRadius: 12, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 },
  openTicketBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  infoCard: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 14, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  formLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" },
  input: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 16 },
  textarea: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 16, minHeight: 120 },
  pill: { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8 },
  pillText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  submitBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, paddingHorizontal: 20 },
  submitBtn: { borderRadius: 12, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 12 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  ticketCard: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 10 },
  ticketRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  ticketId: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  ticketSubject: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  ticketMeta: { fontSize: 12, fontFamily: "Inter_400Regular", textTransform: "capitalize" },
  chevron: { position: "absolute", right: 14, top: "50%" },
});
