import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";

/**
 * Shared outer frame applied to every Expo Router stack route.
 * Keeps nested scroll/column layouts shrinkable and prevents narrow screens
 * from inheriting a wider child layout.
 */
export function RouteFrame({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.frame, { backgroundColor: colors.background }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    width: "100%",
  },
});
