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
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassMenuSection, GlassMenuItem, GlassMenuSeparator } from "@/components/ui/GlassMenuItem";

// ─── Theme helpers ────────────────────────────────────────────────────────────
const THEME_LABELS: Record<string, string> = {
  dark: "Dark", light: "Light", system: "System",
};
const THEME_ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  dark: "moon", light: "sunny", system: "phone-portrait-outline",
};
const THEME_GRADIENTS: Record<string, [string, string]> = {
  dark:   ["#1C1C2E", "#2D2D3E"],
  light:  ["#F5C542", "#F5A623"],
  system: ["#636366", "#48484A"],
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
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
      { text: "Sign Out", style: "destructive", onPress: () => signOut() },
    ]);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Settings" />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── PREFERENCES ─────────────────────────────────────────────── */}
        <GlassMenuSection title="PREFERENCES">
          <GlassMenuItem
            icon={THEME_ICONS[themeMode] ?? "phone-portrait-outline"}
            iconBg={THEME_GRADIENTS[themeMode] ?? ["#636366", "#48484A"]}
            label="Appearance"
            value={THEME_LABELS[themeMode] ?? "System"}
            onPress={cycleTheme}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="language-outline"
            iconBg={["#007AFF", "#0055FF"]}
            label="Language"
            value={langLabel}
            onPress={() => router.push("/language-settings")}
          />
          {Platform.OS !== "web" && (
            <>
              <GlassMenuSeparator />
              <GlassMenuItem
                icon="notifications-outline"
                iconBg={["#BF5AF2", "#9B59B6"]}
                label="Notifications"
                onPress={() => router.push("/settings/notifications")}
              />
            </>
          )}
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="chatbubbles-outline"
            iconBg={["#32D74B", "#25A83A"]}
            label="Chats"
            onPress={() => router.push("/settings/chat")}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="cloud-outline"
            iconBg={["#0A84FF", "#0060CC"]}
            label="Storage"
            onPress={() => router.push("/settings/storage")}
          />
          {Platform.OS !== "web" && (
            <>
              <GlassMenuSeparator />
              <GlassMenuItem
                icon="cloud-download-outline"
                iconBg={["#5AC8FA", "#3BA0D6"]}
                label="Offline Videos"
                onPress={() => router.push("/settings/offline-videos" as any)}
              />
            </>
          )}
        </GlassMenuSection>

        {/* ── PRIVACY & SECURITY ──────────────────────────────────────── */}
        <GlassMenuSection title="PRIVACY & SECURITY">
          <GlassMenuItem
            icon="shield-checkmark-outline"
            iconBg={["#30D158", "#22A040"]}
            label="Privacy"
            onPress={() => router.push("/settings/privacy")}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="lock-closed-outline"
            iconBg={["#FF3B30", "#CC2B22"]}
            label="Security & Data"
            onPress={() => router.push("/settings/security")}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="link-outline"
            iconBg={["#5856D6", "#3D3BAA"]}
            label="Linked Accounts"
            onPress={() => router.push("/settings/oauth-providers")}
          />
        </GlassMenuSection>

        {/* ── HELP & ABOUT ─────────────────────────────────────────────── */}
        <GlassMenuSection title="HELP & ABOUT">
          <GlassMenuItem
            icon="help-buoy-outline"
            iconBg={["#5856D6", "#3D3BAA"]}
            label="Support Center"
            onPress={() => router.push("/support" as any)}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="information-circle-outline"
            iconBg={["#007AFF", "#0055FF"]}
            label="About AfuChat"
            onPress={() => router.push("/about" as any)}
          />
        </GlassMenuSection>

        {/* ── ACCOUNT ──────────────────────────────────────────────────── */}
        <GlassMenuSection title="ACCOUNT">
          <GlassMenuItem
            icon="log-out-outline"
            iconBg={["#FF3B30", "#CC2B22"]}
            label="Sign Out"
            danger
            noChevron
            onPress={handleSignOut}
          />
        </GlassMenuSection>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  body: {
    gap: 28,
    paddingTop: 24,
    paddingHorizontal: 16,
  },
});
