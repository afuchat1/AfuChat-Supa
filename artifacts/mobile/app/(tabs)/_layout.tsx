import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, usePathname } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { TabSwipeProvider } from "@/context/TabSwipeContext";
import { getLocalConversations } from "@/lib/storage/localConversations";
import { supabase } from "@/lib/supabase";

let isLiquidGlassAvailable: () => boolean = () => false;
try {
  isLiquidGlassAvailable = require("expo-glass-effect").isLiquidGlassAvailable;
} catch (_) {}

const afuSymbol = require("@/assets/images/afu-symbol.png");

const TABS = [
  { route: "/(tabs)",          label: "Chats",    sfOn: "message.fill",        sfOff: "message",         mdOn: "chatbubble",  mdOff: "chatbubble-outline" },
  { route: "/(tabs)/discover", label: "Discover", sfOn: "safari.fill",          sfOff: "safari",          mdOn: "compass",     mdOff: "compass-outline"    },
  { route: "/(tabs)/apps",     label: "Apps",     sfOn: "square.grid.2x2.fill", sfOff: "square.grid.2x2", mdOn: "grid",        mdOff: "grid-outline"       },
  { route: "/(tabs)/me",       label: "Profile",  sfOn: "person.circle.fill",   sfOff: "person.circle",   mdOn: "person",      mdOff: "person-outline"     },
] as const;

function normalizeTabPath(p: string): string {
  if (p === "/" || p === "/(tabs)" || p === "/(tabs)/index") return "/(tabs)";
  if (p === "/discover"  || p === "/(tabs)/discover")  return "/(tabs)/discover";
  if (p === "/apps"      || p === "/(tabs)/apps")      return "/(tabs)/apps";
  if (p === "/me"        || p === "/(tabs)/me")        return "/(tabs)/me";
  return p;
}

