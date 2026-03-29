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
};

const NAV_ITEMS: NavItem[] = [
  { key: "index", icon: "chatbubbles-outline", iconActive: "chatbubbles", label: "Chats" },
  { key: "search", icon: "search-outline", iconActive: "search", label: "Search" },
  { key: "discover", icon: "compass-outline", iconActive: "compass", label: "Discover" },
  { key: "notifications", icon: "notifications-outline", iconActive: "notifications", label: "Notifications" },
  { key: "me", icon: "person-circle-outline", iconActive: "person-circle", label: "Profile" },
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
        isActive && { backgroundColor: Colors.brand + "18" },
        !isActive && hovered && { backgroundColor: colors.backgroundSecondary },
      ]}
      {...hoverProps}
    >
      <Ionicons
        name={isActive ? item.iconActive : item.icon}
        size={22}
        color={isActive ? Colors.brand : colors.textSecondary}
      />
      <Text
        style={[
          styles.navLabel,
          { color: isActive ? Colors.brand : colors.text },
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
    </TouchableOpacity>
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
      <Ionicons name={icon} size={18} color={color || colors.textSecondary} />
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
  const { colors, themeMode, setThemeMode } = useTheme();

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

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
      <View style={styles.inner}>
        <View style={styles.logoRow}>
          <View style={styles.logoIconWrap}>
            <Image source={afuSymbol} style={styles.logoIcon} resizeMode="contain" />
          </View>
          <Text style={[styles.logoText, { color: colors.text }]}>AfuChat</Text>
        </View>

        <View style={styles.navSection}>
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.key}
              item={item}
              isActive={activeTab === item.key}
              onPress={() => onTabPress(item.key)}
              colors={colors}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.composeBtn, { backgroundColor: Colors.brand }]}
          onPress={() => onTabPress("index")}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={styles.composeBtnText}>New Chat</Text>
        </TouchableOpacity>

        <View style={styles.bottomSection}>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {profile && (
            <TouchableOpacity
              style={[styles.profileCard, { backgroundColor: colors.backgroundSecondary }]}
              onPress={() => onTabPress("me")}
              activeOpacity={0.8}
            >
              <Avatar uri={profile.avatar_url} name={profile.display_name} size={38} />
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>
                  {profile.display_name || "User"}
                </Text>
                <Text style={[styles.profileHandle, { color: colors.textMuted }]} numberOfLines={1}>
                  @{profile.handle || "handle"}
                </Text>
              </View>
              {profile.is_verified && (
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={profile.is_organization_verified ? Colors.gold : Colors.brand}
                />
              )}
            </TouchableOpacity>
          )}

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
    width: 260,
    borderRightWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 20,
    paddingTop: 4,
  },
  logoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.brand + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  logoIcon: {
    width: 22,
    height: 22,
    tintColor: Colors.brand,
  },
  logoText: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  navSection: {
    gap: 2,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    gap: 12,
  },
  navLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  navLabelActive: {
    fontFamily: "Inter_600SemiBold",
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
  composeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 28,
    paddingVertical: 12,
    marginTop: 16,
    marginHorizontal: 4,
  },
  composeBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
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
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  profileHandle: {
    fontSize: 12,
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
