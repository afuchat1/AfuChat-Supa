import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
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
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassMenuSection, GlassMenuItem, GlassMenuSeparator } from "@/components/ui/GlassMenuItem";
import { Avatar } from "@/components/ui/Avatar";

// ─── Theme helpers ────────────────────────────────────────────────────────────
const THEME_LABELS: Record<string, string> = {
  dark: "Dark", light: "Light", system: "System",
};
const THEME_ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  dark: "moon", light: "sunny", system: "phone-portrait-outline",
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { colors, isDark, themeMode, setThemeMode, accent } = useTheme();
  const { langLabel } = useLanguage();
  const { user, profile, linkedAccounts, signOut, switchAccount } = useAuth();
  const insets = useSafeAreaInsets();

  const [switchingId, setSwitchingId] = useState<string | null>(null);

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

  async function handleSwitch(userId: string) {
    if (userId === user?.id || switchingId) return;
    showAlert(
      "Switch account?",
      "Your current session will be saved and you'll switch to the selected account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: async () => {
            setSwitchingId(userId);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const result = await switchAccount(userId);
            setSwitchingId(null);
            if (!result.success) {
              showAlert("Switch Failed", result.error || "Could not switch account. Please add it again.");
            }
          },
        },
      ]
    );
  }

  // Build the display list: current account first, then others
  const activeAccount = linkedAccounts.find((a) => a.userId === user?.id);
  const otherAccounts = linkedAccounts.filter((a) => a.userId !== user?.id);

  // Synthesise current account from profile if not yet stored
  const displayAccounts =
    linkedAccounts.length === 0 && user && profile
      ? [
          {
            userId: user.id,
            displayName: profile.display_name,
            handle: profile.handle,
            avatarUrl: profile.avatar_url,
            email: user.email || "",
            accessToken: "",
            refreshToken: "",
          },
        ]
      : activeAccount
      ? [activeAccount, ...otherAccounts]
      : linkedAccounts;

  const hasOtherAccounts = otherAccounts.length > 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Settings" />

      {/* Full-screen overlay during switch */}
      {switchingId && (
        <View style={styles.switchOverlay}>
          <View style={[styles.switchCard, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={[styles.switchingText, { color: colors.text }]}>
              Switching account…
            </Text>
            <Text style={[styles.switchingSub, { color: colors.textMuted }]}>
              Clearing data and loading your other account
            </Text>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
        pointerEvents={switchingId ? "none" : "auto"}
      >
        {/* ── ACCOUNTS ─────────────────────────────────────────────────── */}
        <GlassMenuSection title="ACCOUNTS">
          {displayAccounts.map((account, index) => {
            const isCurrent = account.userId === user?.id;
            const isSwitching = switchingId === account.userId;
            const isLast = index === displayAccounts.length - 1;

            return (
              <View key={account.userId}>
                <Pressable
                  style={({ pressed }) => [
                    styles.accountRow,
                    pressed && !isCurrent && !switchingId && {
                      backgroundColor: colors.backgroundSecondary,
                    },
                  ]}
                  onPress={() => !isCurrent && !switchingId && handleSwitch(account.userId)}
                  disabled={isCurrent || !!switchingId}
                >
                  {/* Avatar with active dot */}
                  <View style={styles.avatarWrap}>
                    <Avatar uri={account.avatarUrl} name={account.displayName} size={46} />
                    {isCurrent && (
                      <View
                        style={[
                          styles.activeIndicator,
                          { backgroundColor: accent, borderColor: colors.surface },
                        ]}
                      >
                        <Ionicons name="checkmark" size={9} color="#fff" />
                      </View>
                    )}
                  </View>

                  {/* Name / handle / badge */}
                  <View style={styles.accountInfo}>
                    <Text style={[styles.accountName, { color: colors.text }]} numberOfLines={1}>
                      {account.displayName}
                    </Text>
                    <Text style={[styles.accountHandle, { color: colors.textMuted }]} numberOfLines={1}>
                      @{account.handle}
                    </Text>
                    {isCurrent && (
                      <View style={[styles.activeBadge, { backgroundColor: accent + "22" }]}>
                        <Text style={[styles.activeBadgeText, { color: accent }]}>Active</Text>
                      </View>
                    )}
                  </View>

                  {/* Right: switch button or active ring */}
                  <View style={styles.accountRight}>
                    {isSwitching ? (
                      <ActivityIndicator size="small" color={accent} />
                    ) : isCurrent ? (
                      <Ionicons name="radio-button-on" size={20} color={accent} />
                    ) : (
                      <TouchableOpacity
                        style={[styles.switchBtn, { backgroundColor: accent }]}
                        onPress={() => handleSwitch(account.userId)}
                        disabled={!!switchingId}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="swap-horizontal" size={13} color="#fff" />
                        <Text style={styles.switchBtnText}>Switch</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </Pressable>

                {!isLast && (
                  <View
                    style={[
                      styles.separator,
                      { backgroundColor: colors.border, marginLeft: 74 },
                    ]}
                  />
                )}
              </View>
            );
          })}

          {/* Manage / Add accounts footer row */}
          <View style={[styles.separator, { backgroundColor: colors.border, marginLeft: 0 }]} />
          <TouchableOpacity
            style={styles.manageRow}
            onPress={() => router.push("/linked-accounts")}
            activeOpacity={0.7}
            disabled={!!switchingId}
          >
            <Ionicons name="people-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.manageText, { color: colors.textMuted }]}>
              {hasOtherAccounts ? "Manage accounts" : "Add another account"}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </GlassMenuSection>

        {/* ── PREFERENCES ─────────────────────────────────────────────── */}
        <GlassMenuSection title="PREFERENCES">
          <GlassMenuItem
            icon={THEME_ICONS[themeMode] ?? "phone-portrait-outline"}
            label="Appearance"
            value={THEME_LABELS[themeMode] ?? "System"}
            onPress={cycleTheme}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="language-outline"
            label="Language"
            value={langLabel}
            onPress={() => router.push("/language-settings")}
          />
          {Platform.OS !== "web" && (
            <>
              <GlassMenuSeparator />
              <GlassMenuItem
                icon="notifications-outline"
                label="Notifications"
                onPress={() => router.push("/settings/notifications")}
              />
            </>
          )}
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="chatbubbles-outline"
            label="Chats"
            onPress={() => router.push("/settings/chat")}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="cloud-outline"
            label="Storage"
            onPress={() => router.push("/settings/storage")}
          />
          {Platform.OS !== "web" && (
            <>
              <GlassMenuSeparator />
              <GlassMenuItem
                icon="cloud-download-outline"
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
            label="Privacy"
            onPress={() => router.push("/settings/privacy")}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="lock-closed-outline"
            label="Security & Data"
            onPress={() => router.push("/settings/security")}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="link-outline"
            label="Linked Accounts"
            onPress={() => router.push("/settings/oauth-providers")}
          />
        </GlassMenuSection>

        {/* ── HELP & ABOUT ─────────────────────────────────────────────── */}
        <GlassMenuSection title="HELP & ABOUT">
          <GlassMenuItem
            icon="help-buoy-outline"
            label="Support Center"
            onPress={() => router.push("/support" as any)}
          />
          <GlassMenuSeparator />
          <GlassMenuItem
            icon="information-circle-outline"
            label="About AfuChat"
            onPress={() => router.push("/about" as any)}
          />
        </GlassMenuSection>

        {/* ── ACCOUNT ──────────────────────────────────────────────────── */}
        <GlassMenuSection title="ACCOUNT">
          <GlassMenuItem
            icon="log-out-outline"
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

  // Switch overlay
  switchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  switchCard: {
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    gap: 14,
    minWidth: 240,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  switchingText: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  switchingSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },

  // Account rows
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  avatarWrap: { position: "relative" },
  activeIndicator: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  accountInfo: { flex: 1, gap: 1 },
  accountName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  accountHandle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  activeBadge: {
    alignSelf: "flex-start",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginTop: 3,
  },
  activeBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  accountRight: { alignItems: "flex-end", justifyContent: "center" },
  switchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
  },
  switchBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  separator: { height: StyleSheet.hairlineWidth },

  // Manage footer
  manageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  manageText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
});
