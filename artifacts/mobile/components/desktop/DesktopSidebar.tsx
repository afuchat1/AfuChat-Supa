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

const afuSymbol = require("@/assets/images/afu-symbol.png");

type NavItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  match: (pathname: string) => boolean;
  requiresAuth?: boolean;
};

const PRIMARY: NavItem[] = [
  {
    key: "chats",
    label: "Chats",
    icon: "chatbubbles-outline",
    route: "/(tabs)",
    match: (p) => p === "/" || p === "/index" || p.startsWith("/chat"),
    requiresAuth: true,
  },
  {
    key: "discover",
    label: "Discover",
    icon: "compass-outline",
    route: "/discover",
    match: (p) => p === "/discover" || p.startsWith("/post") || p.startsWith("/article") || p.startsWith("/video"),
  },
  {
    key: "moments",
    label: "Moments",
    icon: "images-outline",
    route: "/moments",
    match: (p) => p.startsWith("/moments"),
    requiresAuth: true,
  },
  {
    key: "apps",
    label: "Apps",
    icon: "grid-outline",
    route: "/apps",
    match: (p) => p === "/apps" || p.startsWith("/apps/"),
  },
  {
    key: "ai",
    label: "AI Chat",
    icon: "sparkles-outline",
    route: "/ai",
    match: (p) => p.startsWith("/ai"),
    requiresAuth: true,
  },
  {
    key: "wallet",
    label: "Wallet",
    icon: "wallet-outline",
    route: "/wallet",
    match: (p) => p.startsWith("/wallet"),
    requiresAuth: true,
  },
  {
    key: "shop",
    label: "Marketplace",
    icon: "bag-outline",
    route: "/shop",
    match: (p) => p.startsWith("/shop") || p.startsWith("/store"),
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: "notifications-outline",
    route: "/notifications",
    match: (p) => p.startsWith("/notifications"),
    requiresAuth: true,
  },
];

const SECONDARY: NavItem[] = [
  {
    key: "premium",
    label: "Premium",
    icon: "star-outline",
    route: "/premium",
    match: (p) => p === "/premium",
  },
  {
    key: "support",
    label: "Help & Support",
    icon: "help-circle-outline",
    route: "/support",
    match: (p) => p.startsWith("/support"),
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings-outline",
    route: "/settings",
    match: (p) => p.startsWith("/settings"),
    requiresAuth: true,
  },
];

type SidebarNavItemProps = {
  item: NavItem;
  active: boolean;
  disabled: boolean;
  activeBg: string;
  hoverBg: string;
  textPrimary: string;
  textMuted: string;
  accent: string;
  onActivate: () => void;
};

