import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Device from "expo-device";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { MobileOnlyView } from "@/components/ui/MobileOnlyView";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import {
  clearPIN,
  hasPIN,
  isBiometricEnabled,
  setBiometricEnabled,
  setScreenshotProtectionEnabled,
  storePIN,
  verifyPIN,
} from "@/lib/appLock";

let LocalAuthentication: typeof import("expo-local-authentication") | null = null;
if (Platform.OS !== "web") {
  try { LocalAuthentication = require("expo-local-authentication"); } catch {}
}

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
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return "Unknown"; }
}

const PLATFORM_ICON: Record<string, string> = {
  ios: "logo-apple", android: "logo-android", web: "globe-outline", default: "phone-portrait-outline",
};

const DOTS = 4;

function PinKeypad({
  title,
  subtitle,
  onComplete,
  onCancel,
}: {
  title: string;
  subtitle: string;
  onComplete: (pin: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  function shake() {
    Vibration.vibrate(200);
    shakeX.value = withSequence(
      withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }),
      withTiming(-8, { duration: 50 }), withTiming(8, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
    setError(true);
    setTimeout(() => { setError(false); setDigits([]); }, 800);
  }

  function pressDigit(d: string) {
    if (digits.length >= DOTS || error) return;
    const next = [...digits, d];
    setDigits(next);
    if (next.length === DOTS) onComplete(next.join(""));
  }

  function backspace() { setDigits((prev) => prev.slice(0, -1)); }

  const ROWS = [["1","2","3"],["4","5","6"],["7","8","9"],["","0","del"]];

  return (
    <View style={pkStyles.root}>
      <Text style={[pkStyles.title, { color: colors.accent }]}>{title}</Text>
      <Text style={pkStyles.subtitle}>{subtitle}</Text>
      <Animated.View style={[pkStyles.dotsRow, shakeStyle]}>
        {Array.from({ length: DOTS }).map((_, i) => (
          <View key={i} style={[pkStyles.dot, i < digits.length && [pkStyles.dotFilled, { backgroundColor: colors.accent, borderColor: colors.accent }], error && pkStyles.dotError]} />
        ))}
      </Animated.View>
      <View style={pkStyles.keypad}>
        {ROWS.map((row, ri) => (
          <View key={ri} style={pkStyles.row}>
            {row.map((k, ki) => {
              if (!k) return <View key={ki} style={pkStyles.keyBtn} />;
              if (k === "del") return (
                <TouchableOpacity key="del" style={pkStyles.keyBtn} onPress={backspace}>
                  <Ionicons name="backspace-outline" size={22} color={colors.accent} />
                </TouchableOpacity>
              );
              return (
                <TouchableOpacity key={k} style={[pkStyles.keyBtn, pkStyles.keyBtnFill, { backgroundColor: colors.accent + "15", borderColor: colors.accent + "30" }]} onPress={() => pressDigit(k)}>
                  <Text style={[pkStyles.keyText, { color: colors.accent }]}>{k}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
      <TouchableOpacity style={pkStyles.cancelBtn} onPress={onCancel}>
        <Text style={pkStyles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

type PinFlow = "setup_enter" | "setup_confirm" | "disable_verify" | null;

export default function DeviceSecurityScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<SecurityPref>(defaults);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"devices" | "security">("devices");
  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnrolled, setBioEnrolled] = useState(false);
  const [pinFlow, setPinFlow] = useState<PinFlow>(null);
  const [pinFirstEntry, setPinFirstEntry] = useState("");
  const [savingPref, setSavingPref] = useState<string | null>(null);

  const registerCurrentDevice = useCallback(async () => {
    if (!user) return;
    const deviceName = Device.deviceName || Device.modelName || "This Device";
    const platform = Platform.OS;
    const deviceType = Device.deviceType === Device.DeviceType.TABLET ? "Tablet" : "Phone";

    await supabase.from("device_sessions")
      .update({ is_current: false })
      .eq("user_id", user.id)
      .eq("is_current", true);

    const { data: existing } = await supabase.from("device_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("device_name", deviceName)
      .eq("platform", platform)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from("device_sessions")
        .update({ is_current: true, last_seen: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("device_sessions").insert({
        user_id: user.id, device_name: deviceName, device_type: deviceType,
        platform, is_current: true, last_seen: new Date().toISOString(),
      });
    }
  }, [user]);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    await registerCurrentDevice();

    const [{ data: prefData }, { data: sessionData }] = await Promise.all([
      supabase.from("security_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("device_sessions").select("*").eq("user_id", user.id)
        .order("is_current", { ascending: false }).order("last_seen", { ascending: false }),
    ]);

    if (prefData) setPrefs({ ...defaults, ...prefData });

    const localPinSet = await hasPIN();
    const localBioEnabled = await isBiometricEnabled();
    setPrefs((p) => ({
      ...p,
      ...(prefData || {}),
      require_pin: localPinSet,
      biometric_lock: localBioEnabled,
    }));

    setSessions(sessionData || []);

    if (LocalAuthentication) {
      const [supported, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      setBioSupported(supported);
      setBioEnrolled(enrolled);
    }

    setLoading(false);
  }, [user, registerCurrentDevice]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function authenticate(reason: string): Promise<boolean> {
    if (!LocalAuthentication) return true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        fallbackLabel: "Use PIN",
        disableDeviceFallback: false,
      });
      return result.success;
    } catch { return false; }
  }

  async function toggleBiometric() {
    if (!bioSupported) {
      showAlert("Not Supported", "Your device doesn't support biometric authentication.");
      return;
    }
    if (!bioEnrolled) {
      showAlert("Not Set Up", "Please enroll fingerprint or Face ID in your device Settings first.");
      return;
    }
    setSavingPref("biometric_lock");
    const enabling = !prefs.biometric_lock;

    const ok = await authenticate(enabling ? "Confirm to enable biometric lock" : "Confirm your identity to disable biometric lock");
    if (!ok) { setSavingPref(null); return; }

    const next = enabling;
    await setBiometricEnabled(next);
    setPrefs((p) => ({ ...p, biometric_lock: next }));
    await supabase.from("security_preferences").upsert({ user_id: user!.id, biometric_lock: next }, { onConflict: "user_id" });
    setSavingPref(null);
  }

  async function toggleRequirePin() {
    const enabling = !prefs.require_pin;
    if (enabling) {
      setPinFlow("setup_enter");
    } else {
      const pinExists = await hasPIN();
      if (pinExists) {
        setPinFlow("disable_verify");
      } else {
        await clearPIN();
        setPrefs((p) => ({ ...p, require_pin: false }));
        await supabase.from("security_preferences").upsert({ user_id: user!.id, require_pin: false }, { onConflict: "user_id" });
      }
    }
  }

  async function handlePinComplete(pin: string) {
    if (pinFlow === "setup_enter") {
      setPinFirstEntry(pin);
      setPinFlow("setup_confirm");
    } else if (pinFlow === "setup_confirm") {
      if (pin === pinFirstEntry) {
        await storePIN(pin);
        setPrefs((p) => ({ ...p, require_pin: true }));
        await supabase.from("security_preferences").upsert({ user_id: user!.id, require_pin: true }, { onConflict: "user_id" });
        setPinFlow(null);
        setPinFirstEntry("");
        showAlert("PIN Set", "Your app PIN has been saved successfully.");
      } else {
        showAlert("Mismatch", "PINs didn't match. Please try again.");
        setPinFlow("setup_enter");
        setPinFirstEntry("");
      }
    } else if (pinFlow === "disable_verify") {
      const ok = await verifyPIN(pin);
      if (ok) {
        await clearPIN();
        setPrefs((p) => ({ ...p, require_pin: false }));
        await supabase.from("security_preferences").upsert({ user_id: user!.id, require_pin: false }, { onConflict: "user_id" });
        setPinFlow(null);
        showAlert("PIN Removed", "App PIN has been disabled.");
      } else {
        showAlert("Wrong PIN", "Incorrect PIN. Try again.");
      }
    }
  }

  async function toggleLoginAlerts() {
    const next = !prefs.login_alerts;
    setPrefs((p) => ({ ...p, login_alerts: next }));
    await supabase.from("security_preferences").upsert({ user_id: user!.id, login_alerts: next }, { onConflict: "user_id" });
  }

  async function toggleScreenshot() {
    const next = !prefs.screenshot_protection;
    setPrefs((p) => ({ ...p, screenshot_protection: next }));
    await Promise.all([
      setScreenshotProtectionEnabled(next),
      supabase.from("security_preferences").upsert({ user_id: user!.id, screenshot_protection: next }, { onConflict: "user_id" }),
    ]);
    showAlert(
      "Screenshot Protection",
      next
        ? Platform.OS === "android"
          ? "Screenshots and screen recording are now blocked inside AfuChat."
          : "AfuChat will be hidden in the App Switcher and screenshots will be blocked."
        : "Screenshot protection has been disabled.",
    );
  }

  async function revokeSession(session: DeviceSession) {
    if (session.is_current) {
      showAlert("Current Device", "You can't revoke your current device. Use Sign Out in Settings instead.");
      return;
    }
    showAlert("Revoke Access?", `Remove "${session.device_name}" from your account?`, [
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
    showAlert("Sign Out Everywhere?", "This ends all sessions on other devices. They'll need to log in again.", [
      { text: "Cancel" },
      {
        text: "Sign Out All Others", style: "destructive",
        onPress: async () => {
          await supabase.from("device_sessions").delete().eq("user_id", user!.id).eq("is_current", false);
          setSessions((prev) => prev.filter((s) => s.is_current));
          showAlert("Done", "All other devices have been signed out.");
        },
      },
    ]);
  }

  if (pinFlow) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
        <PinKeypad
          key={pinFlow}
          title={
            pinFlow === "setup_enter" ? "Create a PIN" :
            pinFlow === "setup_confirm" ? "Confirm your PIN" :
            "Enter current PIN"
          }
          subtitle={
            pinFlow === "setup_enter" ? "Choose a 4-digit PIN to lock AfuChat" :
            pinFlow === "setup_confirm" ? "Re-enter your PIN to confirm" :
            "Verify your identity to disable the PIN"
          }
          onComplete={handlePinComplete}
          onCancel={() => { setPinFlow(null); setPinFirstEntry(""); }}
        />
      </View>
    );
  }

  const otherDeviceCount = sessions.filter((s) => !s.is_current).length;

  if (Platform.OS === "web") {
    return <MobileOnlyView title="Device Security" />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Device Security</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["devices", "security"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeTab === t && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(t)}
          >
            <Ionicons
              name={t === "devices" ? "phone-portrait-outline" : "shield-checkmark-outline"}
              size={16}
              color={activeTab === t ? colors.accent : colors.textMuted}
            />
            <Text style={[styles.tabText, { color: activeTab === t ? colors.accent : colors.textMuted }]}>
              {t === "devices" ? "Devices" : "Security"}
            </Text>
            {t === "devices" && otherDeviceCount > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: "#FF3B30" }]}>
                <Text style={styles.tabBadgeText}>{otherDeviceCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "devices" ? (
        loading ? (
          <View style={{ padding: 12, gap: 10, marginTop: 8 }}>{[1,2,3,4].map(i => <ListRowSkeleton key={i} />)}</View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }}
            ListHeaderComponent={
              otherDeviceCount > 0 ? (
                <TouchableOpacity style={[styles.revokeAllBtn, { borderColor: "#FF3B30" }]} onPress={revokeAll}>
                  <Ionicons name="log-out-outline" size={18} color="#FF3B30" />
                  <Text style={styles.revokeAllText}>Sign Out All Other Devices</Text>
                </TouchableOpacity>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={[styles.deviceCard, {
                backgroundColor: colors.surface,
                borderColor: item.is_current ? colors.accent + "55" : colors.border,
              }]}>
                <View style={[styles.platformIconWrap, {
                  backgroundColor: item.is_current ? colors.accent + "18" : colors.backgroundTertiary,
                }]}>
                  <Ionicons
                    name={(PLATFORM_ICON[item.platform] || PLATFORM_ICON.default) as any}
                    size={24}
                    color={item.is_current ? colors.accent : colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.deviceNameRow}>
                    <Text style={[styles.deviceName, { color: colors.text }]}>{item.device_name}</Text>
                    {item.is_current && (
                      <View style={[styles.currentBadge, { backgroundColor: colors.accent + "20" }]}>
                        <Ionicons name="checkmark-circle" size={11} color={colors.accent} />
                        <Text style={[styles.currentBadgeText, { color: colors.accent }]}>This device</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.deviceMeta, { color: colors.textMuted }]}>
                    {item.platform?.toUpperCase()} · {item.device_type || "Phone"}
                    {item.ip_address ? ` · ${item.ip_address}` : ""}
                  </Text>
                  <View style={styles.deviceMetaRow}>
                    <Ionicons name="time-outline" size={11} color={colors.textMuted} />
                    <Text style={[styles.deviceMeta, { color: colors.textMuted }]}>
                      {formatLastSeen(item.last_seen)}
                      {item.location ? ` · ${item.location}` : ""}
                    </Text>
                  </View>
                </View>
                {!item.is_current && (
                  <TouchableOpacity onPress={() => revokeSession(item)} disabled={revoking === item.id} hitSlop={8}>
                    {revoking === item.id
                      ? <ActivityIndicator size="small" color="#FF3B30" />
                      : <Ionicons name="close-circle-outline" size={24} color="#FF3B30" />}
                  </TouchableOpacity>
                )}
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="phone-portrait-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No devices found</Text>
              </View>
            }
          />
        )
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          <Text style={[styles.secGroup, { color: colors.textMuted }]}>APP LOCK</Text>

          <View style={[styles.prefCard, { backgroundColor: colors.surface }]}>
            <PrefRow
              icon="finger-print-outline"
              iconColor="#5856D6"
              label="Biometric Lock"
              desc={
                !bioSupported ? "No biometric hardware detected"
                : !bioEnrolled ? "Enroll fingerprint/Face ID in device Settings first"
                : "Use fingerprint or Face ID to unlock"
              }
              value={prefs.biometric_lock}
              onToggle={toggleBiometric}
              disabled={!bioSupported || !bioEnrolled}
              loading={savingPref === "biometric_lock"}
              colors={colors}
            />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <PrefRow
              icon="keypad-outline"
              iconColor="#FF9500"
              label="Require PIN"
              desc={prefs.require_pin ? "4-digit PIN is active" : "Set a 4-digit PIN to lock the app"}
              value={prefs.require_pin}
              onToggle={toggleRequirePin}
              colors={colors}
            />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <PrefRow
              icon="camera-off-outline"
              iconColor="#34C759"
              label="Screenshot Protection"
              desc={Platform.OS === "ios" ? "Hides app in App Switcher" : "Blocks screenshots and screen recording"}
              value={prefs.screenshot_protection}
              onToggle={toggleScreenshot}
              colors={colors}
            />
          </View>

          <Text style={[styles.secGroup, { color: colors.textMuted }]}>ALERTS & NOTIFICATIONS</Text>
          <View style={[styles.prefCard, { backgroundColor: colors.surface }]}>
            <PrefRow
              icon="notifications-outline"
              iconColor={colors.accent}
              label="Login Alerts"
              desc="Get a push notification when a new device signs in to your account"
              value={prefs.login_alerts}
              onToggle={toggleLoginAlerts}
              colors={colors}
            />
          </View>

          <Text style={[styles.secGroup, { color: colors.textMuted }]}>ACCOUNT SECURITY</Text>
          <View style={[styles.prefCard, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => router.push("/settings/security" as any)}
            >
              <View style={[styles.actionIcon, { backgroundColor: "#007AFF" }]}>
                <Ionicons name="key-outline" size={17} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Change Password</Text>
                <Text style={[styles.actionSub, { color: colors.textMuted }]}>Update your account password</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <View style={styles.actionRow}>
              <View style={[styles.actionIcon, { backgroundColor: "#5856D6" }]}>
                <Ionicons name="shield-outline" size={17} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Two-Factor Authentication</Text>
                <Text style={[styles.actionSub, { color: colors.textMuted }]}>
                  {prefs.two_factor_enabled ? "Enabled — extra sign-in protection active" : "Coming soon — email OTP + authenticator app"}
                </Text>
              </View>
              <View style={[styles.soonBadge, { backgroundColor: colors.backgroundTertiary }]}>
                <Text style={[styles.soonText, { color: colors.textMuted }]}>SOON</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function PrefRow({
  icon, iconColor, label, desc, value, onToggle, disabled, loading, colors,
}: {
  icon: string; iconColor: string; label: string; desc?: string;
  value: boolean; onToggle: () => void;
  disabled?: boolean; loading?: boolean;
  colors: any;
}) {
  return (
    <View style={[styles.prefRow, disabled && { opacity: 0.5 }]}>
      <View style={[styles.prefIcon, { backgroundColor: iconColor + "22" }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.prefLabel, { color: colors.text }]}>{label}</Text>
        {desc && <Text style={[styles.prefDesc, { color: colors.textMuted }]}>{desc}</Text>}
      </View>
      {loading
        ? <ActivityIndicator size="small" color={colors.accent} />
        : <Switch
            value={value}
            onValueChange={onToggle}
            disabled={disabled}
            trackColor={{ true: colors.accent, false: colors.backgroundTertiary }}
            thumbColor="#fff"
          />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  revokeAllBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, borderWidth: 1.5, paddingVertical: 13, marginBottom: 6 },
  revokeAllText: { color: "#FF3B30", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  deviceCard: { borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 12, borderWidth: 1 },
  platformIconWrap: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  deviceNameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  deviceName: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  currentBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  currentBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  deviceMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  deviceMeta: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  secGroup: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  prefCard: { borderRadius: 14, overflow: "hidden", marginHorizontal: 14 },
  prefRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  prefIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  prefLabel: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 2 },
  prefDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  actionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  actionSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16, marginTop: 1 },
  soonBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  soonText: { fontSize: 10, fontFamily: "Inter_700Bold" },
});

const pkStyles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 32 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.brand },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#888", textAlign: "center", paddingHorizontal: 40 },
  dotsRow: { flexDirection: "row", gap: 20, marginTop: 8 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "#ccc" },
  dotFilled: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  dotError: { backgroundColor: "#FF3B30", borderColor: "#FF3B30" },
  keypad: { gap: 14 },
  row: { flexDirection: "row", gap: 20 },
  keyBtn: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  keyBtnFill: { backgroundColor: Colors.brand + "15", borderWidth: 1, borderColor: Colors.brand + "30" },
  keyText: { fontSize: 28, fontFamily: "Inter_400Regular", color: Colors.brand },
  cancelBtn: { paddingVertical: 14 },
  cancelText: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#888" },
});
