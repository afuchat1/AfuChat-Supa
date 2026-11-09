import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
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
    `Platform: ${Platform.OS}`,
    `OS Version: ${Device.osVersion || "unknown"}`,
    `Device Model: ${Device.modelName || "unknown"}`,
    `Device Brand: ${(Device as any).brand || "unknown"}`,
    `Device Type: ${Device.deviceType === 1 ? "Phone" : Device.deviceType === 2 ? "Tablet" : "Other"}`,
    `Screen: ${Math.round(width)} × ${Math.round(height)}`,
    `App Version: ${appVersion}`,
    `Expo SDK: ${Constants.expoConfig?.sdkVersion || (Constants as any).manifest?.sdkVersion || "unknown"}`,
  ].join("\n");
}

const CATEGORIES = [
  { id: "account",     label: "Account & Login",     icon: "person-circle",  desc: "Password, login, profile" },
  { id: "payments",    label: "Payments & ACoins",   icon: "wallet",          desc: "Top-up, refunds, disputes" },
  { id: "marketplace", label: "AfuMarket Orders",    icon: "bag-handle",      desc: "Orders, shipping, escrow" },
  { id: "messages",    label: "Messaging",           icon: "chatbubbles",     desc: "Chats, media, encryption" },
  { id: "content",     label: "Content & Posts",     icon: "newspaper",       desc: "Posts, stories, videos" },
  { id: "safety",      label: "Safety & Privacy",    icon: "shield-checkmark", desc: "Reports, privacy, data" },
  { id: "technical",   label: "Technical Issue",     icon: "construct",       desc: "Crashes, bugs, performance" },
  { id: "general",     label: "General Enquiry",     icon: "help-circle",     desc: "Questions, feedback" },
];

const PRIORITIES = [
  { id: "low",      label: "Low",      color: "#8E8E93", desc: "Cosmetic / non-blocking" },
  { id: "normal",   label: "Normal",   color: "#007AFF", desc: "Normal use case" },
  { id: "high",     label: "High",     color: "#FF9500", desc: "Significantly impacted" },
  { id: "urgent",   label: "Urgent",   color: "#FF3B30", desc: "Can't use the app" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  open:        { label: "Open",        color: "#34C759", bg: "#34C75920", icon: "radio-button-on" },
  in_progress: { label: "In Progress", color: "#007AFF", bg: "#007AFF20", icon: "sync-circle" },
  resolved:    { label: "Resolved",    color: "#8E8E93", bg: "#8E8E9320", icon: "checkmark-circle" },
  closed:      { label: "Closed",      color: "#636366", bg: "#63636620", icon: "lock-closed" },
};

const FAQ_ITEMS = [
  {
    q: "How do I recover my account?",
    a: "Tap 'Forgot Password' on the login screen. Enter your registered phone or email and follow the verification link sent to you.",
  },
  {
    q: "My ACoins purchase didn't reflect. What do I do?",
    a: "ACoins usually credit within 60 seconds. If they haven't appeared after 5 minutes, submit a Payments ticket with your transaction reference number.",
  },
  {
    q: "How long does support take to reply?",
    a: "Our AI assistant replies instantly with initial guidance. A human agent follows up within 2 to 4 hours during business hours.",
  },
  {
    q: "Can I get a refund on ACoins?",
    a: "Refunds are reviewed case-by-case within 7 days of purchase. Submit a Payments ticket with your transaction ID for review.",
  },
];

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  has_ai_draft?: boolean;
};

type TabId = "home" | "new" | "tickets";

