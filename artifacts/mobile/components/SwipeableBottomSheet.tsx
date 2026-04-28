import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { BlurView } from "expo-blur";

const SCREEN_H = Dimensions.get("window").height;
const CLOSE_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 0.5;

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
  overlayColor,
  useGlass = true,
}: Props) {
  const isIOS = Platform.OS === "ios";

  const mobileBg = backgroundColor ?? (isIOS ? "transparent" : "rgba(18,22,28,0.96)");
  const mobileOverlay = overlayColor ?? "rgba(0,0,0,0.5)";

  const translateY = useRef(new Animated.Value(SCREEN_H)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 11 }).start();
    } else {
      translateY.setValue(SCREEN_H);
    }
  }, [visible]);

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
});
