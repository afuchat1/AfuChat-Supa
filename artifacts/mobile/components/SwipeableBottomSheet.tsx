import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "@/hooks/useTheme";

const SCREEN_H = Dimensions.get("window").height;
const CLOSE_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 0.5;
const DESKTOP_BP = 960;

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  backgroundColor?: string;
  maxHeight?: string | number;
  overlayColor?: string;
  useGlass?: boolean;
  /** Desktop-only: card width preset. Defaults to "md" (560px). */
  desktopSize?: "sm" | "md" | "lg" | "xl";
}

const DESKTOP_SIZE_MAP: Record<NonNullable<Props["desktopSize"]>, number> = {
  sm: 420,
  md: 560,
  lg: 720,
  xl: 960,
};

export default function SwipeableBottomSheet({
  visible,
  onClose,
  children,
  backgroundColor,
  maxHeight = "85%",
  overlayColor,
  useGlass = true,
  desktopSize = "md",
}: Props) {
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BP;
  const isIOS = Platform.OS === "ios";

  // Desktop colors are theme-aware (the previous version was hardcoded dark).
  const desktopBg =
    backgroundColor ?? (isDark ? "#13181F" : "#FFFFFF");
  const desktopBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(15,20,30,0.12)";
  const desktopOverlay =
    overlayColor ?? (isDark ? "rgba(2,5,10,0.62)" : "rgba(15,20,30,0.42)");

  // Mobile colors keep the current dark sheet by default.
  const mobileBg = backgroundColor ?? (isIOS ? "transparent" : "rgba(18,22,28,0.96)");
  const mobileOverlay = overlayColor ?? "rgba(0,0,0,0.5)";

  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const desktopTranslate = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    if (isDesktop) {
      if (visible) {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 180,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(scale, { toValue: 1, tension: 200, friction: 20, useNativeDriver: true }),
          Animated.spring(desktopTranslate, { toValue: 0, tension: 200, friction: 20, useNativeDriver: true }),
        ]).start();
      } else {
        opacity.setValue(0);
        scale.setValue(0.96);
        desktopTranslate.setValue(8);
      }
    } else {
      if (visible) {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 11 }).start();
      } else {
        translateY.setValue(SCREEN_H);
      }
    }
  }, [visible, isDesktop]);

  // ESC closes on desktop
  useEffect(() => {
    if (!isDesktop || !visible || Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, visible, onClose]);

  function dismissMobile() {
    Animated.timing(translateY, { toValue: SCREEN_H, duration: 220, useNativeDriver: true }).start(() => onClose());
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_THRESHOLD || g.vy > VELOCITY_THRESHOLD) {
          dismissMobile();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
        }
      },
    }),
  ).current;

  if (!visible) return null;

  if (isDesktop) {
    const cardWidth = DESKTOP_SIZE_MAP[desktopSize];
    // Right-docked side panel, no backdrop, doesn't cover the page content.
    return (
      <View
        // @ts-ignore — web-only fixed positioning
        style={{
          position: "fixed" as any,
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: cardWidth,
          zIndex: 1000,
          backgroundColor: desktopBg,
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderLeftColor: desktopBorder,
          boxShadow: "-12px 0 32px rgba(0,0,0,0.18)" as any,
          display: "flex" as any,
          flexDirection: "column",
        }}
      >
        <View style={[styles.desktopCardInner, { flex: 1 }]}>{children}</View>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={dismissMobile}>
      <View style={styles.overlay}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: mobileOverlay }]} onPress={dismissMobile} />
        <Animated.View
          style={[
            styles.sheet,
            { maxHeight: maxHeight as any, transform: [{ translateY }] },
          ]}
        >
          {isIOS && useGlass ? (
            <BlurView intensity={85} tint="dark" style={[StyleSheet.absoluteFill, styles.blurSheet]} />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: mobileBg,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                },
              ]}
            />
          )}
          <View style={styles.sheetBorder} pointerEvents="none" />
          <View {...panResponder.panHandlers} style={styles.handleArea}>
            <View style={styles.handle} />
          </View>
          <View style={styles.sheetContent}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" },
  blurSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
  },
  handleArea: { alignItems: "center", paddingTop: 12, paddingBottom: 4, zIndex: 1 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.20)" },
  sheetContent: { zIndex: 1 },

  desktopOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  desktopCard: {
    maxHeight: "86%",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  desktopCardInner: { zIndex: 1, flexShrink: 1 },
});
