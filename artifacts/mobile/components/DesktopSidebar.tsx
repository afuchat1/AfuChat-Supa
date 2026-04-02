import React, { useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

const afuSymbol = require("@/assets/images/afu-symbol.png");

type NavItem = {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconActive: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  badge?: number;
  section?: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "index", icon: "chatbubbles-outline", iconActive: "chatbubbles", label: "Chats", section: "main" },
  { key: "discover", icon: "compass-outline", iconActive: "compass", label: "Discover", section: "main" },
  { key: "search", icon: "search-outline", iconActive: "search", label: "Search", section: "main" },
  { key: "notifications", icon: "notifications-outline", iconActive: "notifications", label: "Notifications", section: "main" },
  { key: "wallet", icon: "wallet-outline", iconActive: "wallet", label: "Wallet", section: "finance" },
];

function NavButton({
  item,
  isActive,
  onPress,
  colors,
}: {
  item: NavItem;
  isActive: boolean;
  onPress: () => void;
  colors: any;
}) {
  const [hovered, setHovered] = useState(false);

  const hoverProps = Platform.OS === "web"
    ? {
        // @ts-ignore
        onMouseEnter: () => setHovered(true),
        // @ts-ignore
        onMouseLeave: () => setHovered(false),
      }
    : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.navItem,
        isActive && { backgroundColor: colors.accent + "15" },
        !isActive && hovered && { backgroundColor: colors.backgroundSecondary },
      ]}
      {...hoverProps}
    >
      <View style={[
        styles.navIconWrap,
        isActive && { backgroundColor: colors.accent + "20" },
      ]}>
        <Ionicons
          name={isActive ? item.iconActive : item.icon}
          size={20}
          color={isActive ? colors.accent : colors.textSecondary}
        />
      </View>
      <Text
        style={[
          styles.navLabel,
          { color: isActive ? colors.accent : colors.text },
          isActive && styles.navLabelActive,
        ]}
      >
        {item.label}
      </Text>
      {item.badge != null && item.badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.badge > 99 ? "99+" : item.badge}</Text>
        </View>
      )}
      {isActive && <View style={[styles.activeBar, { backgroundColor: colors.accent }]} />}
    </TouchableOpacity>
  );
}

function SectionLabel({ label, colors }: { label: string; colors: any }) {
  return (
    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{label}</Text>
  );
}

