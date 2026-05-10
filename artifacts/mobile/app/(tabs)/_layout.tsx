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
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { TabSwipeProvider } from "@/context/TabSwipeContext";

let isLiquidGlassAvailable: () => boolean = () => false;
try {
  isLiquidGlassAvailable = require("expo-glass-effect").isLiquidGlassAvailable;
} catch (_) {}

const afuSymbol = require("@/assets/images/afu-symbol.png");
const SCREEN_WIDTH = Dimensions.get("window").width;

const PILL_HEIGHT = 64;
const PILL_RADIUS = 34;
const PILL_H_MARGIN = 36;

const TABS = [
  { route: "/(tabs)",          label: "AfuChat",  sfOn: "message.fill",        sfOff: "message",         mdOn: "chatbubble",  mdOff: "chatbubble-outline" },
  { route: "/(tabs)/discover", label: "Discover", sfOn: "safari.fill",          sfOff: "safari",          mdOn: "compass",     mdOff: "compass-outline"    },
  { route: "/(tabs)/apps",     label: "Apps",     sfOn: "square.grid.2x2.fill", sfOff: "square.grid.2x2", mdOn: "grid",        mdOff: "grid-outline"       },
  { route: "/(tabs)/me",       label: "Me",       sfOn: "person.circle.fill",   sfOff: "person.circle",   mdOn: "person",      mdOff: "person-outline"     },
] as const;

function normalizeTabPath(p: string): string {
  if (p === "/" || p === "/(tabs)" || p === "/(tabs)/index") return "/(tabs)";
  if (p === "/discover"  || p === "/(tabs)/discover")  return "/(tabs)/discover";
  if (p === "/apps"      || p === "/(tabs)/apps")      return "/(tabs)/apps";
  if (p === "/me"        || p === "/(tabs)/me")        return "/(tabs)/me";
  return p;
}

// ─── Floating pill tab bar ────────────────────────────────────────────────────
function FloatingTabBar() {
  const pathname    = usePathname();
  const colorScheme = useColorScheme();
  const isDark      = colorScheme === "dark";
  const isIOS       = Platform.OS === "ios";
  const insets      = useSafeAreaInsets();
  const { colors }  = useTheme();

  const bottomOffset = (insets.bottom > 0 ? insets.bottom : 14) + 6;
  const active       = normalizeTabPath(pathname);

  const TAB_WIDTH   = (SCREEN_WIDTH - PILL_H_MARGIN * 2) / TABS.length;
  const H_PADDING   = 4;
  const HIGHLIGHT_W = TAB_WIDTH - H_PADDING * 2;
  const HIGHLIGHT_H = PILL_HEIGHT - 16;
  const HIGHLIGHT_R = HIGHLIGHT_H / 2;

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
            { backgroundColor: isDark ? "rgba(26,26,28,0.97)" : "rgba(245,240,232,0.97)" },
          ]}
        />
      )}

      <Animated.View
        style={[
          {
            position: "absolute",
            top: (PILL_HEIGHT - HIGHLIGHT_H) / 2,
            left: 0,
            width: HIGHLIGHT_W,
            height: HIGHLIGHT_H,
            borderRadius: HIGHLIGHT_R,
            backgroundColor: isDark ? colors.accent + "2A" : colors.accent + "20",
            borderWidth: 1,
            borderColor: colors.accent + "30",
          },
          pillAnimStyle,
        ]}
      />

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
        <NativeTabLayout isLoggedIn={isLoggedIn} />
      </TabSwipeProvider>
    );
  }

  return (
    <TabSwipeProvider>
      <View style={{ flex: 1 }}>
        <ClassicTabLayout isLoggedIn={isLoggedIn} />
        {isLoggedIn && !isDesktop && Platform.OS !== "web" && (
          <FloatingTabBar />
        )}
      </View>
    </TabSwipeProvider>
  );
}
