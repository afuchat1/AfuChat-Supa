import React from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Colors from "@/constants/colors";
import { useTheme } from "@/hooks/useTheme";

export const ONBOARDING_THEME = {
  background: Colors.light.background,
  gradientTop: Colors.light.background,
  gradientMiddle: Colors.light.background,
  orbBlue: Colors.brand,
  orbPurple: Colors.brand,
  text: Colors.light.text,
  textSecondary: Colors.light.textSecondary,
  textMuted: Colors.light.textMuted,
  inputBackground: Colors.light.inputBg,
  border: Colors.light.border,
} as const;

function SoftOrb({ cx, cy, size, color }: { cx: number; cy: number; size: number; color: string }) {
  return (
    <>
      <View style={{ position: "absolute", left: cx - size * 0.75, top: cy - size * 0.75, width: size * 1.5, height: size * 1.5, borderRadius: size * 0.75, backgroundColor: color, opacity: 0.07 }} />
      <View style={{ position: "absolute", left: cx - size * 0.5, top: cy - size * 0.5, width: size, height: size, borderRadius: size * 0.5, backgroundColor: color, opacity: 0.11 }} />
      <View style={{ position: "absolute", left: cx - size * 0.27, top: cy - size * 0.27, width: size * 0.54, height: size * 0.54, borderRadius: size * 0.27, backgroundColor: color, opacity: 0.16 }} />
    </>
  );
}

export default function OnboardingBackdrop() {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
      <SoftOrb cx={width * 0.85} cy={height * 0.08} size={280} color={colors.accent} />
      <SoftOrb cx={width * 0.10} cy={height * 0.55} size={220} color={colors.accent} />
      <SoftOrb cx={width * 0.55} cy={height * 0.85} size={180} color={colors.accent} />
    </View>
  );
}