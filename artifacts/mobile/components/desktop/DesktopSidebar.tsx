/**
 * Desktop sidebar — flat / YouTube-style.
 *
 * Design rules:
 *   • Single-surface design: same background as the main content area, no
 *     border-right, no shadow, no decorative tonal split.
 *   • Nav rows are full-bleed with a subtle hover/active fill (no pill
 *     backgrounds, no accent stripes).
 *   • Compact, scannable typography. Section headers are dividers with
 *     small labels (no big banners).
 *   • Width is locked at SIDEBAR_WIDTH = 240. The sidebar is mounted once by
 *     DesktopShell and stays put across navigation.
 */
import React, { useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { supabase } from "@/lib/supabase";

export const SIDEBAR_WIDTH = 240;

const afuSymbol = require("@/assets/images/afu-symbol.png");

type NavItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive?: keyof typeof Ionicons.glyphMap;
  route: string;
  match: (pathname: string) => boolean;
  requiresAuth?: boolean;
};

type NavSection = {
  key: string;
  title?: string;
  items: NavItem[];
};

const SECTIONS: NavSection[] = [
  {
    key: "main",
    items: [
      {
        key: "chats",
        label: "Chats",
        icon: "chatbubbles-outline",
        iconActive: "chatbubbles",
        route: "/(tabs)",
        match: (p) => p === "/" || p === "/index" || p.startsWith("/chat"),
        requiresAuth: true,
      },
      {
        key: "discover",
        label: "Discover",
        icon: "compass-outline",
        iconActive: "compass",
        route: "/discover",
        match: (p) =>
          p === "/discover" ||
          p.startsWith("/post") ||
          p.startsWith("/article") ||
          p.startsWith("/video"),
      },
      {
        key: "shorts",
        label: "Shorts",
        icon: "play-circle-outline",
        iconActive: "play-circle",
        route: "/discover?tab=shorts",
        match: (p) => p === "/shorts" || (typeof window !== "undefined" && window.location.search.includes("tab=shorts")),
      },
      {
        key: "communities",
        label: "Communities",
        icon: "people-outline",
        iconActive: "people",
        route: "/communities",
        match: (p) => p.startsWith("/communities") || p.startsWith("/paid-communities"),
      },
      {
        key: "moments",
        label: "Moments",
        icon: "images-outline",
        iconActive: "images",
        route: "/moments",
        match: (p) => p.startsWith("/moments"),
        requiresAuth: true,
      },
      {
        key: "ai",
        label: "AfuAI",
        icon: "sparkles-outline",
        iconActive: "sparkles",
        route: "/ai",
        match: (p) => p.startsWith("/ai"),
        requiresAuth: true,
      },
      {
        key: "notifications",
        label: "Notifications",
        icon: "notifications-outline",
        iconActive: "notifications",
        route: "/notifications",
        match: (p) => p.startsWith("/notifications"),
        requiresAuth: true,
      },
    ],
  },
  // Note: Services (Wallet / Marketplace / Apps) and the Premium / Settings /
  // Help group are intentionally NOT mirrored here — they already live in the
  // top bar dropdowns. Keeping them out of the sidebar avoids duplicate nav
  // and follows the rule: "if it's available in the header, it must not be in
  // the left bar."
];

type ThemePack = {
  bg: string;
  text: string;
  textMuted: string;
  hoverBg: string;
  activeBg: string;
  divider: string;
  menuBg: string;
};

