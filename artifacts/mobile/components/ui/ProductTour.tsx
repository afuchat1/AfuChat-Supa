import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTour } from "@/context/TourContext";
import { useTheme } from "@/hooks/useTheme";

const TOOLTIP_W = 276;
const ARROW = 9;
const SPOT_PAD = 10;
const DIM = "rgba(0,0,0,0.65)";
const ACCENT = "#00BCD4";
const TOOLTIP_H_EST = 166;
const MARGIN = 14;
const USE_NATIVE_DRIVER = Platform.OS !== "web";

export default function ProductTour() {
  const { isActive, step, stepIndex, totalSteps, layouts, advance, skip } = useTour();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: SW, height: SH } = Dimensions.get("window");

  const opacity = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(16)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseAlpha = useRef(new Animated.Value(0.5)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  // Auto-skip steps whose target element hasn't been registered yet
  useEffect(() => {
    if (!isActive || !step) return;
    if (layouts[step.targetId]) return; // target is registered, nothing to do
    const timer = setTimeout(() => {
      advance();
    }, 350);
    return () => clearTimeout(timer);
  }, [isActive, step?.id, layouts]);

  const stopAnimations = useCallback(() => {
    pulseRef.current?.stop();
    pulseRef.current = null;
  }, []);

  useEffect(() => {
    if (!isActive || !step) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
      stopAnimations();
      return;
    }

    opacity.setValue(0);
    slideY.setValue(step.placement === "above" ? 14 : -14);

    Animated.parallel([
      Animated.spring(opacity, {
        toValue: 1,
        tension: 70,
        friction: 10,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.spring(slideY, {
        toValue: 0,
        tension: 70,
        friction: 10,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();

    stopAnimations();
    pulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.09,
            duration: 820,
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(pulseAlpha, {
            toValue: 0.85,
            duration: 820,
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 820,
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(pulseAlpha, {
            toValue: 0.30,
            duration: 820,
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]),
      ])
    );
    pulseRef.current.start();

    return stopAnimations;
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

  const minTop = insets.top + MARGIN;
  const maxTop = SH - TOOLTIP_H_EST - insets.bottom - MARGIN;
  const minLeft = MARGIN;
  const maxLeft = SW - TOOLTIP_W - MARGIN;

  let tooltipTop = 0;
  let tooltipLeft = 0;
  let arrowLeft: number | null = null;
  let arrowTop: number | null = null;
  let arrowPointing: "down" | "up" | "left" | "right" = "down";

  if (step.placement === "above") {
    const prefTop = ty - TOOLTIP_H_EST - ARROW - 6;
    const aboveOk = prefTop >= minTop;
    tooltipTop = aboveOk ? prefTop : ty + th + ARROW + 6;
    tooltipTop = Math.max(minTop, Math.min(tooltipTop, maxTop));
    tooltipLeft = Math.max(minLeft, Math.min(targetCenterX - TOOLTIP_W / 2, maxLeft));
    const raw = targetCenterX - tooltipLeft - ARROW;
    arrowLeft = Math.max(16, Math.min(raw, TOOLTIP_W - ARROW * 2 - 16));
    arrowPointing = aboveOk ? "down" : "up";
  } else if (step.placement === "below") {
    tooltipTop = Math.max(minTop, Math.min(ty + th + ARROW + 6, maxTop));
    tooltipLeft = Math.max(minLeft, Math.min(targetCenterX - TOOLTIP_W / 2, maxLeft));
    const raw = targetCenterX - tooltipLeft - ARROW;
    arrowLeft = Math.max(16, Math.min(raw, TOOLTIP_W - ARROW * 2 - 16));
    arrowPointing = "up";
  } else if (step.placement === "left") {
    const prefLeft = tx - TOOLTIP_W - ARROW - 6;
    const leftOk = prefLeft >= minLeft;
    tooltipLeft = leftOk ? prefLeft : tx + tw + ARROW + 6;
    tooltipLeft = Math.max(minLeft, Math.min(tooltipLeft, maxLeft));
    tooltipTop = Math.max(minTop, Math.min(targetCenterY - TOOLTIP_H_EST / 2, maxTop));
    const raw = targetCenterY - tooltipTop - ARROW;
    arrowTop = Math.max(16, Math.min(raw, TOOLTIP_H_EST - ARROW * 2 - 16));
    arrowPointing = leftOk ? "right" : "left";
  } else {
    tooltipLeft = Math.max(minLeft, Math.min(tx + tw + ARROW + 6, maxLeft));
    tooltipTop = Math.max(minTop, Math.min(targetCenterY - TOOLTIP_H_EST / 2, maxTop));
    const raw = targetCenterY - tooltipTop - ARROW;
    arrowTop = Math.max(16, Math.min(raw, TOOLTIP_H_EST - ARROW * 2 - 16));
    arrowPointing = "left";
  }

  const spotR = Math.min(tw, th) > 54 ? 16 : th / 2;

  const tooltipBg = isDark ? "rgba(18,22,30,0.82)" : "rgba(255,255,255,0.82)";
  const tooltipBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";

  const arrowBaseColor =
    Platform.OS === "ios"
      ? "transparent"
      : isDark
      ? "#1A2030"
      : "#FFFFFF";

  const arrowStyle = ((): object => {
    const base = { position: "absolute" as const, width: 0, height: 0 };
    if (arrowPointing === "down") {
      return {
        ...base,
        borderLeftWidth: ARROW, borderRightWidth: ARROW, borderTopWidth: ARROW,
        borderLeftColor: "transparent", borderRightColor: "transparent",
        borderTopColor: arrowBaseColor,
        bottom: -ARROW, left: arrowLeft ?? TOOLTIP_W / 2 - ARROW,
      };
    }
    if (arrowPointing === "up") {
      return {
        ...base,
        borderLeftWidth: ARROW, borderRightWidth: ARROW, borderBottomWidth: ARROW,
        borderLeftColor: "transparent", borderRightColor: "transparent",
        borderBottomColor: arrowBaseColor,
        top: -ARROW, left: arrowLeft ?? TOOLTIP_W / 2 - ARROW,
      };
    }
    if (arrowPointing === "right") {
      return {
        ...base,
        borderTopWidth: ARROW, borderBottomWidth: ARROW, borderLeftWidth: ARROW,
        borderTopColor: "transparent", borderBottomColor: "transparent",
        borderLeftColor: arrowBaseColor,
        right: -ARROW, top: arrowTop ?? TOOLTIP_H_EST / 2 - ARROW,
      };
    }
    return {
      ...base,
      borderTopWidth: ARROW, borderBottomWidth: ARROW, borderRightWidth: ARROW,
      borderTopColor: "transparent", borderBottomColor: "transparent",
      borderRightColor: arrowBaseColor,
      left: -ARROW, top: arrowTop ?? TOOLTIP_H_EST / 2 - ARROW,
    };
  })();

  const isLast = stepIndex === totalSteps - 1;

  const TooltipWrapper =
    Platform.OS === "ios"
      ? ({ children }: { children: React.ReactNode }) => (
          <BlurView
            intensity={78}
            tint={isDark ? "dark" : "light"}
            style={[
              styles.tooltip,
              { borderColor: tooltipBorder, overflow: "hidden" },
            ]}
          >
            {children}
          </BlurView>
        )
      : ({ children }: { children: React.ReactNode }) => (
          <View
            style={[
              styles.tooltip,
              {
                backgroundColor: isDark ? "#1A2030" : "#FFFFFF",
                borderColor: tooltipBorder,
              },
            ]}
          >
            {children}
          </View>
        );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dim regions */}
      <View style={[styles.dim, { left: 0, top: 0, right: 0, height: Math.max(0, ty), pointerEvents: "none" } as any]} />
      <View style={[styles.dim, { left: 0, top: ty + th, right: 0, bottom: 0, pointerEvents: "none" } as any]} />
      <View style={[styles.dim, { left: 0, top: ty, width: Math.max(0, tx), height: th, pointerEvents: "none" } as any]} />
      <View style={[styles.dim, { left: tx + tw, top: ty, right: 0, height: th, pointerEvents: "none" } as any]} />

      {/* Spotlight ring */}
      <Animated.View
        style={{
          position: "absolute",
          left: tx, top: ty, width: tw, height: th,
          borderRadius: spotR,
          borderWidth: 2.5,
          borderColor: ACCENT,
          opacity: pulseAlpha,
          transform: [{ scale: pulseScale }],
          shadowColor: ACCENT,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.7,
          shadowRadius: 10,
          pointerEvents: "none",
        } as any}
      />

      {/* Tooltip */}
      <Animated.View
        style={{
          position: "absolute",
          left: tooltipLeft,
          top: tooltipTop,
          width: TOOLTIP_W,
          opacity,
          transform: [{ translateY: slideY }],
        }}
      >
        <TooltipWrapper>
          {/* Arrow */}
          <View style={arrowStyle} />

          {/* Header */}
          <View style={styles.row}>
            <View style={[styles.stepBadge, { backgroundColor: ACCENT + "20" }]}>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        i === stepIndex
                          ? ACCENT
                          : isDark
                          ? "rgba(255,255,255,0.18)"
                          : "rgba(0,0,0,0.15)",
                      width: i === stepIndex ? 14 : 6,
                    },
                  ]}
                />
              ))}
            </View>
            <TouchableOpacity onPress={() => skip()} hitSlop={10}>
              <Text
                style={[
                  styles.skipText,
                  {
                    color: isDark
                      ? "rgba(255,255,255,0.4)"
                      : "rgba(0,0,0,0.4)",
                  },
                ]}
              >
                Skip
              </Text>
            </TouchableOpacity>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>{step.title}</Text>

          {/* Description */}
          <Text style={[styles.desc, { color: colors.textMuted }]}>
            {step.description}
          </Text>

          {/* Hint + Next */}
          <View style={styles.footer}>
            <View style={[styles.hintPill, { backgroundColor: ACCENT + "16" }]}>
              <Ionicons name="finger-print-outline" size={12} color={ACCENT} />
              <Text style={[styles.hintText, { color: ACCENT }]}>{step.hint}</Text>
            </View>
            <TouchableOpacity
              onPress={() => advance()}
              style={[styles.nextBtn, { backgroundColor: ACCENT }]}
              activeOpacity={0.85}
            >
              <Text style={styles.nextBtnText}>{isLast ? "Done" : "Next"}</Text>
              {!isLast && <Ionicons name="arrow-forward" size={12} color="#fff" />}
            </TouchableOpacity>
          </View>
        </TooltipWrapper>
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
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 14,
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
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  dot: {
    height: 6,
    borderRadius: 3,
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
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  hintPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },
  hintText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  nextBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
});
