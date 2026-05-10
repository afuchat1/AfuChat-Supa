import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "@/hooks/useTheme";

export interface GlassCardProps {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[] | any;
  intensity?: number;
  variant?: "subtle" | "medium" | "strong";
  noBorder?: boolean;
  noSpecular?: boolean;
  noShadow?: boolean;
  forceDark?: boolean;
  forceLight?: boolean;
  innerStyle?: ViewStyle | any;
  pointerEvents?: "box-none" | "none" | "box-only" | "auto";
}

export const GlassCard = React.memo(function GlassCard({
  children,
  style,
  variant = "medium",
  noBorder = false,
  noShadow = false,
  forceDark,
  forceLight,
  innerStyle,
  pointerEvents,
}: GlassCardProps) {
  const { colors, isDark: themeDark } = useTheme();
  const isDark = forceDark ? true : forceLight ? false : themeDark;

  const flat = StyleSheet.flatten(style || {}) as any;
  const r = flat.borderRadius ?? 16;

  const bg =
    variant === "subtle"
      ? colors.backgroundSecondary
      : variant === "strong"
      ? isDark
        ? "#1C1C1E"
        : "#FFFFFF"
      : colors.surface;

  return (
    <View
      style={[
        {
          borderRadius: r,
          backgroundColor: bg,
          overflow: "hidden",
        },
        !noBorder && {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        style,
      ]}
      pointerEvents={pointerEvents}
    >
      <View style={innerStyle}>{children}</View>
    </View>
  );
});