function SidebarNavItem({
  item,
  active,
  disabled,
  theme,
  onActivate,
}: {
  item: NavItem;
  active: boolean;
  disabled: boolean;
  theme: ThemePack;
  onActivate: () => void;
}) {
  const iconColor = disabled ? theme.textMuted : theme.text;
  const labelColor = disabled ? theme.textMuted : theme.text;

  return (
    <Pressable
      onPress={onActivate}
      style={({ hovered, pressed }: any) => [
        styles.navItem,
        {
          backgroundColor: active
            ? theme.activeBg
            : hovered || pressed
              ? theme.hoverBg
              : "transparent",
        },
      ]}
    >
      <Ionicons
        name={(active && item.iconActive) || item.icon}
        size={20}
        color={iconColor}
      />
      <Text
        style={[
          styles.navLabel,
          {
            color: labelColor,
            fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
          },
        ]}
        numberOfLines={1}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

export function DesktopSidebar() {
  const pathname = usePathname() || "/";
  const { isDark, themeMode, setThemeMode } = useTheme();
  const { session, profile } = useAuth();
  const isLoggedIn = !!session;
  const [menuOpen, setMenuOpen] = useState(false);

  const theme: ThemePack = {
    bg: isDark ? "#0F0F0F" : "#FFFFFF",
    text: isDark ? "#F1F1F1" : "#0F0F0F",
    textMuted: isDark ? "#8A8A8A" : "#606060",
    hoverBg: isDark ? "#272727" : "#F2F2F2",
    activeBg: isDark ? "#272727" : "#F2F2F2",
    divider: isDark ? "#272727" : "#E5E5E5",
    menuBg: isDark ? "#212121" : "#FFFFFF",
  };

  function go(route: string, requiresAuth?: boolean) {
    if (requiresAuth && !isLoggedIn) {
      router.push("/(auth)/login" as any);
      return;
    }
    router.push(route as any);
  }

  function nextThemeMode() {
    return themeMode === "light"
      ? "dark"
      : themeMode === "dark"
        ? "system"
        : "light";
  }

  return (
    <View style={[styles.sidebar, { backgroundColor: theme.bg }]}>
      {/* Brand */}
      <Pressable
        onPress={() => router.push("/(tabs)" as any)}
        style={({ hovered }: any) => [
          styles.brandRow,
          { opacity: hovered ? 0.85 : 1 },
        ]}
      >
        <Image source={afuSymbol} style={styles.brandLogo} resizeMode="contain" />
        <Text style={[styles.brandText, { color: theme.text }]}>AfuChat</Text>
      </Pressable>

      {/* Navigation */}
      <ScrollView
        style={styles.navScroll}
        contentContainerStyle={styles.navContent}
        showsVerticalScrollIndicator={false}
      >
        {SECTIONS.map((section, idx) => (
          <View key={section.key}>
            {idx > 0 ? (
              <View
                style={[styles.sectionDivider, { backgroundColor: theme.divider }]}
              />
            ) : null}
            {section.title ? (
              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
                {section.title}
              </Text>
            ) : null}
            <View style={styles.navGroup}>
              {section.items.map((item) => (
                <SidebarNavItem
                  key={item.key}
                  item={item}
                  active={item.match(pathname)}
                  disabled={!!(item.requiresAuth && !isLoggedIn)}
                  theme={theme}
                  onActivate={() => go(item.route, item.requiresAuth)}
                />
              ))}
            </View>
          </View>
        ))}

        {/* Footer block (inside the scroll so it never causes layout shift) */}
        <View
          style={[styles.sectionDivider, { backgroundColor: theme.divider }]}
        />
        {isLoggedIn ? (
          <View>
            <Pressable
              onPress={() => setMenuOpen((v) => !v)}
              style={({ hovered, pressed }: any) => [
                styles.userCard,
                {
                  backgroundColor: pressed
                    ? theme.activeBg
                    : hovered
                      ? theme.hoverBg
                      : "transparent",
                },
              ]}
            >
              <Avatar
                uri={profile?.avatar_url ?? null}
                name={profile?.display_name || (profile as any)?.handle || "User"}
                size={28}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[styles.userName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {profile?.display_name || (profile as any)?.handle || "User"}
                </Text>
              </View>
              <Ionicons
                name={menuOpen ? "chevron-down" : "chevron-up"}
                size={14}
                color={theme.textMuted}
              />
            </Pressable>

            {menuOpen ? (
              <View style={styles.menuList}>
                <MenuRow
                  icon="person-outline"
                  label="My profile"
                  theme={theme}
                  onPress={() => {
                    setMenuOpen(false);
                    router.push("/(tabs)/me" as any);
                  }}
                />
                <MenuRow
                  icon="create-outline"
                  label="Edit profile"
                  theme={theme}
                  onPress={() => {
                    setMenuOpen(false);
                    router.push("/profile/edit" as any);
                  }}
                />
                <MenuRow
                  icon={
                    themeMode === "dark"
                      ? "moon-outline"
                      : themeMode === "light"
                        ? "sunny-outline"
                        : "contrast-outline"
                  }
                  label={`Theme: ${themeMode}`}
                  theme={theme}
                  onPress={() => setThemeMode(nextThemeMode() as any)}
                />
                <MenuRow
                  icon="log-out-outline"
                  label="Sign out"
                  theme={theme}
                  destructive
                  onPress={async () => {
                    setMenuOpen(false);
                    await supabase.auth.signOut();
                    router.replace("/(auth)/login" as any);
                  }}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <View>
            <Pressable
              onPress={() => router.push("/(auth)/login" as any)}
              style={({ hovered, pressed }: any) => [
                styles.navItem,
                {
                  backgroundColor: pressed
                    ? theme.activeBg
                    : hovered
                      ? theme.hoverBg
                      : "transparent",
                },
              ]}
            >
              <Ionicons name="log-in-outline" size={20} color={theme.text} />
              <Text style={[styles.navLabel, { color: theme.text }]}>
                Sign in
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setThemeMode(nextThemeMode() as any)}
              style={({ hovered }: any) => [
                styles.navItem,
                {
                  backgroundColor: hovered ? theme.hoverBg : "transparent",
                },
              ]}
            >
              <Ionicons
                name={
                  themeMode === "dark"
                    ? "moon-outline"
                    : themeMode === "light"
                      ? "sunny-outline"
                      : "contrast-outline"
                }
                size={20}
                color={theme.text}
              />
              <Text style={[styles.navLabel, { color: theme.text }]}>
                {themeMode === "system"
                  ? "System theme"
                  : themeMode === "dark"
                    ? "Dark mode"
                    : "Light mode"}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  theme,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  theme: ThemePack;
  onPress: () => void;
  destructive?: boolean;
}) {
  const color = destructive ? "#FF4D4F" : theme.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        styles.navItem,
        {
          backgroundColor: pressed
            ? theme.activeBg
            : hovered
              ? theme.hoverBg
              : "transparent",
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.navLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    minWidth: SIDEBAR_WIDTH,
    maxWidth: SIDEBAR_WIDTH,
    height: "100%",
    flexDirection: "column",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  brandLogo: {
    width: 26,
    height: 26,
    borderRadius: 6,
  },
  brandText: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    letterSpacing: 0.1,
  },
  navScroll: {
    flex: 1,
  },
  navContent: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  sectionDivider: {
    height: 1,
    marginVertical: 8,
    marginHorizontal: 4,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 6,
  },
  navGroup: {
    gap: 0,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  navLabel: {
    fontSize: 13.5,
    flex: 1,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  userName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  menuList: {
    paddingTop: 2,
  },
});
