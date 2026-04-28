import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, usePathname } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Dimensions, Image, Platform, StyleSheet, useColorScheme } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import CommunityBanner from "@/components/ui/CommunityBanner";
import { useTour, TOUR_KEY } from "@/context/TourContext";
import { useIsDesktop } from "@/hooks/useIsDesktop";

const afuSymbol = require("@/assets/images/afu-symbol.png");

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "message.fill", selected: "message.fill" }} />
        <Label>AfuChat</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="discover">
        <Icon sf={{ default: "location" as any, selected: "location.fill" as any }} />
        <Label>Discover</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="apps">
        <Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} />
        <Label>Apps</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="me">
        <Icon sf={{ default: "person.circle", selected: "person.circle.fill" }} />
        <Label>Me</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout({ isLoggedIn }: { isLoggedIn: boolean }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { registerLayout, step, advance } = useTour();
  const pathname = usePathname();
  const { isDesktop } = useIsDesktop();
  const registeredRef = useRef(false);

  const hideTabs = isDesktop || (!isLoggedIn && Platform.OS === "web");

  useEffect(() => {
    if (hideTabs) return;
    if (registeredRef.current) return;
    registeredRef.current = true;

    const { width: SW, height: SH } = Dimensions.get("window");
    const tabBarH = 52 + (insets.bottom > 0 ? insets.bottom : 8);
    const tabBarTop = SH - tabBarH;
    const tabW = SW / 4;

    const tabDefs = [
      { id: "tab-chat", index: 0 },
      { id: "tab-discover", index: 1 },
      { id: "tab-apps", index: 2 },
      { id: "tab-me", index: 3 },
    ];
    tabDefs.forEach(({ id, index }) => {
      registerLayout(id, {
        x: tabW * index,
        y: tabBarTop,
        w: tabW,
        h: tabBarH,
      });
    });
  }, [hideTabs, insets.bottom, registerLayout]);

  useEffect(() => {
    if (!step) return;
    if (step.id === "discover" && pathname === "/discover") advance();
    if (step.id === "chat" && (pathname === "/" || pathname === "/index")) advance();
    if (step.id === "apps" && pathname === "/apps") advance();
  }, [pathname, step?.id]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.tabIconDefault,
        headerShown: false,
        tabBarStyle: hideTabs
          ? { display: "none" }
          : {
              position: "absolute",
              backgroundColor: isIOS ? "transparent" : colors.surface,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
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
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView name={(focused ? "location.fill" : "location") as any} tintColor={color} size={22} />
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
        name="apps"
        options={{
          title: "Apps",
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
  const { startTour } = useTour();

  useEffect(() => {
    if (loading) return;
    if (session && profile && !profile.onboarding_completed) {
      router.replace({ pathname: "/onboarding", params: { userId: session.user.id } });
      return;
    }
    if (session && profile?.onboarding_completed) {
      AsyncStorage.getItem(TOUR_KEY).then((seen) => {
        if (!seen) startTour();
      });
    }
  }, [session, profile, loading]);

  const layout = isLiquidGlassAvailable()
    ? <NativeTabLayout />
    : <ClassicTabLayout isLoggedIn={!!session} />;

  return (
    <>
      {layout}
      {session?.user?.id ? <CommunityBanner userId={session.user.id} /> : null}
    </>
  );
}
