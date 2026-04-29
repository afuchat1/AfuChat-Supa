/**
 * Desktop sidebar — fully rebuilt.
 *
 * Design goals:
 *   1. Fixed width of SIDEBAR_WIDTH (=248px). The sidebar must never resize,
 *      regardless of which route is active or how wide the viewport is.
 *   2. Sticky on web: rendered as `position: fixed` so page-level scrolling
 *      inside the main content area never moves it.
 *   3. Persistent across all in-shell navigations — DesktopShell mounts this
 *      once and routes only swap the right-hand content area.
 *   4. Self-scrollable nav list when there are too many items, while the
 *      brand row, primary CTA, and footer remain pinned.
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
import { ContextMenu, useContextMenu } from "@/components/desktop/ContextMenu";

export const SIDEBAR_WIDTH = 248;

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
  {
    key: "services",
    title: "Services",
    items: [
      {
        key: "wallet",
        label: "Wallet",
        icon: "wallet-outline",
        iconActive: "wallet",
        route: "/wallet",
        match: (p) => p.startsWith("/wallet"),
        requiresAuth: true,
      },
      {
        key: "shop",
        label: "Marketplace",
        icon: "bag-outline",
        iconActive: "bag",
        route: "/shop",
        match: (p) => p.startsWith("/shop") || p.startsWith("/store"),
      },
      {
        key: "apps",
        label: "Apps",
        icon: "grid-outline",
        iconActive: "grid",
        route: "/apps",
        match: (p) => p === "/apps" || p.startsWith("/apps/"),
      },
    ],
  },
  {
    key: "more",
    title: "More",
    items: [
      {
        key: "premium",
        label: "Premium",
        icon: "star-outline",
        iconActive: "star",
        route: "/premium",
        match: (p) => p === "/premium",
      },
      {
        key: "support",
        label: "Help & Support",
        icon: "help-circle-outline",
        iconActive: "help-circle",
        route: "/support",
        match: (p) => p.startsWith("/support"),
      },
      {
        key: "settings",
        label: "Settings",
        icon: "settings-outline",
        iconActive: "settings",
        route: "/settings",
        match: (p) => p.startsWith("/settings"),
        requiresAuth: true,
      },
    ],
  },
];

type ThemePack = {
  bg: string;
  border: string;
  textPrimary: string;
  textMuted: string;
  hoverBg: string;
  activeBg: string;
  activeText: string;
  sectionLabel: string;
  accent: string;
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
  const { menuProps, bind } = useContextMenu([
    [
      {
        key: "open",
        label: "Open",
        icon: "open-outline",
        onSelect: onActivate,
      },
      {
        key: "open-new-tab",
        label: "Open in new tab",
        icon: "open-outline",
        onSelect: () => {
          if (typeof window !== "undefined") {
            window.open(item.route, "_blank", "noopener,noreferrer");
          }
        },
      },
      {
        key: "copy-link",
        label: "Copy link",
        icon: "link-outline",
        onSelect: async () => {
          if (
            typeof window !== "undefined" &&
            typeof navigator !== "undefined" &&
            navigator.clipboard
          ) {
            const url = `${window.location.origin}${item.route}`;
            try {
              await navigator.clipboard.writeText(url);
            } catch {
              /* noop */
            }
          }
        },
      },
    ],
  ]);

  const iconColor = active
    ? theme.accent
    : disabled
      ? theme.textMuted
      : theme.textPrimary;
  const labelColor = active
    ? theme.activeText
    : disabled
      ? theme.textMuted
      : theme.textPrimary;

  const content = (
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
      {active ? (
        <View style={[styles.activeIndicator, { backgroundColor: theme.accent }]} />
      ) : null}
      <Ionicons
        name={(active && item.iconActive) || item.icon}
        size={19}
        color={iconColor}
      />
      <Text
        style={[
          styles.navLabel,
          {
            color: labelColor,
            fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
          },
        ]}
        numberOfLines={1}
      >
        {item.label}
      </Text>
    </Pressable>
  );

  if (Platform.OS !== "web") return content;
  return (
    <View {...bind}>
      <ContextMenu {...menuProps} />
      {content}
    </View>
  );
}

