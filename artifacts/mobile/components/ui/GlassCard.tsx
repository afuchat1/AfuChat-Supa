/**
 * GlassCard — the primary liquid glass surface component.
 *
 * On iOS:  BlurView + specular LinearGradient + hairline border
 * On Web:  backdrop-filter blur + fill overlay + border
 * Android: semi-transparent fill + specular + border (no blur)
 *
 * Usage:
 *   <GlassCard style={{ borderRadius: 20, padding: 16 }}>
 *     <Text>Hello</Text>
 *   </GlassCard>
 */
import React from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { GLASS, glassTokens } from "@/constants/glass";
import { useTheme } from "@/hooks/useTheme";

// ─── Props ────────────────────────────────────────────────────────────────────
export interface GlassCardProps {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[] | any;
  /** Blur intensity override (iOS only) */
  intensity?: number;
  /** Fill strength. 'subtle' is most transparent, 'strong' most opaque */
  variant?: "subtle" | "medium" | "strong";
  /** Remove the hairline border */
  noBorder?: boolean;
  /** Remove the top specular highlight */
  noSpecular?: boolean;
  /** Remove the shadow */
  noShadow?: boolean;
  /** Force dark or light tokens regardless of system theme */
  forceDark?: boolean;
  forceLight?: boolean;
  /** Extra style applied inside the blur clip (useful for padding) */
  innerStyle?: ViewStyle | any;
  /** Override press event passthrough */
  pointerEvents?: "box-none" | "none" | "box-only" | "auto";
}

// ─── Component ────────────────────────────────────────────────────────────────
export const GlassCard = React.memo(function GlassCard({
  children,
  style,
  intensity,
  variant = "medium",
  noBorder = false,
  noSpecular = false,
  noShadow = false,
  forceDark,
  forceLight,
  innerStyle,
  pointerEvents,
}: GlassCardProps) {
  const { isDark: themeDark } = useTheme();
  const isDark = forceDark ? true : forceLight ? false : themeDark;
  const g = glassTokens(isDark);

  const flat = StyleSheet.flatten(style || {}) as any;
  const r = flat.borderRadius ?? GLASS.radius.md;

  const fillColor =
    variant === "subtle"  ? (isDark ? GLASS.fill.dark       : GLASS.fill.light)
    : variant === "strong" ? (isDark ? GLASS.fill.darkStrong : GLASS.fill.lightStrong)
    :                        (isDark ? GLASS.fill.darkMedium : GLASS.fill.lightMedium);

  const blurIntensity = intensity ?? (
    variant === "subtle"  ? GLASS.blur.light  :
    variant === "strong"  ? GLASS.blur.heavy  :
    GLASS.blur.medium
  );

  const specularColors = g.specular;
  const shadow = noShadow ? {} : (variant === "subtle" ? g.shadowSoft : g.shadow);

  // ── iOS: real BlurView ───────────────────────────────────────────────────
  if (Platform.OS === "ios") {
    return (
      <View
        style={[shadow, { borderRadius: r }, style]}
        pointerEvents={pointerEvents}
      >
        <BlurView
          intensity={blurIntensity}
          tint={g.blurTint}
          style={[styles.fill, { borderRadius: r }, innerStyle]}
        >
          {/* Semi-transparent tint over blur */}
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: fillColor, borderRadius: r }]}
            pointerEvents="none"
          />
          {/* Specular highlight */}
          {!noSpecular && (
            <LinearGradient
              colors={specularColors}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 0.45 }}
              style={[StyleSheet.absoluteFill, { borderRadius: r }]}
              pointerEvents="none"
            />
          )}
          {children}
        </BlurView>
        {/* Hairline border — rendered outside BlurView so it's crisp */}
        {!noBorder && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: r,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: g.border,
              },
            ]}
            pointerEvents="none"
          />
        )}
      </View>
    );
  }

  // ── Web: CSS backdrop-filter ──────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <View
        style={[
          {
            borderRadius: r,
            overflow: "hidden",
            backgroundColor: fillColor,
            // @ts-ignore
            backdropFilter: `blur(${blurIntensity / 3}px)`,
            WebkitBackdropFilter: `blur(${blurIntensity / 3}px)`,
          },
          !noBorder && { borderWidth: StyleSheet.hairlineWidth, borderColor: g.border },
          !noShadow && shadow,
          style,
        ]}
        pointerEvents={pointerEvents}
      >
        {!noSpecular && (
          <LinearGradient
            colors={specularColors}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.45 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
        {children}
      </View>
    );
  }

  // ── Android: semi-transparent surface ─────────────────────────────────────
  return (
    <View
      style={[
        {
          borderRadius: r,
          overflow: "hidden",
          backgroundColor: fillColor,
        },
        !noBorder && { borderWidth: StyleSheet.hairlineWidth, borderColor: g.border },
        !noShadow && shadow,
        style,
      ]}
      pointerEvents={pointerEvents}
    >
      {!noSpecular && (
        <LinearGradient
          colors={specularColors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.45 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      {children}
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  fill: { overflow: "hidden" },
});
