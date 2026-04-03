import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { Separator } from "@/components/ui/Separator";

const THEME_LABELS: Record<string, string> = { dark: "Dark", light: "Light", system: "System" };
const THEME_ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  dark: "moon",
  light: "sunny",
  system: "phone-portrait-outline",
};

type MenuItemProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
};

function MenuItem({ icon, iconBg, label, value, onPress, danger }: MenuItemProps) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.item, { backgroundColor: colors.surface }]}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
      <Text style={[styles.label, { color: danger ? "#FF3B30" : colors.text }]}>{label}</Text>
      <View style={styles.right}>
        {value ? <Text style={[styles.value, { color: colors.textMuted }]}>{value}</Text> : null}
        {!danger && <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />}
      </View>
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      <View style={[styles.sectionBody, { borderRadius: 14, overflow: "hidden" }]}>
        {children}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { colors, themeMode, setThemeMode } = useTheme();
  const { langLabel } = useLanguage();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();

  function cycleTheme() {
    const next = themeMode === "dark" ? "light" : themeMode === "light" ? "system" : "dark";
    Haptics.selectionAsync();
    setThemeMode(next);
  }

  function handleSignOut() {
    showAlert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => signOut(),
      },
    ]);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Preferences */}
        <Section title="PREFERENCES">
          <MenuItem
            icon={THEME_ICONS[themeMode] ?? "phone-portrait-outline"}
            iconBg="#1C1C1E"
            label="Appearance"
            value={THEME_LABELS[themeMode] ?? "System"}
            onPress={cycleTheme}
          />
          <Separator indent={54} />
          <MenuItem
            icon="language-outline"
            iconBg="#007AFF"
            label="Language"
            value={langLabel}
            onPress={() => router.push("/language-settings")}
          />
          <Separator indent={54} />
          <MenuItem
            icon="notifications-outline"
            iconBg="#5856D6"
            label="Notifications"
            onPress={() => router.push("/settings/notifications")}
          />
          <Separator indent={54} />
          <MenuItem
            icon="chatbubbles-outline"
            iconBg="#32D74B"
            label="Chats"
            onPress={() => router.push("/settings/chat")}
          />
          <Separator indent={54} />
          <MenuItem
            icon="sparkles-outline"
            iconBg="#BF5AF2"
            label="Advanced Features"
            onPress={() => router.push("/advanced-features")}
          />
        </Section>

        {/* Privacy & Security */}
        <Section title="PRIVACY & SECURITY">
          <MenuItem
            icon="shield-checkmark-outline"
            iconBg="#30D158"
            label="Privacy"
            onPress={() => router.push("/settings/privacy")}
          />
          <Separator indent={54} />
          <MenuItem
            icon="lock-closed-outline"
            iconBg="#FF3B30"
            label="Security & Data"
            onPress={() => router.push("/settings/security")}
          />
          <Separator indent={54} />
          <MenuItem
            icon="ban-outline"
            iconBg="#8E8E93"
            label="Blocked Users"
            onPress={() => router.push("/settings/blocked")}
          />
          {Platform.OS !== "web" && (
            <>
              <Separator indent={54} />
              <MenuItem
                icon="shield-half-outline"
                iconBg="#FF3B30"
                label="Device Security"
                onPress={() => router.push("/device-security")}
              />
            </>
          )}
        </Section>

        {/* Help */}
        <Section title="HELP & ABOUT">
          <MenuItem
            icon="help-buoy-outline"
            iconBg="#5856D6"
            label="Support Center"
            onPress={() => router.push("/support" as any)}
          />
          <Separator indent={54} />
          <MenuItem
            icon="information-circle-outline"
            iconBg="#007AFF"
            label="About AfuChat"
            onPress={() => router.push("/about" as any)}
          />
        </Section>

        {/* Account */}
        <Section title="ACCOUNT">
          <MenuItem
            icon="log-out-outline"
            iconBg="#FF3B30"
            label="Sign Out"
            onPress={handleSignOut}
            danger
          />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 44, alignItems: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  body: { gap: 0, paddingTop: 24, paddingHorizontal: 16 },
  section: { marginBottom: 32 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingLeft: 4,
  },
  sectionBody: { gap: 0 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 14,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  right: { flexDirection: "row", alignItems: "center", gap: 6 },
  value: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
