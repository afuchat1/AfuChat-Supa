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
 *   • The bottom profile/account section has been removed — it duplicates
 *     the top-bar profile drawer. An AI quick-chat widget lives at the
 *     bottom instead.
 */
import React from "react";
import {
  Image,
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
import { SidebarAIWidget } from "./SidebarAIWidget";

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
  accent: string;
  surface: string;
  inputBg: string;
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
  const { session } = useAuth();

  const isLoggedIn = !!session;

  function nextThemeMode() {
    return themeMode === "system"
      ? "light"
      : themeMode === "light"
        ? "dark"
        : "system";
  }

  const theme: ThemePack = {
    bg: isDark ? "#111" : "#fff",
    text: isDark ? "#f0f0f0" : "#111",
    textMuted: isDark ? "#888" : "#888",
    hoverBg: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
    activeBg: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
    divider: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    accent: "#00BCD4",
    surface: isDark ? "#1a1a1a" : "#f8f8f8",
    inputBg: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
  };

  function navigate(route: string) {
    router.push(route as any);
  }

  return (
    <View style={[styles.sidebar, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={styles.navScroll}
        contentContainerStyle={styles.navContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <View style={styles.brandRow}>
          <Image source={afuSymbol} style={styles.brandLogo} />
          <Text style={[styles.brandText, { color: theme.text }]}>AfuChat</Text>
        </View>

        {/* Nav sections */}
        {SECTIONS.map((section, si) => (
          <View key={section.key}>
            {si > 0 && (
              <View
                style={[styles.sectionDivider, { backgroundColor: theme.divider }]}
              />
            )}
            {section.title && (
              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
                {section.title}
              </Text>
            )}
            <View style={styles.navGroup}>
              {section.items.map((item) => {
                const disabled = !!item.requiresAuth && !isLoggedIn;
                return (
                  <SidebarNavItem
                    key={item.key}
                    item={item}
                    active={item.match(pathname)}
                    disabled={disabled}
                    theme={theme}
                    onActivate={() => {
                      if (disabled) {
                        navigate("/(auth)/login");
                      } else {
                        navigate(item.route);
                      }
                    }}
                  />
                );
              })}
            </View>
          </View>
        ))}

        {/* Sign in button for logged-out users */}
        {!isLoggedIn && (
          <>
            <View
              style={[styles.sectionDivider, { backgroundColor: theme.divider }]}
            />
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
              <Text style={[styles.navLabel, { color: theme.text }]}>Sign in</Text>
            </Pressable>
            <Pressable
              onPress={() => setThemeMode(nextThemeMode() as any)}
              style={({ hovered }: any) => [
                styles.navItem,
                { backgroundColor: hovered ? theme.hoverBg : "transparent" },
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
          </>
        )}

        {/* AI quick-chat widget */}
        <SidebarAIWidget theme={theme} />
      </ScrollView>
    </View>
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
    paddingBottom: 12,
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
});
