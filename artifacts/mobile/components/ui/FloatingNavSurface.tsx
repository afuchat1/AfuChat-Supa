import React from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { floatingNavigationShadow, GLASS, glassTokens } from "@/constants/glass";

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
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const glass = glassTokens(isDark);
  const bottom = bottomOffset ?? Math.max(insets.bottom, 8) + 6;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.positioner, { left: sideInset, right: sideInset, bottom }]}
    >
      <View
        style={[
          styles.shadowSurface,
          {
            height,
            backgroundColor: colors.navigationSurface,
            borderColor: colors.navigationBorder,
            ...floatingNavigationShadow(isDark),
          },
        ]}
      >
        <View style={styles.clip}>
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
            style={styles.content}
          >
            {children}
          </View>
        </View>
      </View>
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
  positioner: {
    position: "absolute",
    zIndex: 100,
    alignItems: "center",
  },
  shadowSurface: {
    width: "100%",
    borderRadius: 999,
    borderWidth: 1,
    overflow: "visible",
  },
  clip: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
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
