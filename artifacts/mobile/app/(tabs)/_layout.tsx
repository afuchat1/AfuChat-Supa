import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Dimensions, Image, Platform, StyleSheet, useColorScheme, View } from "react-native";
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
  withTiming,
} from "react-native-reanimated";

import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useIsDesktop } from "@/hooks/useIsDesktop";

let isLiquidGlassAvailable: () => boolean = () => false;
try {
  isLiquidGlassAvailable = require("expo-glass-effect").isLiquidGlassAvailable;
} catch (_) {}

const afuSymbol = require("@/assets/images/afu-symbol.png");
const SCREEN_WIDTH = Dimensions.get("window").width;

// Ordered list of visible tab routes — must match the Tabs.Screen order below
const SWIPE_TAB_ROUTES = [
  "/(tabs)",
  "/(tabs)/discover",
  "/(tabs)/apps",
  "/(tabs)/me",
];

function normalizeTabPath(p: string): string {
  if (p === "/" || p === "/(tabs)" || p === "/(tabs)/index") return "/(tabs)";
  if (p === "/discover"  || p === "/(tabs)/discover")  return "/(tabs)/discover";
  if (p === "/apps"      || p === "/(tabs)/apps")      return "/(tabs)/apps";
  if (p === "/me"        || p === "/(tabs)/me")        return "/(tabs)/me";
  return p;
}

// Called on JS thread — navigate by tab index.
function navigateToIdx(idx: number) {
  router.navigate(SWIPE_TAB_ROUTES[idx] as any);
}

// ─── Swipe wrapper — true pager feel ─────────────────────────────────────────
//
// Design:
//   • Drag 0–20%: content follows finger 1:1 (shows intent).
//   • At 20% threshold: navigate to destination tab IMMEDIATELY so its content
//     is already mounted; position it at the entry edge and let it slide in as
//     the finger continues — user sees real next-tab content while still dragging.
//   • 60 ms opacity fade at the navigation instant masks any layout jump.
//   • On release (committed ≥ 32% or fling): spring new tab to centre.
//   • On release (cancelled): navigate back, bounce new tab off the edge.
//   • Rubber-band at first / last tab (15% damping).

