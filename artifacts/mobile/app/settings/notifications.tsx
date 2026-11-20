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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { supabase } from "@/lib/supabase";
import { isExpoGo } from "@/lib/expoEnvironment";

type NotificationsModule = typeof import("expo-notifications");

let notificationsModule: NotificationsModule | null | undefined;
function getNotifications(): NotificationsModule | null {
  if (notificationsModule !== undefined) return notificationsModule;
  if (Platform.OS === "web" || isExpoGo()) return (notificationsModule = null);
  try {
    notificationsModule = require("expo-notifications") as NotificationsModule;
  } catch {
    notificationsModule = null;
  }
  return notificationsModule;
}

type NotificationPreferences = {
  push_enabled: boolean;
  message_notifications: boolean;
  call_notifications: boolean;
  social_notifications: boolean;
  commerce_notifications: boolean;
  group_notifications: boolean;
  muted_until: string | null;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  push_enabled: true,
  message_notifications: true,
  call_notifications: true,
  social_notifications: true,
  commerce_notifications: true,
  group_notifications: true,
  muted_until: null,
};

function ToggleRow({
  title,
  description,
  value,
  disabled,
  accent,
  muted,
  textColor,
  onChange,
}: {
  title: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  accent: string;
  muted: string;
  textColor: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleTitle, { color: textColor }]}>{title}</Text>
        {description ? <Text style={[styles.description, { color: muted }]}>{description}</Text> : null}
      </View>
      <Switch
        accessibilityRole="switch"
        accessibilityLabel={title}
        accessibilityState={{ checked: value, disabled }}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: accent, false: muted + "55" }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<string | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);

  const refreshPermission = useCallback(async () => {
    const Notifications = getNotifications();
    if (!Notifications) return;
    try {
      const result = await Notifications.getPermissionsAsync();
      setPermission(result.status);
      setCanAskAgain(result.canAskAgain);
    } catch {
      setPermission(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await (supabase as any)
          .from("user_notification_preferences")
          .select("push_enabled, message_notifications, call_notifications, social_notifications, commerce_notifications, group_notifications, muted_until")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (active && data) {
          setPreferences({ ...DEFAULT_PREFERENCES, ...data });
        }
      } catch (error: any) {
        if (active) showAlert("Notification settings unavailable", error?.message ?? "Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    void refreshPermission();
    return () => {
      active = false;
    };
  }, [user?.id, refreshPermission]);

  const save = useCallback(async (patch: Partial<NotificationPreferences>) => {
    if (!user?.id || saving) return;
    const previous = preferences;
    setPreferences((current) => ({ ...current, ...patch }));
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("user_notification_preferences")
        .upsert({
          user_id: user.id,
          ...patch,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      if (error) throw error;
    } catch (error: any) {
      setPreferences(previous);
      showAlert("Could not save settings", error?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  }, [preferences, saving, user?.id]);

  const setTemporaryMute = (hours: number | null) => {
    void save({
      muted_until: hours === null
        ? null
        : new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
    });
  };

  const requestPermission = async () => {
    try {
      const Notifications = getNotifications();
      if (!Notifications) return;
      if (!canAskAgain && permission === "denied") {
        await Linking.openSettings();
      } else {
        const result = await Notifications.requestPermissionsAsync();
        setPermission(result.status);
        setCanAskAgain(result.canAskAgain);
        if (result.status !== "granted") {
          showAlert("Notifications are off", "Enable AfuChat notifications in your device settings to receive alerts.");
        }
      }
    } catch (error: any) {
      showAlert("Could not open notification settings", error?.message ?? "Please try again.");
    }
  };

  const cardStyle = [styles.card, { backgroundColor: colors.cardSurface, borderColor: colors.border }];
  const mutedText = colors.textMuted;
  const currentMute = preferences.muted_until ? Date.parse(preferences.muted_until) : NaN;
  const isTemporarilyMuted = Number.isFinite(currentMute) && currentMute > Date.now();

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Notifications" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={accent} style={styles.loader} />
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: mutedText }]}>PUSH ALERTS</Text>
            <View style={cardStyle}>
              <ToggleRow
                title="Allow notifications"
                description="Master control for AfuChat push alerts on all your devices"
                value={preferences.push_enabled}
                disabled={saving}
                accent={accent}
                muted={mutedText}
                textColor={colors.text}
                onChange={(value) => void save({ push_enabled: value })}
              />
            </View>

            <Text style={[styles.sectionTitle, { color: mutedText }]}>ALERT TYPES</Text>
            <View style={cardStyle}>
              <ToggleRow
                title="Messages"
                value={preferences.message_notifications}
                disabled={saving || !preferences.push_enabled}
                accent={accent}
                muted={mutedText}
                textColor={colors.text}
                onChange={(value) => void save({ message_notifications: value })}
              />
              <View style={[styles.divider, { backgroundColor: colors.separator }]} />
              <ToggleRow
                title="Calls"
                value={preferences.call_notifications}
                disabled={saving || !preferences.push_enabled}
                accent={accent}
                muted={mutedText}
                textColor={colors.text}
                onChange={(value) => void save({ call_notifications: value })}
              />
              <View style={[styles.divider, { backgroundColor: colors.separator }]} />
              <ToggleRow
                title="Social activity"
                value={preferences.social_notifications}
                disabled={saving || !preferences.push_enabled}
                accent={accent}
                muted={mutedText}
                textColor={colors.text}
                onChange={(value) => void save({ social_notifications: value })}
              />
              <View style={[styles.divider, { backgroundColor: colors.separator }]} />
              <ToggleRow
                title="Payments and orders"
                value={preferences.commerce_notifications}
                disabled={saving || !preferences.push_enabled}
                accent={accent}
                muted={mutedText}
                textColor={colors.text}
                onChange={(value) => void save({ commerce_notifications: value })}
              />
            </View>

            <Text style={[styles.sectionTitle, { color: mutedText }]}>ORGANIZATION</Text>
            <View style={cardStyle}>
              <ToggleRow
                title="Group related notifications"
                description="Keep conversation and activity alerts together"
                value={preferences.group_notifications}
                disabled={saving}
                accent={accent}
                muted={mutedText}
                textColor={colors.text}
                onChange={(value) => void save({ group_notifications: value })}
              />
            </View>

            <Text style={[styles.sectionTitle, { color: mutedText }]}>QUIET TIME</Text>
            <View style={cardStyle}>
              <Text style={[styles.muteDescription, { color: mutedText }]}>
                Pause push alerts temporarily. Your alert type choices stay unchanged.
              </Text>
              <View style={styles.durationRow}>
                {[
                  { label: "1 hour", hours: 1 },
                  { label: "8 hours", hours: 8 },
                  { label: "24 hours", hours: 24 },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.hours}
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => setTemporaryMute(item.hours)}
                    style={[styles.durationButton, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.durationText, { color: colors.text }]}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {isTemporarilyMuted ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={() => setTemporaryMute(null)}
                  style={styles.resumeButton}
                >
                  <Ionicons name="notifications-outline" size={17} color={accent} />
                  <Text style={[styles.resumeText, { color: accent }]}>Resume notifications</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {Platform.OS !== "web" && !isExpoGo() ? (
              <>
                <Text style={[styles.sectionTitle, { color: mutedText }]}>DEVICE PERMISSION</Text>
                <View style={[cardStyle, styles.permissionCard]}>
                  <View style={styles.permissionCopy}>
                    <Text style={[styles.permissionTitle, { color: colors.text }]}>
                      {permission === "granted" ? "Device notifications are allowed" : "Allow AfuChat on this device"}
                    </Text>
                    <Text style={[styles.description, { color: mutedText }]}>
                      {permission === "granted"
                        ? "You can still control each alert type above."
                        : "Device permission is also required for push alerts."}
                    </Text>
                  </View>
                  {permission !== "granted" ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => void requestPermission()}
                      style={[styles.permissionButton, { backgroundColor: accent }]}
                    >
                      <Text style={styles.permissionButtonText}>
                        {permission === "denied" && !canAskAgain ? "Open settings" : "Enable"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 6, gap: 10 },
  loader: { marginTop: 32 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    marginTop: 12,
    marginHorizontal: 4,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "hidden",
  },
  toggleRow: {
    minHeight: 58,
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  toggleText: { flex: 1, gap: 3 },
  toggleTitle: { color: "#111827", fontSize: 15, fontWeight: "600" },
  description: { fontSize: 12, lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 15 },
  muteDescription: { fontSize: 13, lineHeight: 19, paddingHorizontal: 15, paddingTop: 14 },
  durationRow: { flexDirection: "row", gap: 8, padding: 14 },
  durationButton: {
    flex: 1,
    minHeight: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  durationText: { fontSize: 13, fontWeight: "600" },
  resumeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(127,127,127,0.25)",
    padding: 13,
  },
  resumeText: { fontSize: 14, fontWeight: "600" },
  permissionCard: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  permissionCopy: { flex: 1, gap: 4 },
  permissionTitle: { fontSize: 14, fontWeight: "600" },
  permissionButton: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  permissionButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});
