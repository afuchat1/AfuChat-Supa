import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
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

function normalizeTabPath(p: string): string {
  if (p === "/" || p === "/(tabs)" || p === "/(tabs)/index") return "/(tabs)";
  if (p === "/discover"  || p === "/(tabs)/discover")  return "/(tabs)/discover";
  if (p === "/apps"      || p === "/(tabs)/apps")      return "/(tabs)/apps";
  if (p === "/me"        || p === "/(tabs)/me")        return "/(tabs)/me";
  return p;
}

// ─── Single animated tab item ──────────────────────────────────────────────────
function TabItem({
  tab,
  isFocused,
  colors,
}: {
  tab: (typeof TABS)[number];
  isFocused: boolean;
  colors: any;
}) {
  const isIOS = Platform.OS === "ios";

  // Animated values
  const pillWidth   = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const iconScale   = useRef(new Animated.Value(isFocused ? 1.1 : 1)).current;
  const labelOpacity = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const labelWidth   = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(pillWidth, {
        toValue: isFocused ? 1 : 0,
        useNativeDriver: false,
        speed: 18,
        bounciness: 4,
      }),
      Animated.spring(iconScale, {
        toValue: isFocused ? 1.12 : 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 6,
      }),
      Animated.timing(labelOpacity, {
        toValue: isFocused ? 1 : 0,
        duration: isFocused ? 180 : 80,
        useNativeDriver: true,
      }),
      Animated.spring(labelWidth, {
        toValue: isFocused ? 1 : 0,
        useNativeDriver: false,
        speed: 18,
        bounciness: 2,
      }),
    ]).start();
  }, [isFocused]);

  const iconColor = isFocused ? colors.accent : colors.tabIconDefault;

  const pillBg = pillWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(0,0,0,0)", colors.accent + "22"],
  });

  const pillPaddingH = pillWidth.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 14],
  });

  const labelMaxWidth = labelWidth.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 72],
  });

  return (
    <TouchableOpacity
      style={tabItemStyles.wrapper}
      onPress={() => router.navigate(tab.route as any)}
      activeOpacity={0.75}
    >
      <Animated.View
        style={[
          tabItemStyles.pill,
          {
            backgroundColor: pillBg,
            paddingHorizontal: pillPaddingH,
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>
          {tab.route === "/(tabs)" ? (
            <Image
              source={afuSymbol}
              style={{ width: 22, height: 22, tintColor: iconColor }}
              resizeMode="contain"
            />
          ) : isIOS ? (
            <SymbolView
              name={isFocused ? tab.sfOn : tab.sfOff}
              tintColor={iconColor}
              size={22}
            />
          ) : (
            <Ionicons
              name={(isFocused ? tab.mdOn : tab.mdOff) as any}
              size={22}
              color={iconColor}
            />
          )}
        </Animated.View>

        <Animated.View
          style={{ overflow: "hidden", maxWidth: labelMaxWidth, opacity: labelOpacity }}
        >
          <Text
            style={[tabItemStyles.label, { color: colors.accent }]}
            numberOfLines={1}
          >
            {tab.label}
          </Text>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const tabItemStyles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    paddingVertical: 9,
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.1,
    marginLeft: 2,
  },
});

// ─── Floating bottom tab bar ──────────────────────────────────────────────────
function FloatingTabBar() {
  const pathname = usePathname();
  const insets   = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const active = normalizeTabPath(pathname);

  const barBg = isDark ? "rgba(30,30,32,0.92)" : "rgba(255,255,255,0.94)";

  return (
    <View
      style={[
        floatStyles.container,
        { bottom: (insets.bottom > 0 ? insets.bottom : 12) + 4 },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          floatStyles.bar,
          {
            backgroundColor: barBg,
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
          },
        ]}
      >
        {TABS.map((tab) => (
          <TabItem
            key={tab.route}
            tab={tab}
            isFocused={active === tab.route}
            colors={colors}
          />
        ))}
      </View>
    </View>
  );
}

const floatStyles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "stretch",
    zIndex: 100,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 16,
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