// ─── Unread count ──────────────────────────────────────────────────────────────
function useTotalUnread(userId: string | undefined): number {
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async () => {
    const convs = await getLocalConversations();
    setTotal(convs.reduce((s, c) => s + (c.unread_count ?? 0), 0));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("tab-bar-unread")
      .on("postgres_changes", { event: "INSERT",  schema: "public", table: "messages" },         refresh)
      .on("postgres_changes", { event: "UPDATE",  schema: "public", table: "message_receipts" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, refresh]);

  return total;
}

// ─── Floating Telegram-style tab bar ──────────────────────────────────────────
// Pill-shaped floating bar with side margins + shadow.
// Active tab gets its own tinted bubble — no sliding animation.
function CompactTabBar({
  userId,
  avatarUrl,
}: {
  userId: string | undefined;
  avatarUrl: string | null | undefined;
}) {
  const pathname    = usePathname();
  const insets      = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const totalUnread = useTotalUnread(userId);
  const active      = normalizeTabPath(pathname);
  const isIOS       = Platform.OS === "ios";

  const barBg = isDark ? "rgba(28,28,30,0.96)" : "rgba(255,255,255,0.97)";
  const shadow = isDark
    ? { shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 18 }
    : { shadowColor: "#000", shadowOpacity: 0.13, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 12 };
  const bottomPos = (insets.bottom > 0 ? insets.bottom : 10) + 6;

  return (
    <View
      pointerEvents="box-none"
      style={[bar.container, { bottom: bottomPos }]}
    >
      <View style={[bar.pill, shadow, { backgroundColor: barBg }]}>
        {TABS.map((tab) => {
          const focused   = active === tab.route;
          const iconColor = focused ? colors.accent : (isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.38)");
          const isChats   = tab.route === "/(tabs)";
          const isProfile = tab.route === "/(tabs)/me";

          return (
            <TouchableOpacity
              key={tab.route}
              style={bar.item}
              onPress={() => router.navigate(tab.route as any)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: focused }}
            >
              {/* Active-tab tinted bubble — sits behind icon+label */}
              {focused && (
                <View
                  style={[
                    bar.activeBubble,
                    { backgroundColor: colors.accent + "1C" },
                  ]}
                />
              )}

              {/* Icon */}
              <View style={bar.iconWrap}>
                {isProfile && avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={[
                      bar.avatar,
                      focused
                        ? { borderColor: colors.accent, borderWidth: 2 }
                        : { borderColor: "transparent", borderWidth: 2 },
                    ]}
                  />
                ) : isChats ? (
                  <Image
                    source={afuSymbol}
                    style={{ width: 23, height: 23 }}
                    resizeMode="contain"
                    tintColor={iconColor}
                  />
                ) : isIOS ? (
                  <SymbolView
                    name={focused ? tab.sfOn : tab.sfOff}
                    tintColor={iconColor}
                    size={23}
                  />
                ) : (
                  <Ionicons
                    name={(focused ? tab.mdOn : tab.mdOff) as any}
                    size={23}
                    color={iconColor}
                  />
                )}

                {/* Unread badge */}
                {isChats && totalUnread > 0 && (
                  <View style={[bar.badge, { backgroundColor: colors.accent }]}>
                    <Text style={bar.badgeText} numberOfLines={1}>
                      {totalUnread > 99 ? "99+" : String(totalUnread)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Label */}
              <Text
                style={[bar.label, { color: iconColor }]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const bar = StyleSheet.create({
  // Outer wrapper — absorbs pointer events only on the pill itself
  container: {
    position: "absolute",
    left: 14,
    right: 14,
    alignItems: "stretch",
    zIndex: 100,
  },
  // The floating pill
  pill: {
    flexDirection: "row",
    borderRadius: 26,
    paddingVertical: 6,
    paddingHorizontal: 6,
    overflow: "visible",
  },
  // Each tab button
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    gap: 2,
    zIndex: 1,
  },
  // Per-tab active bubble (replaces the sliding pill)
  activeBubble: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 4,
    right: 4,
    borderRadius: 18,
  },
  iconWrap: {
    position: "relative",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -7,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    lineHeight: 13,
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.1,
    textAlign: "center",
  },
});

// ─── Native tab layout (iOS Liquid Glass only) ────────────────────────────────
function NativeTabLayout({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <NativeTabs>
      {isLoggedIn && (<NativeTabs.Trigger name="index"><Icon sf={{ default: "message.fill", selected: "message.fill" }} /><Label>Chats</Label></NativeTabs.Trigger>)}
      {isLoggedIn && (<NativeTabs.Trigger name="discover"><Icon sf={{ default: "safari", selected: "safari.fill" }} /><Label>Discover</Label></NativeTabs.Trigger>)}
      {isLoggedIn && (<NativeTabs.Trigger name="apps"><Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} /><Label>Apps</Label></NativeTabs.Trigger>)}
      {isLoggedIn && (<NativeTabs.Trigger name="me"><Icon sf={{ default: "person.circle", selected: "person.circle.fill" }} /><Label>Profile</Label></NativeTabs.Trigger>)}
    </NativeTabs>
  );
}

// ─── Classic tab layout ───────────────────────────────────────────────────────
function ClassicTabLayout({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: false,
        ...(({ contentStyle: { backgroundColor: colors.background } }) as any),
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index"       options={{ href: isLoggedIn ? undefined : null }} />
      <Tabs.Screen name="discover"    options={{ href: isLoggedIn ? undefined : null }} />
      <Tabs.Screen name="search"      options={{ href: null }} />
      <Tabs.Screen name="contacts"    options={{ href: null }} />
      <Tabs.Screen name="communities" options={{ href: null }} />
      <Tabs.Screen name="apps"        options={{ href: isLoggedIn ? undefined : null }} />
      <Tabs.Screen name="me"          options={{ href: isLoggedIn ? undefined : null }} />
    </Tabs>
  );
}

// ─── Root layout ──────────────────────────────────────────────────────────────
export default function TabLayout() {
  const { session, profile, loading, user } = useAuth();
  const { isDesktop } = useIsDesktop();
  const isLoggedIn     = !!session;
  const prevSessionRef = useRef<Session | null>(null);

  useEffect(() => {
    if (loading) return;
    const hadSession = prevSessionRef.current !== null;
    const hasSession = session !== null;
    if (hadSession && !hasSession) router.replace("/discover");
    prevSessionRef.current = session;
  }, [session, loading]);

  useEffect(() => {
    if (loading) return;
    if (session && profile && !profile.onboarding_completed) {
      router.replace({ pathname: "/onboarding", params: { userId: session.user.id } });
    }
  }, [session, profile, loading]);

  if (isLiquidGlassAvailable()) {
    return (
      <TabSwipeProvider>
        <NativeTabLayout isLoggedIn={isLoggedIn} />
      </TabSwipeProvider>
    );
  }

  return (
    <TabSwipeProvider>
      <View style={{ flex: 1 }}>
        <ClassicTabLayout isLoggedIn={isLoggedIn} />
        {isLoggedIn && !isDesktop && (
          <CompactTabBar
            userId={user?.id}
            avatarUrl={profile?.avatar_url}
          />
        )}
      </View>
    </TabSwipeProvider>
  );
}
