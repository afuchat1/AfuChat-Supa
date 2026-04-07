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
import { showAlert } from "@/lib/alert";
import type { DesktopSection } from "./DesktopWrapper";

const afuSymbol = require("@/assets/images/afu-symbol.png");

type NavItem = {
  key: DesktopSection;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconActive: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "discover",      icon: "home-outline",          iconActive: "home",          label: "Home" },
  { key: "search",        icon: "search-outline",        iconActive: "search",        label: "Explore" },
  { key: "notifications", icon: "notifications-outline", iconActive: "notifications", label: "Notifications" },
  { key: "chats",         icon: "mail-outline",          iconActive: "mail",          label: "Messages" },
  { key: "wallet",        icon: "wallet-outline",        iconActive: "wallet",        label: "Wallet" },
  { key: "contacts",      icon: "people-outline",        iconActive: "people",        label: "Contacts" },
];

type Props = {
  activeSection: DesktopSection;
  onSectionChange: (s: DesktopSection) => void;
  hasSession: boolean;
};

function NavTab({
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
      ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
      : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.navTab,
        isActive && [styles.navTabActive, { borderBottomColor: colors.accent }],
        hovered && !isActive && { backgroundColor: colors.textMuted + "12" },
      ]}
      {...(hoverProps as any)}
    >
      <Ionicons
        name={isActive ? item.iconActive : item.icon}
        size={18}
        color={isActive ? colors.accent : colors.textMuted}
      />
      <Text
        style={[
          styles.navTabLabel,
          {
            color: isActive ? colors.accent : colors.textMuted,
            fontFamily: isActive ? "Inter_600SemiBold" : "Inter_400Regular",
          },
        ]}
      >
        {item.label}
      </Text>
    </TouchableOpacity>
  );
}

export function DesktopTopNav({ activeSection, onSectionChange, hasSession }: Props) {
  const { profile, signOut } = useAuth();
  const { colors, themeMode, setThemeMode } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const themeIcon =
    themeMode === "dark"
      ? ("moon" as const)
      : themeMode === "light"
      ? ("sunny" as const)
      : ("phone-portrait-outline" as const);

  function cycleTheme() {
    const next =
      themeMode === "system" ? "dark" : themeMode === "dark" ? "light" : "system";
    setThemeMode(next);
  }

  async function handleSignOut() {
    setUserMenuOpen(false);
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
    <View style={[styles.topbar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      {/* Logo */}
      <TouchableOpacity
        style={styles.logoArea}
        onPress={() => onSectionChange("discover")}
        activeOpacity={0.85}
      >
        <View style={[styles.logoCircle, { backgroundColor: colors.accent }]}>
          <Image source={afuSymbol} style={styles.logoImg} resizeMode="contain" />
        </View>
        <Text style={[styles.logoText, { color: colors.text }]}>AfuChat</Text>
      </TouchableOpacity>

      {/* Nav tabs — center */}
      {hasSession && (
        <View style={styles.navTabs}>
          {NAV_ITEMS.map((item) => (
            <NavTab
              key={item.key}
              item={item}
              isActive={activeSection === item.key}
              onPress={() => onSectionChange(item.key)}
              colors={colors}
            />
          ))}
        </View>
      )}

      {/* Right side actions */}
      <View style={styles.rightArea}>
        {hasSession ? (
          <>
            {/* Post button */}
            <TouchableOpacity
              style={[styles.postBtn, { backgroundColor: colors.accent }]}
              onPress={() => router.push("/moments/create" as any)}
              activeOpacity={0.88}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.postBtnText}>Post</Text>
            </TouchableOpacity>

            {/* Theme toggle */}
            <TouchableOpacity onPress={cycleTheme} style={styles.iconBtn} activeOpacity={0.75}>
              <Ionicons name={themeIcon} size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Settings */}
            <TouchableOpacity
              onPress={() => router.push("/settings" as any)}
              style={styles.iconBtn}
              activeOpacity={0.75}
            >
              <Ionicons name="settings-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {/* User avatar / profile */}
            <View style={{ position: "relative" as any }}>
              <TouchableOpacity
                style={styles.avatarBtn}
                onPress={() => setUserMenuOpen((v) => !v)}
                activeOpacity={0.85}
              >
                <Avatar
                  uri={profile?.avatar_url || null}
                  name={profile?.display_name || "Me"}
                  size={32}
                />
              </TouchableOpacity>

              {userMenuOpen && (
                <View
                  style={[
                    styles.userMenu,
                    { backgroundColor: colors.background, borderColor: colors.border },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      setUserMenuOpen(false);
                      onSectionChange("profile");
                    }}
                  >
                    <Ionicons name="person-outline" size={16} color={colors.text} />
                    <Text style={[styles.menuItemText, { color: colors.text }]}>Profile</Text>
                  </TouchableOpacity>
                  <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                  <TouchableOpacity style={styles.menuItem} onPress={handleSignOut}>
                    <Ionicons name="log-out-outline" size={16} color={colors.textMuted} />
                    <Text style={[styles.menuItemText, { color: colors.textMuted }]}>Sign Out</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </>
        ) : (
          <TouchableOpacity
            onPress={() => router.push("/(auth)/login" as any)}
            style={[styles.postBtn, { backgroundColor: colors.accent }]}
            activeOpacity={0.85}
          >
            <Ionicons name="log-in-outline" size={16} color="#fff" />
            <Text style={styles.postBtnText}>Sign In</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/** Legacy export kept so any old import of DesktopIconRail still compiles */
export const DesktopIconRail = DesktopTopNav;

const styles = StyleSheet.create<any>({
  topbar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    gap: 0,
  },

  logoArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginRight: 24,
  },
  logoCircle: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImg: { width: 17, height: 17, tintColor: "#fff" },
  logoText: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },

  navTabs: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    height: 52,
    gap: 2,
  },
  navTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  navTabActive: {
    borderBottomWidth: 2,
  },
  navTabLabel: {
    fontSize: 14,
    letterSpacing: -0.1,
  },

  rightArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 16,
  },

  postBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 4,
  },
  postBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },

  userMenu: {
    position: "absolute",
    top: 40,
    right: 0,
    width: 180,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingVertical: 4,
    zIndex: 200,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuItemText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  menuDivider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
});
