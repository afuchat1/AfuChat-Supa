import React, { useState } from "react";
import {
  Image,
  Platform,
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
import type { DesktopSection } from "./DesktopWrapper";

const afuSymbol = require("@/assets/images/afu-symbol.png");

const RAIL_WIDTH = 64;

type NavItem = {
  key: DesktopSection;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconActive: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "chats",         icon: "chatbubble-ellipses-outline", iconActive: "chatbubble-ellipses", label: "Chats" },
  { key: "discover",      icon: "compass-outline",              iconActive: "compass",             label: "Discover" },
  { key: "search",        icon: "search-outline",               iconActive: "search",              label: "Search" },
  { key: "notifications", icon: "notifications-outline",        iconActive: "notifications",        label: "Notifications" },
  { key: "wallet",        icon: "wallet-outline",               iconActive: "wallet",              label: "Wallet" },
];

function Tooltip({ label, visible }: { label: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <View
      style={styles.tooltip}
      pointerEvents="none"
    >
      <Text style={styles.tooltipText}>{label}</Text>
    </View>
  );
}

function RailButton({
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

  const hoverProps =
    Platform.OS === "web"
      ? {
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
        }
      : {};

  return (
    <View style={{ position: "relative" }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        style={[
          styles.railBtn,
          isActive && { backgroundColor: colors.accent + "18" },
          !isActive && hovered && { backgroundColor: colors.backgroundSecondary + "88" },
        ]}
        {...(hoverProps as any)}
      >
        {isActive && (
          <View style={[styles.activeBar, { backgroundColor: colors.accent }]} />
        )}
        <Ionicons
          name={isActive ? item.iconActive : item.icon}
          size={22}
          color={isActive ? colors.accent : colors.textMuted}
        />
      </TouchableOpacity>
      {hovered && <Tooltip label={item.label} visible />}
    </View>
  );
}

function RailIconBtn({
  icon,
  label,
  onPress,
  color,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  color?: string;
  colors: any;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps =
    Platform.OS === "web"
      ? {
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
        }
      : {};

  return (
    <View style={{ position: "relative" }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        style={[
          styles.railBtn,
          hovered && { backgroundColor: colors.backgroundSecondary + "88" },
        ]}
        {...(hoverProps as any)}
      >
        <Ionicons name={icon} size={20} color={color || colors.textMuted} />
      </TouchableOpacity>
      {hovered && <Tooltip label={label} visible />}
    </View>
  );
}

type Props = {
  activeSection: DesktopSection;
  onSectionChange: (s: DesktopSection) => void;
};

export function DesktopIconRail({ activeSection, onSectionChange }: Props) {
  const { profile, signOut } = useAuth();
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const [profileHovered, setProfileHovered] = useState(false);

  function cycleTheme() {
    const next =
      themeMode === "system" ? "dark" : themeMode === "dark" ? "light" : "system";
    setThemeMode(next);
  }

  const themeIcon =
    themeMode === "dark"
      ? ("moon" as const)
      : themeMode === "light"
      ? ("sunny" as const)
      : ("phone-portrait-outline" as const);

  const themeLabel =
    themeMode === "dark" ? "Dark mode" : themeMode === "light" ? "Light mode" : "System";

  async function handleSignOut() {
    showAlert("Sign out?", "You'll need to log back in.", [
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
    <View
      style={[
        styles.rail,
        {
          backgroundColor: isDark ? "#0a0a0d" : "#f4f5f7",
          borderRightColor: colors.border,
        },
      ]}
    >
      {/* Logo */}
      <View style={styles.logoWrap}>
        <View style={[styles.logoCircle, { backgroundColor: colors.accent }]}>
          <Image source={afuSymbol} style={styles.logoImg} resizeMode="contain" />
        </View>
      </View>

      <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />

      {/* Main nav */}
      <View style={styles.navGroup}>
        {NAV_ITEMS.map((item) => (
          <RailButton
            key={item.key}
            item={item}
            isActive={activeSection === item.key}
            onPress={() => onSectionChange(item.key)}
            colors={colors}
          />
        ))}
      </View>

      {/* Spacer */}
      <View style={{ flex: 1 }} />

      {/* Bottom utilities */}
      <View style={styles.bottomGroup}>
        <RailIconBtn
          icon={themeIcon}
          label={themeLabel}
          onPress={cycleTheme}
          colors={colors}
        />
        <RailIconBtn
          icon="settings-outline"
          label="Settings"
          onPress={() => router.push("/settings" as any)}
          colors={colors}
        />
        <RailIconBtn
          icon="log-out-outline"
          label="Sign out"
          onPress={handleSignOut}
          color="#FF4444"
          colors={colors}
        />

        <View style={[styles.dividerLine, { backgroundColor: colors.border, marginVertical: 6 }]} />

        {/* Profile avatar */}
        <View style={{ position: "relative" }}>
          <TouchableOpacity
            onPress={() => onSectionChange("profile")}
            activeOpacity={0.8}
            style={[
              styles.profileBtn,
              activeSection === "profile" && {
                backgroundColor: colors.accent + "18",
              },
            ]}
            {...({ onMouseEnter: () => setProfileHovered(true), onMouseLeave: () => setProfileHovered(false) } as any)}
          >
            {activeSection === "profile" && (
              <View style={[styles.activeBar, { backgroundColor: colors.accent }]} />
            )}
            <Avatar
              uri={profile?.avatar_url || null}
              name={profile?.display_name || "Me"}
              size={34}
            />
          </TouchableOpacity>
          {profileHovered && <Tooltip label={profile?.display_name || "Profile"} visible />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create<any>({
  rail: {
    width: RAIL_WIDTH,
    flexShrink: 0,
    flexDirection: "column",
    alignItems: "center",
    paddingVertical: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    gap: 0,
  },
  logoWrap: {
    width: RAIL_WIDTH,
    alignItems: "center",
    paddingBottom: 12,
  },
  logoCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImg: {
    width: 20,
    height: 20,
    tintColor: "#fff",
  },
  dividerLine: {
    width: 28,
    height: StyleSheet.hairlineWidth,
    borderRadius: 1,
    alignSelf: "center",
    marginVertical: 2,
  },
  navGroup: {
    width: "100%",
    alignItems: "center",
    gap: 2,
    paddingTop: 8,
  },
  bottomGroup: {
    width: "100%",
    alignItems: "center",
    gap: 2,
    paddingBottom: 4,
  },
  railBtn: {
    width: RAIL_WIDTH,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  profileBtn: {
    width: RAIL_WIDTH,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
  },
  tooltip: {
    position: "absolute",
    left: RAIL_WIDTH + 6,
    top: "50%" as any,
    transform: [{ translateY: -10 }],
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    zIndex: 9999,
    pointerEvents: "none" as any,
  },
  tooltipText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    whiteSpace: "nowrap" as any,
  },
});
