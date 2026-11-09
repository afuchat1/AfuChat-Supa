import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { T } from "@/constants/theme";

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
  // Default radius from T.radius — no hardcoded 16
  const r = flat.borderRadius ?? T.radius.md;

  // Map variant → theme surface colors (no hardcoded #1C1C1E / #FFFFFF)
  const bg =
    variant === "subtle"
      ? colors.backgroundSecondary
      : variant === "strong"
      ? colors.backgroundTertiary
      : colors.surface;

  return (
    <View
      style={[
        { backgroundColor: bg, borderRadius: r },
        style,
        pointerEvents ? ({ pointerEvents } as any) : undefined,
      ]}
    >
      <View style={innerStyle}>{children}</View>
    </View>
  );
});
