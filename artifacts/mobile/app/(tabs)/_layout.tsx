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
  Easing,
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

// ─── Swipe wrapper — full-width native-feel pager ─────────────────────────────
//
// Design:
//   • Drag ratio 1:1 — finger and content move together, no damping.
//   • Rubber-band at first/last tab (15% movement, springs back).
//   • On release above threshold: slide content off screen (200ms ease-out),
//     navigate, then slide in from the opposite edge (spring). Because tabs use
//     lazy:false all screens are pre-rendered so the switch is instant.
//   • On cancel: spring back with the gesture's own velocity — feels physical.

function SwipeTabsWrapper({
  children,
  isLoggedIn,
}: {
  children: React.ReactNode;
  isLoggedIn: boolean;
}) {
  const pathname = usePathname();

  const translateX   = useSharedValue(0);
  const isLoggedInSV = useSharedValue(isLoggedIn);
  const tabIdxSV     = useSharedValue(SWIPE_TAB_ROUTES.indexOf(normalizeTabPath(pathname)));

  // Sync shared values from JS — must be in useEffect, never in render body.
  useEffect(() => { isLoggedInSV.value = isLoggedIn; }, [isLoggedIn]);
  useEffect(() => {
    tabIdxSV.value = SWIPE_TAB_ROUTES.indexOf(normalizeTabPath(pathname));
  }, [pathname]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const swipeGesture = useRef(
    Gesture.Pan()
      // Activate only on horizontal intent, fail on vertical scroll.
      .activeOffsetX([-10, 10])
      .failOffsetY([-14, 14])
      .onUpdate((e) => {
        "worklet";
        const idx = tabIdxSV.value;
        const atStart = idx === 0;
        const atEnd   = idx === SWIPE_TAB_ROUTES.length - 1;

        if (!isLoggedInSV.value) {
          // Not logged in — tiny rubber-band only.
          translateX.value = e.translationX * 0.08;
          return;
        }

        // Rubber-band at edges (15%), full 1:1 in the middle.
        if ((atStart && e.translationX > 0) || (atEnd && e.translationX < 0)) {
          translateX.value = e.translationX * 0.15;
        } else {
          translateX.value = e.translationX;
        }
      })
      .onEnd((e) => {
        "worklet";
        const isFling = Math.abs(e.velocityX) > 300;
        const isFar   = Math.abs(e.translationX) > SCREEN_WIDTH * 0.32;
        const idx     = tabIdxSV.value;

        const goNext = e.translationX < 0 && idx < SWIPE_TAB_ROUTES.length - 1;
        const goPrev = e.translationX > 0 && idx > 0;

        if (isLoggedInSV.value && (isFling || isFar) && (goNext || goPrev)) {
          const newIdx  = goNext ? idx + 1 : idx - 1;
          // Slide current content fully off screen, then navigate + slide in.
          const exitX   = goNext ? -SCREEN_WIDTH : SCREEN_WIDTH;
          const entryX  = goNext ?  SCREEN_WIDTH : -SCREEN_WIDTH;

          translateX.value = withTiming(
            exitX,
            { duration: 200, easing: Easing.out(Easing.cubic) },
            () => {
              // Navigate on JS thread — lazy:false means new tab is already mounted.
              runOnJS(navigateToIdx)(newIdx);
              // Jump to the entry edge, then spring into view.
              translateX.value = entryX;
              translateX.value = withSpring(0, {
                damping: 26,
                stiffness: 320,
                mass: 0.85,
                overshootClamping: true,
              });
            },
          );
        } else {
          // Didn't cross threshold — spring back using gesture velocity (physical).
          translateX.value = withSpring(0, {
            velocity: e.velocityX,
            damping: 22,
            stiffness: 280,
            mass: 0.8,
            overshootClamping: false,
          });
        }
      })
  ).current;

  // Web — no swipe needed.
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
