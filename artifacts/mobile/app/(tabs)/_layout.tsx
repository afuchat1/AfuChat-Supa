import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Dimensions,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { router, usePathname } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useIsDesktop } from "@/hooks/useIsDesktop";

let isLiquidGlassAvailable: () => boolean = () => false;
try {
  isLiquidGlassAvailable = require("expo-glass-effect").isLiquidGlassAvailable;
} catch (_) {}

const afuSymbol = require("@/assets/images/afu-symbol.png");
const SCREEN_WIDTH = Dimensions.get("window").width;

const PILL_HEIGHT = 64;
const PILL_RADIUS = 34;
const PILL_H_MARGIN = 36;

// Tab definitions — used by both FloatingTabBar and SwipeTabsWrapper
const TABS = [
  { route: "/(tabs)",          label: "AfuChat",  sfOn: "message.fill",        sfOff: "message",         mdOn: "chatbubble",  mdOff: "chatbubble-outline" },
  { route: "/(tabs)/discover", label: "Discover", sfOn: "safari.fill",          sfOff: "safari",          mdOn: "compass",     mdOff: "compass-outline"    },
  { route: "/(tabs)/apps",     label: "Apps",     sfOn: "square.grid.2x2.fill", sfOff: "square.grid.2x2", mdOn: "grid",        mdOff: "grid-outline"       },
  { route: "/(tabs)/me",       label: "Me",       sfOn: "person.circle.fill",   sfOff: "person.circle",   mdOn: "person",      mdOff: "person-outline"     },
] as const;

const SWIPE_TAB_ROUTES = TABS.map((t) => t.route);

function normalizeTabPath(p: string): string {
  if (p === "/" || p === "/(tabs)" || p === "/(tabs)/index") return "/(tabs)";
  if (p === "/discover"  || p === "/(tabs)/discover")  return "/(tabs)/discover";
  if (p === "/apps"      || p === "/(tabs)/apps")      return "/(tabs)/apps";
  if (p === "/me"        || p === "/(tabs)/me")        return "/(tabs)/me";
  return p;
}

function navigateToIdx(idx: number) {
  router.navigate(SWIPE_TAB_ROUTES[idx] as any);
}