export function DesktopSidebar() {
  const pathname = usePathname() || "/";
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const { session, profile } = useAuth();
  const isLoggedIn = !!session;
  const [menuOpen, setMenuOpen] = useState(false);

  const theme: ThemePack = {
    bg: isDark ? "#0B0B0E" : "#FAFBFC",
    border: isDark ? "#1C1C20" : "#E6E8EC",
    textPrimary: isDark ? "#EDEDF0" : "#1A1A1F",
    textMuted: isDark ? "#7E8088" : "#6A6E78",
    hoverBg: isDark ? "#16171B" : "#EEF0F4",
    activeBg: isDark ? "#1C1F2A" : "#E7EBFA",
    activeText: isDark ? "#FFFFFF" : "#1A1A1F",
    sectionLabel: isDark ? "#6B6F78" : "#8A8F9C",
    accent: colors.accent,
    menuBg: isDark ? "#15161B" : "#FFFFFF",
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
    <View
      style={[
        styles.sidebar,
        { backgroundColor: theme.bg, borderRightColor: theme.border },
      ]}
    >
      {/* Brand */}
      <Pressable
        onPress={() => router.push("/(tabs)" as any)}
        style={({ hovered }: any) => [
          styles.brandRow,
          { opacity: hovered ? 0.85 : 1 },
        ]}
      >
        <Image source={afuSymbol} style={styles.brandLogo} resizeMode="contain" />
        <Text style={[styles.brandText, { color: theme.textPrimary }]}>
          AfuChat
        </Text>
      </Pressable>

      {/* Compose CTA */}
      <View style={styles.ctaWrap}>
        {isLoggedIn ? (
          <Pressable
            onPress={() => router.push("/contact" as any)}
            style={({ hovered, pressed }: any) => [
              styles.cta,
              {
                backgroundColor: theme.accent,
                opacity: pressed ? 0.85 : hovered ? 0.92 : 1,
              },
            ]}
          >
            <Ionicons name="create-outline" size={16} color="#FFFFFF" />
            <Text style={styles.ctaText}>New chat</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push("/(auth)/login" as any)}
            style={({ hovered, pressed }: any) => [
              styles.cta,
              {
                backgroundColor: theme.accent,
                opacity: pressed ? 0.85 : hovered ? 0.92 : 1,
              },
            ]}
          >
            <Ionicons name="log-in-outline" size={16} color="#FFFFFF" />
            <Text style={styles.ctaText}>Sign in</Text>
          </Pressable>
        )}
      </View>

      {/* Navigation */}
      <ScrollView
        style={styles.navScroll}
        contentContainerStyle={styles.navContent}
        showsVerticalScrollIndicator={false}
      >
        {SECTIONS.map((section, idx) => (
          <View key={section.key} style={idx === 0 ? null : styles.sectionGap}>
            {section.title ? (
              <Text style={[styles.sectionLabel, { color: theme.sectionLabel }]}>
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
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
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
                size={34}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[styles.userName, { color: theme.textPrimary }]}
                  numberOfLines={1}
                >
                  {profile?.display_name || (profile as any)?.handle || "User"}
                </Text>
                {(profile as any)?.handle ? (
                  <Text
                    style={[styles.userHandle, { color: theme.textMuted }]}
                    numberOfLines={1}
                  >
                    @{(profile as any).handle}
                  </Text>
                ) : null}
              </View>
              <Ionicons
                name={menuOpen ? "chevron-down" : "chevron-up"}
                size={14}
                color={theme.textMuted}
              />
            </Pressable>

            {menuOpen ? (
              <View
                style={[
                  styles.menu,
                  { backgroundColor: theme.menuBg, borderColor: theme.border },
                ]}
              >
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
                <View
                  style={[styles.menuDivider, { backgroundColor: theme.border }]}
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
          <Pressable
            onPress={() => setThemeMode(nextThemeMode() as any)}
            style={({ hovered }: any) => [
              styles.themeToggle,
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
              size={16}
              color={theme.textMuted}
            />
            <Text style={[styles.themeToggleText, { color: theme.textMuted }]}>
              {themeMode === "system"
                ? "System theme"
                : themeMode === "dark"
                  ? "Dark mode"
                  : "Light mode"}
            </Text>
          </Pressable>
        )}
      </View>
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
  const color = destructive ? "#EF4444" : theme.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        styles.menuItem,
        {
          backgroundColor: pressed
            ? theme.activeBg
            : hovered
              ? theme.hoverBg
              : "transparent",
        },
      ]}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.menuItemText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    minWidth: SIDEBAR_WIDTH,
    maxWidth: SIDEBAR_WIDTH,
    height: "100%",
    borderRightWidth: 1,
    flexDirection: "column",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 14,
  },
  brandLogo: {
    width: 26,
    height: 26,
    borderRadius: 7,
  },
  brandText: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    letterSpacing: 0.2,
  },
  ctaWrap: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 38,
    borderRadius: 10,
  },
  ctaText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13.5,
  },
  navScroll: {
    flex: 1,
  },
  navContent: {
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  sectionGap: {
    marginTop: 14,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  navGroup: {
    gap: 2,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    position: "relative",
  },
  activeIndicator: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  navLabel: {
    fontSize: 13.5,
    flex: 1,
  },
  footer: {
    borderTopWidth: 1,
    padding: 8,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
  },
  userName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  userHandle: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 1,
  },
  menu: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 4,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  menuItemText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  menuDivider: {
    height: 1,
    width: "100%",
    marginVertical: 4,
  },
  themeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
  },
  themeToggleText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
