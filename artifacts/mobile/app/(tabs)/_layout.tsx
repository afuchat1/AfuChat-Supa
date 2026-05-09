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
import { TabSwipeContext, TabSwipeProvider } from "@/context/TabSwipeContext";

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

  // ── Animated highlight — squircle-style continuous-curve rounded rect ───────
  const TAB_WIDTH     = (SCREEN_WIDTH - PILL_H_MARGIN * 2) / TABS.length;
  const H_PADDING     = 4;   // space on each side of the highlight within the tab slot
  const HIGHLIGHT_W   = TAB_WIDTH - H_PADDING * 2;
  const HIGHLIGHT_H   = PILL_HEIGHT - 16;  // 48px — tall enough to enclose icon + label
  const HIGHLIGHT_R   = HIGHLIGHT_H / 2;  // true oval/capsule — fully rounded short ends

  function pillLeft(idx: number) {
    return idx * TAB_WIDTH + H_PADDING;
  }

  const activeIdx = TABS.findIndex((t) => t.route === active);
  const pillX     = useSharedValue(pillLeft(activeIdx === -1 ? 0 : activeIdx));

  useEffect(() => {
    const idx = TABS.findIndex((t) => t.route === active);
    if (idx !== -1) {
      pillX.value = withSpring(pillLeft(idx), {
        damping: 26,
        stiffness: 360,
        mass: 0.7,
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

      {/* Sliding highlight — rounded rectangle behind icon + label */}
      <Animated.View
        style={[
          {
            position: "absolute",
            top: (PILL_HEIGHT - HIGHLIGHT_H) / 2,
            left: 0,
            width: HIGHLIGHT_W,
            height: HIGHLIGHT_H,
            borderRadius: HIGHLIGHT_R,
            backgroundColor: isDark
              ? colors.accent + "2A"
              : colors.accent + "20",
            borderWidth: 1,
            borderColor: colors.accent + "30",
          },
          pillAnimStyle,
        ]}
      />

      {/* Tab items — each slot is exactly TAB_WIDTH so content aligns over highlight */}
      <View style={{ flex: 1, flexDirection: "row" }}>
        {TABS.map((tab) => {
          const isFocused = active === tab.route;
          const color     = isFocused ? colors.accent : colors.tabIconDefault;

          return (
            <TouchableOpacity
              key={tab.route}
              style={{
                width: TAB_WIDTH,
                height: PILL_HEIGHT,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
              onPress={() => router.navigate(tab.route as any)}
              activeOpacity={0.7}
            >
              {tab.route === "/(tabs)" ? (
                <Image
                  source={afuSymbol}
                  style={{ width: 22, height: 22, tintColor: color }}
                  resizeMode="contain"
                />
              ) : isIOS ? (
                <SymbolView name={isFocused ? tab.sfOn : tab.sfOff} tintColor={color} size={21} />
              ) : (
                <Ionicons name={(isFocused ? tab.mdOn : tab.mdOff) as any} size={21} color={color} />
              )}
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: isFocused ? "Inter_600SemiBold" : "Inter_400Regular",
                  color,
                  letterSpacing: 0.1,
                }}
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

// ─── Swipe wrapper ────────────────────────────────────────────────────────────
// Early-nav fires at 8% so destination content slides in almost immediately.
// No opacity flash — the new screen is positioned at its entry edge and glides in.
function SwipeTabsWrapper({ children, isLoggedIn }: { children: React.ReactNode; isLoggedIn: boolean }) {
  const pathname = usePathname();
  const { horizontalScrollActive } = React.useContext(TabSwipeContext);

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

        // Non-tab screen (search, contacts, etc.) — completely block swipe
        if (tabIdxSV.value === -1) {
          translateX.value = 0;
          return;
        }

        // A child horizontal scroll is currently active — don't intercept
        if (horizontalScrollActive.value) {
          return;
        }

        if (!isLoggedInSV.value) {
          translateX.value = e.translationX * 0.08;
          return;
        }

        // After early nav we keep tracking the finger without jumping —
        // the new screen is already mounted (lazy:false) at translateX, so it
        // slides in seamlessly with no blank-flash.
        if (earlyNavDone.value) {
          translateX.value = e.translationX;
          return;
        }

        const idx     = tabIdxSV.value;
        const atStart = idx === 0;
        const atEnd   = idx === SWIPE_TAB_ROUTES.length - 1;

        // Rubber-band at first / last tab
        if ((atStart && e.translationX > 0) || (atEnd && e.translationX < 0)) {
          translateX.value = e.translationX * 0.15;
          return;
        }

        translateX.value = e.translationX;

        // ── Early navigation at 8% — fire-and-forget, no position jump ────────
        const EARLY     = SCREEN_WIDTH * 0.08;
        const canGoNext = e.translationX < -EARLY && !atEnd;
        const canGoPrev = e.translationX > +EARLY && !atStart;

        if (canGoNext || canGoPrev) {
          earlyNavDone.value  = true;
          earlyNavEdge.value  = canGoNext ? 1 : -1;   // +1 = went next, -1 = went prev
          runOnJS(navigateToIdx)(canGoNext ? idx + 1 : idx - 1);
        }
      })
      .onEnd((e) => {
        "worklet";

        // Non-tab screen — always spring back to zero
        if (tabIdxSV.value === -1) {
          translateX.value = withSpring(0, { velocity: 0, damping: 22, stiffness: 280, mass: 0.8 });
          return;
        }

        if (!isLoggedInSV.value || !earlyNavDone.value) {
          // No nav happened — bounce back
          translateX.value = withSpring(0, { velocity: e.velocityX, damping: 22, stiffness: 280, mass: 0.8 });
          return;
        }

        const isFling  = Math.abs(e.velocityX) > 300;
        const isFar    = Math.abs(e.translationX) > SCREEN_WIDTH * 0.28;
        // dirMatch: finger is still moving in the direction the nav went
        const dirMatch = earlyNavEdge.value > 0 ? e.translationX < 0 : e.translationX > 0;

        if ((isFling || isFar) && dirMatch) {
          // Committed — new content is already on-screen, spring it to centre
          translateX.value = withSpring(0, { velocity: e.velocityX, damping: 26, stiffness: 320, mass: 0.85, overshootClamping: true });
        } else {
          // Cancelled — go back and spring to rest (0)
          runOnJS(navigateToIdx)(originalIdx.value);
          translateX.value = withSpring(0, { velocity: e.velocityX, damping: 22, stiffness: 280, mass: 0.8 });
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
      <TabSwipeProvider>
        <SwipeTabsWrapper isLoggedIn={isLoggedIn}>
          <NativeTabLayout isLoggedIn={isLoggedIn} />
        </SwipeTabsWrapper>
      </TabSwipeProvider>
    );
  }

  return (
    <TabSwipeProvider>
      <View style={{ flex: 1 }}>
        <SwipeTabsWrapper isLoggedIn={isLoggedIn}>
          <ClassicTabLayout isLoggedIn={isLoggedIn} />
        </SwipeTabsWrapper>
        {isLoggedIn && !isDesktop && Platform.OS !== "web" && (
          <FloatingTabBar />
        )}
      </View>
    </TabSwipeProvider>
  );
}