function UtilBtn({
  icon,
  onPress,
  label,
  color,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  label: string;
  color?: string;
  colors: any;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps = Platform.OS === "web"
    ? {
        // @ts-ignore
        onMouseEnter: () => setHovered(true),
        // @ts-ignore
        onMouseLeave: () => setHovered(false),
      }
    : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.utilBtn, hovered && { backgroundColor: colors.backgroundSecondary }]}
      {...hoverProps}
    >
      <Ionicons name={icon} size={17} color={color || colors.textSecondary} />
      <Text style={[styles.utilLabel, { color: color || colors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

type Props = {
  activeTab: string;
  onTabPress: (tab: string) => void;
};

export function DesktopSidebar({ activeTab, onTabPress }: Props) {
  const { profile, signOut } = useAuth();
  const { colors, isDark, themeMode, setThemeMode } = useTheme();

  function cycleTheme() {
    const next = themeMode === "system" ? "dark" : themeMode === "dark" ? "light" : "system";
    setThemeMode(next);
  }

  const themeIcon = themeMode === "dark"
    ? ("moon" as const)
    : themeMode === "light"
      ? ("sunny" as const)
      : ("phone-portrait-outline" as const);

  const themeLabel = themeMode === "dark" ? "Dark" : themeMode === "light" ? "Light" : "System";

  async function handleSignOut() {
    showAlert("Sign out?", "You'll need to log back in to access AfuChat.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  const mainItems = NAV_ITEMS.filter((i) => i.section === "main");
  const financeItems = NAV_ITEMS.filter((i) => i.section === "finance");

  return (
    <View style={[styles.container, { backgroundColor: isDark ? "#0e0e10" : "#f9fafb", borderRightColor: colors.border }]}>
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={[styles.logoIconWrap, { backgroundColor: colors.accent }]}>
            <Image source={afuSymbol} style={styles.logoIcon} resizeMode="contain" />
          </View>
          <View>
            <Text style={[styles.logoText, { color: colors.text }]}>AfuChat</Text>
            <Text style={[styles.logoSub, { color: colors.textMuted }]}>Stay connected</Text>
          </View>
        </View>

        {/* New Chat button */}
        <TouchableOpacity
          style={[styles.composeBtn, { backgroundColor: colors.accent }]}
          onPress={() => onTabPress("index")}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={17} color="#fff" />
          <Text style={styles.composeBtnText}>New Chat</Text>
        </TouchableOpacity>

        {/* Main nav */}
        <View style={[styles.navSection, { marginTop: 20 }]}>
          <SectionLabel label="NAVIGATION" colors={colors} />
          {mainItems.map((item) => (
            <NavButton
              key={item.key}
              item={item}
              isActive={activeTab === item.key}
              onPress={() => onTabPress(item.key)}
              colors={colors}
            />
          ))}
        </View>

        {/* Finance nav */}
        <View style={[styles.navSection, { marginTop: 12 }]}>
          <SectionLabel label="FINANCE" colors={colors} />
          {financeItems.map((item) => (
            <NavButton
              key={item.key}
              item={item}
              isActive={activeTab === item.key}
              onPress={() => onTabPress(item.key)}
              colors={colors}
            />
          ))}
        </View>

        {/* Bottom section */}
        <View style={styles.bottomSection}>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Profile card */}
          {profile && (
            <TouchableOpacity
              style={[styles.profileCard, {
                backgroundColor: activeTab === "me"
                  ? colors.accent + "12"
                  : colors.backgroundSecondary,
                borderColor: activeTab === "me" ? colors.accent + "30" : "transparent",
              }]}
              onPress={() => onTabPress("me")}
              activeOpacity={0.8}
            >
              <Avatar uri={profile.avatar_url} name={profile.display_name} size={36} />
              <View style={styles.profileInfo}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>
                    {profile.display_name || "User"}
                  </Text>
                  {profile.is_verified && (
                    <Ionicons
                      name="checkmark-circle"
                      size={13}
                      color={profile.is_organization_verified ? Colors.gold : colors.accent}
                    />
                  )}
                </View>
                <Text style={[styles.profileHandle, { color: colors.textMuted }]} numberOfLines={1}>
                  @{profile.handle || "handle"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {/* Util buttons */}
          <View style={styles.utilRow}>
            <UtilBtn icon={themeIcon} onPress={cycleTheme} label={themeLabel} colors={colors} />
            <UtilBtn
              icon="settings-outline"
              onPress={() => onTabPress("me")}
              label="Settings"
              colors={colors}
            />
            <UtilBtn
              icon="log-out-outline"
              onPress={handleSignOut}
              label="Sign out"
              color="#FF3B30"
              colors={colors}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 280,
    borderRightWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 16,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 18,
  },
  logoIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  logoIcon: {
    width: 22,
    height: 22,
    tintColor: "#fff",
  },
  logoText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
    lineHeight: 20,
  },
  logoSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  composeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 24,
    paddingVertical: 11,
    marginHorizontal: 2,
  },
  composeBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  navSection: {
    gap: 1,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    paddingHorizontal: 12,
    paddingBottom: 6,
    paddingTop: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 10,
    position: "relative",
    overflow: "hidden",
  },
  navIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  navLabelActive: {
    fontFamily: "Inter_600SemiBold",
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: Colors.brand,
  },
  badge: {
    backgroundColor: "#FF3B30",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  bottomSection: {
    marginTop: "auto" as any,
    gap: 10,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 4,
    marginBottom: 4,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 17,
  },
  profileHandle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  utilRow: {
    flexDirection: "row",
    gap: 2,
  },
  utilBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 10,
    gap: 3,
  },
  utilLabel: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
  },
});
