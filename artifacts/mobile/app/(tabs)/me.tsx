import React from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { Separator } from "@/components/ui/Separator";
import Colors from "@/constants/colors";

const afuSymbol = require("@/assets/images/afu-symbol.png");


type MenuItemProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  badge?: string;
};

function MenuItem({ icon, iconBg, label, value, onPress, danger, badge }: MenuItemProps) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.menuItem, { backgroundColor: colors.surface }]}
      onPress={() => { Haptics.selectionAsync(); onPress?.(); }}
      activeOpacity={0.7}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
      <Text style={[styles.menuLabel, { color: danger ? "#FF3B30" : colors.text }]}>{label}</Text>
      <View style={styles.menuRight}>
        {badge ? (
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumBadgeText}>{badge}</Text>
          </View>
        ) : null}
        {value ? <Text style={[styles.menuValue, { color: colors.textSecondary }]}>{value}</Text> : null}
        {!danger && <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />}
      </View>
    </TouchableOpacity>
  );
}

function MenuGroup({ children }: { children: React.ReactNode }) {
  return (
    <View style={[styles.menuGroup, { borderRadius: 14, overflow: "hidden" }]}>
      {children}
    </View>
  );
}

export default function MeScreen() {
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const { profile, isPremium, subscription } = useAuth();
  const insets = useSafeAreaInsets();

  function cycleTheme() {
    Haptics.selectionAsync();
    if (themeMode === "system") setThemeMode("dark");
    else if (themeMode === "dark") setThemeMode("light");
    else setThemeMode("system");
  }

  const themeLabel = themeMode === "system" ? "System" : themeMode === "dark" ? "Dark" : "Light";
  const themeIcon = themeMode === "dark" ? "moon" : themeMode === "light" ? "sunny" : "phone-portrait-outline";
  const gradeIcon = profile?.current_grade === "Newcomer" ? "leaf-outline" : "star-outline";

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity
        style={[styles.profileCard, { backgroundColor: colors.surface }]}
        onPress={() => router.push("/profile/edit")}
        activeOpacity={0.85}
      >
        <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={68} />
        <View style={styles.profileInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.profileName, { color: colors.text }]}>
              {profile?.display_name || "User"}
            </Text>
            {profile?.is_organization_verified && (
              <Ionicons name="checkmark-circle" size={18} color={Colors.gold} style={{ marginLeft: 4 }} />
            )}
            {!profile?.is_organization_verified && profile?.is_verified && (
              <Ionicons name="checkmark-circle" size={18} color={Colors.brand} style={{ marginLeft: 4 }} />
            )}
            {isPremium && (
              <View style={styles.premiumStarBadge}>
                <Ionicons name="diamond" size={12} color="#fff" />
              </View>
            )}
          </View>
          <Text style={[styles.profileHandle, { color: colors.textSecondary }]}>
            @{profile?.handle || "handle"}
          </Text>
          {profile?.is_organization_verified && (
            <View style={styles.businessTag}>
              <Ionicons name="briefcase" size={10} color="#fff" />
              <Text style={styles.businessTagText}>Business</Text>
            </View>
          )}
          {profile?.bio ? (
            <Text style={[styles.profileBio, { color: colors.textMuted }]} numberOfLines={1}>
              {profile.bio}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <View style={[styles.statsRow, { backgroundColor: colors.surface }]}>
        <View style={styles.statItem}>
          <Ionicons name="flash" size={20} color="#FFD60A" />
          <Text style={[styles.statValue, { color: colors.text }]}>{profile?.xp || 0}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Nexa</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Ionicons name="diamond" size={20} color="#FF9500" />
          <Text style={[styles.statValue, { color: colors.text }]}>{profile?.acoin || 0}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>ACoin</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Ionicons name={gradeIcon as any} size={20} color={Colors.brand} />
          <Text style={[styles.statValue, { color: colors.text }]}>{profile?.current_grade || "Newcomer"}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Grade</Text>
        </View>
      </View>

      {!isPremium && (
        <TouchableOpacity
          style={styles.premiumBanner}
          onPress={() => router.push("/premium")}
          activeOpacity={0.85}
        >
          <View style={styles.premiumBannerLeft}>
            <Ionicons name="diamond" size={24} color="#FFD60A" />
            <View>
              <Text style={styles.premiumBannerTitle}>Upgrade to Premium</Text>
              <Text style={styles.premiumBannerSub}>Pay with ACoin for badges, linked accounts & more</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      )}

      <MenuGroup>
        <MenuItem icon="sparkles-outline" iconBg="#00C2CB" label="AfuAi" onPress={() => router.push("/ai")} />
        <Separator indent={54} />
        <MenuItem icon="newspaper-outline" iconBg="#FF9500" label="My Posts" onPress={() => router.push("/my-posts")} />
        <Separator indent={54} />
        <MenuItem icon="images-outline" iconBg="#5856D6" label="Stories" onPress={() => router.push("/stories/create")} />
        <Separator indent={54} />
        <MenuItem icon="notifications-outline" iconBg="#007AFF" label="Notifications" onPress={() => router.push("/notifications")} />
      </MenuGroup>

      <MenuGroup>
        <MenuItem icon="wallet-outline" iconBg="#00C2CB" label="Wallet" onPress={() => router.push("/wallet")} />
        <Separator indent={54} />
        <MenuItem icon="gift-outline" iconBg="#FF3B30" label="Gifts" onPress={() => router.push("/gifts")} />
        <Separator indent={54} />
        <MenuItem icon="game-controller-outline" iconBg="#007AFF" label="Games" onPress={() => router.push("/games")} />
        <Separator indent={54} />
        <MenuItem icon="apps-outline" iconBg="#AF52DE" label="Mini Programs" onPress={() => router.push("/mini-programs")} />
        <Separator indent={54} />
        <MenuItem icon="gift-outline" iconBg="#FF9500" label="Referral Program" onPress={() => router.push("/referral")} />
      </MenuGroup>

      <MenuGroup>
        <MenuItem
          icon="diamond-outline"
          iconBg="#FFD60A"
          label="Premium"
          onPress={() => router.push("/premium")}
          value={isPremium ? `Active (${subscription?.plan_tier})` : ""}
        />
        <Separator indent={54} />
        <MenuItem
          icon="swap-horizontal-outline"
          iconBg="#AF52DE"
          label="Switch Accounts"
          onPress={() => router.push("/linked-accounts")}
        />
      </MenuGroup>

      <MenuGroup>
        <MenuItem
          icon={themeIcon as any}
          iconBg={isDark ? "#1C1C1E" : "#FFD60A"}
          label="Appearance"
          value={themeLabel}
          onPress={cycleTheme}
        />
        <Separator indent={54} />
        <MenuItem
          icon="chatbubble-ellipses-outline"
          iconBg="#34C759"
          label="Chat Settings"
          onPress={() => router.push("/settings/chat")}
        />
        <Separator indent={54} />
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
          icon="notifications-outline"
          iconBg="#5856D6"
          label="Notification Settings"
          onPress={() => router.push("/settings/notifications")}
        />
      </MenuGroup>

      {profile?.is_admin && (
        <MenuGroup>
          <MenuItem
            icon="shield-checkmark"
            iconBg={Colors.brand}
            label="Admin Dashboard"
            onPress={() => router.push("/admin")}
          />
        </MenuGroup>
      )}

      <View style={styles.versionRow}>
        <Image source={afuSymbol} style={{ width: 22, height: 22, tintColor: Colors.brand }} resizeMode="contain" />
        <Text style={[styles.version, { color: colors.textMuted }]}>AfuChat v1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 16, paddingHorizontal: 16 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    gap: 14,
  },
  profileInfo: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 2 },
  profileHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 2 },
  profileBio: { fontSize: 13, fontFamily: "Inter_400Regular" },
  businessTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.gold,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 2,
    alignSelf: "flex-start",
  },
  businessTagText: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  premiumStarBadge: {
    backgroundColor: "#FFD60A",
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: "row",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  premiumBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1a1a2e",
    borderRadius: 14,
    padding: 16,
  },
  premiumBannerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  premiumBannerTitle: { color: "#FFD60A", fontSize: 16, fontFamily: "Inter_700Bold" },
  premiumBannerSub: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  menuGroup: { gap: 0 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 14,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  menuRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  menuValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  premiumBadge: {
    backgroundColor: "#FFD60A",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  premiumBadgeText: { color: "#000", fontSize: 10, fontFamily: "Inter_700Bold" },
  versionRow: { alignItems: "center", marginTop: 8, gap: 6 },
  version: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular" },
});
