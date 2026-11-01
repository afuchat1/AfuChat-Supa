import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { T } from "@/constants/theme";
import { GLASS } from "@/constants/glass";

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
  noSpecular = false,
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

  // Keep variants on distinct theme layers so the same component has depth
  // in both palettes without introducing per-screen colors.
  const bg =
    variant === "subtle"
      ? colors.backgroundSecondary
      : variant === "strong"
      ? colors.backgroundTertiary
      : colors.surface;
  const shadow = noShadow
    ? undefined
    : isDark
      ? GLASS.shadow.darkSoft
      : GLASS.shadow.lightSoft;

  return (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: r,
          borderWidth: noBorder ? 0 : T.border.hairline,
          borderColor: colors.border,
        },
        shadow,
        style,
        pointerEvents ? ({ pointerEvents } as any) : undefined,
      ]}
    >
      {!noSpecular && (
        <View
          pointerEvents="none"
          style={[
            styles.specularEdge,
            { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.88)", borderTopLeftRadius: r, borderTopRightRadius: r },
          ]}
        />
      )}
      <View style={innerStyle}>{children}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  specularEdge: {
    position: "absolute",
    top: 0,
    left: T.space.xs,
    right: T.space.xs,
    height: 1,
    zIndex: 1,
  },
});
