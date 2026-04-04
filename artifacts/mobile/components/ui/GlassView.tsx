import React from "react";
import { Platform, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

interface GlassViewProps {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[] | any;
  intensity?: number;
  tint?: "light" | "dark" | "default" | "systemMaterial" | "systemThickMaterial" | "systemUltraThinMaterial" | "systemThinMaterial" | "systemChromeMaterial";
  fallbackColor?: string;
  borderColor?: string;
  noBorder?: boolean;
}

export function GlassView({
  children,
  style,
  intensity = 72,
  tint = "dark",
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

  if (Platform.OS === "ios") {
    return (
      <BlurView
        intensity={intensity}
        tint={tint}
        style={[{ borderRadius: r, overflow: "hidden" }, borderStyle, style]}
      >
        {children}
      </BlurView>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View
        style={[
          {
            borderRadius: r,
            overflow: "hidden",
            backgroundColor: fallbackColor,
            ...(({ backdropFilter: "blur(20px)" } as any)),
          },
          borderStyle,
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <View style={[{ borderRadius: r, overflow: "hidden", backgroundColor: fallbackColor }, borderStyle, style]}>
      {children}
    </View>
  );
}
