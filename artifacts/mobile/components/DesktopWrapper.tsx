import React from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSegments, router } from "expo-router";
import { DesktopSidebar } from "./DesktopSidebar";
import { DesktopDetailProvider } from "@/context/DesktopDetailContext";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";

const DESKTOP_BREAKPOINT = 768;

type Props = {
  children: React.ReactNode;
};

export function DesktopWrapper({ children }: Props) {
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const segments = useSegments();
  const { session } = useAuth();

  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;
  const isLoggedIn = !!session;

  if (!isDesktop) {
    return (
      <DesktopDetailProvider>
        {children}
      </DesktopDetailProvider>
    );
  }

  const activeTab = segments.includes("search")
    ? "search"
    : segments.includes("discover")
      ? "discover"
      : segments.includes("me")
        ? "me"
        : segments.includes("notifications")
          ? "notifications"
          : "index";

  const handleTabPress = (tab: string) => {
    if (tab === "index") router.replace("/(tabs)");
    else if (tab === "search") router.replace("/(tabs)/search");
    else if (tab === "discover") router.replace("/(tabs)/discover");
    else if (tab === "me") router.replace("/(tabs)/me");
    else if (tab === "notifications") router.push("/notifications" as any);
  };

  const bg = isDark ? "#0d0d0d" : "#f2f3f5";

  return (
    <DesktopDetailProvider>
      <View style={[styles.root, { backgroundColor: bg }]}>
        <View
          style={[
            styles.appShell,
            {
              backgroundColor: colors.background,
              // @ts-ignore
              boxShadow: isDark
                ? "0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.5)"
                : "0 0 0 1px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.08)",
            },
          ]}
        >
          {isLoggedIn && (
            <DesktopSidebar activeTab={activeTab} onTabPress={handleTabPress} />
          )}
          <View style={[styles.mainContent, { backgroundColor: colors.background }]}>
            {children}
          </View>
        </View>
      </View>
    </DesktopDetailProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
  },
  appShell: {
    flex: 1,
    width: "100%" as any,
    maxWidth: 1380,
    flexDirection: "row",
    overflow: "hidden",
  },
  mainContent: {
    flex: 1,
    overflow: "hidden",
  },
});
