/**
 * Desktop top bar — pinned to the right of the sidebar, fixed at the top of
 * the viewport on web.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  [Wallet ▾]  [Marketplace ▾]  [Apps ▾]  [Settings ▾]                 │
 *   │                                                                      │
 *   │                   [ 🔍  Search… ]                                    │
 *   │                                                                      │
 *   │                          [ 💰 1,234 AC ]  [ 🔔 3 ]  [ 👤 ]           │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 *   - Top-nav items with sub-pages open as click-anchored dropdowns.
 *   - Items without sub-pages navigate directly.
 *   - The search input routes to the global search tab on Enter.
 *   - The ACoins pill mirrors `profile.acoin`. The bell badges the number of
 *     unread notifications (live-updated via Supabase realtime).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";

export const TOPBAR_HEIGHT = 56;

type SubItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  description?: string;
};

type TopNavItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string; // direct nav when no sub-pages
  match: (pathname: string) => boolean;
  subItems?: SubItem[];
  requiresAuth?: boolean;
};

const TOP_NAV: TopNavItem[] = [
  {
    key: "wallet",
    label: "Wallet",
    icon: "wallet-outline",
    match: (p) => p.startsWith("/wallet"),
    requiresAuth: true,
    subItems: [
      {
        key: "overview",
        label: "Overview",
        icon: "wallet-outline",
        route: "/wallet",
        description: "Balance, recent activity & rates",
      },
      {
        key: "topup",
        label: "Top up",
        icon: "add-circle-outline",
        route: "/wallet/topup",
        description: "Buy ACoins with NEXA",
      },
      {
        key: "requests",
        label: "Money requests",
        icon: "swap-horizontal-outline",
        route: "/wallet/requests",
        description: "Send & approve transfer requests",
      },
      {
        key: "scan",
        label: "Scan to pay",
        icon: "qr-code-outline",
        route: "/wallet/scan",
      },
      {
        key: "gift-vault",
        label: "Gift vault",
        icon: "gift-outline",
        route: "/wallet/gift-vault",
        description: "Convert received gifts to ACoins",
      },
    ],
  },
  {
    key: "marketplace",
    label: "Marketplace",
    icon: "bag-outline",
    match: (p) => p.startsWith("/shop") || p.startsWith("/store"),
    subItems: [
      {
        key: "browse",
        label: "Browse",
        icon: "search-outline",
        route: "/shop",
      },
      {
        key: "store",
        label: "Featured store",
        icon: "storefront-outline",
        route: "/store",
      },
      {
        key: "cart",
        label: "Cart",
        icon: "cart-outline",
        route: "/shop/cart",
      },
      {
        key: "orders",
        label: "My orders",
        icon: "receipt-outline",
        route: "/shop/my-orders",
      },
      {
        key: "manage",
        label: "Manage shop",
        icon: "construct-outline",
        route: "/shop/manage",
      },
      {
        key: "apply",
        label: "Open a shop",
        icon: "ribbon-outline",
        route: "/shop/apply",
      },
    ],
  },
  {
    key: "apps",
    label: "Apps",
    icon: "grid-outline",
    match: (p) => p === "/apps" || p.startsWith("/apps/") || p.startsWith("/games") || p.startsWith("/gifts") || p.startsWith("/freelance") || p.startsWith("/digital-events"),
    subItems: [
      { key: "ai", label: "AfuAI", icon: "sparkles-outline", route: "/ai" },
      { key: "games", label: "Games", icon: "game-controller-outline", route: "/games" },
      { key: "gifts", label: "Gifts", icon: "gift-outline", route: "/gifts" },
      { key: "freelance", label: "Freelance", icon: "briefcase-outline", route: "/freelance" },
      { key: "events", label: "Digital events", icon: "calendar-outline", route: "/digital-events" },
      { key: "username-market", label: "Username market", icon: "at-outline", route: "/username-market" },
      { key: "all", label: "All apps", icon: "grid-outline", route: "/apps" },
    ],
  },
  {
    key: "more",
    label: "More",
    icon: "ellipsis-horizontal",
    match: (p) =>
      p.startsWith("/settings") ||
      p.startsWith("/premium") ||
      p.startsWith("/support") ||
      p.startsWith("/about") ||
      p.startsWith("/referral") ||
      p.startsWith("/achievements"),
    subItems: [
      { key: "premium", label: "Premium", icon: "star-outline", route: "/premium" },
      { key: "achievements", label: "Achievements", icon: "trophy-outline", route: "/achievements" },
      { key: "referral", label: "Refer a friend", icon: "people-outline", route: "/referral" },
      { key: "settings", label: "Settings", icon: "settings-outline", route: "/settings" },
      { key: "support", label: "Help & Support", icon: "help-circle-outline", route: "/support" },
      { key: "about", label: "About", icon: "information-circle-outline", route: "/about" },
    ],
  },
];

type ThemePack = {
  bg: string;
  border: string;
  text: string;
  textMuted: string;
  hoverBg: string;
  activeBg: string;
  activeText: string;
  accent: string;
  inputBg: string;
  pillBg: string;
  badgeBg: string;
  menuBg: string;
  menuShadow: string;
};

function useThemePack(): ThemePack {
  const { isDark, colors } = useTheme();
  return {
    bg: isDark ? "#0F0F0F" : "#FFFFFF",
    border: isDark ? "#272727" : "#E5E5E5",
    text: isDark ? "#F1F1F1" : "#0F0F0F",
    textMuted: isDark ? "#8A8A8A" : "#606060",
    hoverBg: isDark ? "#272727" : "#F2F2F2",
    activeBg: isDark ? "#272727" : "#F2F2F2",
    activeText: isDark ? "#FFFFFF" : "#0F0F0F",
    accent: colors.accent,
    inputBg: isDark ? "#1F1F1F" : "#F2F2F2",
    pillBg: isDark ? "#1F1F1F" : "#F2F2F2",
    badgeBg: "#FF3B30",
    menuBg: isDark ? "#212121" : "#FFFFFF",
    menuShadow: "transparent",
  };
}

/**
 * Click-anchored dropdown. The trigger renders inline; on press, the panel
 * is positioned absolutely just below the trigger via a measured rect.
 */
