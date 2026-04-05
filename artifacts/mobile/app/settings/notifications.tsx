import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { registerForPushNotifications, getLastPushRegistrationError } from "@/lib/pushNotifications";

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

const defaults: Prefs = { push_enabled: true, push_messages: true, push_likes: true, push_follows: true, push_gifts: true, push_mentions: true, push_replies: true, quiet_hours_enabled: false };

type DiagState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; permission: string; token: string | null; dbToken: string | null; error?: string };

export default function NotificationSettingsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<Prefs>(defaults);
  const [diag, setDiag] = useState<DiagState>({ status: "idle" });

  useEffect(() => {
    if (!user) return;
    supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) setPrefs({ ...defaults, ...data });
    });
  }, [user]);

  async function toggle(key: keyof Prefs) {
    const val = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: val }));
    if (!user) return;
    await supabase.from("notification_preferences").upsert({ user_id: user.id, [key]: val }, { onConflict: "user_id" });
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
      if (!token) error = getLastPushRegistrationError() ?? "returned null (no error captured)";
    } catch (e: any) {
      error = e?.message || "registration threw";
    }

    try {
      const { data } = await supabase
        .from("profiles")
        .select("expo_push_token")
        .eq("id", user.id)
        .single();
      dbToken = data?.expo_push_token ?? null;
    } catch {}

    setDiag({ status: "done", permission, token, dbToken, error });
  }, [user]);

  useEffect(() => {
    if (Platform.OS !== "web" && user) runDiagnostics();
  }, [user]);

  function Row({ label, field }: { label: string; field: keyof Prefs }) {
    return (
      <View style={[styles.row, { backgroundColor: colors.surface }]}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <Switch value={prefs[field]} onValueChange={() => toggle(field)} trackColor={{ true: colors.accent, false: colors.border }} />
      </View>
    );
  }

  const statusColor = (ok: boolean | null) =>
    ok === null ? colors.textMuted : ok ? "#34C759" : "#FF3B30";

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.backgroundSecondary }]} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>

      {Platform.OS !== "web" && (
        <>
          <Text style={[styles.section, { color: colors.textSecondary }]}>Push Token Status</Text>
          <View style={[styles.diagCard, { backgroundColor: colors.surface }]}>
            {diag.status === "checking" || diag.status === "idle" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator color={colors.accent} />
                <Text style={[styles.diagLabel, { color: colors.textSecondary }]}>Checking push registration…</Text>
              </View>
            ) : (
              <>
                <View style={styles.diagRow}>
                  <Text style={[styles.diagLabel, { color: colors.textSecondary }]}>Permission</Text>
                  <Text style={[styles.diagValue, { color: diag.permission === "granted" ? "#34C759" : "#FF3B30" }]}>
                    {diag.permission}
                  </Text>
                </View>
                <View style={styles.diagRow}>
                  <Text style={[styles.diagLabel, { color: colors.textSecondary }]}>Token obtained</Text>
                  <Text style={[styles.diagValue, { color: statusColor(!!diag.token) }]}>
                    {diag.token ? "✓ yes" : "✗ no"}
                  </Text>
                </View>
                {diag.token && (
                  <View style={styles.diagRow}>
                    <Text style={[styles.diagLabel, { color: colors.textSecondary }]}>Token</Text>
                    <Text style={[styles.diagValueSmall, { color: colors.textMuted }]} numberOfLines={2}>
                      {diag.token}
                    </Text>
                  </View>
                )}
                <View style={styles.diagRow}>
                  <Text style={[styles.diagLabel, { color: colors.textSecondary }]}>Saved in DB</Text>
                  <Text style={[styles.diagValue, { color: statusColor(!!diag.dbToken) }]}>
                    {diag.dbToken ? "✓ yes" : "✗ no"}
                  </Text>
                </View>
                {diag.error && (
                  <View style={[styles.errorBox, { backgroundColor: "#FF3B3020" }]}>
                    <Ionicons name="warning-outline" size={14} color="#FF3B30" />
                    <Text style={styles.errorText}>{diag.error}</Text>
                  </View>
                )}
                {!diag.token && !diag.error && (
                  <View style={[styles.errorBox, { backgroundColor: "#FF3B3020" }]}>
                    <Ionicons name="warning-outline" size={14} color="#FF3B30" />
                    <Text style={styles.errorText}>
                      getExpoPushTokenAsync returned null — check permission or FCM config.
                    </Text>
                  </View>
                )}
              </>
            )}
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: colors.accent + "20", borderColor: colors.accent }]}
              onPress={runDiagnostics}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={16} color={colors.accent} />
              <Text style={[styles.retryText, { color: colors.accent }]}>Re-register push token</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <Text style={[styles.section, { color: colors.textSecondary }]}>Push Notifications</Text>
      <Row label="Enable Push Notifications" field="push_enabled" />
      <Row label="Messages" field="push_messages" />
      <Row label="Likes" field="push_likes" />
      <Row label="New Followers" field="push_follows" />
      <Row label="Gifts" field="push_gifts" />
      <Row label="Mentions" field="push_mentions" />
      <Row label="Replies" field="push_replies" />

      <Text style={[styles.section, { color: colors.textSecondary }]}>Quiet Hours</Text>
      <Row label="Enable Quiet Hours" field="quiet_hours_enabled" />
      {prefs.quiet_hours_enabled && (
        <Text style={[styles.quietNote, { color: colors.textMuted }]}>Notifications silenced 10 PM - 8 AM</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  section: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  quietNote: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 13, fontFamily: "Inter_400Regular" },
  diagCard: { marginHorizontal: 16, borderRadius: 14, padding: 14, gap: 10 },
  diagRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  diagLabel: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  diagValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  diagValueSmall: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 2, textAlign: "right" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: 8, padding: 8, marginTop: 2 },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#FF3B30", flex: 1 },
  retryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 10, borderWidth: 1, marginTop: 4 },
  retryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
