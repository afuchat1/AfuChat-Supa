import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
  type ViewProps,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { floatingNavigationShadow, GLASS, glassTokens } from "@/constants/glass";
import { T } from "@/constants/theme";

type FloatingGlassSurfaceProps = Omit<ViewProps, "children" | "style" | "onLayout"> & {
  children?: React.ReactNode;
  fill?: boolean;
  variant?: "navigation" | "input";
  cornerRadius?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  onLayout?: ViewProps["onLayout"];
};

export function FloatingGlassSurface({
  children,
  fill = true,
  variant = "navigation",
  cornerRadius,
  style,
  contentStyle,
  onLayout,
  ...viewProps
}: FloatingGlassSurfaceProps) {
  const { colors, isDark } = useTheme();
  const glass = glassTokens(isDark);
  const surfaceBackground =
    variant === "input"
      ? isDark
        ? "rgba(255,255,255,0.12)"
        : colors.inputBg
      : colors.navigationSurface;
  const surfaceBorder =
    variant === "input"
      ? isDark
        ? "rgba(255,255,255,0.22)"
        : colors.border
      : colors.navigationBorder;

  return (
    <View
      {...viewProps}
      style={[
        styles.glassSurface,
        style,
        cornerRadius !== undefined ? { borderRadius: cornerRadius } : undefined,
        {
          backgroundColor: surfaceBackground,
          borderColor: surfaceBorder,
          borderWidth: variant === "input" ? StyleSheet.hairlineWidth : 1,
          ...floatingNavigationShadow(isDark),
        },
      ]}
    >
      <View
        style={[
          fill ? styles.glassClip : styles.glassClipAuto,
          cornerRadius !== undefined ? { borderRadius: cornerRadius } : undefined,
        ]}
      >
        {(variant === "input" || !isDark) && (
          <>
            <BlurView
              intensity={GLASS.blur.light}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {!(variant === "input" && isDark) && (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { backgroundColor: glass.fillStrong }]}
              />
            )}
          </>
        )}
        <View
          onLayout={onLayout}
          pointerEvents="box-none"
          style={[
            fill ? styles.glassContent : styles.glassContentAuto,
            contentStyle,
          ]}
        >
          {children}
        </View>
      </View>
    </View>
  );
}

type Props = {
  children: React.ReactNode;
  height?: number;
  bottomOffset?: number;
  sideInset?: number;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function FloatingNavSurface({
  children,
  height = 56,
  bottomOffset,
  sideInset = 20,
  onLayout,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottom = bottomOffset ?? Math.max(insets.bottom, 8) + 6;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.positioner, { left: sideInset, right: sideInset, bottom }]}
    >
      <FloatingGlassSurface
        style={{ height, width: "100%" }}
        onLayout={onLayout}
        contentStyle={styles.content}
      >
        {children}
      </FloatingGlassSurface>
    </View>
  );
}

type FloatingNavIndicatorProps = {
  itemCount: number;
  selectedIndex: number;
  barWidth: number;
};

export function FloatingNavIndicator({
  itemCount,
  selectedIndex,
  barWidth,
}: FloatingNavIndicatorProps) {
  const { colors, isDark } = useTheme();
  const activeIndexAnim = useRef(new Animated.Value(selectedIndex)).current;
  const itemWidth = itemCount > 0 ? Math.max(0, (barWidth - 12) / itemCount) : 0;
  const activeTranslateX = itemCount > 1
    ? activeIndexAnim.interpolate({
        inputRange: Array.from({ length: itemCount }, (_, index) => index),
        outputRange: Array.from({ length: itemCount }, (_, index) => index * itemWidth),
        extrapolate: "clamp",
      })
    : 0;

  useEffect(() => {
    Animated.spring(activeIndexAnim, {
      toValue: selectedIndex,
      ...T.motion.spring.snappy,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [activeIndexAnim, selectedIndex]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        floatingNavigationStyles.activeHighlight,
        {
          width: itemWidth,
          backgroundColor: colors.navigationActive + (isDark ? "34" : "1C"),
          transform: [{ translateX: activeTranslateX }],
        },
      ]}
    />
  );
}

export const floatingNavigationStyles = StyleSheet.create({
  activeHighlight: {
    position: "absolute",
    left: 6,
    top: 5,
    bottom: 5,
    borderRadius: 999,
  },
  item: {
    flex: 1,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 0,
    zIndex: 1,
  },
  iconWrap: {
    width: 44,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  label: {
    width: "100%",
    fontSize: 10,
    lineHeight: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    letterSpacing: 0,
    marginTop: 1,
    textAlign: "center",
    includeFontPadding: false,
  },
});

const styles = StyleSheet.create({
  glassSurface: {
    borderRadius: 999,
    borderWidth: 1,
    overflow: "visible",
  },
  glassClip: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
  },
  glassClipAuto: {
    width: "100%",
    borderRadius: 999,
    overflow: "hidden",
  },
  glassContent: {
    flex: 1,
    width: "100%",
  },
  glassContentAuto: {
    width: "100%",
  },
  positioner: {
    position: "absolute",
    zIndex: 100,
    alignItems: "center",
  },
  content: {
    flex: 1,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    position: "relative",
  },
});
