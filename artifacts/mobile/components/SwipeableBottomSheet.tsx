/**
 * SwipeableBottomSheet
 *
 * Mobile (native):
 *   • Opens at a configurable peek height (default ~62% of screen)
 *   • Drag UP  → snaps to full screen
 *   • Drag DOWN from full (when scroll is at top) → collapses back to peek
 *   • Drag DOWN from peek / fast fling → dismisses
 *   • Content is inside a ScrollView; scrolling is enabled only when fully expanded
 *
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  backgroundColor?: string;
  /**
   * Maximum collapsed height as a percentage string ("72%", "85%") or pixels.
   * The sheet now opens at measured content height and uses this value only as
   * a cap for unusually tall content. When fully expanded it fills the screen
   * minus the status-bar inset.
   */
  maxHeight?: string | number;
  overlayColor?: string;
}

export default function SwipeableBottomSheet({
  visible,
  onClose,
  children,
  backgroundColor,
  maxHeight = "92%",
  overlayColor,
}: Props) {
  return (
    <MobileSheet
      visible={visible}
      onClose={onClose}
      backgroundColor={backgroundColor}
      maxHeight={maxHeight}
      overlayColor={overlayColor}
    >
      {children}
    </MobileSheet>
  );
}

// ─── Mobile implementation (own component so hooks are unconditional) ──────────

type MobileProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  backgroundColor?: string;
  maxHeight?: string | number;
  overlayColor?: string;
};