// ─── Floating pill tab bar ────────────────────────────────────────────────────
// Rendered OUTSIDE SwipeTabsWrapper so it never moves during page swipes.
function FloatingTabBar() {
  const pathname   = usePathname();
  const colorScheme = useColorScheme();
  const isDark     = colorScheme === "dark";
  const isIOS      = Platform.OS === "ios";
  const insets     = useSafeAreaInsets();
  const { colors } = useTheme();

  const bottomOffset = (insets.bottom > 0 ? insets.bottom : 14) + 6;
  const active       = normalizeTabPath(pathname);

  // ── Animated highlight pill ─────────────────────────────────────────────────
  const TAB_WIDTH    = (SCREEN_WIDTH - PILL_H_MARGIN * 2) / TABS.length;
  const PILL_W       = TAB_WIDTH * 0.78;
  const PILL_H_INNER = PILL_HEIGHT - 20;  // 44px tall capsule

  function pillLeft(idx: number) {
    return idx * TAB_WIDTH + (TAB_WIDTH - PILL_W) / 2;
  }

  const activeIdx   = TABS.findIndex((t) => t.route === active);
  const pillX       = useSharedValue(pillLeft(activeIdx === -1 ? 0 : activeIdx));

  useEffect(() => {
    const idx = TABS.findIndex((t) => t.route === active);
    if (idx !== -1) {
      pillX.value = withSpring(pillLeft(idx), {
        damping: 24,
        stiffness: 340,
        mass: 0.75,
        overshootClamping: false,
      });
    }
  }, [active]);

  const pillAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: PILL_H_MARGIN,
        right: PILL_H_MARGIN,
        bottom: bottomOffset,
        height: PILL_HEIGHT,
        borderRadius: PILL_RADIUS,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: isDark ? 0.5 : 0.14,
        shadowRadius: 28,
        elevation: 20,
      }}
    >
      {/* Background */}
      {isIOS ? (
        <BlurView
          intensity={isDark ? 72 : 88}
          tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDark ? "rgba(26,26,28,0.97)" : "rgba(255,255,255,0.97)" },
          ]}
        />
      )}

      {/* Sliding highlight capsule */}
      <Animated.View
        style={[
          {
            position: "absolute",
            top: (PILL_HEIGHT - PILL_H_INNER) / 2,
            left: 0,
            width: PILL_W,
            height: PILL_H_INNER,
            borderRadius: PILL_H_INNER / 2,
            backgroundColor: colors.accent + "1E",
          },
          pillAnimStyle,
        ]}
      />

      {/* Tab items */}
      <View style={{ flex: 1, flexDirection: "row" }}>
        {TABS.map((tab) => {
          const isFocused = active === tab.route;
          const color     = isFocused ? colors.accent : colors.tabIconDefault;

          return (
            <TouchableOpacity
              key={tab.route}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 3 }}
              onPress={() => router.navigate(tab.route as any)}
              activeOpacity={0.65}
            >
              {tab.route === "/(tabs)" ? (
                <Image
                  source={afuSymbol}
                  style={{ width: 24, height: 24, tintColor: color }}
                  resizeMode="contain"
                />
              ) : isIOS ? (
                <SymbolView name={isFocused ? tab.sfOn : tab.sfOff} tintColor={color} size={22} />
              ) : (
                <Ionicons name={(isFocused ? tab.mdOn : tab.mdOff) as any} size={22} color={color} />
              )}
              <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color, letterSpacing: 0.1 }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Swipe wrapper ────────────────────────────────────────────────────────────
// Early-nav fires at 8% so destination content slides in almost immediately.
// No opacity flash — the new screen is positioned at its entry edge and glides in.
function SwipeTabsWrapper({ children, isLoggedIn }: { children: React.ReactNode; isLoggedIn: boolean }) {
  const pathname = usePathname();

  const translateX   = useSharedValue(0);
  const isLoggedInSV = useSharedValue(isLoggedIn);
  const tabIdxSV     = useSharedValue(SWIPE_TAB_ROUTES.indexOf(normalizeTabPath(pathname)));
  const earlyNavDone = useSharedValue(false);
  const earlyNavEdge = useSharedValue(0);
  const originalIdx  = useSharedValue(0);

  useEffect(() => { isLoggedInSV.value = isLoggedIn; }, [isLoggedIn]);
  useEffect(() => {
    tabIdxSV.value = SWIPE_TAB_ROUTES.indexOf(normalizeTabPath(pathname));
  }, [pathname]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const swipeGesture = useRef(
    Gesture.Pan()
      .activeOffsetX([-10, 10])
      .failOffsetY([-14, 14])
      .onBegin(() => {
        "worklet";
        cancelAnimation(translateX);
        earlyNavDone.value = false;
        earlyNavEdge.value = 0;
        originalIdx.value  = tabIdxSV.value;
      })
      .onUpdate((e) => {
        "worklet";
        const idx     = tabIdxSV.value;
        const atStart = idx === 0;
        const atEnd   = idx === SWIPE_TAB_ROUTES.length - 1;

        if (!isLoggedInSV.value) {
          translateX.value = e.translationX * 0.08;
          return;
        }

        // ── Early navigation at just 8% — content appears almost immediately ──
        if (!earlyNavDone.value) {
          const EARLY    = SCREEN_WIDTH * 0.08;
          const canGoNext = e.translationX < -EARLY && !atEnd;
          const canGoPrev = e.translationX > +EARLY && !atStart;

          if (canGoNext || canGoPrev) {
            earlyNavDone.value = true;
            const newIdx = canGoNext ? idx + 1 : idx - 1;
            // Position the new screen at its natural entry edge — no flash needed
            const edge = canGoNext ? SCREEN_WIDTH : -SCREEN_WIDTH;
            earlyNavEdge.value = edge;
            runOnJS(navigateToIdx)(newIdx);
            // Place new content at entry edge + current finger offset immediately
            translateX.value = edge + e.translationX;
            return;
          }
        }

        if (earlyNavDone.value) {
          translateX.value = earlyNavEdge.value + e.translationX;
          return;
        }

        // Rubber-band at first / last tab
        if ((atStart && e.translationX > 0) || (atEnd && e.translationX < 0)) {
          translateX.value = e.translationX * 0.15;
        } else {
          translateX.value = e.translationX;
        }
      })
      .onEnd((e) => {
        "worklet";

        if (!isLoggedInSV.value || !earlyNavDone.value) {
          translateX.value = withSpring(0, { velocity: e.velocityX, damping: 22, stiffness: 280, mass: 0.8 });
          return;
        }

        const isFling  = Math.abs(e.velocityX) > 300;
        const isFar    = Math.abs(e.translationX) > SCREEN_WIDTH * 0.28;
        const dirMatch = earlyNavEdge.value > 0 ? e.translationX < 0 : e.translationX > 0;

        if ((isFling || isFar) && dirMatch) {
          // Committed — spring to centre
          translateX.value = withSpring(0, { damping: 26, stiffness: 320, mass: 0.85, overshootClamping: true });
        } else {
          // Cancelled — navigate back, bounce off entry edge
          runOnJS(navigateToIdx)(originalIdx.value);
          translateX.value = withSpring(earlyNavEdge.value, { velocity: e.velocityX, damping: 22, stiffness: 280, mass: 0.8 }, () => {
            translateX.value = 0;
          });
        }
      })
  ).current;

  if (Platform.OS === "web") return <>{children}</>;

  return (
    <GestureDetector gesture={swipeGesture}>
      <View style={{ flex: 1, overflow: "hidden" }}>
        <Animated.View style={[{ flex: 1 }, animatedStyle]}>
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

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

// ─── Classic tab layout — built-in tab bar hidden; FloatingTabBar used instead ─
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
  const { session, profile, loading } = useAuth();
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
      <SwipeTabsWrapper isLoggedIn={isLoggedIn}>
        <NativeTabLayout isLoggedIn={isLoggedIn} />
      </SwipeTabsWrapper>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SwipeTabsWrapper isLoggedIn={isLoggedIn}>
        <ClassicTabLayout isLoggedIn={isLoggedIn} />
      </SwipeTabsWrapper>
      {isLoggedIn && !isDesktop && Platform.OS !== "web" && (
        <FloatingTabBar />
      )}
    </View>
  );
}
