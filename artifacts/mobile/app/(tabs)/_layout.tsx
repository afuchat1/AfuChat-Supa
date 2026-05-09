import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Image, Platform, StyleSheet, useColorScheme } from "react-native";
import { router } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useIsDesktop } from "@/hooks/useIsDesktop";

let isLiquidGlassAvailable: () => boolean = () => false;
try {
  isLiquidGlassAvailable = require("expo-glass-effect").isLiquidGlassAvailable;
} catch (_) {}

const afuSymbol = require("@/assets/images/afu-symbol.png");

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

  const layout = isLiquidGlassAvailable()
    ? <NativeTabLayout isLoggedIn={!!session} />
    : <ClassicTabLayout isLoggedIn={!!session} />;

  return (
    <>
      {layout}
    </>
  );
}
