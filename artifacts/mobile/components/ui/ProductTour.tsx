import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTour } from "@/context/TourContext";
import { useTheme } from "@/hooks/useTheme";

const TOOLTIP_W = 272;
const ARROW = 9;
const SPOT_PAD = 10;
const DIM = "rgba(0,0,0,0.62)";

export default function ProductTour() {
  const { isActive, step, stepIndex, totalSteps, layouts, advance, skip } = useTour();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: SW, height: SH } = Dimensions.get("window");

  const opacity = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(16)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseAlpha = useRef(new Animated.Value(0.5)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!isActive || !step) {
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start();
      pulseRef.current?.stop();
      return;
    }

    opacity.setValue(0);
    slideY.setValue(step.placement === "above" ? 14 : -14);

    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, tension: 70, friction: 10, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
    ]).start();

    pulseRef.current?.stop();
    pulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1.08, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAlpha, { toValue: 0.9, duration: 800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAlpha, { toValue: 0.35, duration: 800, useNativeDriver: true }),
        ]),
      ])
    );
    pulseRef.current.start();

    return () => {
      pulseRef.current?.stop();
    };
  }, [isActive, step?.id]);

  if (!isActive || !step) return null;

  const target = layouts[step.targetId];
  if (!target) return null;

  const tx = target.x - SPOT_PAD;
  const ty = target.y - SPOT_PAD;
  const tw = target.w + SPOT_PAD * 2;
  const th = target.h + SPOT_PAD * 2;

  const targetCenterX = target.x + target.w / 2;
  const targetCenterY = target.y + target.h / 2;

  let tooltipTop = 0;
  let tooltipLeft = 0;
  let arrowLeft: number | null = null;
  let arrowTop: number | null = null;
  let arrowRight: number | null = null;
  let arrowBottom: number | null = null;
  let arrowPointing: "down" | "up" | "left" | "right" = "down";

  const TOOLTIP_H_EST = 148;

  if (step.placement === "above") {
    tooltipTop = ty - TOOLTIP_H_EST - ARROW - 6;
    if (tooltipTop < insets.top + 8) tooltipTop = ty + th + ARROW + 6;
    tooltipLeft = Math.max(12, Math.min(targetCenterX - TOOLTIP_W / 2, SW - TOOLTIP_W - 12));
    const raw = targetCenterX - tooltipLeft - ARROW;
    arrowLeft = Math.max(16, Math.min(raw, TOOLTIP_W - ARROW * 2 - 16));
    arrowPointing = tooltipTop < ty ? "down" : "up";
  } else if (step.placement === "below") {
    tooltipTop = ty + th + ARROW + 6;
    tooltipLeft = Math.max(12, Math.min(targetCenterX - TOOLTIP_W / 2, SW - TOOLTIP_W - 12));
    const raw = targetCenterX - tooltipLeft - ARROW;
    arrowLeft = Math.max(16, Math.min(raw, TOOLTIP_W - ARROW * 2 - 16));
    arrowPointing = "up";
  } else if (step.placement === "left") {
    tooltipLeft = tx - TOOLTIP_W - ARROW - 6;
    if (tooltipLeft < 12) tooltipLeft = tx + tw + ARROW + 6;
    tooltipTop = Math.max(
      insets.top + 8,
      Math.min(targetCenterY - TOOLTIP_H_EST / 2, SH - TOOLTIP_H_EST - insets.bottom - 8)
    );
    const raw = targetCenterY - tooltipTop - ARROW;
    arrowTop = Math.max(16, Math.min(raw, TOOLTIP_H_EST - ARROW * 2 - 16));
    arrowPointing = tooltipLeft < tx ? "right" : "left";
  } else {
    tooltipLeft = tx + tw + ARROW + 6;
    tooltipTop = Math.max(
      insets.top + 8,
      Math.min(targetCenterY - TOOLTIP_H_EST / 2, SH - TOOLTIP_H_EST - insets.bottom - 8)
    );
    const raw = targetCenterY - tooltipTop - ARROW;
    arrowTop = Math.max(16, Math.min(raw, TOOLTIP_H_EST - ARROW * 2 - 16));
    arrowPointing = "left";
  }

  const spotR = Math.min(tw, th) > 54 ? 16 : th / 2;

  const arrowStyle = ((): object => {
    const base = { position: "absolute" as const, width: 0, height: 0 };
    if (arrowPointing === "down") {
      return {
        ...base,
        borderLeftWidth: ARROW,
        borderRightWidth: ARROW,
        borderTopWidth: ARROW,
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
        borderTopColor: colors.surface,
        bottom: -ARROW,
        left: arrowLeft ?? TOOLTIP_W / 2 - ARROW,
      };
    }
    if (arrowPointing === "up") {
      return {
        ...base,
        borderLeftWidth: ARROW,
        borderRightWidth: ARROW,
        borderBottomWidth: ARROW,
        borderLeftColor: "transparent",
        borderRightColor: "transparent",
        borderBottomColor: colors.surface,
        top: -ARROW,
        left: arrowLeft ?? TOOLTIP_W / 2 - ARROW,
      };
    }
    if (arrowPointing === "right") {
      return {
        ...base,
        borderTopWidth: ARROW,
        borderBottomWidth: ARROW,
        borderLeftWidth: ARROW,
        borderTopColor: "transparent",
        borderBottomColor: "transparent",
        borderLeftColor: colors.surface,
        right: -ARROW,
        top: arrowTop ?? TOOLTIP_H_EST / 2 - ARROW,
      };
    }
    return {
      ...base,
      borderTopWidth: ARROW,
      borderBottomWidth: ARROW,
      borderRightWidth: ARROW,
      borderTopColor: "transparent",
      borderBottomColor: "transparent",
      borderRightColor: colors.surface,
      left: -ARROW,
      top: arrowTop ?? TOOLTIP_H_EST / 2 - ARROW,
    };
  })();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dim — top */}
      <View
        pointerEvents="none"
        style={[styles.dim, { left: 0, top: 0, right: 0, height: Math.max(0, ty) }]}
      />
      {/* Dim — bottom */}
      <View
        pointerEvents="none"
        style={[styles.dim, { left: 0, top: ty + th, right: 0, bottom: 0 }]}
      />
      {/* Dim — left */}
      <View
        pointerEvents="none"
        style={[
          styles.dim,
          { left: 0, top: ty, width: Math.max(0, tx), height: th },
        ]}
      />
      {/* Dim — right */}
      <View
        pointerEvents="none"
        style={[
          styles.dim,
          { left: tx + tw, top: ty, right: 0, height: th },
        ]}
      />

      {/* Spotlight pulsing border */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: tx,
          top: ty,
          width: tw,
          height: th,
          borderRadius: spotR,
          borderWidth: 2,
          borderColor: colors.accent,
          opacity: pulseAlpha,
          transform: [{ scale: pulseScale }],
        }}
      />

      {/* Tooltip card */}
      <Animated.View
        style={[
          styles.tooltip,
          {
            left: tooltipLeft,
            top: tooltipTop,
            width: TOOLTIP_W,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity,
            transform: [{ translateY: slideY }],
          },
        ]}
      >
        {/* Arrow */}
        <View style={arrowStyle} />

        {/* Step indicator row */}
        <View style={styles.row}>
          <View style={[styles.stepBadge, { backgroundColor: colors.accent + "18" }]}>
            <View style={[styles.stepDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.stepText, { color: colors.accent }]}>
              {stepIndex + 1} / {totalSteps}
            </Text>
          </View>
          <TouchableOpacity onPress={() => skip()} hitSlop={10}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip tour</Text>
          </TouchableOpacity>
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.text }]}>{step.title}</Text>

        {/* Description */}
        <Text style={[styles.desc, { color: colors.textMuted }]}>{step.description}</Text>

        {/* Tap hint pill */}
        <View style={[styles.hintPill, { backgroundColor: colors.accent + "14" }]}>
          <Ionicons name="finger-print-outline" size={13} color={colors.accent} />
          <Text style={[styles.hintText, { color: colors.accent }]}>{step.hint}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    position: "absolute",
    backgroundColor: DIM,
  },
  tooltip: {
    position: "absolute",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  stepBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stepText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  skipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  desc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  hintPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 2,
  },
  hintText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
