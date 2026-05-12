import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
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
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import { showAlert } from "@/lib/alert";

function buildDeviceInfo(): string {
  const { width, height } = Dimensions.get("window");
  const appVersion =
    Constants.expoConfig?.version ||
    (Constants as any).manifest?.version ||
    "unknown";
  return [
    `Platform: ${Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web"}`,
    `OS Version: ${Device.osVersion || "unknown"}`,
    `Device Model: ${Device.modelName || "unknown"}`,
    `Device Brand: ${(Device as any).brand || "unknown"}`,
    `Device Type: ${Device.deviceType === 1 ? "Phone" : Device.deviceType === 2 ? "Tablet" : "Other"}`,
    `Screen: ${Math.round(width)} × ${Math.round(height)}`,
    `App Version: ${appVersion}`,
    `Expo SDK: ${Constants.expoConfig?.sdkVersion || (Constants as any).manifest?.sdkVersion || "unknown"}`,
  ].join("\n");
}

const BRAND_FALLBACK = Colors.brand;

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
  open:        { label: "Open",        color: "#34C759", bg: "#34C75920" },
  in_progress: { label: "In Progress", color: "#007AFF", bg: "#007AFF20" },
  resolved:    { label: "Resolved",    color: "#8E8E93", bg: "#8E8E9320" },
  closed:      { label: "Closed",      color: "#636366", bg: "#63636620" },
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

type TabId = "home" | "new" | "tickets";

