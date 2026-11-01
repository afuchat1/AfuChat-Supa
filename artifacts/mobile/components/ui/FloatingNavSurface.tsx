import React from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { floatingNavigationShadow, GLASS, glassTokens } from "@/constants/glass";

type FloatingGlassSurfaceProps = {
  children: React.ReactNode;
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function FloatingGlassSurface({
  children,
  fill = true,
  style,
  contentStyle,
  onLayout,
}: FloatingGlassSurfaceProps) {
  const { colors, isDark } = useTheme();
  const glass = glassTokens(isDark);

  return (
    <View
      style={[
        styles.glassSurface,
        {
          backgroundColor: colors.navigationSurface,
          borderColor: colors.navigationBorder,
          ...floatingNavigationShadow(isDark),
        },
        style,
      ]}
    >
      <View style={fill ? styles.glassClip : styles.glassClipAuto}>
        {!isDark && (
          <>
            <BlurView
              intensity={GLASS.blur.light}
              tint="light"
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: glass.fillStrong }]}
            />
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