function SwipeTabsWrapper({
  children,
  isLoggedIn,
}: {
  children: React.ReactNode;
  isLoggedIn: boolean;
}) {
  const pathname = usePathname();

  const translateX   = useSharedValue(0);
  const opacity      = useSharedValue(1);
  const isLoggedInSV = useSharedValue(isLoggedIn);
  const tabIdxSV     = useSharedValue(SWIPE_TAB_ROUTES.indexOf(normalizeTabPath(pathname)));

  // Per-gesture state (reset in onBegin).
  const earlyNavDone = useSharedValue(false);
  const earlyNavEdge = useSharedValue(0);   // ±SCREEN_WIDTH
  const originalIdx  = useSharedValue(0);

  useEffect(() => { isLoggedInSV.value = isLoggedIn; }, [isLoggedIn]);
  useEffect(() => {
    tabIdxSV.value = SWIPE_TAB_ROUTES.indexOf(normalizeTabPath(pathname));
  }, [pathname]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const swipeGesture = useRef(
    Gesture.Pan()
      .activeOffsetX([-10, 10])
      .failOffsetY([-14, 14])
      .onBegin(() => {
        "worklet";
        cancelAnimation(translateX);
        cancelAnimation(opacity);
        earlyNavDone.value = false;
        earlyNavEdge.value = 0;
        originalIdx.value  = tabIdxSV.value;
        opacity.value      = 1;
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

        // ── Early navigation at 20% ────────────────────────────────────────
        if (!earlyNavDone.value) {
          const EARLY    = SCREEN_WIDTH * 0.20;
          const canGoNext = e.translationX < -EARLY && !atEnd;
          const canGoPrev = e.translationX > +EARLY && !atStart;

          if (canGoNext || canGoPrev) {
            earlyNavDone.value = true;
            const newIdx = canGoNext ? idx + 1 : idx - 1;
            // New tab enters from this edge (right for goNext, left for goPrev).
            const edge = canGoNext ? SCREEN_WIDTH : -SCREEN_WIDTH;
            earlyNavEdge.value = edge;

            // Switch tab immediately — new content is now active at translateX=0.
            runOnJS(navigateToIdx)(newIdx);

            // Briefly drop opacity to hide the position jump, then fade back in.
            opacity.value = 0;
            translateX.value = edge + e.translationX;
            opacity.value = withTiming(1, { duration: 60 });
            return;
          }
        }

        if (earlyNavDone.value) {
          // New tab slides in from its entry edge as finger continues.
          translateX.value = earlyNavEdge.value + e.translationX;
          return;
        }

        // Rubber-band at first / last tab (no early nav possible).
        if ((atStart && e.translationX > 0) || (atEnd && e.translationX < 0)) {
          translateX.value = e.translationX * 0.15;
        } else {
          translateX.value = e.translationX;
        }
      })
      .onEnd((e) => {
        "worklet";

        opacity.value = 1;

        if (!isLoggedInSV.value || !earlyNavDone.value) {
          // No early nav — spring back.
          translateX.value = withSpring(0, {
            velocity: e.velocityX,
            damping: 22,
            stiffness: 280,
            mass: 0.8,
          });
          return;
        }

        const isFling  = Math.abs(e.velocityX) > 300;
        const isFar    = Math.abs(e.translationX) > SCREEN_WIDTH * 0.32;
        // Direction must still match: goNext→translationX<0, goPrev→translationX>0.
        const dirMatch = earlyNavEdge.value > 0
          ? e.translationX < 0
          : e.translationX > 0;

        if ((isFling || isFar) && dirMatch) {
          // ── Committed: spring new tab to centre ───────────────────────────
          translateX.value = withSpring(0, {
            damping: 26,
            stiffness: 320,
            mass: 0.85,
            overshootClamping: true,
          });
        } else {
          // ── Cancelled: navigate back, bounce new tab off its entry edge ───
          runOnJS(navigateToIdx)(originalIdx.value);
          translateX.value = withSpring(earlyNavEdge.value, {
            velocity: e.velocityX,
            damping: 22,
            stiffness: 280,
            mass: 0.8,
          }, () => {
            // Reset invisibly — original tab is now active at centre.
            translateX.value = 0;
          });
        }
      })
  ).current;

  // Web — no swipe needed.
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

function NativeTabLayout({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <NativeTabs>
      {isLoggedIn && (
        <NativeTabs.Trigger name="index">
          <Icon sf={{ default: "message.fill", selected: "message.fill" }} />
          <Label>AfuChat</Label>
        </NativeTabs.Trigger>
      )}
      {isLoggedIn && (
        <NativeTabs.Trigger name="discover">
          <Icon sf={{ default: "safari", selected: "safari.fill" }} />
          <Label>Discover</Label>
        </NativeTabs.Trigger>
      )}
      {isLoggedIn && (
        <NativeTabs.Trigger name="apps">
          <Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} />
          <Label>Apps</Label>
        </NativeTabs.Trigger>
      )}
      {isLoggedIn && (
        <NativeTabs.Trigger name="me">
          <Icon sf={{ default: "person.circle", selected: "person.circle.fill" }} />
          <Label>Me</Label>
        </NativeTabs.Trigger>
      )}
    </NativeTabs>
  );
}

function ClassicTabLayout({ isLoggedIn }: { isLoggedIn: boolean }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isDesktop } = useIsDesktop();

  const hideTabs = isDesktop || (!isLoggedIn && Platform.OS === "web");

  const PILL_HEIGHT = 62;
  const PILL_RADIUS = 32;
  const PILL_H_MARGIN = 24;
  const bottomOffset = (insets.bottom > 0 ? insets.bottom : 12) + 4;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.tabIconDefault,
        headerShown: false,
        lazy: false,
        ...(({ contentStyle: { backgroundColor: colors.background } }) as any),
        tabBarStyle: hideTabs
          ? { display: "none" }
          : {
              position: "absolute",
              left: PILL_H_MARGIN,
              right: PILL_H_MARGIN,
              bottom: bottomOffset,
              height: PILL_HEIGHT,
              borderRadius: PILL_RADIUS,
              backgroundColor: isIOS ? "transparent" : isDark ? "rgba(30,30,32,0.97)" : "rgba(255,255,255,0.97)",
              borderTopWidth: 0,
              elevation: 16,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: isDark ? 0.45 : 0.13,
              shadowRadius: 24,
              paddingBottom: 0,
              overflow: "hidden",
            },
        tabBarItemStyle: {
          paddingTop: 4,
          paddingBottom: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "Inter_500Medium",
          marginTop: 2,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={isDark ? 70 : 85}
              tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
              style={[StyleSheet.absoluteFill, { borderRadius: PILL_RADIUS, overflow: "hidden" }]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "AfuChat",
          href: isLoggedIn ? undefined : null,
          tabBarIcon: ({ color }) => (
            <Image source={afuSymbol} style={{ width: 26, height: 26, tintColor: color }} resizeMode="contain" />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          href: isLoggedIn ? undefined : null,
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "safari.fill" : "safari"} tintColor={color} size={22} />
            ) : (
              <Ionicons name={focused ? "compass" : "compass-outline"} size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="contacts"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="communities"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="apps"
        options={{
          title: "Apps",
          href: isLoggedIn ? undefined : null,
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "square.grid.2x2.fill" : "square.grid.2x2"} tintColor={color} size={22} />
            ) : (
              <Ionicons name={focused ? "grid" : "grid-outline"} size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "Me",
          href: isLoggedIn ? undefined : null,
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={focused ? "person.circle.fill" : "person.circle"} tintColor={color} size={22} />
            ) : (
              <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { session, profile, loading } = useAuth();
  const isLoggedIn = !!session;
  const prevSessionRef = useRef<Session | null>(null);

  useEffect(() => {
    if (loading) return;
    const hadSession = prevSessionRef.current !== null;
    const hasSession = session !== null;
    if (hadSession && !hasSession) {
      router.replace("/discover");
    }
    prevSessionRef.current = session;
  }, [session, loading]);

  useEffect(() => {
    if (loading) return;
    if (session && profile && !profile.onboarding_completed) {
      router.replace({ pathname: "/onboarding", params: { userId: session.user.id } });
    }
  }, [session, profile, loading]);

  const tabs = isLiquidGlassAvailable()
    ? <NativeTabLayout isLoggedIn={isLoggedIn} />
    : <ClassicTabLayout isLoggedIn={isLoggedIn} />;

  return (
    <SwipeTabsWrapper isLoggedIn={isLoggedIn}>
      {tabs}
    </SwipeTabsWrapper>
  );
}
