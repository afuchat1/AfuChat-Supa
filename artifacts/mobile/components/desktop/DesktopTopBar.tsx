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
import type { StoredAccount } from "@/lib/accountStore";

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
    key: "pages",
    label: "Pages",
    icon: "business-outline",
    match: (p) => p.startsWith("/company"),
    subItems: [
      { key: "discover", label: "Discover Pages", icon: "search-outline", route: "/company", description: "Browse organization pages" },
      { key: "my-pages", label: "My Pages", icon: "briefcase-outline", route: "/company?tab=mine", description: "Pages you manage" },
      { key: "create", label: "Create a Page", icon: "add-circle-outline", route: "/company/create", description: "Build your organization's presence" },
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
 * Vercel-style hover-to-open dropdown.
 *
 * - Opens instantly on mouse-enter of the trigger button.
 * - Stays open while the cursor is over the trigger OR the panel.
 * - Closes after a short grace delay once the cursor leaves both zones,
 *   so the user can comfortably move from button → panel without the
 *   menu snapping shut.
 * - Clicking still works (for keyboard / touch users).
 * - Escape always closes.
 */
const LEAVE_DELAY_MS = 120; // ms before closing after cursor leaves

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
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measure = () => {
    if (Platform.OS !== "web") return;
    const node: any = triggerRef.current as any;
    if (!node || !node.getBoundingClientRect) return;
    const rect = node.getBoundingClientRect();
    setCoords({ left: rect.left, top: rect.bottom + 4 });
  };

  const openMenu = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    if (!open) {
      measure();
      setOpen(true);
    }
  };

  const scheduleClose = () => {
    leaveTimer.current = setTimeout(() => setOpen(false), LEAVE_DELAY_MS);
  };

  const cancelClose = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  };

  useEffect(() => {
    return () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
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
    } else {
      measure();
      setOpen(true);
    }
  };

  return (
    <>
      <View
        ref={triggerRef as any}
        // @ts-expect-error react-native-web passes through onMouseEnter/Leave
        onMouseEnter={item.subItems?.length ? openMenu : undefined}
        onMouseLeave={item.subItems?.length ? scheduleClose : undefined}
      >
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
          // @ts-expect-error react-native-web passes through mouse events
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
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
                    style={[styles.dropdownDesc, { color: theme.textMuted }]}
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

/**
 * Account dropdown anchored to the user's avatar in the top right.
 *
 * Shows the active account, any other accounts the user has linked through the
 * "Linked accounts" flow, plus quick links to add an account, edit / view the
 * profile, and sign out. This replaces the previous avatar→/me navigation so
 * desktop users get a one-click account switcher (mirrors WhatsApp/Telegram
 * web's avatar menu).
 */
function ProfileDropdown({
  theme,
  profile,
  currentUserId,
  linkedAccounts,
  onSwitchAccount,
}: {
  theme: ThemePack;
  profile: { display_name: string | null; handle: string | null; avatar_url: string | null } | null;
  currentUserId: string | null;
  linkedAccounts: StoredAccount[];
  onSwitchAccount: (userId: string) => Promise<void>;
}) {
  const { themeMode, setThemeMode } = useTheme();
  const triggerRef = useRef<View | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ right: number; top: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const measure = () => {
    if (Platform.OS !== "web") return;
    const node: any = triggerRef.current as any;
    if (!node || !node.getBoundingClientRect) return;
    const rect = node.getBoundingClientRect();
    setCoords({
      right: Math.max(8, window.innerWidth - rect.right),
      top: rect.bottom + 6,
    });
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
    } else {
      measure();
      setOpen(true);
    }
  };

  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onResize = () => setOpen(false);
    const onClick = (e: MouseEvent) => {
      const target = e.target as any;
      if (target?.closest?.('[data-profile-dropdown="1"]')) return;
      const trigger: any = triggerRef.current;
      if (trigger && typeof trigger.contains === "function" && trigger.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function navigate(route: string) {
    setOpen(false);
    router.push(route as any);
  }

  async function handleSwitch(userId: string) {
    if (userId === currentUserId || busy) return;
    setBusy(userId);
    try {
      await onSwitchAccount(userId);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  const displayName = profile?.display_name || "You";
  const handle = profile?.handle || "";
  const initial = (displayName || "U").trim().slice(0, 1).toUpperCase();
  const otherAccounts = linkedAccounts.filter((a) => a.userId !== currentUserId);

  function renderAvatar(uri: string | null | undefined, name: string | null | undefined, size: number) {
    if (uri) {
      return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
    }
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.accent,
        }}
      >
        <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: Math.max(11, Math.floor(size * 0.42)) }}>
          {(name || "U").trim().slice(0, 1).toUpperCase()}
        </Text>
      </View>
    );
  }

  return (
    <>
      <View ref={triggerRef as any}>
        <Pressable
          onPress={toggle}
          style={({ hovered, pressed }: any) => [
            styles.avatarBtn,
            {
              borderColor: open ? theme.accent : theme.border,
              opacity: pressed ? 0.85 : hovered ? 0.92 : 1,
            },
          ]}
        >
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: theme.accent }]}>
              <Text style={styles.avatarFallbackText}>{initial}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {open && coords && Platform.OS === "web" ? (
        <View
          // @ts-expect-error react-native-web maps dataSet to data-* attrs
          dataSet={{ "profile-dropdown": "1" }}
          style={[
            styles.profilePanel,
            {
              right: coords.right,
              top: coords.top,
              backgroundColor: theme.menuBg,
              borderColor: theme.border,
            },
          ]}
        >
          {/* Active account header */}
          <Pressable
            onPress={() => navigate("/(tabs)/me")}
            style={({ hovered }: any) => [
              styles.profileHeader,
              { backgroundColor: hovered ? theme.hoverBg : "transparent" },
            ]}
          >
            {renderAvatar(profile?.avatar_url ?? null, displayName, 38)}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
                {displayName}
              </Text>
              {handle ? (
                <Text style={[styles.profileHandle, { color: theme.textMuted }]} numberOfLines={1}>
                  @{handle}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
          </Pressable>

          <View style={[styles.profileDivider, { backgroundColor: theme.border }]} />

          {/* Other linked accounts */}
          {otherAccounts.length > 0 ? (
            <>
              <Text style={[styles.profileSection, { color: theme.textMuted }]}>Switch account</Text>
              {otherAccounts.map((acct) => (
                <Pressable
                  key={acct.userId}
                  onPress={() => handleSwitch(acct.userId)}
                  disabled={!!busy}
                  style={({ hovered }: any) => [
                    styles.profileAccountRow,
                    { backgroundColor: hovered ? theme.hoverBg : "transparent", opacity: busy && busy !== acct.userId ? 0.5 : 1 },
                  ]}
                >
                  {renderAvatar(acct.avatarUrl, acct.displayName, 30)}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.profileAccountName, { color: theme.text }]} numberOfLines={1}>
                      {acct.displayName || "Account"}
                    </Text>
                    <Text style={[styles.profileAccountSub, { color: theme.textMuted }]} numberOfLines={1}>
                      {acct.handle ? `@${acct.handle}` : acct.email}
                    </Text>
                  </View>
                  {busy === acct.userId ? (
                    <Ionicons name="sync" size={14} color={theme.textMuted} />
                  ) : (
                    <Ionicons name="swap-horizontal-outline" size={14} color={theme.textMuted} />
                  )}
                </Pressable>
              ))}
              <View style={[styles.profileDivider, { backgroundColor: theme.border }]} />
            </>
          ) : null}

          {/* Account / profile actions */}
          <Pressable
            onPress={() => navigate("/linked-accounts?addNew=1")}
            style={({ hovered }: any) => [
              styles.profileItem,
              { backgroundColor: hovered ? theme.hoverBg : "transparent" },
            ]}
          >
            <Ionicons name="person-add-outline" size={16} color={theme.text} />
            <Text style={[styles.profileItemText, { color: theme.text }]}>Add another account</Text>
          </Pressable>

          <Pressable
            onPress={() => navigate("/linked-accounts")}
            style={({ hovered }: any) => [
              styles.profileItem,
              { backgroundColor: hovered ? theme.hoverBg : "transparent" },
            ]}
          >
            <Ionicons name="people-outline" size={16} color={theme.text} />
            <Text style={[styles.profileItemText, { color: theme.text }]}>Manage accounts</Text>
          </Pressable>

          <View style={[styles.profileDivider, { backgroundColor: theme.border }]} />

          <Pressable
            onPress={() => navigate("/(tabs)/me")}
            style={({ hovered }: any) => [
              styles.profileItem,
              { backgroundColor: hovered ? theme.hoverBg : "transparent" },
            ]}
          >
            <Ionicons name="person-circle-outline" size={16} color={theme.text} />
            <Text style={[styles.profileItemText, { color: theme.text }]}>My profile</Text>
          </Pressable>

          <Pressable
            onPress={() => navigate("/profile/edit")}
            style={({ hovered }: any) => [
              styles.profileItem,
              { backgroundColor: hovered ? theme.hoverBg : "transparent" },
            ]}
          >
            <Ionicons name="create-outline" size={16} color={theme.text} />
            <Text style={[styles.profileItemText, { color: theme.text }]}>Edit profile</Text>
          </Pressable>

          <Pressable
            onPress={() => navigate("/settings")}
            style={({ hovered }: any) => [
              styles.profileItem,
              { backgroundColor: hovered ? theme.hoverBg : "transparent" },
            ]}
          >
            <Ionicons name="settings-outline" size={16} color={theme.text} />
            <Text style={[styles.profileItemText, { color: theme.text }]}>Settings</Text>
          </Pressable>

          {/* Theme switcher */}
          <View style={[styles.profileItem, { gap: 8 }]}>
            <Ionicons
              name={themeMode === "dark" ? "moon-outline" : themeMode === "light" ? "sunny-outline" : "contrast-outline"}
              size={16}
              color={theme.text}
            />
            <Text style={[styles.profileItemText, { color: theme.text, flex: 1 }]}>Theme</Text>
            <View style={[styles.themeSegment, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
              {(["light", "system", "dark"] as const).map((mode) => {
                const active = themeMode === mode;
                const icons = { light: "sunny", system: "contrast", dark: "moon" } as const;
                const labels = { light: "Light", system: "Auto", dark: "Dark" } as const;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setThemeMode(mode)}
                    style={[
                      styles.themeSegmentBtn,
                      active && { backgroundColor: theme.accent },
                    ]}
                  >
                    <Ionicons
                      name={active ? icons[mode] : (`${icons[mode]}-outline` as any)}
                      size={13}
                      color={active ? "#fff" : theme.textMuted}
                    />
                    <Text style={[styles.themeSegmentLabel, { color: active ? "#fff" : theme.textMuted }]}>
                      {labels[mode]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

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
  const { session, profile, linkedAccounts, switchAccount } = useAuth();
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
      const { data } = await supabase
        .from("notifications")
        .select("id, type, is_read, created_at, post_id, reference_id, actor_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled || !data) return;
      const seen = new Map<string, any>();
      for (const item of data) {
        const key = [item.type, item.actor_id ?? "", item.post_id ?? "", item.reference_id ?? ""].join("|");
        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, item);
        } else {
          const diff = Math.abs(new Date(item.created_at).getTime() - new Date(existing.created_at).getTime());
          if (diff < 5 * 60 * 1000) {
            if (new Date(item.created_at) > new Date(existing.created_at)) seen.set(key, item);
          } else {
            seen.set(key + "|" + item.created_at, item);
          }
        }
      }
      const unreadCount = Array.from(seen.values()).filter(n => !n.is_read).length;
      setUnread(unreadCount);
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
          <ProfileDropdown
            theme={theme}
            profile={profile}
            currentUserId={userId ?? null}
            linkedAccounts={linkedAccounts}
            onSwitchAccount={async (id) => {
              await switchAccount(id);
            }}
          />
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
  profilePanel: {
    position: "fixed" as any,
    width: 280,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    zIndex: 1000,
    overflow: "hidden",
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  profileHandle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 1,
  },
  profileSection: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  profileAccountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  profileAccountName: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  profileAccountSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11.5,
    marginTop: 1,
  },
  profileItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  profileItemText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  profileDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 8,
  },
  themeSegment: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  themeSegmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  themeSegmentLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
