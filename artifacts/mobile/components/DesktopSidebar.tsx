import React, { useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";
import type { DesktopSection } from "./DesktopWrapper";

const afuSymbol = require("@/assets/images/afu-symbol.png");

const WIDE = 240;
const NARROW = 68;
const BREAKPOINT = 1100;

type NavItem = {
  key: DesktopSection;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconActive: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "discover",      icon: "home-outline",                 iconActive: "home",                label: "Home" },
  { key: "search",        icon: "search-outline",               iconActive: "search",              label: "Explore" },
  { key: "notifications", icon: "notifications-outline",        iconActive: "notifications",        label: "Notifications" },
  { key: "chats",         icon: "mail-outline",                 iconActive: "mail",                label: "Messages" },
  { key: "wallet",        icon: "wallet-outline",               iconActive: "wallet",              label: "Wallet" },
];

function NavButton({
  item,
  isActive,
  onPress,
  colors,
  showLabel,
}: {
  item: NavItem;
  isActive: boolean;
  onPress: () => void;
  colors: any;
  showLabel: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps =
    Platform.OS === "web"
      ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
      : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.navItem,
        showLabel ? styles.navItemWide : styles.navItemNarrow,
        hovered && { backgroundColor: colors.textMuted + "18" },
      ]}
      {...(hoverProps as any)}
    >
      <Ionicons
        name={isActive ? item.iconActive : item.icon}
        size={24}
        color={isActive ? colors.text : colors.text}
      />
      {showLabel && (
        <Text
          style={[
            styles.navLabel,
            { color: colors.text, fontFamily: isActive ? "Inter_700Bold" : "Inter_400Regular" },
          ]}
        >
          {item.label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

type Props = {
  activeSection: DesktopSection;
  onSectionChange: (s: DesktopSection) => void;
};

export function DesktopIconRail({ activeSection, onSectionChange }: Props) {
  const { profile, signOut } = useAuth();
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const showLabel = screenW >= BREAKPOINT;

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  function cycleTheme() {
    const next =
      themeMode === "system" ? "dark" : themeMode === "dark" ? "light" : "system";
    setThemeMode(next);
  }

  const themeIcon =
    themeMode === "dark" ? ("moon" as const) : themeMode === "light" ? ("sunny" as const) : ("phone-portrait-outline" as const);

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

  const sidebarW = showLabel ? WIDE : NARROW;

  return (
    <View
      style={[
        styles.sidebar,
        { width: sidebarW, backgroundColor: colors.background, borderRightColor: colors.border },
      ]}
    >
      {/* Logo */}
      <TouchableOpacity
        style={[styles.logoRow, showLabel ? styles.logoRowWide : styles.logoRowNarrow]}
        onPress={() => onSectionChange("discover")}
        activeOpacity={0.85}
      >
        <View style={[styles.logoCircle, { backgroundColor: colors.accent }]}>
          <Image source={afuSymbol} style={styles.logoImg} resizeMode="contain" />
        </View>
        {showLabel && (
          <Text style={[styles.logoText, { color: colors.text }]}>AfuChat</Text>
        )}
      </TouchableOpacity>

      {/* Nav items */}
      <View style={styles.navGroup}>
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.key}
            item={item}
            isActive={activeSection === item.key}
            onPress={() => onSectionChange(item.key)}
            colors={colors}
            showLabel={showLabel}
          />
        ))}

        {/* Profile nav item */}
        <NavButton
          item={{ key: "profile", icon: "person-outline", iconActive: "person", label: "Profile" }}
          isActive={activeSection === "profile"}
          onPress={() => onSectionChange("profile")}
          colors={colors}
          showLabel={showLabel}
        />
      </View>

      {/* Post button */}
      <TouchableOpacity
        style={[
          styles.postBtn,
          showLabel ? styles.postBtnWide : styles.postBtnNarrow,
          { backgroundColor: colors.accent },
        ]}
        onPress={() => router.push("/moments/create" as any)}
        activeOpacity={0.88}
      >
        {showLabel ? (
          <Text style={styles.postBtnText}>Post</Text>
        ) : (
          <Ionicons name="add" size={22} color="#fff" />
        )}
      </TouchableOpacity>

      <View style={{ flex: 1 }} />

      {/* Bottom utilities */}
      <View style={[styles.bottomRow, showLabel ? styles.bottomRowWide : styles.bottomRowNarrow]}>
        <TouchableOpacity
          style={[styles.utilBtn, showLabel ? styles.utilBtnWide : styles.utilBtnNarrow, { borderRadius: showLabel ? 8 : 24 }]}
          onPress={cycleTheme}
          activeOpacity={0.75}
        >
          <Ionicons name={themeIcon} size={18} color={colors.textMuted} />
          {showLabel && <Text style={[styles.utilLabel, { color: colors.textMuted }]}>
            {themeMode === "dark" ? "Dark" : themeMode === "light" ? "Light" : "System"}
          </Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.utilBtn, showLabel ? styles.utilBtnWide : styles.utilBtnNarrow, { borderRadius: showLabel ? 8 : 24 }]}
          onPress={() => router.push("/settings" as any)}
          activeOpacity={0.75}
        >
          <Ionicons name="settings-outline" size={18} color={colors.textMuted} />
          {showLabel && <Text style={[styles.utilLabel, { color: colors.textMuted }]}>Settings</Text>}
        </TouchableOpacity>
      </View>

      {/* User profile card at bottom */}
      <TouchableOpacity
        style={[
          styles.profileCard,
          showLabel ? styles.profileCardWide : styles.profileCardNarrow,
          { borderTopColor: colors.border },
        ]}
        onPress={handleSignOut}
        activeOpacity={0.85}
      >
        <Avatar uri={profile?.avatar_url || null} name={profile?.display_name || "Me"} size={38} />
        {showLabel && (
          <>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>
                {profile?.display_name || "Me"}
              </Text>
              <Text style={[styles.profileHandle, { color: colors.textMuted }]} numberOfLines={1}>
                @{profile?.handle || "me"}
              </Text>
            </View>
            <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} />
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create<any>({
  sidebar: {
    flexShrink: 0,
    flexDirection: "column",
    paddingVertical: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },

  logoRow: { alignItems: "center", paddingVertical: 6, marginBottom: 4 },
  logoRowWide: { flexDirection: "row", paddingHorizontal: 14, gap: 10 },
  logoRowNarrow: { justifyContent: "center" },
  logoCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImg: { width: 20, height: 20, tintColor: "#fff" },
  logoText: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },

  navGroup: { paddingTop: 4, gap: 2 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 28,
    marginHorizontal: 6,
  },
  navItemWide: { paddingHorizontal: 14, paddingVertical: 12, gap: 16 },
  navItemNarrow: { paddingHorizontal: 0, paddingVertical: 12, justifyContent: "center" },
  navLabel: { fontSize: 19, letterSpacing: -0.2 },

  postBtn: {
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 10,
    marginTop: 16,
  },
  postBtnWide: { paddingVertical: 14, borderRadius: 28 },
  postBtnNarrow: { width: 46, height: 46, borderRadius: 23, alignSelf: "center" },
  postBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },

  bottomRow: { gap: 2, paddingHorizontal: 6 },
  bottomRowWide: {},
  bottomRowNarrow: { alignItems: "center" },
  utilBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
  },
  utilBtnWide: { paddingHorizontal: 12 },
  utilBtnNarrow: { width: 44, height: 44, justifyContent: "center", alignSelf: "center" },
  utilLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  profileCardWide: { paddingHorizontal: 14 },
  profileCardNarrow: { justifyContent: "center", paddingHorizontal: 6 },
  profileName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  profileHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
});
