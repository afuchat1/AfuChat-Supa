import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { registerForPushNotifications, getLastPushRegistrationError } from "@/lib/pushNotifications";
import { getSoundMode, setSoundMode, playNotificationSound, SoundMode } from "@/lib/soundManager";

type Prefs = {
  push_enabled: boolean;
  push_messages: boolean;
  push_likes: boolean;
  push_follows: boolean;
  push_gifts: boolean;
  push_mentions: boolean;
  push_replies: boolean;
  quiet_hours_enabled: boolean;
};

const defaults: Prefs = {
  push_enabled: true,
  push_messages: true,
  push_likes: true,
  push_follows: true,
  push_gifts: true,
  push_mentions: true,
  push_replies: true,
  quiet_hours_enabled: false,
};

type DiagState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; permission: string; token: string | null; dbToken: string | null; error?: string };

const SOUND_OPTIONS: { value: SoundMode; icon: string; label: string; sub: string }[] = [
  { value: "afuchat", icon: "musical-notes",  label: "AfuChat Sound",   sub: "Branded tune — our signature sound" },
  { value: "device",  icon: "phone-portrait",  label: "Device Default",  sub: "Your system notification sound" },
  { value: "silent",  icon: "volume-mute",     label: "Silent",          sub: "Vibrate only — no sound" },
];