export default function SupportCenter() {
  const { colors } = useTheme();
  const BRAND = colors.accent;
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<TabId>("home");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(user?.email || "");
  const [includeDeviceInfo, setIncludeDeviceInfo] = useState(true);
  const [showDevicePreview, setShowDevicePreview] = useState(false);
  const deviceInfo = useMemo(() => buildDeviceInfo(), []);

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
      const fullMessage = includeDeviceInfo
        ? `${message.trim()}\n\n── Device Info ──────────────────\n${deviceInfo}`
        : message.trim();

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

      await supabase.from("support_messages").insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_type: "user",
        message: fullMessage,
      });

      setSubject(""); setMessage(""); setCategory("");
      showAlert(
        "Ticket Submitted",
        "Your support request has been received. We'll get back to you as soon as possible.",
        [
          { text: "View My Tickets", onPress: () => setTab("tickets") },
          { text: "OK" },
        ]
      );
    } catch (err: any) {
      showAlert("Error", err.message || "Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  }

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: "home", label: "Help", icon: "home-outline" },
    { id: "new", label: "New Ticket", icon: "create-outline" },
    { id: "tickets", label: "My Tickets", icon: "receipt-outline" },
  ];

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { backgroundColor: BRAND, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.iconBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>Support Center</Text>
          <Text style={st.headerSub}>We're here to help</Text>
        </View>
        <View style={[st.supportBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
          <Ionicons name="headset-outline" size={14} color="#fff" />
          <Text style={st.supportBadgeText}>24/7</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={[st.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[st.tabItem, tab === t.id && { borderBottomColor: BRAND, borderBottomWidth: 2 }]}
            onPress={() => setTab(t.id)}
          >
            <Ionicons
              name={t.icon as any}
              size={16}
              color={tab === t.id ? BRAND : colors.textMuted}
            />
            <Text style={[st.tabLabel, { color: tab === t.id ? BRAND : colors.textMuted }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Home tab */}
      {tab === "home" && (
        <ScrollView
          style={st.scroll}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={[st.heroCard, { backgroundColor: BRAND + "12", borderColor: BRAND + "30" }]}>
            <View style={[st.heroIcon, { backgroundColor: BRAND }]}>
              <Ionicons name="chatbubbles" size={28} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.heroTitle, { color: colors.text }]}>How can we help?</Text>
              <Text style={[st.heroSub, { color: colors.textMuted }]}>We typically reply within 2–4 hours</Text>
            </View>
          </View>

          <Text style={[st.sectionTitle, { color: colors.text }]}>Browse by Topic</Text>
          <View style={st.catGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[st.catCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setCategory(cat.id); setTab("new"); }}
                activeOpacity={0.75}
              >
                <View style={[st.catIconWrap, { backgroundColor: BRAND + "15" }]}>
                  <Ionicons name={cat.icon as any} size={20} color={BRAND} />
                </View>
                <Text style={[st.catLabel, { color: colors.text }]} numberOfLines={2}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[st.primaryBtn, { backgroundColor: BRAND }]}
            onPress={() => setTab("new")}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={st.primaryBtnText}>Open a Support Ticket</Text>
          </TouchableOpacity>

          <View style={[st.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="mail-outline" size={20} color={BRAND} />
            <View style={{ flex: 1 }}>
              <Text style={[st.infoTitle, { color: colors.text }]}>Email Support</Text>
              <Text style={[st.infoText, { color: colors.textMuted }]}>
                Reach us directly at{" "}
                <Text style={{ color: BRAND, fontFamily: "Inter_600SemiBold" }}>support@afuchat.com</Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* New Ticket tab */}
      {tab === "new" && (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <ScrollView
            style={st.scroll}
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[st.formLabel, { color: colors.textMuted }]}>CATEGORY *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    st.pill,
                    {
                      borderColor: category === cat.id ? BRAND : colors.border,
                      backgroundColor: category === cat.id ? BRAND : colors.surface,
                    },
                  ]}
                  onPress={() => setCategory(cat.id)}
                >
                  <Ionicons name={cat.icon as any} size={13} color={category === cat.id ? "#fff" : colors.textMuted} />
                  <Text style={[st.pillText, { color: category === cat.id ? "#fff" : colors.text }]}>
                    {cat.label}
                  </Text>
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
              autoCorrect={false}
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
              placeholder="Please provide as much detail as possible — screenshots, steps to reproduce, or error messages — to help us assist you faster."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />

            {/* Device info toggle */}
            <Text style={[st.formLabel, { color: colors.textMuted }]}>DEVICE DIAGNOSTICS</Text>
            <TouchableOpacity
              style={[
                st.deviceToggle,
                {
                  borderColor: includeDeviceInfo ? BRAND + "55" : colors.border,
                  backgroundColor: includeDeviceInfo ? BRAND + "08" : colors.surface,
                },
              ]}
              onPress={() => setIncludeDeviceInfo(v => !v)}
              activeOpacity={0.75}
            >
              <View style={[st.deviceToggleIcon, { backgroundColor: includeDeviceInfo ? BRAND + "18" : colors.backgroundSecondary || colors.border + "40" }]}>
                <Ionicons
                  name="phone-portrait-outline"
                  size={16}
                  color={includeDeviceInfo ? BRAND : colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[st.deviceToggleTitle, { color: colors.text }]}>
                  Attach device info
                </Text>
                <Text style={[st.deviceToggleSub, { color: colors.textMuted }]}>
                  Helps us tell if it's a device-specific bug
                </Text>
              </View>
              <View style={[
                st.togglePill,
                { backgroundColor: includeDeviceInfo ? BRAND : colors.border },
              ]}>
                <View style={[
                  st.toggleKnob,
                  { transform: [{ translateX: includeDeviceInfo ? 18 : 0 }] },
                ]} />
              </View>
            </TouchableOpacity>

            {/* Device info preview expand */}
            {includeDeviceInfo && (
              <TouchableOpacity
                style={[st.devicePreviewToggle, { borderColor: colors.border }]}
                onPress={() => setShowDevicePreview(v => !v)}
                activeOpacity={0.7}
              >
                <Ionicons name={showDevicePreview ? "eye-off-outline" : "eye-outline"} size={13} color={colors.textMuted} />
                <Text style={[st.devicePreviewToggleText, { color: colors.textMuted }]}>
                  {showDevicePreview ? "Hide device details" : "Preview what will be attached"}
                </Text>
                <Ionicons name={showDevicePreview ? "chevron-up" : "chevron-down"} size={13} color={colors.textMuted} />
              </TouchableOpacity>
            )}

            {includeDeviceInfo && showDevicePreview && (
              <View style={[st.deviceInfoBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                {deviceInfo.split("\n").map((line, i) => {
                  const colonIdx = line.indexOf(": ");
                  const key = colonIdx >= 0 ? line.slice(0, colonIdx) : line;
                  const val = colonIdx >= 0 ? line.slice(colonIdx + 2) : "";
                  return (
                    <View key={i} style={st.deviceInfoRow}>
                      <Text style={[st.deviceInfoKey, { color: colors.textMuted }]}>{key}</Text>
                      <Text style={[st.deviceInfoVal, { color: colors.text }]}>{val}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <View style={[st.submitBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
            <TouchableOpacity
              style={[st.primaryBtn, { backgroundColor: BRAND, opacity: submitting ? 0.7 : 1 }]}
              onPress={submitTicket}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={st.primaryBtnText}>Submit Ticket</Text>
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
            <View style={{ padding: 12, gap: 10 }}>{[1,2,3,4].map(i => <ListRowSkeleton key={i} />)}</View>
          ) : tickets.length === 0 ? (
            <View style={st.empty}>
              <View style={[st.emptyIconWrap, { backgroundColor: BRAND + "12" }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={40} color={BRAND} />
              </View>
              <Text style={[st.emptyTitle, { color: colors.text }]}>No tickets yet</Text>
              <Text style={[st.emptySub, { color: colors.textMuted }]}>
                Support requests you submit will appear here so you can track their progress.
              </Text>
              <TouchableOpacity
                style={[st.primaryBtn, { backgroundColor: BRAND, marginTop: 8 }]}
                onPress={() => setTab("new")}
              >
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={st.primaryBtnText}>Open Your First Ticket</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={tickets}
              keyExtractor={(t) => t.id}
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}
              refreshing={loading}
              onRefresh={fetchTickets}
              renderItem={({ item }) => {
                const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.open;
                const shortId = item.id.split("-")[0].toUpperCase();
                const updatedAt = new Date(item.updated_at);
                const diffMs = Date.now() - updatedAt.getTime();
                const diffHrs = diffMs / 3600000;
                const timeStr = diffHrs < 24
                  ? updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : updatedAt.toLocaleDateString();
                return (
                  <TouchableOpacity
                    style={[st.ticketCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => router.push(`/support/ticket/${item.id}` as any)}
                    activeOpacity={0.75}
                  >
                    <View style={st.ticketCardTop}>
                      <View style={[st.statusDot, { backgroundColor: cfg.color }]} />
                      <Text style={[st.ticketId, { color: colors.textMuted }]}>#{shortId}</Text>
                      <View style={{ flex: 1 }} />
                      <View style={[st.statusBadge, { backgroundColor: cfg.bg }]}>
                        <Text style={[st.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    </View>
                    <Text style={[st.ticketSubject, { color: colors.text }]} numberOfLines={2}>{item.subject}</Text>
                    <View style={st.ticketMeta}>
                      <Ionicons name="folder-outline" size={12} color={colors.textMuted} />
                      <Text style={[st.ticketMetaText, { color: colors.textMuted }]} numberOfLines={1}>
                        {item.category.replace(/_/g, " ")}
                      </Text>
                      <Text style={[st.ticketDot, { color: colors.border }]}>·</Text>
                      <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                      <Text style={[st.ticketMetaText, { color: colors.textMuted }]}>{timeStr}</Text>
                      <View style={{ flex: 1 }} />
                      <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
                    </View>
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
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 14, gap: 10,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  supportBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  supportBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },

  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabItem: { flex: 1, paddingVertical: 11, alignItems: "center", gap: 3 },
  tabLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  scroll: { flex: 1 },

  heroCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    padding: 18, marginBottom: 24,
  },
  heroIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  heroSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },

  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 12 },

  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  catCard: {
    width: "47.5%", borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, gap: 10,
  },
  catIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  catLabel: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 17 },

  primaryBtn: {
    borderRadius: 14, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginBottom: 16,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },

  infoCard: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, flexDirection: "row", gap: 12, alignItems: "flex-start",
  },
  infoTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },

  formLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 20,
  },
  textarea: {
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, fontFamily: "Inter_400Regular",
    minHeight: 130, marginBottom: 20,
  },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 20, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: 8, marginRight: 8,
  },
  pillText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  submitBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, paddingHorizontal: 20 },

  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 10 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  ticketCard: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, gap: 6,
  },
  ticketCardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  ticketId: { fontSize: 11, fontFamily: "Inter_700Bold" },
  statusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  ticketSubject: { fontSize: 15, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  ticketMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  ticketMetaText: { fontSize: 12, fontFamily: "Inter_400Regular", textTransform: "capitalize" },
  ticketDot: { fontSize: 12 },

  deviceToggle: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8,
  },
  deviceToggleIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  deviceToggleTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  deviceToggleSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  togglePill: {
    width: 42, height: 24, borderRadius: 12,
    justifyContent: "center", paddingHorizontal: 3,
  },
  toggleKnob: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#fff",
  },

  devicePreviewToggle: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 8, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8,
    alignSelf: "flex-start",
  },
  devicePreviewToggleText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  deviceInfoBox: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, gap: 6, marginBottom: 16,
  },
  deviceInfoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  deviceInfoKey: { fontSize: 12, fontFamily: "Inter_600SemiBold", width: 110 },
  deviceInfoVal: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
});
