import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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
  { route: "/(tabs)/search",   label: "Search",   sfOn: "magnifyingglass.circle.fill", sfOff: "magnifyingglass.circle", mdOn: "search", mdOff: "search-outline" },
  { route: "/(tabs)/apps",     label: "Apps",     sfOn: "square.grid.2x2.fill", sfOff: "square.grid.2x2", mdOn: "grid",        mdOff: "grid-outline"       },
  { route: "/(tabs)/me",       label: "Profile",  sfOn: "person.circle.fill",   sfOff: "person.circle",   mdOn: "person",      mdOff: "person-outline"     },
] as const;

function normalizeTabPath(p: string): string {
  if (p === "/" || p === "/(tabs)" || p === "/(tabs)/index") return "/(tabs)";
  if (p === "/discover"  || p === "/(tabs)/discover")  return "/(tabs)/discover";
  if (p === "/search"    || p === "/(tabs)/search")    return "/(tabs)/search";
  if (p === "/apps"      || p === "/(tabs)/apps")      return "/(tabs)/apps";
  if (p === "/me"        || p === "/(tabs)/me")        return "/(tabs)/me";
  return p;
}

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

function CompactTabBar({
  userId,
  avatarUrl,
}: {
  userId: string | undefined;
  avatarUrl: string | null | undefined;
}) {
  const pathname        = usePathname();
  const insets          = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const totalUnread     = useTotalUnread(userId);
  const active          = normalizeTabPath(pathname);
  const isIOS           = Platform.OS === "ios";
  const isAndroid       = Platform.OS === "android";

  const barBg = isDark ? "rgba(28,28,30,0.97)" : "rgba(255,255,255,0.97)";

  // Use boxShadow on web (shadow* props are deprecated there); native shadow on iOS/Android.
  const shadow = Platform.select({
    web: {
      boxShadow: isDark
        ? "0 8px 24px rgba(0,0,0,0.50)"
        : "0 4px 18px rgba(0,0,0,0.14)",
    },
    default: isDark
      ? {
          shadowColor: "#000",
          shadowOpacity: 0.50,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
          elevation: 20,
        }
      : {
          shadowColor: "#000",
          shadowOpacity: 0.14,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 4 },
          elevation: 14,
        },
  });

  // Edge-to-edge on Android can set insets.bottom to 0 on gesture-nav devices.
  // Always guarantee at least 8dp above the gesture handle bar.
  const bottomPos = Math.max(insets.bottom, isAndroid ? 8 : 10) + 6;

  // Brand-tinted ripple — subtle so it doesn't fight with the focused highlight.
  const ripple = { color: colors.accent + "28", borderless: false } as const;

  function handleTabPress(route: typeof TABS[number]["route"]) {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(
        isAndroid
          ? Haptics.ImpactFeedbackStyle.Light
          : Haptics.ImpactFeedbackStyle.Rigid,
      ).catch(() => {});
    }
    router.navigate(route as any);
  }

  return (
    <View
      style={[bar.container, { bottom: bottomPos, pointerEvents: "box-none" }]}
    >
      <View style={[bar.pill, shadow, { backgroundColor: barBg }]}>
        {TABS.map((tab) => {
          const focused   = active === tab.route;
          const iconColor = focused
            ? colors.accent
            : isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.38)";
          const isChats   = tab.route === "/(tabs)";
          const isProfile = tab.route === "/(tabs)/me";

          return (
            <View key={tab.route} style={bar.item}>
              {/*
               * Two-layer pill structure for Android:
               *   1. pillClip  — borderRadius + overflow:hidden clips the ripple
               *   2. Pressable — receives android_ripple and the touch event
               * The focused highlight colour lives on pillClip so it renders
               * underneath the ripple overlay (correct stacking order).
               */}
              <View
                style={[
                  bar.pillClip,
                  focused && { backgroundColor: colors.accent + "1C" },
                ]}
              >
                <Pressable
                  android_ripple={ripple}
                  style={({ pressed }) => [
                    bar.pressable,
                    focused
                      ? { paddingHorizontal: 12, paddingVertical: 6 }
                      : { paddingHorizontal: 8, paddingVertical: 6 },
                    // iOS uses opacity press; Android uses the ripple overlay.
                    !isAndroid && pressed ? { opacity: 0.72 } : null,
                  ]}
                  onPress={() => handleTabPress(tab.route)}
                  accessibilityRole="button"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: focused }}
                  // Expand touch target to 48 dp minimum (Material guideline).
                  hitSlop={
                    isAndroid
                      ? { top: 8, bottom: 8, left: 4, right: 4 }
                      : undefined
                  }
                >
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
                        style={{ width: 22, height: 22 }}
                        resizeMode="contain"
                        tintColor={iconColor}
                      />
                    ) : isIOS ? (
                      <SymbolView
                        name={focused ? tab.sfOn : tab.sfOff}
                        tintColor={iconColor}
                        size={22}
                      />
                    ) : (
                      <Ionicons
                        name={(focused ? tab.mdOn : tab.mdOff) as any}
                        size={22}
                        color={iconColor}
                      />
                    )}
                  </View>

                  <Text
                    style={[bar.label, { color: iconColor }]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              </View>

              {/* Unread badge — floats above the pill */}
              {isChats && totalUnread > 0 && (
                <View
                  style={[
                    bar.badge,
                    { backgroundColor: colors.accent, borderColor: barBg },
                  ]}
                >
                  <Text style={bar.badgeText} numberOfLines={1}>
                    {totalUnread > 99 ? "99+" : String(totalUnread)}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const bar = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  pill: {
    flexDirection: "row",
    borderRadius: 36,
    paddingVertical: 7,
    paddingHorizontal: 8,
    overflow: "visible",
    width: "92%",
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Must have overflow:"hidden" to clip the Android ripple to the pill shape.
  pillClip: {
    borderRadius: 999,
    overflow: "hidden",
  },
  // Inner Pressable — padding here drives the visible pill size.
  pressable: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    gap: 2,
  },
  iconWrap: {
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
    top: 1,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    zIndex: 10,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    lineHeight: 13,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 0.1,
    textAlign: "center",
  },
});

function NativeTabLayout({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <NativeTabs>
      {isLoggedIn && (<NativeTabs.Trigger name="index"><Icon sf={{ default: "message.fill", selected: "message.fill" }} /><Label>Chats</Label></NativeTabs.Trigger>)}
      {isLoggedIn && (<NativeTabs.Trigger name="discover"><Icon sf={{ default: "safari", selected: "safari.fill" }} /><Label>Discover</Label></NativeTabs.Trigger>)}
      {isLoggedIn && (<NativeTabs.Trigger name="search"><Icon sf={{ default: "magnifyingglass.circle", selected: "magnifyingglass.circle.fill" }} /><Label>Search</Label></NativeTabs.Trigger>)}
      {isLoggedIn && (<NativeTabs.Trigger name="apps"><Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} /><Label>Apps</Label></NativeTabs.Trigger>)}
      {isLoggedIn && (<NativeTabs.Trigger name="me"><Icon sf={{ default: "person.circle", selected: "person.circle.fill" }} /><Label>Profile</Label></NativeTabs.Trigger>)}
    </NativeTabs>
  );
}

function ClassicTabLayout({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: false,
        freezeOnBlur: true,
        ...(({ contentStyle: { backgroundColor: colors.background } }) as any),
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index"       options={{ href: isLoggedIn ? undefined : null }} />
      <Tabs.Screen name="discover"    options={{ href: isLoggedIn ? undefined : null }} />
      <Tabs.Screen name="search"      options={{ href: isLoggedIn ? undefined : null }} />
      <Tabs.Screen name="contacts"    options={{ href: null }} />
      <Tabs.Screen name="communities" options={{ href: null }} />
      <Tabs.Screen name="apps"        options={{ href: isLoggedIn ? undefined : null }} />
      <Tabs.Screen name="me"          options={{ href: isLoggedIn ? undefined : null }} />
    </Tabs>
  );
}

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
