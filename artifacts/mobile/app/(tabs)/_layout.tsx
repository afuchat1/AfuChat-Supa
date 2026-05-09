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

const PILL_HEIGHT = 64;
const PILL_RADIUS = 34;
const PILL_H_MARGIN = 36;

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

// ─── Floating pill tab bar — rendered OUTSIDE the swipe animation ─────────────
function FloatingTabBar() {
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const bottomOffset = (insets.bottom > 0 ? insets.bottom : 14) + 6;
  const active = normalizeTabPath(pathname);

  const TABS = [
    { route: "/(tabs)",          label: "AfuChat",  sfOn: "message.fill",         sfOff: "message",         mdOn: "chatbubble",       mdOff: "chatbubble-outline" },
    { route: "/(tabs)/discover", label: "Discover", sfOn: "safari.fill",           sfOff: "safari",           mdOn: "compass",          mdOff: "compass-outline" },
    { route: "/(tabs)/apps",     label: "Apps",     sfOn: "square.grid.2x2.fill",  sfOff: "square.grid.2x2",  mdOn: "grid",             mdOff: "grid-outline" },
    { route: "/(tabs)/me",       label: "Me",       sfOn: "person.circle.fill",    sfOff: "person.circle",    mdOn: "person",           mdOff: "person-outline" },
  ];

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

      <View style={{ flex: 1, flexDirection: "row" }}>
        {TABS.map((tab) => {
          const isFocused = active === tab.route;
          const color = isFocused ? colors.accent : colors.tabIconDefault;

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
                <SymbolView
                  name={isFocused ? tab.sfOn : tab.sfOff}
                  tintColor={color}
                  size={22}
                />
              ) : (
                <Ionicons
                  name={(isFocused ? tab.mdOn : tab.mdOff) as any}
                  size={22}
                  color={color}
                />
              )}
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: "Inter_500Medium",
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

// ─── Swipe wrapper — true pager feel ─────────────────────────────────────────
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

  const earlyNavDone = useSharedValue(false);
  const earlyNavEdge = useSharedValue(0);
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

        if (!earlyNavDone.value) {
          const EARLY    = SCREEN_WIDTH * 0.20;
          const canGoNext = e.translationX < -EARLY && !atEnd;
          const canGoPrev = e.translationX > +EARLY && !atStart;

          if (canGoNext || canGoPrev) {
            earlyNavDone.value = true;
            const newIdx = canGoNext ? idx + 1 : idx - 1;
            const edge = canGoNext ? SCREEN_WIDTH : -SCREEN_WIDTH;
            earlyNavEdge.value = edge;
            runOnJS(navigateToIdx)(newIdx);
            opacity.value = 0;
            translateX.value = edge + e.translationX;
            opacity.value = withTiming(1, { duration: 60 });
            return;
          }
        }

        if (earlyNavDone.value) {
          translateX.value = earlyNavEdge.value + e.translationX;
          return;
        }

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
        const dirMatch = earlyNavEdge.value > 0
          ? e.translationX < 0
          : e.translationX > 0;

        if ((isFling || isFar) && dirMatch) {
          translateX.value = withSpring(0, {
            damping: 26,
            stiffness: 320,
            mass: 0.85,
            overshootClamping: true,
          });
        } else {
          runOnJS(navigateToIdx)(originalIdx.value);
          translateX.value = withSpring(earlyNavEdge.value, {
            velocity: e.velocityX,
            damping: 22,
            stiffness: 280,
            mass: 0.8,
          }, () => {
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

// Screen-only layout — tab bar is rendered separately outside the swipe layer
function ClassicTabLayout({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: false,
        ...(({ contentStyle: { backgroundColor: colors.background } }) as any),
        // Hide the built-in tab bar entirely — FloatingTabBar handles it
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

export default function TabLayout() {
  const { session, profile, loading } = useAuth();
  const { isDesktop } = useIsDesktop();
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