function SidebarNavItem({
  item,
  active,
  disabled,
  activeBg,
  hoverBg,
  textPrimary,
  textMuted,
  accent,
  onActivate,
}: SidebarNavItemProps) {
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
            } catch {}
          }
        },
      },
    ],
  ]);

  const content = (
    <Pressable
      onPress={onActivate}
      style={({ hovered }: any) => [
        styles.navItem,
        { backgroundColor: active ? activeBg : hovered ? hoverBg : "transparent" },
      ]}
    >
      <Ionicons
        name={item.icon}
        size={18}
        color={active ? accent : disabled ? textMuted : textPrimary}
      />
      <Text
        style={[
          styles.navLabel,
          {
            color: active ? accent : disabled ? textMuted : textPrimary,
            fontWeight: active ? "600" : "500",
          },
        ]}
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

  const sidebarBg = isDark ? "#0E0E10" : "#F7F8FA";
  const borderColor = isDark ? "#1F1F23" : "#E6E7EB";
  const textPrimary = isDark ? "#F2F2F2" : "#1A1A1A";
  const textMuted = isDark ? "#8B8B90" : "#6B6F76";
  const hoverBg = isDark ? "#1A1A1D" : "#EDEFF3";
  const activeBg = isDark ? "#1F2024" : "#E8EAF0";

  function go(route: string, requiresAuth?: boolean) {
    if (requiresAuth && !isLoggedIn) {
      router.push("/(auth)/login" as any);
      return;
    }
    router.push(route as any);
  }

  function renderItem(item: NavItem) {
    const active = item.match(pathname);
    const disabled = item.requiresAuth && !isLoggedIn;
    return (
      <SidebarNavItem
        key={item.key}
        item={item}
        active={active}
        disabled={!!disabled}
        activeBg={activeBg}
        hoverBg={hoverBg}
        textPrimary={textPrimary}
        textMuted={textMuted}
        accent={colors.accent}
        onActivate={() => go(item.route, item.requiresAuth)}
      />
    );
  }

  return (
    <View
      style={[
        styles.sidebar,
        { backgroundColor: sidebarBg, borderRightColor: borderColor },
      ]}
    >
      {/* Brand */}
      <Pressable
        onPress={() => router.push("/(tabs)" as any)}
        style={styles.brandRow}
      >
        <Image source={afuSymbol} style={styles.brandLogo} resizeMode="contain" />
        <Text style={[styles.brandText, { color: textPrimary }]}>AfuChat</Text>
      </Pressable>

      <View style={[styles.divider, { backgroundColor: borderColor }]} />

      {/* New chat / compose CTA */}
      {isLoggedIn ? (
        <Pressable
          onPress={() => router.push("/contact" as any)}
          style={({ hovered }: any) => [
            styles.cta,
            {
              backgroundColor: colors.accent,
              opacity: hovered ? 0.92 : 1,
            },
          ]}
        >
          <Ionicons name="create-outline" size={16} color="#FFFFFF" />
          <Text style={styles.ctaText}>New chat</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => router.push("/(auth)/login" as any)}
          style={({ hovered }: any) => [
            styles.cta,
            {
              backgroundColor: colors.accent,
              opacity: hovered ? 0.92 : 1,
            },
          ]}
        >
          <Ionicons name="log-in-outline" size={16} color="#FFFFFF" />
          <Text style={styles.ctaText}>Sign in</Text>
        </Pressable>
      )}

      {/* Navigation */}
      <ScrollView
        style={styles.navScroll}
        contentContainerStyle={styles.navContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.navGroup}>{PRIMARY.map(renderItem)}</View>

        <View
          style={[styles.divider, { backgroundColor: borderColor, marginVertical: 12 }]}
        />

        <View style={styles.navGroup}>{SECONDARY.map(renderItem)}</View>
      </ScrollView>

      {/* User card / footer */}
      <View style={[styles.footer, { borderTopColor: borderColor }]}>
        {isLoggedIn ? (
          <View>
            <Pressable
              onPress={() => setMenuOpen((v) => !v)}
              style={({ hovered }: any) => [
                styles.userCard,
                { backgroundColor: hovered ? hoverBg : "transparent" },
              ]}
            >
              <Avatar
                uri={profile?.avatar_url ?? null}
                name={profile?.display_name || profile?.username || "User"}
                size={32}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[styles.userName, { color: textPrimary }]}
                  numberOfLines={1}
                >
                  {profile?.display_name || profile?.username || "User"}
                </Text>
                {profile?.username ? (
                  <Text
                    style={[styles.userHandle, { color: textMuted }]}
                    numberOfLines={1}
                  >
                    @{profile.username}
                  </Text>
                ) : null}
              </View>
              <Ionicons
                name={menuOpen ? "chevron-down" : "chevron-up"}
                size={14}
                color={textMuted}
              />
            </Pressable>

            {menuOpen ? (
              <View
                style={[
                  styles.menu,
                  { backgroundColor: isDark ? "#16161A" : "#FFFFFF", borderColor },
                ]}
              >
                <Pressable
                  onPress={() => {
                    setMenuOpen(false);
                    router.push("/(tabs)/me" as any);
                  }}
                  style={({ hovered }: any) => [
                    styles.menuItem,
                    { backgroundColor: hovered ? hoverBg : "transparent" },
                  ]}
                >
                  <Ionicons name="person-outline" size={16} color={textPrimary} />
                  <Text style={[styles.menuItemText, { color: textPrimary }]}>
                    Profile
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setMenuOpen(false);
                    router.push("/profile/edit" as any);
                  }}
                  style={({ hovered }: any) => [
                    styles.menuItem,
                    { backgroundColor: hovered ? hoverBg : "transparent" },
                  ]}
                >
                  <Ionicons name="create-outline" size={16} color={textPrimary} />
                  <Text style={[styles.menuItemText, { color: textPrimary }]}>
                    Edit profile
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const next =
                      themeMode === "light"
                        ? "dark"
                        : themeMode === "dark"
                          ? "system"
                          : "light";
                    setThemeMode(next as any);
                  }}
                  style={({ hovered }: any) => [
                    styles.menuItem,
                    { backgroundColor: hovered ? hoverBg : "transparent" },
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
                    color={textPrimary}
                  />
                  <Text style={[styles.menuItemText, { color: textPrimary }]}>
                    Theme: {themeMode}
                  </Text>
                </Pressable>
                <View style={[styles.divider, { backgroundColor: borderColor }]} />
                <Pressable
                  onPress={async () => {
                    setMenuOpen(false);
                    await supabase.auth.signOut();
                    router.replace("/(auth)/login" as any);
                  }}
                  style={({ hovered }: any) => [
                    styles.menuItem,
                    { backgroundColor: hovered ? hoverBg : "transparent" },
                  ]}
                >
                  <Ionicons name="log-out-outline" size={16} color="#EF4444" />
                  <Text style={[styles.menuItemText, { color: "#EF4444" }]}>
                    Sign out
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <Pressable
            onPress={() => {
              const next =
                themeMode === "light"
                  ? "dark"
                  : themeMode === "dark"
                    ? "system"
                    : "light";
              setThemeMode(next as any);
            }}
            style={({ hovered }: any) => [
              styles.themeToggle,
              { backgroundColor: hovered ? hoverBg : "transparent" },
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
              color={textMuted}
            />
            <Text style={[styles.themeToggleText, { color: textMuted }]}>
              {themeMode === "system" ? "System theme" : themeMode === "dark" ? "Dark mode" : "Light mode"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 240,
    height: "100%",
    borderRightWidth: 1,
    flexDirection: "column",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
  },
  brandLogo: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  brandText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 0.2,
  },
  divider: {
    height: 1,
    width: "100%",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 36,
    marginHorizontal: 12,
    marginVertical: 12,
    borderRadius: 8,
  },
  ctaText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  navScroll: {
    flex: 1,
  },
  navContent: {
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  navGroup: {
    gap: 2,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  navLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
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
    borderRadius: 8,
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
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 4,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  menuItemText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  themeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  themeToggleText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
