import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SPRING = { damping: 20, stiffness: 200, mass: 0.8 };
const MAX_SCALE = 5;
const MIN_SCALE = 1;
const SWIPE_THRESHOLD = 60;

type ZoomableSlideProps = {
  uri: string;
  width: number;
  height: number;
  isActive: boolean;
  onClose: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onScaleChange: (s: number) => void;
};

function ZoomableSlide({
  uri, width, height, isActive, onClose, onSwipeLeft, onSwipeRight, onScaleChange,
}: ZoomableSlideProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const savedOffsetX = useSharedValue(0);
  const savedOffsetY = useSharedValue(0);

  // Pinch gesture start state — saved in onBegin to avoid stale-closure jumps on Android
  const pinchStartScale = useSharedValue(1);
  const pinchStartOffX = useSharedValue(0);
  const pinchStartOffY = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);

  useEffect(() => {
    if (!isActive) {
      scale.value = withSpring(1, SPRING);
      offsetX.value = withSpring(0, SPRING);
      offsetY.value = withSpring(0, SPRING);
      savedScale.value = 1;
      savedOffsetX.value = 0;
      savedOffsetY.value = 0;
    }
  }, [isActive]);

  // Clamp pan offset so image edges can't go past the screen edge
  function clampOffset(val: number, s: number, dim: number) {
    "worklet";
    const maxPan = Math.max(0, (dim * s - dim) / 2);
    return Math.max(-maxPan, Math.min(maxPan, val));
  }

  const pinch = Gesture.Pinch()
    // Save all state at gesture start so onUpdate has a stable baseline.
    // This is critical on Android where gestures restart more aggressively.
    .onBegin((e) => {
      pinchStartScale.value = savedScale.value;
      pinchStartOffX.value = savedOffsetX.value;
      pinchStartOffY.value = savedOffsetY.value;
      // Focal point relative to container center (content-space)
      pinchFocalX.value = e.focalX - width / 2;
      pinchFocalY.value = e.focalY - height / 2;
    })
    .onUpdate((e) => {
      const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStartScale.value * e.scale));
      scale.value = s;

      // Focal-point-aware translation:
      // The screen coordinate under the fingers should remain fixed as scale changes.
      // Formula: newOffset = focalPoint + (startOffset - focalPoint) * (s / startScale)
      const scaleRatio = s / (pinchStartScale.value || 1);
      const fx = pinchFocalX.value;
      const fy = pinchFocalY.value;
      offsetX.value = clampOffset(fx + (pinchStartOffX.value - fx) * scaleRatio, s, width);
      offsetY.value = clampOffset(fy + (pinchStartOffY.value - fy) * scaleRatio, s, height);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1, SPRING);
        offsetX.value = withSpring(0, SPRING);
        offsetY.value = withSpring(0, SPRING);
        savedScale.value = 1;
        savedOffsetX.value = 0;
        savedOffsetY.value = 0;
        runOnJS(onScaleChange)(1);
      } else {
        savedScale.value = scale.value;
        savedOffsetX.value = offsetX.value;
        savedOffsetY.value = offsetY.value;
        runOnJS(onScaleChange)(scale.value);
      }
    });

  const pan = Gesture.Pan()
    .minDistance(4)
    // maxPointers(1) prevents pan from firing during 2-finger pinch on Android
    .maxPointers(1)
    .onUpdate((e) => {
      if (scale.value > 1.01) {
        offsetX.value = clampOffset(savedOffsetX.value + e.translationX, scale.value, width);
        offsetY.value = clampOffset(savedOffsetY.value + e.translationY, scale.value, height);
      }
    })
    .onEnd((e) => {
      if (scale.value <= 1.01) {
        const vx = e.velocityX;
        const tx = e.translationX;
        if (tx < -SWIPE_THRESHOLD || vx < -400) {
          runOnJS(onSwipeLeft)();
        } else if (tx > SWIPE_THRESHOLD || vx > 400) {
          runOnJS(onSwipeRight)();
        }
        offsetX.value = withSpring(0, SPRING);
        offsetY.value = withSpring(0, SPRING);
      } else {
        savedOffsetX.value = offsetX.value;
        savedOffsetY.value = offsetY.value;
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    // 300ms is safer for Android's touch pipeline (vs 250ms which misses on some devices)
    .maxDuration(300)
    .onEnd((e) => {
      if (scale.value > 1.5) {
        scale.value = withSpring(1, SPRING);
        offsetX.value = withSpring(0, SPRING);
        offsetY.value = withSpring(0, SPRING);
        savedScale.value = 1;
        savedOffsetX.value = 0;
        savedOffsetY.value = 0;
        runOnJS(onScaleChange)(1);
      } else {
        const targetScale = 2.5;
        const focalX = e.x - width / 2;
        const focalY = e.y - height / 2;
        const newOffX = clampOffset(-focalX * (targetScale - 1), targetScale, width);
        const newOffY = clampOffset(-focalY * (targetScale - 1), targetScale, height);
        scale.value = withSpring(targetScale, SPRING);
        offsetX.value = withSpring(newOffX, SPRING);
        offsetY.value = withSpring(newOffY, SPRING);
        savedScale.value = targetScale;
        savedOffsetX.value = newOffX;
        savedOffsetY.value = newOffY;
        runOnJS(onScaleChange)(targetScale);
      }
    });

  const singleTap = Gesture.Tap()
    .maxDuration(200)
    // Do NOT add requireExternalGestureToFail here — it's redundant with
    // Gesture.Exclusive below and causes double-tap misfires on Android
    .onEnd(() => {
      if (scale.value <= 1.01) {
        runOnJS(onClose)();
      }
    });

  // Compose gestures:
  // - pinch + pan run simultaneously (two-finger)
  // - double tap takes priority over single tap (Exclusive)
  // - all four can coexist in one GestureDetector (Simultaneous outer)
  const composed = Gesture.Simultaneous(
    Gesture.Simultaneous(pinch, pan),
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: offsetX.value },
      { translateY: offsetY.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.Image
        source={{ uri }}
        style={[{ width, height }, animStyle]}
        resizeMode="contain"
      />
    </GestureDetector>
  );
}

type Props = {
  images: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
};

export function ImageViewer({ images, initialIndex = 0, visible, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);

  const slideX = useSharedValue(0);
  const slideOpacity = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      const safeIndex = Math.min(initialIndex, Math.max(0, images.length - 1));
      setIndex(safeIndex);
      setZoomed(false);
      slideX.value = 0;
      slideOpacity.value = 1;
    }
  }, [visible, initialIndex]);

  const animateSlide = useCallback((dir: "left" | "right", nextIdx: number) => {
    const targetX = dir === "left" ? -width : width;
    slideX.value = withTiming(targetX, { duration: 220 }, () => {
      slideX.value = -targetX;
      runOnJS(setIndex)(nextIdx);
      slideOpacity.value = 0;
      slideX.value = withSpring(0, SPRING);
      slideOpacity.value = withTiming(1, { duration: 200 });
    });
  }, [width]);

  const goLeft = useCallback(() => {
    if (index < images.length - 1) animateSlide("left", index + 1);
  }, [index, images.length, animateSlide]);

  const goRight = useCallback(() => {
    if (index > 0) animateSlide("right", index - 1);
  }, [index, animateSlide]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: slideOpacity.value,
  }));

  if (!visible || images.length === 0) return null;

  const hasMultiple = images.length > 1;
  const imgH = height * 0.88;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
      hardwareAccelerated
    >
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {hasMultiple && (
            <Text style={styles.counter}>{index + 1} / {images.length}</Text>
          )}
          {zoomed && (
            <View style={styles.zoomBadge}>
              <Ionicons name="scan-outline" size={13} color="#fff" />
              <Text style={styles.zoomBadgeText}>Pinch to zoom</Text>
            </View>
          )}
        </View>

        {/* overflow must be "visible" so the zoomed image is not clipped by the container on Android */}
        <Animated.View style={[styles.slideWrap, { width, height: imgH }, slideStyle]}>
          <ZoomableSlide
            key={index}
            uri={images[index]}
            width={width}
            height={imgH}
            isActive={true}
            onClose={onClose}
            onSwipeLeft={goLeft}
            onSwipeRight={goRight}
            onScaleChange={(s) => setZoomed(s > 1.05)}
          />
        </Animated.View>

        {hasMultiple && !zoomed && (
          <>
            <TouchableOpacity
              style={[styles.navBtn, styles.navLeft, { top: insets.top + 60 + imgH / 2 - 24 }]}
              onPress={goRight}
              disabled={index === 0}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={26} color="#fff" style={{ opacity: index === 0 ? 0.25 : 1 }} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navBtn, styles.navRight, { top: insets.top + 60 + imgH / 2 - 24 }]}
              onPress={goLeft}
              disabled={index === images.length - 1}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={26} color="#fff" style={{ opacity: index === images.length - 1 ? 0.25 : 1 }} />
            </TouchableOpacity>
          </>
        )}

        {hasMultiple && (
          <View style={[styles.dots, { bottom: insets.bottom + 24 }]}>
            {images.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => setIndex(i)}>
                <View style={[
                  styles.dot,
                  i === index && styles.dotActive,
                  i === index && { width: 20 },
                ]} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!zoomed && (
          <View style={[styles.hint, { bottom: insets.bottom + (hasMultiple ? 60 : 32) }]}>
            <Text style={styles.hintText}>Double-tap to zoom · Tap to close</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

export function useImageViewer() {
  const [state, setState] = useState<{ visible: boolean; images: string[]; index: number }>({
    visible: false, images: [], index: 0,
  });

  const openViewer = useCallback((images: string[], index = 0) => {
    setState({ visible: true, images, index });
  }, []);

  const closeViewer = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
  }, []);

  return { ...state, openViewer, closeViewer };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center", alignItems: "center",
    marginRight: "auto",
  },
  counter: {
    color: "#fff", fontSize: 15,
    fontFamily: "Inter_500Medium",
    position: "absolute", left: 0, right: 0,
    textAlign: "center",
  },
  zoomBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  zoomBadgeText: {
    color: "#fff", fontSize: 12, fontFamily: "Inter_400Regular",
  },
  slideWrap: {
    justifyContent: "center",
    alignItems: "center",
    // overflow must stay "visible" — "hidden" hard-clips zoomed images on Android
    overflow: "visible",
  },
  navBtn: {
    position: "absolute",
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center", alignItems: "center",
    zIndex: 10,
  },
  navLeft: { left: 12 },
  navRight: { right: 12 },
  dots: {
    position: "absolute",
    flexDirection: "row",
    gap: 6,
    alignSelf: "center",
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    backgroundColor: "#fff",
    borderRadius: 4,
  },
  hint: {
    position: "absolute",
    alignSelf: "center",
  },
  hintText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12, fontFamily: "Inter_400Regular",
  },
});