export default function SupportCenter() {
  const { colors } = useTheme();
  const BRAND = colors.accent;
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  // Crash-triggered pre-fill: when navigating here from the crash alert the
  // route params carry the error message, category, and priority.
  const params = useLocalSearchParams<{
    errorSubject?: string;
    errorCategory?: string;
    errorPriority?: string;
  }>();

  const [tab, setTab] = useState<TabId>(params.errorSubject ? "new" : "home");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null);

  const [category, setCategory] = useState(params.errorCategory || "");
  const [priority, setPriority] = useState(params.errorPriority || "normal");
  const [subject, setSubject] = useState(params.errorSubject || "");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(user?.email || "");
  const [includeDeviceInfo, setIncludeDeviceInfo] = useState(true);
  const [showDevicePreview, setShowDevicePreview] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const deviceInfo = useMemo(() => buildDeviceInfo(), []);

  const successAnim = useRef(new Animated.Value(0)).current;
  const aiPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (submitted) {
      Animated.spring(successAnim, { toValue: 1, useNativeDriver: true, tension: 60 }).start();
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(aiPulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
          Animated.timing(aiPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      successAnim.setValue(0);
    }
  }, [submitted]);

  const fetchTickets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id, subject, category, status, priority, created_at, updated_at, has_ai_draft")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) console.warn("[Support] fetchTickets error:", error.message);
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
          priority,
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

      // Fire AI reply in the background — don't block the success UI on it.
      supabase.functions
        .invoke("support-ai-reply", { body: { ticket_id: ticket.id } })
        .catch((e) => console.warn("[Support] AI reply invoke failed:", e?.message));

      setSubmittedTicketId(ticket.id);
      setSubmitted(true);
      setSubject(""); setMessage(""); setCategory(""); setPriority("normal");
    } catch (err: any) {
      showAlert("Error", err.message || "Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  }

  const TABS: { id: TabId; label: string; icon: string; activeIcon: string }[] = [
    { id: "home",    label: "Help",       icon: "home",    activeIcon: "home" },
    { id: "new",     label: "New Ticket", icon: "create",  activeIcon: "create" },
    { id: "tickets", label: "My Tickets", icon: "receipt", activeIcon: "receipt" },
  ];

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
          <Text style={st.headerTitle}>Support Center</Text>
          <View style={st.headerSubRow}>
            <View style={st.aiDot} />
            <Text style={st.headerSub}>AI-powered · 24/7 support</Text>
          </View>
        </View>
        <View style={[st.headBadge, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
          <Ionicons name="bulb-outline" size={12} color="#fff" />
          <Text style={st.headBadgeText}>AI Ready</Text>
        </View>
      </LinearGradient>

      {/* ── Tab Bar ─────────────────────────────────────── */}
      <View style={[st.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[st.tabItem, active && { borderBottomColor: BRAND, borderBottomWidth: 2 }]}
              onPress={() => {
                setSubmitted(false);
                setTab(t.id);
              }}
            >
              <Ionicons
                name={(active ? t.activeIcon : t.icon) as any}
                size={17}
                color={active ? BRAND : colors.textMuted}
              />
              <Text style={[st.tabLabel, { color: active ? BRAND : colors.textMuted }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ════════════════════════════════════════════════════
          HOME TAB
      ════════════════════════════════════════════════════ */}
      {tab === "home" && (
        <ScrollView
          style={st.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <LinearGradient
            colors={[BRAND + "18", BRAND + "06"]}
            style={[st.heroCard, { borderColor: BRAND + "25" }]}
          >
            <View style={[st.heroIconWrap, { backgroundColor: BRAND }]}>
              <Ionicons name="bulb-outline" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.heroTitle, { color: colors.text }]}>How can we help you?</Text>
              <Text style={[st.heroSub, { color: colors.textMuted }]}>
                AI drafts an instant reply · human follow-up in 2–4 hrs
              </Text>
            </View>
          </LinearGradient>

          {/* Stats strip */}
          <View style={[st.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {[
              { icon: "flash", label: "Instant AI Reply", val: "< 1 min" },
              { icon: "person", label: "Human Follow-up", val: "2 to 4 hrs" },
              { icon: "star",   label: "Satisfaction",    val: "97%" },
            ].map((s) => (
              <View key={s.label} style={st.statItem}>
                <Ionicons name={s.icon as any} size={16} color={BRAND} />
                <Text style={[st.statVal, { color: colors.text }]}>{s.val}</Text>
                <Text style={[st.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Category grid */}
          <View style={st.section}>
            <Text style={[st.sectionTitle, { color: colors.text }]}>Browse by topic</Text>
            <View style={st.catGrid}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[st.catCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => { setCategory(cat.id); setTab("new"); }}
                  activeOpacity={0.72}
                >
                  <View style={[st.catIconWrap, { backgroundColor: BRAND + "14" }]}>
                    <Ionicons name={cat.icon as any} size={20} color={BRAND} />
                  </View>
                  <Text style={[st.catLabel, { color: colors.text }]} numberOfLines={1}>{cat.label}</Text>
                  <Text style={[st.catDesc, { color: colors.textMuted }]} numberOfLines={1}>{cat.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* CTA */}
          <View style={st.ctaRow}>
            <TouchableOpacity
              style={[st.primaryBtn, { backgroundColor: BRAND }]}
              onPress={() => setTab("new")}
              activeOpacity={0.85}
            >
              <Ionicons name="create" size={17} color="#fff" />
              <Text style={st.primaryBtnText}>Open a Support Ticket</Text>
            </TouchableOpacity>
            {tickets.length > 0 && (
              <TouchableOpacity
                style={[st.ghostBtn, { borderColor: colors.border }]}
                onPress={() => setTab("tickets")}
              >
                <Ionicons name="receipt" size={17} color={BRAND} />
                <Text style={[st.ghostBtnText, { color: BRAND }]}>My Tickets</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* FAQ */}
          <View style={st.section}>
            <Text style={[st.sectionTitle, { color: colors.text }]}>Frequently asked</Text>
            {FAQ_ITEMS.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={[st.faqCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setExpandedFaq(expandedFaq === i ? null : i)}
                activeOpacity={0.8}
              >
                <View style={st.faqHeader}>
                  <Ionicons name="help-circle" size={16} color={BRAND} />
                  <Text style={[st.faqQ, { color: colors.text }]}>{item.q}</Text>
                  <Ionicons
                    name={expandedFaq === i ? "chevron-up" : "chevron-down"}
                    size={15}
                    color={colors.textMuted}
                  />
                </View>
                {expandedFaq === i && (
                  <Text style={[st.faqA, { color: colors.textMuted, borderTopColor: colors.border }]}>
                    {item.a}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Email contact */}
          <View style={[st.emailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[st.emailIcon, { backgroundColor: BRAND + "14" }]}>
              <Ionicons name="mail" size={18} color={BRAND} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.emailTitle, { color: colors.text }]}>Email us directly</Text>
              <Text style={[st.emailAddr, { color: BRAND }]}>support@afuchat.com</Text>
              <Text style={[st.emailNote, { color: colors.textMuted }]}>
                For complex issues that need more context
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* ════════════════════════════════════════════════════
          NEW TICKET TAB
      ════════════════════════════════════════════════════ */}
      {tab === "new" && (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          {submitted ? (
            /* ── Success state ─────────────────────────── */
            <ScrollView
              contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 40, alignItems: "center" }}
              showsVerticalScrollIndicator={false}
            >
              <Animated.View
                style={[
                  st.successCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  { transform: [{ scale: successAnim }] },
                ]}
              >
                <View style={[st.successIconWrap, { backgroundColor: "#34C75920" }]}>
                  <Ionicons name="checkmark-circle" size={40} color="#34C759" />
                </View>
                <Text style={[st.successTitle, { color: colors.text }]}>Ticket submitted!</Text>
                <Text style={[st.successSub, { color: colors.textMuted }]}>
                  Your ticket has been received. Our AI assistant is drafting an initial reply right now — a human agent will follow up shortly.
                </Text>
              </Animated.View>

              <Animated.View
                style={[
                  st.aiThinkingCard,
                  { backgroundColor: "#7C3AED12", borderColor: "#7C3AED30" },
                  { transform: [{ scale: aiPulse }] },
                ]}
              >
                <LinearGradient
                  colors={["#7C3AED", "#6D28D9"]}
                  style={st.aiThinkingIcon}
                >
                  <Ionicons name="bulb-outline" size={16} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={[st.aiThinkingTitle, { color: "#7C3AED" }]}>
                    AI is reviewing your ticket…
                  </Text>
                  <Text style={[st.aiThinkingSub, { color: colors.textMuted }]}>
                    An instant reply will appear in your ticket thread in moments
                  </Text>
                </View>
              </Animated.View>

              <TouchableOpacity
                style={[st.primaryBtn, { backgroundColor: BRAND, alignSelf: "stretch", marginTop: 8 }]}
                onPress={() => {
                  setSubmitted(false);
                  setTab("tickets");
                  fetchTickets();
                }}
              >
                <Ionicons name="receipt" size={17} color="#fff" />
                <Text style={st.primaryBtnText}>View My Tickets</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.ghostBtn, { borderColor: colors.border, alignSelf: "stretch", marginTop: 10 }]}
                onPress={() => { setSubmitted(false); setTab("home"); }}
              >
                <Text style={[st.ghostBtnText, { color: colors.textMuted }]}>Back to Help</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* ── Form ──────────────────────────────────── */
            <>
              <ScrollView
                style={st.scroll}
                contentContainerStyle={{ padding: 18, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* AI notice */}
                <View style={[st.aiNotice, { backgroundColor: "#7C3AED0D", borderColor: "#7C3AED30" }]}>
                  <Ionicons name="bulb-outline" size={14} color="#7C3AED" />
                  <Text style={[st.aiNoticeText, { color: "#7C3AED" }]}>
                    Our AI reviews every ticket and drafts an instant reply. A human agent follows up within 2–4 hours.
                  </Text>
                </View>

                {/* Category */}
                <Text style={[st.fieldLabel, { color: colors.textMuted }]}>CATEGORY *</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 20 }}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {CATEGORIES.map((cat) => {
                    const active = category === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          st.pill,
                          {
                            borderColor: active ? BRAND : colors.border,
                            backgroundColor: active ? BRAND : colors.surface,
                          },
                        ]}
                        onPress={() => setCategory(cat.id)}
                      >
                        <Ionicons name={cat.icon as any} size={13} color={active ? "#fff" : colors.textMuted} />
                        <Text style={[st.pillText, { color: active ? "#fff" : colors.text }]}>
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Priority */}
                <Text style={[st.fieldLabel, { color: colors.textMuted }]}>PRIORITY</Text>
                <View style={[st.priorityRow, { marginBottom: 20 }]}>
                  {PRIORITIES.map((p) => {
                    const active = priority === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[
                          st.priorityBtn,
                          {
                            borderColor: active ? p.color : colors.border,
                            backgroundColor: active ? p.color + "18" : colors.surface,
                          },
                        ]}
                        onPress={() => setPriority(p.id)}
                      >
                        <View style={[st.priorityDot, { backgroundColor: p.color }]} />
                        <View>
                          <Text style={[st.priorityLabel, { color: active ? p.color : colors.text }]}>
                            {p.label}
                          </Text>
                          <Text style={[st.priorityDesc, { color: colors.textMuted }]} numberOfLines={1}>
                            {p.desc}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Email */}
                <Text style={[st.fieldLabel, { color: colors.textMuted }]}>YOUR EMAIL *</Text>
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

                {/* Subject */}
                <Text style={[st.fieldLabel, { color: colors.textMuted }]}>SUBJECT *</Text>
                <TextInput
                  style={[st.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="Brief description of your issue"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="next"
                  maxLength={120}
                />

                {/* Message */}
                <View style={st.fieldLabelRow}>
                  <Text style={[st.fieldLabel, { color: colors.textMuted }]}>DESCRIBE YOUR ISSUE *</Text>
                  <Text style={[st.charCount, { color: message.length > 1800 ? "#FF3B30" : colors.textMuted }]}>
                    {message.length}/2000
                  </Text>
                </View>
                <TextInput
                  style={[st.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  value={message}
                  onChangeText={setMessage}
                  placeholder="Provide as much detail as possible. Include steps to reproduce, error messages, or when it started happening so our AI and team can help you faster."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  maxLength={2000}
                />

                {/* Device diagnostics */}
                <Text style={[st.fieldLabel, { color: colors.textMuted }]}>DEVICE DIAGNOSTICS</Text>
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
                  <View style={[
                    st.deviceToggleIcon,
                    { backgroundColor: includeDeviceInfo ? BRAND + "18" : colors.border + "40" },
                  ]}>
                    <Ionicons
                      name="phone-portrait"
                      size={16}
                      color={includeDeviceInfo ? BRAND : colors.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.deviceToggleTitle, { color: colors.text }]}>
                      Attach device info
                    </Text>
                    <Text style={[st.deviceToggleSub, { color: colors.textMuted }]}>
                      Helps diagnose device-specific bugs
                    </Text>
                  </View>
                  <View style={[st.toggle, { backgroundColor: includeDeviceInfo ? BRAND : colors.border }]}>
                    <View style={[st.toggleKnob, { transform: [{ translateX: includeDeviceInfo ? 18 : 0 }] }]} />
                  </View>
                </TouchableOpacity>

                {includeDeviceInfo && (
                  <TouchableOpacity
                    style={[st.devicePreviewToggle, { borderColor: colors.border }]}
                    onPress={() => setShowDevicePreview(v => !v)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={showDevicePreview ? "eye-off" : "eye"}
                      size={13}
                      color={colors.textMuted}
                    />
                    <Text style={[st.devicePreviewText, { color: colors.textMuted }]}>
                      {showDevicePreview ? "Hide device details" : "Preview attached data"}
                    </Text>
                    <Ionicons
                      name={showDevicePreview ? "chevron-up" : "chevron-down"}
                      size={13}
                      color={colors.textMuted}
                    />
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

              {/* Submit bar */}
              <View style={[
                st.submitBar,
                { borderTopColor: colors.border, paddingBottom: insets.bottom + 12, backgroundColor: colors.background },
              ]}>
                <TouchableOpacity
                  style={[st.primaryBtn, { backgroundColor: BRAND, opacity: submitting ? 0.7 : 1 }]}
                  onPress={submitTicket}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="send" size={17} color="#fff" />
                      <Text style={st.primaryBtnText}>Submit Ticket</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      )}

      {/* ════════════════════════════════════════════════════
          MY TICKETS TAB
      ════════════════════════════════════════════════════ */}
      {tab === "tickets" && (
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={{ padding: 14, gap: 10 }}>
              {[1, 2, 3, 4].map(i => <ListRowSkeleton key={i} />)}
            </View>
          ) : tickets.length === 0 ? (
            <View style={st.empty}>
              <View style={[st.emptyIconWrap, { backgroundColor: BRAND + "12" }]}>
                <Ionicons name="chatbubble-ellipses" size={40} color={BRAND} />
              </View>
              <Text style={[st.emptyTitle, { color: colors.text }]}>No tickets yet</Text>
              <Text style={[st.emptySub, { color: colors.textMuted }]}>
                Support requests you submit will appear here so you can track their progress and replies.
              </Text>
              <TouchableOpacity
                style={[st.primaryBtn, { backgroundColor: BRAND, marginTop: 8, alignSelf: "center", paddingHorizontal: 28 }]}
                onPress={() => setTab("new")}
              >
                <Ionicons name="create" size={16} color="#fff" />
                <Text style={st.primaryBtnText}>Open Your First Ticket</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={tickets}
              keyExtractor={(t) => t.id}
              contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 28, gap: 10 }}
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
                  : updatedAt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
                const isOpen = item.status === "open" || item.status === "in_progress";
                return (
                  <TouchableOpacity
                    style={[
                      st.ticketCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: isOpen ? cfg.color + "40" : colors.border,
                        borderWidth: isOpen ? 1 : 0.5,
                      },
                    ]}
                    onPress={() => router.push(`/support/ticket/${item.id}` as any)}
                    activeOpacity={0.75}
                  >
                    <View style={st.ticketTop}>
                      <View style={[st.ticketStatusBadge, { backgroundColor: cfg.bg }]}>
                        <Ionicons name={cfg.icon as any} size={11} color={cfg.color} />
                        <Text style={[st.ticketStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                      <View style={{ flex: 1 }} />
                      {item.has_ai_draft && (
                        <View style={st.aiDraftBadge}>
                          <Ionicons name="bulb-outline" size={10} color="#7C3AED" />
                          <Text style={st.aiDraftBadgeText}>AI Draft</Text>
                        </View>
                      )}
                      <Text style={[st.ticketTime, { color: colors.textMuted }]}>{timeStr}</Text>
                    </View>
                    <Text style={[st.ticketSubject, { color: colors.text }]} numberOfLines={2}>
                      {item.subject}
                    </Text>
                    <View style={st.ticketMeta}>
                      <View style={[st.ticketIdBadge, { backgroundColor: colors.background }]}>
                        <Text style={[st.ticketIdText, { color: colors.textMuted }]}>#{shortId}</Text>
                      </View>
                      <Text style={[st.ticketCategory, { color: colors.textMuted }]}>
                        {item.category.replace(/_/g, " ")}
                      </Text>
                      <View style={{ flex: 1 }} />
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
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
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSubRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  aiDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ADE80" },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Inter_400Regular" },
  headBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  headBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },

  tabBar: { flexDirection: "row" },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: "center", gap: 3 },
  tabLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  scroll: { flex: 1 },

  heroCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    margin: 16, marginBottom: 8,
    borderRadius: 18, borderWidth: 1,
    padding: 16,
  },
  heroIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  heroSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },

  statsRow: {
    flexDirection: "row", marginHorizontal: 16, marginBottom: 8,
    borderRadius: 14, borderWidth: 0.5,
    paddingVertical: 14,
  },
  statItem: { flex: 1, alignItems: "center", gap: 3 },
  statVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },

  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 12 },

  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 4 },
  catCard: {
    width: "47.5%", borderRadius: 14, borderWidth: 0.5,
    padding: 13, gap: 8,
  },
  catIconWrap: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  catLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  catDesc: { fontSize: 11, fontFamily: "Inter_400Regular" },

  ctaRow: { paddingHorizontal: 16, marginTop: 16, gap: 10 },
  primaryBtn: {
    borderRadius: 999, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  ghostBtn: {
    borderRadius: 999, paddingVertical: 13,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1,
  },
  ghostBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  faqCard: {
    borderRadius: 13, borderWidth: 0.5,
    marginBottom: 8, overflow: "hidden",
  },
  faqHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14,
  },
  faqQ: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  faqA: {
    fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20,
    paddingHorizontal: 14, paddingBottom: 14,
    
    paddingTop: 12, color: "#666",
  },

  emailCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    margin: 16, marginTop: 8,
    borderRadius: 14, borderWidth: 0.5, padding: 14,
  },
  emailIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  emailTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  emailAddr: { fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 2 },
  emailNote: { fontSize: 12, fontFamily: "Inter_400Regular" },

  aiNotice: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderRadius: 12, borderWidth: 1,
    padding: 12, marginBottom: 20,
  },
  aiNoticeText: {
    flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17,
  },

  fieldLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5, marginBottom: 8 },
  fieldLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  charCount: { fontSize: 11, fontFamily: "Inter_400Regular" },

  pill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 999, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  pillText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  priorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  priorityBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1,
    padding: 10, flexGrow: 1, flexBasis: "47%", minWidth: 0,
  },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  priorityLabel: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontFamily: "Inter_600SemiBold" },
  priorityDesc: { flexShrink: 1, fontSize: 10, lineHeight: 14, fontFamily: "Inter_400Regular", marginTop: 1 },

  input: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Inter_400Regular",
    marginBottom: 18,
  },
  textarea: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: "Inter_400Regular",
    minHeight: 130, maxHeight: 200,
    marginBottom: 18,
  },

  deviceToggle: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 13, borderWidth: 1,
    padding: 13, marginBottom: 8,
  },
  deviceToggleIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  deviceToggleTitle: { fontSize: 14, fontFamily: "Inter_500Medium" },
  deviceToggleSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  toggle: { width: 42, height: 24, borderRadius: 12 },
  toggleKnob: {
    position: "absolute", top: 2, left: 2,
    width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff",
  },

  devicePreviewToggle: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 8, borderWidth: 0.5,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, alignSelf: "flex-start",
  },
  devicePreviewText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  deviceInfoBox: {
    borderRadius: 10, borderWidth: 0.5,
    padding: 12, marginBottom: 12, gap: 4,
  },
  deviceInfoRow: { flexDirection: "row", gap: 8 },
  deviceInfoKey: { flexShrink: 1, fontSize: 11, lineHeight: 15, fontFamily: "Inter_500Medium", width: 110 },
  deviceInfoVal: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 15, fontFamily: "Inter_400Regular" },

  submitBar: {
    padding: 14, paddingTop: 12,
    
  },

  successCard: {
    width: "100%", borderRadius: 20, borderWidth: 1,
    padding: 24, alignItems: "center", gap: 10, marginBottom: 16,
  },
  successIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  successSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },

  aiThinkingCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    width: "100%", borderRadius: 16, borderWidth: 1,
    padding: 14, marginBottom: 20,
  },
  aiThinkingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  aiThinkingTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  aiThinkingSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 36, gap: 10 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },

  ticketCard: {
    borderRadius: 16, overflow: "hidden",
    padding: 14, gap: 8,
  },
  ticketTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  ticketStatusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3,
  },
  ticketStatusText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  ticketTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  aiDraftBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3,
    backgroundColor: "#7C3AED18",
  },
  aiDraftBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#7C3AED" },
  ticketSubject: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  ticketMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  ticketIdBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ticketIdText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  ticketCategory: { fontSize: 12, fontFamily: "Inter_400Regular", textTransform: "capitalize" },
});
