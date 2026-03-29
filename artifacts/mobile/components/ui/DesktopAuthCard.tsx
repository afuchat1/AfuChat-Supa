import React from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { useTheme } from "@/hooks/useTheme";

const DESKTOP_BREAKPOINT = 768;

type Props = {
  children: React.ReactNode;
};

export function DesktopAuthCard({ children }: Props) {
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();

  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;

  if (!isDesktop) {
    return <>{children}</>;
  }

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: isDark ? "#0d0d0d" : "#f0f2f5" },
      ]}
    >
      <View style={styles.centerWrap}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.background,
              // @ts-ignore
              boxShadow: isDark
                ? "0 0 0 1px rgba(255,255,255,0.07), 0 16px 48px rgba(0,0,0,0.5)"
                : "0 0 0 1px rgba(0,0,0,0.06), 0 16px 48px rgba(0,0,0,0.1)",
              // @ts-ignore
              maxHeight: "88vh",
              // @ts-ignore
              overflowY: "auto",
            },
          ]}
        >
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  card: {
    width: "100%" as any,
    maxWidth: 460,
    borderRadius: 20,
    overflow: "hidden",
  },
});
