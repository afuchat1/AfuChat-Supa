import React from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSegments, router } from "expo-router";
import { DesktopSidebar } from "./DesktopSidebar";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { DesktopDetailProvider } from "@/context/DesktopDetailContext";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";

const DESKTOP_BREAKPOINT = 768;
const SIDEBAR_WIDTH = 280;
const RIGHT_PANEL_WIDTH = 380;
const RIGHT_PANEL_BREAKPOINT = 1280;

type Props = {
  children: React.ReactNode;
};

function DesktopShell({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  const { session } = useAuth();
  const segments = useSegments();
  const { width } = useWindowDimensions();

  const isLoggedIn = !!session;

  const activeTab = segments.includes("search")
    ? "search"
    : segments.includes("discover")
      ? "discover"
      : segments.includes("me")
        ? "me"
        : segments.includes("notifications")
          ? "notifications"
          : segments.includes("wallet")
            ? "wallet"
            : "index";

  const handleTabPress = (tab: string) => {
    if (tab === "index") router.replace("/(tabs)");
    else if (tab === "search") router.replace("/(tabs)/search");
    else if (tab === "discover") router.replace("/(tabs)/discover");
    else if (tab === "me") router.replace("/(tabs)/me");
    else if (tab === "notifications") router.push("/notifications" as any);
    else if (tab === "wallet") router.push("/wallet" as any);
  };

  const bg = isDark ? "#0a0a0a" : "#eef0f4";
  const showRightPanel = isLoggedIn && width >= RIGHT_PANEL_BREAKPOINT;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View
        style={[
          styles.appShell,
          {
            backgroundColor: isDark ? "#111113" : "#ffffff",
            // @ts-ignore
            boxShadow: isDark
              ? "0 0 0 1px rgba(255,255,255,0.05), 0 4px 32px rgba(0,0,0,0.4)"
              : "0 0 0 1px rgba(0,0,0,0.07), 0 4px 24px rgba(0,0,0,0.08)",
          },
        ]}
      >
        {isLoggedIn && (
          <DesktopSidebar activeTab={activeTab} onTabPress={handleTabPress} />
        )}

        <View
          style={[
            styles.centerPanel,
            {
              borderRightWidth: showRightPanel ? StyleSheet.hairlineWidth : 0,
              borderRightColor: colors.border,
            },
          ]}
        >
          {children}
        </View>

        {showRightPanel && (
          <View
            style={[
              styles.rightPanel,
              { backgroundColor: isDark ? "#0d0d10" : "#f5f7fa", borderLeftColor: colors.border },
            ]}
          >
            <DesktopRightPanel activeTab={activeTab} colors={colors} />
          </View>
        )}
      </View>
    </View>
  );
}

export function DesktopWrapper({ children }: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;

  if (!isDesktop) {
    return (
      <DesktopDetailProvider>
        {children}
      </DesktopDetailProvider>
    );
  }

  return (
    <DesktopDetailProvider>
      <DesktopShell>{children}</DesktopShell>
    </DesktopDetailProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  appShell: {
    flex: 1,
    width: "100%" as any,
    maxWidth: 1600,
    flexDirection: "row",
    overflow: "hidden",
  },
  centerPanel: {
    flex: 1,
    overflow: "hidden",
  },
  rightPanel: {
    width: RIGHT_PANEL_WIDTH,
    overflow: "hidden",
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
});
