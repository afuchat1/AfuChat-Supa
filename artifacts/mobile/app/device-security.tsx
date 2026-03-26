import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Device from "expo-device";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

type DeviceSession = {
  id: string;
  device_name: string;
  device_type: string;
  platform: string;
  last_seen: string;
  ip_address: string;
  is_current: boolean;
  location?: string;
};

type SecurityPref = {
  two_factor_enabled: boolean;
  login_alerts: boolean;
  require_pin: boolean;
  biometric_lock: boolean;
  screenshot_protection: boolean;
};

const defaults: SecurityPref = {
  two_factor_enabled: false,
  login_alerts: true,
  require_pin: false,
  biometric_lock: false,
  screenshot_protection: false,
};

function formatLastSeen(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return "Unknown"; }
}

const PLATFORM_ICON: Record<string, string> = {
  ios: "logo-apple", android: "logo-android", web: "globe-outline", default: "phone-portrait-outline",
};

export default function DeviceSecurityScreen() {
  const { colors } = useTheme();
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<SecurityPref>(defaults);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"devices" | "security">("devices");

  const loadSessions = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Load security preferences
    const { data: prefData } = await supabase
      .from("security_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (prefData) setPrefs({ ...defaults, ...prefData });

    // Load device sessions
    const { data: sessionData } = await supabase
      .from("device_sessions")
      .select("id, device_name, device_type, platform, last_seen, ip_address, is_current, location")
      .eq("user_id", user.id)
      .order("last_seen", { ascending: false });

    if (sessionData && sessionData.length > 0) {
      setSessions(sessionData);
    } else {
      // Synthesize current device session
      const currentSession: DeviceSession = {
        id: "current",
        device_name: Device.deviceName || "This Device",
        device_type: Device.deviceType === Device.DeviceType.PHONE ? "Phone" : "Tablet",
        platform: Platform.OS,
        last_seen: new Date().toISOString(),
        ip_address: "—",
        is_current: true,
      };
      setSessions([currentSession]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  async function revokeSession(session: DeviceSession) {
    if (session.is_current) { showAlert("Current device", "You can't revoke your current session. Sign out instead."); return; }
    showAlert("Revoke Access?", `Remove ${session.device_name} from your account?`, [
      { text: "Cancel" },
      {
        text: "Revoke", style: "destructive",
        onPress: async () => {
          setRevoking(session.id);
          await supabase.from("device_sessions").delete().eq("id", session.id);
          setSessions((prev) => prev.filter((s) => s.id !== session.id));
          setRevoking(null);
        },
      },
    ]);
  }

  async function revokeAll() {
    showAlert("Sign Out Everywhere?", "This will end all sessions except your current device.", [
      { text: "Cancel" },
      {
        text: "Sign Out All", style: "destructive",
        onPress: async () => {
          await supabase.from("device_sessions").delete().eq("user_id", user!.id).eq("is_current", false);
          setSessions((prev) => prev.filter((s) => s.is_current));
          showAlert("Done", "All other devices have been signed out");
        },
      },
    ]);
  }

  async function togglePref(key: keyof SecurityPref) {
    if (!user) return;
    const val = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: val }));
    await supabase.from("security_preferences").upsert({ user_id: user.id, [key]: val }, { onConflict: "user_id" });
  }

  function PrefRow({ label, desc, field }: { label: string; desc?: string; field: keyof SecurityPref }) {
    return (
      <View style={[styles.prefRow, { backgroundColor: colors.surface }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.prefLabel, { color: colors.text }]}>{label}</Text>
          {desc && <Text style={[styles.prefDesc, { color: colors.textMuted }]}>{desc}</Text>}
        </View>
        <Switch
          value={prefs[field]}
          onValueChange={() => togglePref(field)}
          trackColor={{ true: Colors.brand, false: colors.backgroundTertiary }}
          thumbColor="#fff"
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Device Security</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>Manage access and security settings</Text>
        </View>
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["devices", "security"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, activeTab === t && { borderBottomColor: Colors.brand, borderBottomWidth: 2 }]} onPress={() => setActiveTab(t)}>
            <Ionicons name={t === "devices" ? "phone-portrait-outline" : "shield-checkmark-outline"} size={16} color={activeTab === t ? Colors.brand : colors.textMuted} />
            <Text style={[styles.tabText, { color: activeTab === t ? Colors.brand : colors.textMuted }]}>
              {t === "devices" ? "Devices" : "Security"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "devices" ? (
        <>
          {loading ? (
            <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={sessions}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 40 }}
              ListHeaderComponent={
                sessions.filter((s) => !s.is_current).length > 0 ? (
                  <TouchableOpacity style={[styles.revokeAll, { borderColor: "#FF3B30" }]} onPress={revokeAll}>
                    <Ionicons name="log-out-outline" size={18} color="#FF3B30" />
                    <Text style={styles.revokeAllText}>Sign Out All Other Devices</Text>
                  </TouchableOpacity>
                ) : null
              }
              renderItem={({ item }) => (
                <View style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: item.is_current ? Colors.brand + "44" : colors.border }]}>
                  <View style={[styles.platformIcon, { backgroundColor: item.is_current ? Colors.brand + "18" : colors.backgroundTertiary }]}>
                    <Ionicons name={(PLATFORM_ICON[item.platform] || PLATFORM_ICON.default) as any} size={24} color={item.is_current ? Colors.brand : colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.deviceNameRow}>
                      <Text style={[styles.deviceName, { color: colors.text }]}>{item.device_name}</Text>
                      {item.is_current && (
                        <View style={[styles.currentBadge, { backgroundColor: Colors.brand + "20" }]}>
                          <Text style={[styles.currentBadgeText, { color: Colors.brand }]}>Current</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.deviceMeta, { color: colors.textMuted }]}>
                      {item.platform?.toUpperCase()} · {item.device_type} · {item.ip_address}
                    </Text>
                    <Text style={[styles.deviceMeta, { color: colors.textMuted }]}>
                      Last active: {formatLastSeen(item.last_seen)}
                      {item.location ? ` · ${item.location}` : ""}
                    </Text>
                  </View>
                  {!item.is_current && (
                    <TouchableOpacity onPress={() => revokeSession(item)} disabled={revoking === item.id}>
                      {revoking === item.id
                        ? <ActivityIndicator size="small" color="#FF3B30" />
                        : <Ionicons name="close-circle-outline" size={22} color="#FF3B30" />}
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          )}
        </>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={[styles.secGroup, { color: colors.textMuted }]}>ACCOUNT SECURITY</Text>
          <PrefRow label="Two-Factor Authentication" desc="Add an extra layer of sign-in security" field="two_factor_enabled" />
          <PrefRow label="Login Alerts" desc="Get notified when a new device signs in" field="login_alerts" />

          <Text style={[styles.secGroup, { color: colors.textMuted }]}>APP LOCK</Text>
          <PrefRow label="Require PIN" desc="Lock the app with a PIN when backgrounded" field="require_pin" />
          <PrefRow label="Biometric Lock" desc="Use Face ID or fingerprint to unlock" field="biometric_lock" />
          <PrefRow label="Screenshot Protection" desc="Block screenshots inside AfuChat" field="screenshot_protection" />

          <Text style={[styles.secGroup, { color: colors.textMuted }]}>DANGER ZONE</Text>
          <TouchableOpacity
            style={[styles.dangerBtn, { backgroundColor: "#FF3B3012" }]}
            onPress={() => showAlert("Sign Out?", "You will be signed out of this device.", [
              { text: "Cancel" }, { text: "Sign Out", style: "destructive", onPress: signOut }
            ])}
          >
            <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
            <Text style={styles.dangerBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  revokeAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 12, marginBottom: 8 },
  revokeAllText: { color: "#FF3B30", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  deviceCard: { borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 12, borderWidth: 1 },
  platformIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  deviceNameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  deviceName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  currentBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  currentBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  deviceMeta: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  secGroup: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  prefRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, marginBottom: StyleSheet.hairlineWidth },
  prefLabel: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 2 },
  prefDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  dangerBtn: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, borderRadius: 14, padding: 16, marginTop: 4 },
  dangerBtnText: { color: "#FF3B30", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
