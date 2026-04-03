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
}

export default function SwipeableBottomSheet({
  visible,
  onClose,
  children,
  backgroundColor = "#fff",
  maxHeight = "85%",
  overlayColor = "rgba(0,0,0,0.5)",
}: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BP;

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
              { backgroundColor, transform: [{ scale }] },
            ]}
          >
            {children}
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
            { backgroundColor, maxHeight, transform: [{ translateY }] },
          ]}
        >
          <View {...panResponder.panHandlers} style={styles.handleArea}>
            <View style={styles.handle} />
          </View>
          {children}
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
  handleArea: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#C7C7CC",
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
    ...Platform.select({
      web: { boxShadow: "0 8px 40px rgba(0,0,0,0.24)" } as any,
    }),
  },
});
