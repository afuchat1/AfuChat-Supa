/**
 * SmartSheet
 * An advanced expanding bottom sheet that:
 *  - Opens at a partial "peek" height
 *  - Expands to full screen as the user drags up or scrolls content
 *  - Collapses back to peek when dragged down from full height
 *  - Dismisses when dragged down past the peek height threshold
 *  - Animated backdrop fades in/out with sheet height
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { T } from "@/constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Legacy fallback fraction used only before content measurement completes. */
  peekFraction?: number;
  backgroundColor?: string;
  handleColor?: string;
};

export function SmartSheet({
  visible,
  onClose,
  children,
  peekFraction = 0.28,
  backgroundColor,
  handleColor,
}: Props) {
  const { colors, isDark } = useTheme();
  const resolvedBg = backgroundColor ?? colors.surface;
  const resolvedHandle = handleColor ?? (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)");
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const fullH = screenH - insets.top - 16;
  const [contentH, setContentH] = useState(0);
  const contentPeekH = Math.min(
    fullH,
    contentH > 0
      ? Math.max(120, contentH + 48 + insets.bottom)
      : Math.max(160, screenH * peekFraction),
  );

  // Keep fresh values accessible inside the PanResponder closure (created once)
  const peekHRef = useRef(contentPeekH);
  const fullHRef = useRef(fullH);
  peekHRef.current = contentPeekH;
  fullHRef.current = fullH;

  const sheetH = useRef(new Animated.Value(0)).current;

  // isFull state drives ScrollView's scrollEnabled so it re-renders correctly
  const [isFull, setIsFull] = useState(false);
  const isFullRef = useRef(false);

  const scrollYRef = useRef(0);
  const scrollRef = useRef<ScrollViewInstance>(null);

  // ─── Snap functions (stored in refs so PanResponder can always call the latest) ─

  const snapToFullRef = useRef<() => void>(() => {});
  const snapToPeekRef = useRef<() => void>(() => {});
  const dismissRef = useRef<() => void>(() => {});

  snapToFullRef.current = () => {
    isFullRef.current = true;
    setIsFull(true);
    Animated.spring(sheetH, {
      toValue: fullHRef.current,
      ...T.motion.spring.gentle,
      useNativeDriver: false,
    }).start();
  };

  snapToPeekRef.current = () => {
    isFullRef.current = false;
    setIsFull(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    Animated.spring(sheetH, {
      toValue: peekHRef.current,
      ...T.motion.spring.gentle,
      useNativeDriver: false,
    }).start();
  };

  dismissRef.current = () => {
    isFullRef.current = false;
    setIsFull(false);
    Animated.spring(sheetH, {
      toValue: 0,
      ...T.motion.spring.snappy,
      useNativeDriver: false,
    }).start(() => {
      sheetH.setValue(0);
      onClose();
    });
  };

  // ─── Open/close animation ──────────────────────────────────────────────────

  useEffect(() => {
    if (!visible || contentH <= 0) return;
    // Long content has no useful collapsed state: open to the available
    // viewport and let the inner scroll view handle the rest.
    if (contentPeekH >= fullH && !isFullRef.current) {
      isFullRef.current = true;
      setIsFull(true);
    }
    Animated.spring(sheetH, {
      toValue: contentPeekH,
      ...T.motion.spring.gentle,
      useNativeDriver: false,
    }).start();
  }, [contentH, contentPeekH, fullH, visible]);

  useEffect(() => {
    if (visible) {
       isFullRef.current = false;
       setIsFull(false);
       setContentH(0);
      sheetH.setValue(0);
      Animated.spring(sheetH, {
         toValue: peekHRef.current,
        ...T.motion.spring.gentle,
        useNativeDriver: false,
      }).start();
    }
  }, [visible]);

  // ─── PanResponder ─────────────────────────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        const isV =
          Math.abs(gs.dy) > Math.abs(gs.dx) && Math.abs(gs.dy) > 5;
        if (!isV) return false;
        // Peek mode → intercept all vertical drags (prevents content scrolling)
        if (!isFullRef.current) return true;
        // Full mode → only intercept downward drag when scroll is at the very top
        return gs.dy > 8 && scrollYRef.current <= 1;
      },
      onPanResponderMove: (_, gs) => {
        const base = isFullRef.current
          ? fullHRef.current
          : peekHRef.current;
        const next = Math.max(
          peekHRef.current * 0.12,
          Math.min(fullHRef.current, base - gs.dy)
        );
        sheetH.setValue(next);
      },
      onPanResponderRelease: (_, gs) => {
        const base = isFullRef.current
          ? fullHRef.current
          : peekHRef.current;
        const projected = base - gs.dy - gs.vy * 120;
        const mid = (fullHRef.current + peekHRef.current) / 2;

        if (gs.vy > 1.5 || (!isFullRef.current && gs.dy > 100)) {
          // Fast/big downward fling from peek → dismiss
          dismissRef.current();
        } else if (isFullRef.current && (gs.vy > 0.6 || gs.dy > 80)) {
          // Downward from full → collapse to peek
          snapToPeekRef.current();
        } else if (gs.vy < -0.5 || gs.dy < -50) {
          // Upward drag/fling → expand to full
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

  // ─── Scroll-based collapse ─────────────────────────────────────────────────

  const handleScrollEndDrag = useCallback((e: any) => {
    const { contentOffset, velocity } = e.nativeEvent;
    if (contentOffset.y <= 1 && (velocity?.y ?? 0) > 0.4) {
      snapToPeekRef.current();
    }
  }, []);

  // ─── Backdrop opacity tied to sheet height ─────────────────────────────────

  const backdropOpacity = sheetH.interpolate({
    inputRange: [0, screenH * 0.35],
    outputRange: [0, 0.55],
    extrapolate: "clamp",
  });

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => dismissRef.current()}
      statusBarTranslucent
    >
      {/* Tappable backdrop dismisses or collapses */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() =>
          isFullRef.current
            ? snapToPeekRef.current()
            : dismissRef.current()
        }
      />

      {/* Dimming overlay (pointer-events: none so backdrop Pressable works) */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: "rgba(0,0,0,0.72)",
            opacity: backdropOpacity,
            pointerEvents: "none",
          } as any,
        ]}
      />

      {/* The sheet itself — panHandlers on the whole view */}
      <Animated.View
        style={[styles.sheet, { height: sheetH, backgroundColor: resolvedBg, paddingBottom: insets.bottom }]}
        {...panResponder.panHandlers}
      >
        {/* Drag handle indicator */}
        <View style={styles.handleBar}>
          <View style={[styles.handle, { backgroundColor: resolvedHandle }]} />
        </View>

        {/* Scrollable content area */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 0, paddingBottom: 8 }}
            scrollEnabled={isFull}
            bounces={false}
            showsVerticalScrollIndicator={false}
            onScroll={(e) => {
              scrollYRef.current = e.nativeEvent.contentOffset.y;
            }}
            onScrollEndDrag={handleScrollEndDrag}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            onContentSizeChange={(_, height) => {
              if (height > 0) setContentH(height);
            }}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: T.radius.xl,
    borderTopRightRadius: T.radius.xl,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 -8px 32px rgba(0,0,0,0.24)",
      } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.22,
        shadowRadius: 18,
        elevation: 20,
      },
    }),
  },
  handleBar: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
});