function MobileSheet({ visible, onClose, children, backgroundColor, maxHeight = "62%", overlayColor }: MobileProps) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const mobileBg = backgroundColor ?? colors.surface;
  const mobileOverlay = overlayColor ?? "rgba(0,0,0,0.5)";

  // Resolve the maximum collapsed height from maxHeight. The actual opening
  // height is calculated from content once the ScrollView reports its size.
  function resolveMaxH(sh: number): number {
    if (typeof maxHeight === "string" && maxHeight.endsWith("%")) {
      const pct = parseFloat(maxHeight) / 100;
      return sh * Math.min(Math.max(pct, 0.3), 0.92);
    }
    if (typeof maxHeight === "number") return Math.min(maxHeight, sh * 0.92);
    return sh * 0.92;
  }

  const fullH = screenH - insets.top - 16;
  const [contentH, setContentH] = useState(0);
  const maxCollapsedH = resolveMaxH(screenH);
  const contentPeekH = Math.min(
    fullH,
    maxCollapsedH,
    contentH > 0 ? Math.max(120, contentH + 44 + insets.bottom) : Math.max(160, screenH * 0.28),
  );

  // Keep fresh values inside PanResponder closure
  const peekHRef = useRef(contentPeekH);
  const fullHRef = useRef(fullH);
  peekHRef.current = contentPeekH;
  fullHRef.current = fullH;

  const sheetH = useRef(new Animated.Value(0)).current;
  const [isFull, setIsFull] = useState(false);
  const isFullRef = useRef(false);
  const scrollYRef = useRef(0);
  const scrollRef = useRef<ScrollViewInstance>(null);

  // ── Snap helpers (in refs so PanResponder always calls the latest) ────────
  const snapToFullRef = useRef<() => void>(() => {});
  const snapToPeekRef = useRef<() => void>(() => {});
  const dismissRef = useRef<() => void>(() => {});

  snapToFullRef.current = () => {
    isFullRef.current = true;
    setIsFull(true);
    Animated.timing(sheetH, { toValue: fullHRef.current, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  };

  snapToPeekRef.current = () => {
    isFullRef.current = false;
    setIsFull(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    Animated.timing(sheetH, { toValue: peekHRef.current, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  };

  dismissRef.current = () => {
    isFullRef.current = false;
    setIsFull(false);
    Animated.timing(sheetH, { toValue: 0, duration: 220, useNativeDriver: false }).start(() => {
      sheetH.setValue(0);
      onClose();
    });
  };

  // ── Open/close animation ──────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || contentH <= 0) return;
    if (contentPeekH >= fullH && !isFullRef.current) {
      isFullRef.current = true;
      setIsFull(true);
    }
    Animated.timing(sheetH, {
      toValue: contentPeekH,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [contentH, contentPeekH, fullH, visible]);

  useEffect(() => {
    if (visible) {
      isFullRef.current = false;
      setIsFull(false);
      setContentH(0);
      sheetH.setValue(0);
      Animated.timing(sheetH, { toValue: peekHRef.current, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }
  }, [visible]);

  // ── PanResponder ──────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        const isV = Math.abs(gs.dy) > Math.abs(gs.dx) && Math.abs(gs.dy) > 5;
        if (!isV) return false;
        if (!isFullRef.current) return true;
        // Full mode: only intercept downward drag when scroll is at the very top
        return gs.dy > 8 && scrollYRef.current <= 1;
      },
      onPanResponderMove: (_, gs) => {
        const base = isFullRef.current ? fullHRef.current : peekHRef.current;
        const next = Math.max(peekHRef.current * 0.12, Math.min(fullHRef.current, base - gs.dy));
        sheetH.setValue(next);
      },
      onPanResponderRelease: (_, gs) => {
        const base = isFullRef.current ? fullHRef.current : peekHRef.current;
        const projected = base - gs.dy - gs.vy * 120;
        const mid = (fullHRef.current + peekHRef.current) / 2;

        if (gs.vy > 1.5 || (!isFullRef.current && gs.dy > 100)) {
          dismissRef.current();
        } else if (isFullRef.current && (gs.vy > 0.6 || gs.dy > 80)) {
          snapToPeekRef.current();
        } else if (gs.vy < -0.5 || gs.dy < -50) {
          snapToFullRef.current();
        } else if (projected >= mid) {
          snapToFullRef.current();
        } else if (projected >= peekHRef.current * 0.4) {
          snapToPeekRef.current();
        } else {
          dismissRef.current();
        }
      },
    })
  ).current;

  // ── Scroll-based collapse ─────────────────────────────────────────────────
  const handleScrollEndDrag = useCallback((e: any) => {
    const { contentOffset, velocity } = e.nativeEvent;
    if (contentOffset.y <= 1 && (velocity?.y ?? 0) > 0.4) {
      snapToPeekRef.current();
    }
  }, []);

  // ── Backdrop opacity ──────────────────────────────────────────────────────
  const backdropOpacity = sheetH.interpolate({
    inputRange: [0, screenH * 0.3],
    outputRange: [0, 0.55],
    extrapolate: "clamp",
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={() => dismissRef.current()} statusBarTranslucent>
      {/* Tappable backdrop */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => isFullRef.current ? snapToPeekRef.current() : dismissRef.current()}
      />

      {/* Dimming overlay */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: mobileOverlay, opacity: backdropOpacity, pointerEvents: "none" } as any]}
      />

      {/* Sheet */}
      <Animated.View
        style={[ms.sheet, { height: sheetH, backgroundColor: mobileBg, paddingBottom: insets.bottom }]}
        {...panResponder.panHandlers}
      >
        {/* Subtle top border glow */}
        <View style={[ms.sheetBorder, { pointerEvents: "none" } as any]} />

        {/* Drag handle */}
        <View style={ms.handleArea}>
          <View style={ms.handle} />
        </View>

        {/* Scrollable content */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 0, paddingBottom: 8 }}
          scrollEnabled={isFull}
          bounces={false}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
          onScrollEndDrag={handleScrollEndDrag}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={(_, height) => {
            if (height > 0) setContentH(height);
          }}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const ms = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 -6px 18px rgba(0,0,0,0.22)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.22, shadowRadius: 18, elevation: 20 },
    }),
  },
  sheetBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderTopWidth: 0.5,
    borderColor: "rgba(255,255,255,0.10)",
  },
  handleArea: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.20)" },
});
