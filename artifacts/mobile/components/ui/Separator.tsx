import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";

export function Separator({ indent = 0 }: { indent?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.sep,
        { backgroundColor: colors.separator, marginLeft: indent },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  sep: { height: StyleSheet.hairlineWidth },
});