function NavDropdown({
  item,
  active,
  theme,
  isLoggedIn,
  onNavigate,
}: {
  item: TopNavItem;
  active: boolean;
  theme: ThemePack;
  isLoggedIn: boolean;
  onNavigate: (route: string, requiresAuth?: boolean) => void;
}) {
  const triggerRef = useRef<View | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(
    null,
  );

  const measure = () => {
    if (Platform.OS !== "web") return;
    const node: any = triggerRef.current as any;
    if (!node || !node.getBoundingClientRect) return;
    const rect = node.getBoundingClientRect();
    setCoords({ left: rect.left, top: rect.bottom + 6 });
  };

  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const onDown = (e: MouseEvent) => {
      const node: any = triggerRef.current as any;
      if (node && node.contains && node.contains(e.target)) return;
      // Allow clicks inside the panel via data attribute
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('[data-nav-dropdown="1"]')) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  const onPressTrigger = () => {
    if (!item.subItems || item.subItems.length === 0) {
      if (item.route) onNavigate(item.route, item.requiresAuth);
      return;
    }
    if (open) {
      setOpen(false);
      return;
    }
    measure();
    setOpen(true);
  };

  return (
    <>
      <View ref={triggerRef as any}>
        <Pressable
          onPress={onPressTrigger}
          style={({ hovered, pressed }: any) => [
            styles.navBtn,
            {
              backgroundColor: active
                ? theme.activeBg
                : open
                  ? theme.hoverBg
                  : hovered || pressed
                    ? theme.hoverBg
                    : "transparent",
            },
          ]}
        >
          <Ionicons
            name={item.icon}
            size={15}
            color={active ? theme.accent : theme.text}
          />
          <Text
            style={[
              styles.navBtnText,
              {
                color: active ? theme.activeText : theme.text,
                fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
              },
            ]}
          >
            {item.label}
          </Text>
          {item.subItems && item.subItems.length > 0 ? (
            <Ionicons
              name={open ? "chevron-up" : "chevron-down"}
              size={12}
              color={theme.textMuted}
            />
          ) : null}
        </Pressable>
      </View>

      {open && coords && Platform.OS === "web" && item.subItems ? (
        <View
          // @ts-expect-error react-native-web maps dataSet to data-* attrs
          dataSet={{ "nav-dropdown": "1" }}
          style={[
            styles.dropdownPanel,
            {
              left: coords.left,
              top: coords.top,
              backgroundColor: theme.menuBg,
              borderColor: theme.border,
              shadowColor: theme.menuShadow,
            },
          ]}
        >
          {item.subItems.map((sub) => (
            <Pressable
              key={sub.key}
              onPress={() => {
                setOpen(false);
                onNavigate(sub.route, item.requiresAuth);
              }}
              style={({ hovered }: any) => [
                styles.dropdownRow,
                { backgroundColor: hovered ? theme.hoverBg : "transparent" },
              ]}
            >
              <View
                style={[
                  styles.dropdownIconWrap,
                  { backgroundColor: theme.inputBg },
                ]}
              >
                <Ionicons name={sub.icon} size={15} color={theme.text} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.dropdownLabel, { color: theme.text }]}>
                  {sub.label}
                </Text>
                {sub.description ? (
                  <Text
                    style={[
                      styles.dropdownDesc,
                      { color: theme.textMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {sub.description}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </>
  );
}

function formatACoins(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function DesktopTopBar() {
  const theme = useThemePack();
  const pathname = usePathname() || "/";
  const { session, profile } = useAuth();
  const isLoggedIn = !!session;
  const userId = session?.user?.id;

  const [query, setQuery] = useState("");
  const [unread, setUnread] = useState(0);

  // Fetch + subscribe to unread notifications count.
  useEffect(() => {
    if (!userId) {
      setUnread(0);
      return;
    }
    let cancelled = false;

    const refresh = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      if (!cancelled) setUnread(count ?? 0);
    };

    refresh();

    const channel = supabase
      .channel(`topbar-notifs:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => refresh(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  function go(route: string, requiresAuth?: boolean) {
    if (requiresAuth && !isLoggedIn) {
      router.push("/(auth)/login" as any);
      return;
    }
    router.push(route as any);
  }

  function submitSearch() {
    const q = query.trim();
    if (!q) {
      router.push("/(tabs)/search" as any);
      return;
    }
    router.push(`/(tabs)/search?q=${encodeURIComponent(q)}` as any);
  }

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.bg,
          height: TOPBAR_HEIGHT,
        },
      ]}
    >
      {/* Left: top nav with dropdowns */}
      <View style={styles.left}>
        {TOP_NAV.map((item) => (
          <NavDropdown
            key={item.key}
            item={item}
            active={item.match(pathname)}
            theme={theme}
            isLoggedIn={isLoggedIn}
            onNavigate={go}
          />
        ))}
      </View>

      {/* Centre: search */}
      <View style={styles.center}>
        <View
          style={[
            styles.searchWrap,
            { backgroundColor: theme.inputBg, borderColor: theme.border },
          ]}
        >
          <Ionicons name="search-outline" size={15} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={submitSearch}
            placeholder="Search people, posts, shops…"
            placeholderTextColor={theme.textMuted}
            returnKeyType="search"
            style={[
              styles.searchInput,
              {
                color: theme.text,
                ...(Platform.OS === "web" ? { outlineWidth: 0 as any } : null),
              },
            ]}
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery("")}
              style={({ hovered }: any) => ({
                opacity: hovered ? 0.7 : 1,
                padding: 2,
              })}
            >
              <Ionicons
                name="close-circle"
                size={15}
                color={theme.textMuted}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Right: utilities */}
      <View style={styles.right}>
        {isLoggedIn ? (
          <Pressable
            onPress={() => router.push("/wallet" as any)}
            style={({ hovered, pressed }: any) => [
              styles.coinPill,
              {
                backgroundColor: theme.pillBg,
                borderColor: theme.border,
                opacity: pressed ? 0.85 : hovered ? 0.92 : 1,
              },
            ]}
          >
            <Ionicons name="logo-bitcoin" size={14} color="#D4A853" />
            <Text style={[styles.coinText, { color: theme.text }]}>
              {formatACoins(profile?.acoin ?? 0)}
            </Text>
            <Text style={[styles.coinSuffix, { color: theme.textMuted }]}>
              AC
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => go("/notifications", true)}
          style={({ hovered, pressed }: any) => [
            styles.iconBtn,
            {
              backgroundColor:
                pressed || hovered ? theme.hoverBg : "transparent",
            },
          ]}
        >
          <Ionicons
            name="notifications-outline"
            size={18}
            color={theme.text}
          />
          {isLoggedIn && unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.badgeBg }]}>
              <Text style={styles.badgeText}>
                {unread > 99 ? "99+" : String(unread)}
              </Text>
            </View>
          ) : null}
        </Pressable>

        {isLoggedIn ? (
          <Pressable
            onPress={() => router.push("/(tabs)/me" as any)}
            style={({ hovered, pressed }: any) => [
              styles.avatarBtn,
              { borderColor: theme.border, opacity: pressed ? 0.85 : hovered ? 0.92 : 1 },
            ]}
          >
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatarImg}
              />
            ) : (
              <View
                style={[
                  styles.avatarFallback,
                  { backgroundColor: theme.accent },
                ]}
              >
                <Text style={styles.avatarFallbackText}>
                  {(profile?.display_name || "U").trim().slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push("/(auth)/login" as any)}
            style={({ hovered, pressed }: any) => [
              styles.signInBtn,
              {
                backgroundColor: theme.accent,
                opacity: pressed ? 0.85 : hovered ? 0.92 : 1,
              },
            ]}
          >
            <Text style={styles.signInText}>Sign in</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 16,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  center: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    minWidth: 0,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  navBtnText: {
    fontSize: 13,
  },
  dropdownPanel: {
    position: "fixed" as any,
    width: 280,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    zIndex: 1000,
  },
  dropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dropdownIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  dropdownDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 11.5,
    marginTop: 1,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 36,
    width: "100%",
    maxWidth: 480,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13.5,
    minWidth: 0,
  },
  coinPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
  },
  coinText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12.5,
  },
  coinSuffix: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    lineHeight: 12,
  },
  avatarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    marginLeft: 4,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 13,
  },
  signInBtn: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  signInText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
});
