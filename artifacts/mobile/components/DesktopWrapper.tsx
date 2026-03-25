import React, { useState } from "react";
import { Platform, View, StyleSheet, Text, useWindowDimensions } from "react-native";
import { usePathname, useSegments, router } from "expo-router";
import { DesktopSidebar } from "./DesktopSidebar";
import { DesktopDetailProvider } from "@/context/DesktopDetailContext";

const DESKTOP_BREAKPOINT = 768;
const BRAND_BG = "#00897B";
const HEADER_HEIGHT = 127;
const TOP_VISIBLE = 19;

type Props = {
  children: React.ReactNode;
};

export function DesktopWrapper({ children }: Props) {
  const { width, height } = useWindowDimensions();
  const segments = useSegments();

  if (Platform.OS !== "web" || width < DESKTOP_BREAKPOINT) {
    return (
      <DesktopDetailProvider>
        {children}
      </DesktopDetailProvider>
    );
  }

  const activeTab = segments.includes("discover")
    ? "discover"
    : segments.includes("me")
      ? "me"
      : "index";

  const handleTabPress = (tab: string) => {
    if (tab === "index") router.replace("/(tabs)");
    else if (tab === "discover") router.replace("/(tabs)/discover");
    else if (tab === "me") router.replace("/(tabs)/me");
  };

  const appHeight = height - TOP_VISIBLE * 2;

  return (
    <DesktopDetailProvider>
      <View style={styles.root}>
        <View style={styles.topBar} />
        <View style={styles.contentArea}>
          <View style={[styles.appShell, { height: appHeight }]}>
            <DesktopSidebar activeTab={activeTab} onTabPress={handleTabPress} />
            <View style={styles.mainContent}>
              {children}
            </View>
          </View>
        </View>
      </View>
    </DesktopDetailProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#DAD3CC",
  },
  topBar: {
    height: HEADER_HEIGHT,
    backgroundColor: BRAND_BG,
  },
  contentArea: {
    flex: 1,
    alignItems: "center",
    marginTop: -(HEADER_HEIGHT - TOP_VISIBLE),
  },
  appShell: {
    width: "100%",
    maxWidth: 1400,
    flexDirection: "row",
    backgroundColor: "#fff",
    overflow: "hidden",
    // @ts-ignore
    boxShadow: "0 1px 1px 0 rgba(0,0,0,0.06), 0 2px 5px 0 rgba(0,0,0,0.2)",
  },
  mainContent: {
    flex: 1,
  },
});
