import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
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
import * as Haptics from "@/lib/haptics";
import { getLocalConversations } from "@/lib/storage/localConversations";
import { supabase } from "@/lib/supabase";

let isLiquidGlassAvailable: () => boolean = () => false;
try {
  isLiquidGlassAvailable = require("expo-glass-effect").isLiquidGlassAvailable;
} catch (_) {}

const afuSymbol = require("@/assets/images/afu-symbol.png");

const TABS = [
  { route: "/(tabs)",          label: "AfuChat",  sfOn: "message.fill",        sfOff: "message",         mdOn: "chatbubble",  mdOff: "chatbubble-outline" },
  { route: "/(tabs)/discover", label: "Discover", sfOn: "safari.fill",          sfOff: "safari",          mdOn: "compass",     mdOff: "compass-outline"    },
  { route: "/(tabs)/apps",     label: "Apps",     sfOn: "square.grid.2x2.fill", sfOff: "square.grid.2x2", mdOn: "grid",        mdOff: "grid-outline"       },
  { route: "/(tabs)/me",       label: "Me",       sfOn: "person.circle.fill",   sfOff: "person.circle",   mdOn: "person",      mdOff: "person-outline"     },
] as const;

// All animations in the tab bar use JS driver (useNativeDriver: false).
// This avoids the native/JS driver conflict that arises when React Compiler
// rewrites hook dependency tracking and native-claimed nodes get re-animated.
const ND = false as const;

function normalizeTabPath(p: string): string {
  if (p === "/" || p === "/(tabs)" || p === "/(tabs)/index") return "/(tabs)";
  if (p === "/discover"  || p === "/(tabs)/discover")  return "/(tabs)/discover";
  if (p === "/apps"      || p === "/(tabs)/apps")      return "/(tabs)/apps";
  if (p === "/me"        || p === "/(tabs)/me")        return "/(tabs)/me";
  return p;
}

// ─── Hook: total unread chat count ────────────────────────────────────────────
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "message_receipts" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, refresh]);

  return total;
}

// ─── Single tab item — NO own pill background; parent renders the sliding pill ──
function TabItem({
  tab,
  isFocused,
  colors,
  unreadDot,
  onLayout,
}: {
  tab: (typeof TABS)[number];
  isFocused: boolean;
  colors: any;
  unreadDot?: boolean;
  onLayout?: (e: any) => void;
}) {
  const isIOS = Platform.OS === "ios";

  const scaleAnim    = useRef(new Animated.Value(isFocused ? 1.12 : 1)).current;
  const labelOpacity = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const labelMaxW    = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const dotScale     = useRef(new Animated.Value(unreadDot ? 1 : 0)).current;

  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;

  useEffect(() => {
    Animated.spring(scaleAnim,  { toValue: isFocused ? 1.12 : 1, useNativeDriver: ND, speed: 20, bounciness: 6 }).start();
    Animated.timing(labelOpacity, { toValue: isFocused ? 1 : 0, duration: isFocused ? 200 : 100, useNativeDriver: ND }).start();
    Animated.spring(labelMaxW,  { toValue: isFocused ? 1 : 0, useNativeDriver: ND, speed: 18, bounciness: 2 }).start();
  }, [isFocused]);

  useEffect(() => {
    Animated.spring(dotScale, { toValue: unreadDot ? 1 : 0, useNativeDriver: ND, speed: 22, bounciness: 10 }).start();
  }, [unreadDot]);

  const triggerBounce = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle?.Medium);
    const rest = isFocusedRef.current ? 1.12 : 1;
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.68, useNativeDriver: ND, speed: 80, bounciness: 0 }),
      Animated.spring(scaleAnim, { toValue: 1.28, useNativeDriver: ND, speed: 30, bounciness: 8 }),
      Animated.spring(scaleAnim, { toValue: rest,  useNativeDriver: ND, speed: 22, bounciness: 4 }),
    ]).start();
  }, [scaleAnim]);

  const iconColor = isFocused ? colors.accent : colors.tabIconDefault;
  const maxW      = labelMaxW.interpolate({ inputRange: [0, 1], outputRange: [0, 68] });

  return (
    <TouchableOpacity
      style={tabItemStyles.wrapper}
      onPress={() => router.navigate(tab.route as any)}
      onLongPress={triggerBounce}
      onLayout={onLayout}
      delayLongPress={180}
      activeOpacity={0.85}
    >
      {/* Content only — background comes from the parent's sliding pill */}
      <View style={tabItemStyles.content}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <View style={{ position: "relative" }}>
            {tab.route === "/(tabs)" ? (
              <Image source={afuSymbol} style={{ width: 22, height: 22, tintColor: iconColor }} resizeMode="contain" />
            ) : isIOS ? (
              <SymbolView name={isFocused ? tab.sfOn : tab.sfOff} tintColor={iconColor} size={22} />
            ) : (
              <Ionicons name={(isFocused ? tab.mdOn : tab.mdOff) as any} size={22} color={iconColor} />
            )}
            {unreadDot && (
              <Animated.View style={[tabItemStyles.dot, { backgroundColor: colors.accent, transform: [{ scale: dotScale }] }]} />
            )}
          </View>
        </Animated.View>

        <Animated.View style={{ overflow: "hidden", maxWidth: maxW, opacity: labelOpacity }}>
          <Text style={[tabItemStyles.label, { color: colors.accent }]} numberOfLines={1}>
            {tab.label}
          </Text>
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

const tabItemStyles = StyleSheet.create({
  wrapper:  { flex: 1, alignItems: "center", justifyContent: "center" },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 10,
    gap: 6,
  },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 0.1, marginLeft: 2 },
  dot: {
    position: "absolute",
    top: -2,
    right: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
});

