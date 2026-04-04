import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { BlurView } from "expo-blur";

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
}

export default function SwipeableBottomSheet({
  visible,
  onClose,
  children,
  backgroundColor,
  maxHeight = "85%",
  overlayColor = "rgba(0,0,0,0.5)",
  useGlass = true,
}: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BP;
  const isIOS = Platform.OS === "ios";

  const resolvedBg = backgroundColor ?? (isIOS ? "transparent" : "rgba(18,22,28,0.96)");

  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (isDesktop) {
      if (visible) {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1, tension: 140, friction: 16, useNativeDriver: true }),
        ]).start();
      } else {
        opacity.setValue(0);
        scale.setValue(0.95);
      }
    } else {
      if (visible) {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 60,
          friction: 11,
        }).start();
      } else {
        translateY.setValue(SCREEN_H);
      }
    }
  }, [visible, isDesktop]);

  function dismissMobile() {
    Animated.timing(translateY, {
      toValue: SCREEN_H,
      duration: 220,
      useNativeDriver: true,
    }).start(() => onClose());
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
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 12,
          }).start();
        }
      },
    })
  ).current;

  if (!visible) return null;

  if (isDesktop) {
    return (
      <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
        <Animated.View style={[styles.desktopOverlay, { opacity, backgroundColor: overlayColor }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <Animated.View
            style={[
              styles.desktopCard,
              { transform: [{ scale }] },
            ]}
          >
            {isIOS && useGlass ? (
              <BlurView intensity={80} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: resolvedBg, borderRadius: 16 }]} />
            )}
            <View style={styles.desktopCardInner}>{children}</View>
          </Animated.View>
        </Animated.View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={dismissMobile}>
      <View style={styles.overlay}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }]} onPress={dismissMobile} />
        <Animated.View
          style={[
            styles.sheet,
            { maxHeight: maxHeight as any, transform: [{ translateY }] },
          ]}
        >
          {isIOS && useGlass ? (
            <BlurView intensity={85} tint="dark" style={[StyleSheet.absoluteFill, styles.blurSheet]} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: resolvedBg, borderTopLeftRadius: 24, borderTopRightRadius: 24 }]} />
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
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  blurSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
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
  handleArea: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
    zIndex: 1,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  sheetContent: {
    zIndex: 1,
  },
  desktopOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  desktopCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "82%",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    ...Platform.select({
      web: { boxShadow: "0 12px 50px rgba(0,0,0,0.36)" } as any,
    }),
  },
  desktopCardInner: {
    zIndex: 1,
  },
});
