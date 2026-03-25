import React from "react";
import { Platform, View, StyleSheet, useWindowDimensions } from "react-native";

const DESKTOP_BREAKPOINT = 768;
const BRAND_BG = "#00897B";
const HEADER_HEIGHT = 127;
const TOP_VISIBLE = 19;

type Props = {
  children: React.ReactNode;
};

export function DesktopWrapper({ children }: Props) {
  const { width, height } = useWindowDimensions();

  if (Platform.OS !== "web" || width < DESKTOP_BREAKPOINT) {
    return <>{children}</>;
  }

  const appHeight = height - TOP_VISIBLE - TOP_VISIBLE;

  return (
    <View style={styles.root}>
      <View style={styles.topBar} />
      <View style={styles.contentArea}>
        <View style={[styles.appContainer, { height: appHeight }]}>
          {children}
        </View>
      </View>
    </View>
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
  appContainer: {
    width: "100%",
    maxWidth: 1400,
    backgroundColor: "#fff",
    overflow: "hidden",
    // @ts-ignore
    boxShadow: "0 1px 1px 0 rgba(0,0,0,0.06), 0 2px 5px 0 rgba(0,0,0,0.2)",
  },
});