// ─── Floating tab bar with single sliding highlight pill ──────────────────────
const BAR_PAD_H = 8; // must match floatStyles.bar paddingHorizontal

function FloatingTabBar({ userId }: { userId: string | undefined }) {
  const pathname    = usePathname();
  const insets      = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const totalUnread = useTotalUnread(userId);
  const active      = normalizeTabPath(pathname);
  const activeIdx   = TABS.findIndex((t) => t.route === active);
  const barBg       = isDark ? "rgba(30,30,32,0.92)" : "rgba(255,255,255,0.94)";

  // Each tab's measured { x, width } in the bar's coordinate space
  const tabLayouts  = useRef<Array<{ x: number; w: number } | null>>(TABS.map(() => null));
  const readyCount  = useRef(0);
  const initialized = useRef(false);

  // Single shared pill position — no jump, only springs
  const slideX = useRef(new Animated.Value(-999)).current;
  const slideW = useRef(new Animated.Value(0)).current;

  // Called when a tab's TouchableOpacity reports its layout
  const handleTabLayout = useCallback((idx: number, e: any) => {
    const { x, width } = e.nativeEvent.layout;
    if (tabLayouts.current[idx]?.x === x && tabLayouts.current[idx]?.w === width) return;
    tabLayouts.current[idx] = { x, w: width };
    readyCount.current = tabLayouts.current.filter(Boolean).length;

    // Once all tabs are measured, set the initial pill position instantly (no spring)
    if (!initialized.current && readyCount.current >= TABS.length) {
      initialized.current = true;
      const layout = tabLayouts.current[activeIdx];
      if (layout) {
        slideX.setValue(layout.x);
        slideW.setValue(layout.w);
      }
    }
  }, [activeIdx]);

  // Track previous active index so we only spring on actual tab changes
  const prevIdxRef = useRef(activeIdx);
  useEffect(() => {
    if (prevIdxRef.current === activeIdx) return;
    prevIdxRef.current = activeIdx;

    const layout = tabLayouts.current[activeIdx];
    if (!layout) return;

    Animated.parallel([
      Animated.spring(slideX, { toValue: layout.x, useNativeDriver: ND, speed: 16, bounciness: 5 }),
      Animated.spring(slideW, { toValue: layout.w, useNativeDriver: ND, speed: 16, bounciness: 5 }),
    ]).start();
  }, [activeIdx]);

  return (
    <View
      style={[floatStyles.container, { bottom: (insets.bottom > 0 ? insets.bottom : 12) + 4 }]}
      pointerEvents="box-none"
    >
      <View
        style={[
          floatStyles.bar,
          { backgroundColor: barBg, borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)" },
        ]}
      >
        {/* ── Single pill that slides between tabs — rendered BEHIND everything ── */}
        <Animated.View
          pointerEvents="none"
          style={[
            floatStyles.slidingPill,
            {
              backgroundColor: colors.accent + "22",
              width: slideW,
              transform: [{ translateX: slideX }],
            },
          ]}
        />

        {TABS.map((tab, idx) => (
          <TabItem
            key={tab.route}
            tab={tab}
            isFocused={active === tab.route}
            colors={colors}
            unreadDot={tab.route === "/(tabs)" && totalUnread > 0}
            onLayout={(e) => handleTabLayout(idx, e)}
          />
        ))}
      </View>
    </View>
  );
}

const floatStyles = StyleSheet.create({
  container: { position: "absolute", left: 16, right: 16, alignItems: "stretch", zIndex: 100 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: BAR_PAD_H,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 16,
  },
  slidingPill: {
    position: "absolute",
    top: 6,
    bottom: 6,
    left: 0,
    borderRadius: 24,
    // zIndex: -1 would hide it behind siblings, but RN renders earlier children behind later ones,
    // so rendering the pill first (before the TabItems) keeps it visually underneath.
  },
});

// ─── Native tab layout (iOS Liquid Glass only) ────────────────────────────────
function NativeTabLayout({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <NativeTabs>
      {isLoggedIn && (<NativeTabs.Trigger name="index"><Icon sf={{ default: "message.fill", selected: "message.fill" }} /><Label>AfuChat</Label></NativeTabs.Trigger>)}
      {isLoggedIn && (<NativeTabs.Trigger name="discover"><Icon sf={{ default: "safari", selected: "safari.fill" }} /><Label>Discover</Label></NativeTabs.Trigger>)}
      {isLoggedIn && (<NativeTabs.Trigger name="apps"><Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} /><Label>Apps</Label></NativeTabs.Trigger>)}
      {isLoggedIn && (<NativeTabs.Trigger name="me"><Icon sf={{ default: "person.circle", selected: "person.circle.fill" }} /><Label>Me</Label></NativeTabs.Trigger>)}
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
          <FloatingTabBar userId={user?.id} />
        )}
      </View>
    </TabSwipeProvider>
  );
}
