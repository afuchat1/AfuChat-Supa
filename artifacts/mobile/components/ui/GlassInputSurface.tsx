import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { GLASS } from "@/constants/glass";
import { useTheme } from "@/hooks/useTheme";
import { LinearGradient } from "@/components/ui/SafeGradient";

type GlassInputSurfaceProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "standard" | "overlay";
  borderColor?: string;
  blurIntensity?: number;
};

export function GlassInputSurface({
  children,
  style,
  tone = "standard",
  borderColor,
  blurIntensity = GLASS.input.blur,
}: GlassInputSurfaceProps) {
  const { isDark } = useTheme();
  const isOverlay = tone === "overlay";
  const fillColor = isOverlay
    ? GLASS.input.fillOverlay
    : isDark ? GLASS.input.fillDark : GLASS.input.fillLight;
  const edgeColor = borderColor
    ?? (isOverlay
      ? GLASS.input.borderOverlay
      : isDark ? GLASS.input.borderDark : GLASS.input.borderLight);
  const highlightColors: [string, string] = isDark || isOverlay
    ? GLASS.input.specularDark
    : GLASS.input.specularLight;

  return (
    <View
      style={[
        styles.surface,
        style,
        { borderColor: edgeColor },
        styles.clip,
      ]}
    >
      <BlurView
        pointerEvents="none"
        intensity={blurIntensity}
        tint="light"
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: fillColor }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={highlightColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.highlight}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    position: "relative",
    overflow: "hidden",
    borderWidth: 0.75,
    backgroundColor: "transparent",
  },
  clip: {
    overflow: "hidden",
  },
  highlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 14,
  },
});