export default function NotificationSettingsScreen() {
  if (Platform.OS === "web") return null;

  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [prefs, setPrefs]           = useState<Prefs>(defaults);
  const [soundMode, setSoundModeState] = useState<SoundMode>("afuchat");
  const [testingSound, setTestingSound] = useState(false);
  const [diag, setDiag]             = useState<DiagState>({ status: "idle" });

  // Load prefs from DB
  useEffect(() => {
    if (!user) return;
    supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) setPrefs({ ...defaults, ...data });
    });
  }, [user]);

  // Load sound mode from AsyncStorage
  useEffect(() => {
    getSoundMode().then(setSoundModeState);
  }, []);

  async function toggle(key: keyof Prefs) {
    const val = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: val }));
    if (!user) return;
    await supabase.from("notification_preferences").upsert({ user_id: user.id, [key]: val }, { onConflict: "user_id" });
    Haptics.selectionAsync();
  }

  async function handleSoundModeChange(mode: SoundMode) {
    setSoundModeState(mode);
    await setSoundMode(mode);
    Haptics.selectionAsync();
  }

  async function testSound() {
    if (testingSound) return;
    setTestingSound(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await playNotificationSound();
    setTimeout(() => setTestingSound(false), 1200);
  }

  function openSystemSettings() {
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:");
    } else if (Platform.OS === "android") {
      Linking.openSettings();
    }
  }

  const runDiagnostics = useCallback(async () => {
    if (!user || Platform.OS === "web") return;
    setDiag({ status: "checking" });
    let permission = "unknown";
    let token: string | null = null;
    let dbToken: string | null = null;
    let error: string | undefined;

    try {
      const Notifications = require("expo-notifications");
      const { status } = await Notifications.getPermissionsAsync();
      permission = status;
    } catch (e: any) {
      permission = "error: " + (e?.message || "unknown");
    }

    try {
      token = await registerForPushNotifications(user.id);
      if (!token) error = getLastPushRegistrationError() ?? "returned null";
    } catch (e: any) {
      error = e?.message || "registration threw";
    }

    try {
      const { data } = await supabase.from("profiles").select("expo_push_token").eq("id", user.id).single();
      dbToken = data?.expo_push_token ?? null;
    } catch {}

    setDiag({ status: "done", permission, token, dbToken, error });
  }, [user]);

  useEffect(() => {
    if (Platform.OS !== "web" && user) runDiagnostics();
  }, [user]);

  const statusColor = (ok: boolean | null) =>
    ok === null ? colors.textMuted : ok ? "#34C759" : "#FF3B30";

  function PrefRow({ label, field, sub }: { label: string; field: keyof Prefs; sub?: string }) {
    return (
      <View style={[st.row, { backgroundColor: colors.surface }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[st.rowLabel, { color: colors.text }]}>{label}</Text>
          {sub && <Text style={[st.rowSub, { color: colors.textMuted }]}>{sub}</Text>}
        </View>
        <Switch
          value={prefs[field]}
          onValueChange={() => toggle(field)}
          trackColor={{ true: accent, false: colors.border }}
          thumbColor={Platform.OS === "android" ? (prefs[field] ? accent : colors.textMuted) : undefined}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={[st.root, { backgroundColor: colors.backgroundSecondary }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: colors.text }]}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={[st.accentLine, { backgroundColor: accent }]} />

      {/* ── Notification Sound ─────────────────────────────────────── */}
      <Text style={[st.section, { color: colors.textSecondary }]}>Notification Sound</Text>
      <View style={[st.soundGrid, { backgroundColor: colors.surface }]}>
        {SOUND_OPTIONS.map((opt) => {
          const active = soundMode === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                st.soundCard,
                { borderColor: active ? accent : colors.border, backgroundColor: active ? accent + "12" : colors.surface },
              ]}
              onPress={() => handleSoundModeChange(opt.value)}
              activeOpacity={0.8}
            >
              <View style={[st.soundIconWrap, { backgroundColor: active ? accent + "20" : colors.backgroundSecondary }]}>
                <Ionicons name={opt.icon as any} size={22} color={active ? accent : colors.textSecondary} />
              </View>
              <Text style={[st.soundCardLabel, { color: active ? accent : colors.text }]}>{opt.label}</Text>
              <Text style={[st.soundCardSub, { color: colors.textMuted }]} numberOfLines={2}>{opt.sub}</Text>
              {active && (
                <View style={[st.soundCheckmark, { backgroundColor: accent }]}>
                  <Ionicons name="checkmark" size={11} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Test sound + system settings */}
      <View style={[st.soundActions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity
          style={[st.testBtn, { backgroundColor: accent + "15", borderColor: accent + "50" }]}
          onPress={testSound}
          disabled={testingSound || soundMode === "silent"}
          activeOpacity={0.8}
        >
          {testingSound ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Ionicons name="volume-high-outline" size={16} color={soundMode === "silent" ? colors.textMuted : accent} />
          )}
          <Text style={[st.testBtnText, { color: soundMode === "silent" ? colors.textMuted : accent }]}>
            {testingSound ? "Playing…" : "Test Sound"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={st.sysSettingsBtn} onPress={openSystemSettings} activeOpacity={0.7}>
          <Ionicons name="settings-outline" size={14} color={colors.textMuted} />
          <Text style={[st.sysSettingsText, { color: colors.textMuted }]}>
            Change push sound in system settings →
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Push Notification Prefs ───────────────────────────────── */}
      <Text style={[st.section, { color: colors.textSecondary }]}>Push Notifications</Text>
      <PrefRow label="Enable Push Notifications" field="push_enabled" sub="Master toggle for all push alerts" />
      <PrefRow label="Messages"      field="push_messages" sub="Chat messages from your contacts" />
      <PrefRow label="Likes"         field="push_likes"    sub="When someone likes your post" />
      <PrefRow label="New Followers" field="push_follows"  sub="When someone starts following you" />
      <PrefRow label="Gifts"         field="push_gifts"    sub="When someone sends you a gift" />
      <PrefRow label="Mentions"      field="push_mentions" sub="When you're mentioned in a post" />
      <PrefRow label="Replies"       field="push_replies"  sub="When someone replies to your post" />

      {/* ── Quiet Hours ───────────────────────────────────────────── */}
      <Text style={[st.section, { color: colors.textSecondary }]}>Quiet Hours</Text>
      <PrefRow label="Enable Quiet Hours" field="quiet_hours_enabled" sub="Silence notifications 10 PM – 8 AM" />

      {/* ── Interactive Actions Info ──────────────────────────────── */}
      <Text style={[st.section, { color: colors.textSecondary }]}>Quick Actions</Text>
      <View style={[st.infoCard, { backgroundColor: colors.surface, borderColor: accent + "30" }]}>
        <View style={[st.infoIconWrap, { backgroundColor: accent + "15" }]}>
          <Ionicons name="flash" size={20} color={accent} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[st.infoTitle, { color: colors.text }]}>Reply without opening AfuChat</Text>
          <Text style={[st.infoBody, { color: colors.textSecondary }]}>
            Notifications include action buttons so you can reply to messages, like posts, follow back, or snooze reminders — all directly from your lock screen or status bar.
          </Text>
          <View style={st.actionTagsRow}>
            {["💬 Reply", "❤️ Like", "➕ Follow", "🔕 Snooze"].map((tag) => (
              <View key={tag} style={[st.actionTag, { backgroundColor: accent + "15" }]}>
                <Text style={[st.actionTagText, { color: accent }]}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ── Push Token Diagnostics ────────────────────────────────── */}
      {Platform.OS !== "web" && (
        <>
          <Text style={[st.section, { color: colors.textSecondary }]}>Push Registration Status</Text>
          <View style={[st.diagCard, { backgroundColor: colors.surface }]}>
            {diag.status === "checking" || diag.status === "idle" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator color={accent} />
                <Text style={[st.diagLabel, { color: colors.textSecondary }]}>Checking push registration…</Text>
              </View>
            ) : (
              <>
                <View style={st.diagRow}>
                  <Text style={[st.diagLabel, { color: colors.textSecondary }]}>Permission</Text>
                  <Text style={[st.diagValue, { color: diag.permission === "granted" ? "#34C759" : "#FF3B30" }]}>
                    {diag.permission}
                  </Text>
                </View>
                <View style={st.diagRow}>
                  <Text style={[st.diagLabel, { color: colors.textSecondary }]}>Token obtained</Text>
                  <Text style={[st.diagValue, { color: statusColor(!!diag.token) }]}>
                    {diag.token ? "✓ yes" : "✗ no"}
                  </Text>
                </View>
                {diag.token && (
                  <View style={st.diagRow}>
                    <Text style={[st.diagLabel, { color: colors.textSecondary }]}>Token</Text>
                    <Text style={[st.diagValueSmall, { color: colors.textMuted }]} numberOfLines={2}>
                      {diag.token}
                    </Text>
                  </View>
                )}
                <View style={st.diagRow}>
                  <Text style={[st.diagLabel, { color: colors.textSecondary }]}>Saved in DB</Text>
                  <Text style={[st.diagValue, { color: statusColor(!!diag.dbToken) }]}>
                    {diag.dbToken ? "✓ yes" : "✗ no"}
                  </Text>
                </View>
                {diag.error && (
                  <View style={[st.errorBox, { backgroundColor: "#FF3B3020" }]}>
                    <Ionicons name="warning-outline" size={14} color="#FF3B30" />
                    <Text style={st.errorText}>{diag.error}</Text>
                  </View>
                )}
              </>
            )}
            <TouchableOpacity
              style={[st.retryBtn, { backgroundColor: accent + "20", borderColor: accent }]}
              onPress={runDiagnostics}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={16} color={accent} />
              <Text style={[st.retryText, { color: accent }]}>Re-register push token</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  accentLine: { height: 2, opacity: 0.85 },

  section: {
    fontSize: 12, fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8,
    textTransform: "uppercase", letterSpacing: 0.6,
  },

  // Sound mode cards
  soundGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 12, paddingVertical: 12, gap: 10,
  },
  soundCard: {
    flex: 1, minWidth: "28%",
    borderRadius: 14, borderWidth: 1.5,
    padding: 12, gap: 6,
    alignItems: "flex-start",
  },
  soundIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  soundCardLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  soundCardSub: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  soundCheckmark: {
    position: "absolute", top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },

  soundActions: {
    marginHorizontal: 16, borderRadius: 14, borderWidth: 1,
    padding: 14, gap: 12, marginTop: 2,
  },
  testBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 10, paddingVertical: 11, borderWidth: 1,
  },
  testBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sysSettingsBtn: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" },
  sysSettingsText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Pref rows
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "transparent",
  },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Quick actions info card
  infoCard: {
    marginHorizontal: 16, borderRadius: 14, borderWidth: 1,
    padding: 14, flexDirection: "row", gap: 12, alignItems: "flex-start",
  },
  infoIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  infoTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  infoBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  actionTagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  actionTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  actionTagText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  // Diagnostics
  diagCard: {
    marginHorizontal: 16, borderRadius: 14, padding: 14, gap: 10,
  },
  diagRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  diagLabel: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  diagValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  diagValueSmall: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 2, textAlign: "right" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: 8, padding: 8 },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#FF3B30", flex: 1 },
  retryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: 10, paddingVertical: 10, borderWidth: 1, marginTop: 4,
  },
  retryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
