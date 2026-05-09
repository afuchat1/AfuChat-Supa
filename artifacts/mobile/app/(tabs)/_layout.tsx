import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef } from "react";
import { Dimensions, Image, Platform, StyleSheet, useColorScheme, View } from "react-native";
import { router, usePathname } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
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

// Ordered list of visible tab routes — must match the Tabs.Screen order below
const SWIPE_TAB_ROUTES = [
  "/(tabs)",
  "/(tabs)/discover",
  "/(tabs)/apps",
  "/(tabs)/me",
];

/**
 * Expo Router can return either the full grouped path "/(tabs)/discover"
 * or the short path "/discover" depending on the version/platform.
 * Normalise all variants to the canonical form used in SWIPE_TAB_ROUTES.
 */
function normalizeTabPath(p: string): string {
  if (p === "/" || p === "/(tabs)" || p === "/(tabs)/index") return "/(tabs)";
  if (p === "/discover"  || p === "/(tabs)/discover")  return "/(tabs)/discover";
  if (p === "/apps"      || p === "/(tabs)/apps")      return "/(tabs)/apps";
  if (p === "/me"        || p === "/(tabs)/me")        return "/(tabs)/me";
  return p;
}

// Navigate by index — receives only a plain number from the UI thread.
function navigateToIdx(idx: number) {
  router.navigate(SWIPE_TAB_ROUTES[idx] as any);
}

// How much the screen follows the finger — 0.28 keeps it subtle.
const DRAG_RATIO = 0.28;

function SwipeTabsWrapper({
  children,
  isLoggedIn,
}: {
  children: React.ReactNode;
  isLoggedIn: boolean;
}) {
  const pathname = usePathname();

  // Shared values are safe to both capture in worklets AND update from JS.
  // Never use plain refs in worklet closures — they get serialised and frozen.
  const translateX    = useSharedValue(0);
  const isLoggedInSV  = useSharedValue(isLoggedIn);
  const tabIdxSV      = useSharedValue(SWIPE_TAB_ROUTES.indexOf(normalizeTabPath(pathname)));

  // Keep shared values in sync whenever the JS-side props change.
  // Must be in useEffect — mutating shared values during render causes crashes.
  useEffect(() => { isLoggedInSV.value = isLoggedIn; }, [isLoggedIn]);
  useEffect(() => {
    tabIdxSV.value = SWIPE_TAB_ROUTES.indexOf(normalizeTabPath(pathname));
  }, [pathname]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Gesture created once. Everything it touches is worklet-safe:
  //   translateX, isLoggedInSV, tabIdxSV  →  shared values (UI-thread native)
  //   DRAG_RATIO, SWIPE_TAB_ROUTES        →  module-level constants
  //   navigateToIdx                        →  module-level JS function (runOnJS)
  const swipeGesture = useRef(
    Gesture.Pan()
      .activeOffsetX([-14, 14])
      .failOffsetY([-12, 12])
      // Follow the finger with dampening — physical "push" feel on the UI thread.
      .onUpdate((e) => {
        translateX.value = e.translationX * DRAG_RATIO;
      })
      .onEnd((e) => {
        const isFling = Math.abs(e.velocityX) > 250;
        const isFar   = Math.abs(e.translationX) > 50;

        if ((isFling || isFar) && isLoggedInSV.value) {
          const idx = tabIdxSV.value;
          if (e.translationX < 0 && idx < SWIPE_TAB_ROUTES.length - 1) {
            runOnJS(navigateToIdx)(idx + 1);
          } else if (e.translationX > 0 && idx > 0) {
            runOnJS(navigateToIdx)(idx - 1);
          }
        }

        // Spring back to centre — new content slides in if we navigated,
        // or the screen bounces back if we didn't hit the threshold.
        translateX.value = withSpring(0, {
          damping: 20,
          stiffness: 220,
          mass: 0.8,
          overshootClamping: true,
        });
      })
  ).current;

  // Web: pass through untouched — no swipe, no animation overhead.
  if (Platform.OS === "web") return <>{children}</>;

  return (
    <GestureDetector gesture={swipeGesture}>
      <Animated.View style={[{ flex: 1 }, animatedStyle]}>
        {children}
      </Animated.View>
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
              backgroundColor: isIOS ? "transparent" : colors.surface,
              borderTopWidth: 0,
              elevation: 0,
              height: 52 + (insets.bottom > 0 ? insets.bottom : 8),
              paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
            },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "Inter_500Medium",
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
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
