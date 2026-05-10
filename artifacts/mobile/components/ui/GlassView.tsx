import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";

interface GlassViewProps {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[] | any;
  intensity?: number;
  tint?: string;
  fallbackColor?: string;
  borderColor?: string;
  noBorder?: boolean;
}

export function GlassView({
  children,
  style,
  fallbackColor = "rgba(18,22,28,0.88)",
  borderColor = "rgba(255,255,255,0.08)",
  noBorder = false,
}: GlassViewProps) {
  const flatStyle = StyleSheet.flatten(style || {}) as any;
  const r = flatStyle.borderRadius ?? 0;

  const borderStyle = noBorder ? {} : {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor,
  };

  return (
    <View
      style={[
        { borderRadius: r, overflow: "hidden", backgroundColor: fallbackColor },
        borderStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}
