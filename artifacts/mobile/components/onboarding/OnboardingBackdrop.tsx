import React from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Colors from "@/constants/colors";
import { useAppAccent } from "@/context/AppAccentContext";

export const ONBOARDING_THEME = {
  background: Colors.dark.background,
  // Keep the same black base as the login screen. The shared soft orbs below
  // provide the only background color treatment across auth and onboarding.
  gradientTop: Colors.dark.background,
  gradientMiddle: Colors.dark.background,
  orbBlue: Colors.brand,
  orbPurple: "#4B237A",
  text: Colors.dark.text,
  textSecondary: "rgba(255,255,255,0.62)",
  textMuted: "rgba(255,255,255,0.42)",
  inputBackground: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.14)",
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
  const { accent } = useAppAccent();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: ONBOARDING_THEME.background }]} />
      <SoftOrb cx={width * 0.85} cy={height * 0.08} size={280} color={accent} />
      <SoftOrb cx={width * 0.10} cy={height * 0.55} size={220} color={ONBOARDING_THEME.orbPurple} />
      <SoftOrb cx={width * 0.55} cy={height * 0.85} size={180} color={accent} />
    </View>
  );
}