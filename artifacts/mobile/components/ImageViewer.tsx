import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

// ─────────────────────────────────────────────────────────────────────────────
// Lazy-load Reanimated + GestureHandler with a try-catch IIFE.
//
// On certain Android Expo Go builds the native worklet runtime throws a Java
// NullPointerException during module initialisation — BEFORE any React code
// runs. A static `import` at the top of this file would propagate that crash
// to the module itself, making ALL exports (including `useImageViewer`) become
// undefined. The lazy IIFE approach catches the native error and falls back to
// a plain (non-animated) image viewer instead.
// ─────────────────────────────────────────────────────────────────────────────

const _RA: typeof import("react-native-reanimated") | null = (() => {
  try {
    const Constants = require("expo-constants").default;
    if (Constants?.appOwnership === "expo" || Constants?.executionEnvironment === "storeClient") {
      return null;
    }
    const m = require("react-native-reanimated");
    if (m && typeof m.useSharedValue === "function") return m;
  } catch {}
  return null;
})();

const _GH: typeof import("react-native-gesture-handler") | null = (() => {
  try {
    return require("react-native-gesture-handler");
  } catch {}
  return null;
})();

const RA_AVAILABLE = _RA !== null && _GH !== null;

// ─── Constants ───────────────────────────────────────────────────────────────

// Snappy spring for zoom transforms — fast, almost no wobble
const ZOOM_SPRING  = { damping: 16, stiffness: 320, mass: 0.55 };
// Softer spring for pan settle and overlay slide
const PAN_SPRING   = { damping: 22, stiffness: 230, mass: 0.75 };
// Rubber-band resistance factor when exceeding MAX_SCALE
const RUBBER_BAND  = 0.18;
const MAX_SCALE    = 7;
const MIN_SCALE    = 1;
const SWIPE_THRESHOLD = 60;
// Overlay fade duration (ms)
const OVERLAY_FADE = 170;

// ─── Types ───────────────────────────────────────────────────────────────────

type ZoomSlideProps = {
  uri: string;
  width: number;
  height: number;
  isActive: boolean;
  onClose: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onScaleChange: (s: number) => void;
  /** Called on a single tap when not zoomed — used to toggle overlay. */
  onSingleTap: () => void;
};

/** Post metadata passed to the viewer from the feed or detail page. */
export type PostViewerMeta = {
  postId: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string | null;
  isVerified?: boolean;
  isOrgVerified?: boolean;
  likeCount: number;
  replyCount: number;
  viewCount: number;
  bookmarked: boolean;
  liked: boolean;
  isFollowing?: boolean;
  // Callbacks so the viewer can mutate feed state in-place
  onToggleLike?: () => void;
  onToggleBookmark?: () => void;
  onToggleFollow?: () => void;
};

// ─── Animated slide (uses Reanimated + GestureHandler) ───────────────────────

function AnimatedZoomSlide({
  uri, width, height, isActive, onClose, onSwipeLeft, onSwipeRight, onScaleChange, onSingleTap,
}: ZoomSlideProps) {
  const {
    useSharedValue, useAnimatedStyle, withSpring, withTiming, withDecay, runOnJS,
    default: AnimatedRN,
  } = _RA!;
  const { Gesture, GestureDetector } = _GH!;

  const scale          = useSharedValue(1);
  const savedScale     = useSharedValue(1);
  const offsetX        = useSharedValue(0);
  const offsetY        = useSharedValue(0);
  const savedOffsetX   = useSharedValue(0);
  const savedOffsetY   = useSharedValue(0);

  const pinchStartScale = useSharedValue(1);
  const pinchStartOffX  = useSharedValue(0);
  const pinchStartOffY  = useSharedValue(0);
  const pinchFocalX     = useSharedValue(0);
  const pinchFocalY     = useSharedValue(0);

  // Snapshot of offsetX/Y at the START of each pan gesture — always reflects the
  // actual animated position, not the pre-decay savedOffset (which goes stale
  // when withDecay animation is still running when the next drag begins).
  const panStartOffX = useSharedValue(0);
  const panStartOffY = useSharedValue(0);

  useEffect(() => {
    if (!isActive) {
      scale.value      = withSpring(1, ZOOM_SPRING);
      offsetX.value    = withSpring(0, ZOOM_SPRING);
      offsetY.value    = withSpring(0, ZOOM_SPRING);
      savedScale.value = 1;
      savedOffsetX.value = 0;
      savedOffsetY.value = 0;
    }
  }, [isActive]);

  function clampOffset(val: number, s: number, dim: number) {
    "worklet";
    const maxPan = Math.max(0, (dim * s - dim) / 2);
    return Math.max(-maxPan, Math.min(maxPan, val));
  }

  // Rubber-band scale when approaching limits — feels physical
  function rubberScale(raw: number): number {
    "worklet";
    if (raw > MAX_SCALE) {
      return MAX_SCALE + (raw - MAX_SCALE) * RUBBER_BAND;
    }
    if (raw < MIN_SCALE) {
      return MIN_SCALE - (MIN_SCALE - raw) * RUBBER_BAND;
    }
    return raw;
  }

  const pinch = Gesture.Pinch()
    .onBegin((e: any) => {
      "worklet";
      pinchStartScale.value = savedScale.value;
      pinchStartOffX.value  = savedOffsetX.value;
      pinchStartOffY.value  = savedOffsetY.value;
      pinchFocalX.value     = e.focalX - width / 2;
      pinchFocalY.value     = e.focalY - height / 2;
    })
    .onUpdate((e: any) => {
      "worklet";
      const raw = pinchStartScale.value * e.scale;
      const s   = rubberScale(raw);
      scale.value = s;

      // Keep focal point anchored — the point under your fingers stays still
      const clampedS   = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
      const scaleRatio = clampedS / (pinchStartScale.value || 1);
      const fx = pinchFocalX.value;
      const fy = pinchFocalY.value;
      offsetX.value = clampOffset(fx + (pinchStartOffX.value - fx) * scaleRatio, clampedS, width);
      offsetY.value = clampOffset(fy + (pinchStartOffY.value - fy) * scaleRatio, clampedS, height);
    })
    .onEnd(() => {
      "worklet";
      if (scale.value < 1) {
        // Snap back to 1× with a bouncy spring
        scale.value   = withSpring(1, ZOOM_SPRING);
        offsetX.value = withSpring(0, ZOOM_SPRING);
        offsetY.value = withSpring(0, ZOOM_SPRING);
        savedScale.value   = 1;
        savedOffsetX.value = 0;
        savedOffsetY.value = 0;
        runOnJS(onScaleChange)(1);
      } else if (scale.value > MAX_SCALE) {
        // Snap back to hard ceiling
        const clamped = MAX_SCALE;
        const cx = clampOffset(offsetX.value, clamped, width);
        const cy = clampOffset(offsetY.value, clamped, height);
        scale.value   = withSpring(clamped, ZOOM_SPRING);
        offsetX.value = withSpring(cx, ZOOM_SPRING);
        offsetY.value = withSpring(cy, ZOOM_SPRING);
        savedScale.value   = clamped;
        savedOffsetX.value = cx;
        savedOffsetY.value = cy;
        runOnJS(onScaleChange)(clamped);
      } else {
        savedScale.value   = scale.value;
        savedOffsetX.value = clampOffset(offsetX.value, scale.value, width);
        savedOffsetY.value = clampOffset(offsetY.value, scale.value, height);
        offsetX.value = savedOffsetX.value;
        offsetY.value = savedOffsetY.value;
        runOnJS(onScaleChange)(scale.value);
      }
    });

  const pan = Gesture.Pan()
    .minDistance(3)
    .maxPointers(1)
    .onBegin(() => {
      "worklet";
      // Always snapshot the current animated position at gesture start.
      // This is the correct baseline even when a previous decay/spring is
      // still in flight — offsetX/Y always hold the real current position.
      panStartOffX.value = offsetX.value;
      panStartOffY.value = offsetY.value;
    })
    .onUpdate((e: any) => {
      "worklet";
      if (scale.value > 1.01) {
        offsetX.value = clampOffset(panStartOffX.value + e.translationX, scale.value, width);
        offsetY.value = clampOffset(panStartOffY.value + e.translationY, scale.value, height);
      }
    })
    .onEnd((e: any) => {
      "worklet";
      if (scale.value <= 1.01) {
        const vx = e.velocityX, tx = e.translationX;
        if      (tx < -SWIPE_THRESHOLD || vx < -400) runOnJS(onSwipeLeft)();
        else if (tx >  SWIPE_THRESHOLD || vx >  400) runOnJS(onSwipeRight)();
        offsetX.value = withSpring(0, PAN_SPRING);
        offsetY.value = withSpring(0, PAN_SPRING);
      } else {
        const maxPanX = Math.max(0, (width  * scale.value - width)  / 2);
        const maxPanY = Math.max(0, (height * scale.value - height) / 2);
        const releaseX = Math.max(-maxPanX, Math.min(maxPanX, panStartOffX.value + e.translationX));
        const releaseY = Math.max(-maxPanY, Math.min(maxPanY, panStartOffY.value + e.translationY));

        if (withDecay && (Math.abs(e.velocityX) > 200 || Math.abs(e.velocityY) > 200)) {
          // Decay animation: clamp handles the boundary.
          // savedOffset* are intentionally NOT updated here — panStartOff* will
          // snapshot the live offsetX/Y value at the next gesture begin, so
          // no stale baseline is ever used regardless of where decay settles.
          offsetX.value = withDecay({ velocity: e.velocityX, clamp: [-maxPanX, maxPanX] });
          offsetY.value = withDecay({ velocity: e.velocityY, clamp: [-maxPanY, maxPanY] });
        } else {
          offsetX.value = withSpring(releaseX, { ...PAN_SPRING, velocity: e.velocityX });
          offsetY.value = withSpring(releaseY, { ...PAN_SPRING, velocity: e.velocityY });
        }
        // Keep savedOffset* in sync for pinch start (which still reads them)
        savedOffsetX.value = releaseX;
        savedOffsetY.value = releaseY;
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd((e: any) => {
      "worklet";
      if (scale.value > 1.5) {
        // Double-tap when zoomed → snap back to 1×
        scale.value   = withSpring(1, ZOOM_SPRING);
        offsetX.value = withSpring(0, ZOOM_SPRING);
        offsetY.value = withSpring(0, ZOOM_SPRING);
        savedScale.value = 1; savedOffsetX.value = 0; savedOffsetY.value = 0;
        runOnJS(onScaleChange)(1);
      } else {
        // Double-tap at 1× → zoom into the tapped spot at 3×
        const targetScale = 3;
        const fx = e.x - width  / 2;
        const fy = e.y - height / 2;
        // The focal point should remain fixed: offset = -focal * (scale - 1)
        const newOffX = clampOffset(-fx * (targetScale - 1), targetScale, width);
        const newOffY = clampOffset(-fy * (targetScale - 1), targetScale, height);
        scale.value   = withSpring(targetScale, ZOOM_SPRING);
        offsetX.value = withSpring(newOffX, ZOOM_SPRING);
        offsetY.value = withSpring(newOffY, ZOOM_SPRING);
        savedScale.value   = targetScale;
        savedOffsetX.value = newOffX;
        savedOffsetY.value = newOffY;
        runOnJS(onScaleChange)(targetScale);
      }
    });

  // Single tap: toggle overlay visibility (not close)
  const singleTap = Gesture.Tap()
    .maxDuration(200)
    .onEnd(() => {
      "worklet";
      if (scale.value <= 1.01) runOnJS(onSingleTap)();
    });

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
      <AnimatedRN.Image source={{ uri }} style={[{ width, height }, animStyle]} resizeMode="contain" />
    </GestureDetector>
  );
}

// ─── Simple slide fallback (pinch + double-tap zoom via PanResponder) ─────────

function SimpleZoomSlide({ uri, width, height, onSwipeLeft, onSwipeRight, onScaleChange, onSingleTap }: ZoomSlideProps) {
  const scale  = useRef(new Animated.Value(1)).current;
  const transX = useRef(new Animated.Value(0)).current;
  const transY = useRef(new Animated.Value(0)).current;

  // Committed translation — the stable position at the END of each gesture.
  // Used as the baseline for the NEXT gesture so moves don't jump.
  const commitX = useRef(0);
  const commitY = useRef(0);
  // Live translation written on every pan move event (used to commit on release).
  const liveX   = useRef(0);
  const liveY   = useRef(0);
  // Current scale value kept in sync with the Animated.Value.
  const scaleVal = useRef(1);

  // Pinch — reset on every new 2-finger phase.
  const pinchInitDist  = useRef(1);
  const pinchInitScale = useRef(1);

  // Pan — reset on every new 1-finger phase.
  const panTouchX = useRef(0);  // touch X when 1-finger phase started
  const panTouchY = useRef(0);

  // Gesture state.
  const nTouches      = useRef(0);   // current live touch count
  const hadMultiTouch = useRef(false); // any 2-finger contact in this gesture?

  const lastTap  = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clamp(val: number, s: number, dim: number) {
    const max = Math.max(0, (dim * s - dim) / 2);
    return Math.max(-max, Math.min(max, val));
  }

  function pinchDist(t: any[]) {
    const dx = t[0].pageX - t[1].pageX, dy = t[0].pageY - t[1].pageY;
    return Math.sqrt(dx * dx + dy * dy) || 1;
  }

  function springReset() {
    commitX.current = 0; commitY.current = 0;
    liveX.current   = 0; liveY.current   = 0;
    scaleVal.current = 1;
    Animated.spring(scale,  { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 3 }).start();
    Animated.spring(transX, { toValue: 0, useNativeDriver: true, speed: 40, bounciness: 3 }).start();
    Animated.spring(transY, { toValue: 0, useNativeDriver: true, speed: 40, bounciness: 3 }).start();
    onScaleChange(1);
  }

  function zoomTo(target: number, fx = 0, fy = 0) {
    const ox = clamp(-fx * (target - 1), target, width);
    const oy = clamp(-fy * (target - 1), target, height);
    commitX.current = ox; commitY.current = oy;
    liveX.current   = ox; liveY.current   = oy;
    scaleVal.current = target;
    Animated.spring(scale,  { toValue: target, useNativeDriver: true, speed: 40, bounciness: 3 }).start();
    Animated.spring(transX, { toValue: ox,     useNativeDriver: true, speed: 40, bounciness: 3 }).start();
    Animated.spring(transY, { toValue: oy,     useNativeDriver: true, speed: 40, bounciness: 3 }).start();
    onScaleChange(target);
  }

  const pr = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    // Always claim move events so we receive every touch-move regardless of
    // whether another responder is trying to take over.
    onMoveShouldSetPanResponder:  () => true,

    onPanResponderGrant: (e) => {
      const t = e.nativeEvent.touches;
      nTouches.current      = t.length;
      hadMultiTouch.current = t.length >= 2;

      if (t.length >= 2) {
        // Two fingers already down at grant time.
        pinchInitDist.current  = pinchDist(t);
        pinchInitScale.current = scaleVal.current;
      } else {
        // Single touch — initialise pan baseline from committed position.
        panTouchX.current = t[0]?.pageX ?? 0;
        panTouchY.current = t[0]?.pageY ?? 0;
        liveX.current = commitX.current;
        liveY.current = commitY.current;
      }
    },

    onPanResponderMove: (e) => {
      // NOTE: intentionally ignoring the `g` argument — g.dx/g.dy track only
      // the PRIMARY touch and accumulate from gesture start, making them
      // unusable once a second finger has joined or left.
      const t    = e.nativeEvent.touches;
      const prev = nTouches.current;
      nTouches.current = t.length;

      if (t.length >= 2) {
        hadMultiTouch.current = true;

        if (prev < 2) {
          // Second finger just appeared — reinitialise pinch from scratch.
          pinchInitDist.current  = pinchDist(t);
          pinchInitScale.current = scaleVal.current;
          // Anchor committed translation so the image doesn't jump.
          commitX.current = liveX.current;
          commitY.current = liveY.current;
        }

        const s = Math.max(1, Math.min(MAX_SCALE,
          pinchInitScale.current * pinchDist(t) / pinchInitDist.current));
        scaleVal.current = s;
        scale.setValue(s);
        onScaleChange(s);

      } else if (t.length === 1) {

        if (prev >= 2) {
          // One finger lifted — transition from pinch to single-touch pan.
          // Re-baseline so the pan starts from exactly where the image sits.
          panTouchX.current = t[0].pageX;
          panTouchY.current = t[0].pageY;
          commitX.current   = liveX.current;
          commitY.current   = liveY.current;
        }

        if (scaleVal.current > 1.02) {
          const nx = clamp(commitX.current + (t[0].pageX - panTouchX.current), scaleVal.current, width);
          const ny = clamp(commitY.current + (t[0].pageY - panTouchY.current), scaleVal.current, height);
          liveX.current = nx;
          liveY.current = ny;
          transX.setValue(nx);
          transY.setValue(ny);
        }
      }
    },

    onPanResponderRelease: (e, g) => {
      if (e.nativeEvent.touches.length > 0) {
        // Finger lifted but gesture not over — update live count.
        nTouches.current = e.nativeEvent.touches.length;
        return;
      }

      // All fingers lifted — finalise the gesture.
      const wasPinch = hadMultiTouch.current;
      hadMultiTouch.current = false;
      nTouches.current      = 0;

      if (scaleVal.current > 1.02) {
        // Commit whatever liveX/Y is now (set by the last pan move, or the
        // pre-pinch commit if it was a pure pinch with no pan after).
        commitX.current = clamp(liveX.current, scaleVal.current, width);
        commitY.current = clamp(liveY.current, scaleVal.current, height);
        transX.setValue(commitX.current);
        transY.setValue(commitY.current);
        return;
      }

      // Scale returned to 1× — clear any residual translation.
      commitX.current = 0; commitY.current = 0;
      liveX.current   = 0; liveY.current   = 0;
      transX.setValue(0);
      transY.setValue(0);

      // Multi-touch gestures never trigger swipes or taps.
      if (wasPinch) return;

      // Single-touch: swipe detection (g.dx is reliable here).
      if (g.dx < -SWIPE_THRESHOLD || g.vx < -0.4) { onSwipeLeft();  return; }
      if (g.dx >  SWIPE_THRESHOLD || g.vx >  0.4) { onSwipeRight(); return; }

      // Tap detection.
      if (Math.abs(g.dx) < 12 && Math.abs(g.dy) < 12) {
        const now = Date.now();
        if (now - lastTap.current < 300 && lastTap.current > 0) {
          lastTap.current = 0;
          if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
          // Double-tap: toggle between 1× and 3×.
          if (scaleVal.current > 1.5) { springReset(); } else { zoomTo(3, 0, 0); }
        } else {
          lastTap.current = now;
          tapTimer.current = setTimeout(() => {
            tapTimer.current = null;
            if (scaleVal.current <= 1.02) onSingleTap();
          }, 300);
        }
      }
    },
  })).current;

  return (
    <View style={{ width, height }} {...pr.panHandlers}>
      <Animated.Image
        source={{ uri }}
        style={[{ width, height }, { transform: [{ scale }, { translateX: transX }, { translateY: transY }] }]}
        resizeMode="contain"
      />
    </View>
  );
}

function AnimatedZoomSlideWithRoot(props: ZoomSlideProps) {
  const { GestureHandlerRootView } = _GH!;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AnimatedZoomSlide {...props} />
    </GestureHandlerRootView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (!n || n < 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 10_000)    return Math.round(n / 1_000) + "K";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

// ─── Post chrome overlay ──────────────────────────────────────────────────────

function PostChrome({
  meta,
  zoomed,
  insets,
  onClose,
  onNavigateToPost,
}: {
  meta: PostViewerMeta;
  zoomed: boolean;
  insets: ReturnType<typeof useSafeAreaInsets>;
  onClose: () => void;
  onNavigateToPost: () => void;
}) {
  const { user, profile: myProfile } = useAuth();
  const [liked, setLiked]           = useState(meta.liked);
  const [likeCount, setLikeCount]   = useState(meta.likeCount);
  const [bookmarked, setBookmarked] = useState(meta.bookmarked);
  const [following, setFollowing]   = useState(!!meta.isFollowing);
  const [replyText, setReplyText]   = useState("");
  const [sending, setSending]       = useState(false);
  const inputRef = useRef<TextInput>(null);
  const heartScale = useRef(new Animated.Value(1)).current;
  const kbOffset   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        const dur = Platform.OS === "ios" ? (e.duration ?? 250) : 220;
        Animated.timing(kbOffset, {
          toValue: e.endCoordinates.height,
          duration: dur,
          useNativeDriver: false,
        }).start();
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      (e) => {
        const dur = Platform.OS === "ios" ? (e.duration ?? 200) : 180;
        Animated.timing(kbOffset, { toValue: 0, duration: dur, useNativeDriver: false }).start();
      },
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => { setLiked(meta.liked); setLikeCount(meta.likeCount); }, [meta.liked, meta.likeCount]);
  useEffect(() => { setBookmarked(meta.bookmarked); }, [meta.bookmarked]);
  useEffect(() => { setFollowing(!!meta.isFollowing); }, [meta.isFollowing]);

  function pulseLike() {
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: true, speed: 50, bounciness: 14 }),
      Animated.spring(heartScale, { toValue: 1,   useNativeDriver: true, speed: 22, bounciness: 4  }),
    ]).start();
  }

  function handleLike() {
    if (!user) { onNavigateToPost(); return; }
    pulseLike();
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => c + (newLiked ? 1 : -1));
    meta.onToggleLike?.();
  }

  function handleBookmark() {
    if (!user) { onNavigateToPost(); return; }
    setBookmarked((b) => !b);
    meta.onToggleBookmark?.();
  }

  function handleFollow() {
    if (!user) { onNavigateToPost(); return; }
    setFollowing(true);
    meta.onToggleFollow?.();
  }

  async function sendReply() {
    if (!user || !replyText.trim() || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.from("post_replies").insert({
        post_id: meta.postId,
        author_id: user.id,
        content: replyText.trim(),
      }).select("id").single();
      if (!error && data) {
        setReplyText("");
        Keyboard.dismiss();
      }
    } catch {}
    setSending(false);
  }

  if (zoomed) return null;

  const isOwnPost = user?.id === meta.authorId;

  return (
    <>
      {/* ── Author row ── */}
      <View style={[styles.authorRow, { paddingTop: insets.top + 50 }]}>
        <TouchableOpacity
          onPress={() => { onClose(); setTimeout(() => router.push({ pathname: "/contact/[id]", params: { id: meta.authorId } } as any), 120); }}
          activeOpacity={0.8}
          style={styles.authorInfo}
        >
          <Avatar uri={meta.authorAvatar} name={meta.authorName} size={36} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={styles.authorName} numberOfLines={1}>{meta.authorName}</Text>
              {(meta.isVerified || meta.isOrgVerified) && (
                <VerifiedBadge isVerified={!!meta.isVerified} isOrganizationVerified={!!meta.isOrgVerified} size={13} />
              )}
            </View>
            <Text style={styles.authorHandle} numberOfLines={1}>@{meta.authorHandle}</Text>
          </View>
        </TouchableOpacity>
        {!isOwnPost && !following && (
          <TouchableOpacity onPress={handleFollow} style={styles.followBtn} activeOpacity={0.8}>
            <Text style={styles.followBtnText}>Follow</Text>
          </TouchableOpacity>
        )}
        {!isOwnPost && following && (
          <View style={styles.followingTag}>
            <Text style={styles.followingTagText}>Following</Text>
          </View>
        )}
      </View>

      {/* ── Bottom chrome: action bar + reply input (lifts above keyboard) ── */}
      <Animated.View style={[styles.bottomChrome, { paddingBottom: insets.bottom, bottom: kbOffset }]}>
        {/* Action bar */}
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.actionStat} onPress={onNavigateToPost} activeOpacity={0.7}>
            <Ionicons name="chatbubble-outline" size={20} color="rgba(255,255,255,0.75)" />
            <Text style={styles.actionCount}>{fmtCount(meta.replyCount)}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionStat} onPress={handleLike} activeOpacity={0.7}>
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons
                name={liked ? "heart" : "heart-outline"}
                size={20}
                color={liked ? "#FF3B30" : "rgba(255,255,255,0.75)"}
              />
            </Animated.View>
            <Text style={[styles.actionCount, liked && { color: "#FF3B30" }]}>{fmtCount(likeCount)}</Text>
          </TouchableOpacity>

          <View style={styles.actionStat}>
            <Ionicons name="eye-outline" size={20} color="rgba(255,255,255,0.75)" />
            <Text style={styles.actionCount}>{fmtCount(meta.viewCount)}</Text>
          </View>

          <View style={{ flex: 1 }} />

          <TouchableOpacity style={styles.actionIcon} onPress={handleBookmark} activeOpacity={0.7}>
            <Ionicons
              name={bookmarked ? "bookmark" : "bookmark-outline"}
              size={bookmarked ? 20 : 20}
              color={bookmarked ? "#FFD60A" : "rgba(255,255,255,0.75)"}
            />
          </TouchableOpacity>
        </View>

        {/* Reply input pill */}
        <View style={styles.replyRow}>
          <Avatar uri={myProfile?.avatar_url ?? null} name={myProfile?.display_name ?? "You"} size={30} />
          <View style={styles.replyPill}>
            <TextInput
              ref={inputRef}
              style={styles.replyInput}
              placeholder="Post your reply…"
              placeholderTextColor="rgba(255,255,255,0.38)"
              value={replyText}
              onChangeText={setReplyText}
              multiline={false}
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={sendReply}
            />
            {replyText.trim().length > 0 && (
              <TouchableOpacity onPress={sendReply} disabled={sending} style={styles.sendBtn} activeOpacity={0.8}>
                {sending
                  ? <ActivityIndicator size={14} color="#fff" />
                  : <Ionicons name="arrow-up" size={14} color="#fff" />}
              </TouchableOpacity>
            )}
          </View>

          {/* Expand: navigate to full comment page */}
          <TouchableOpacity onPress={onNavigateToPost} hitSlop={8} style={styles.expandBtn} activeOpacity={0.7}>
            <Ionicons name="expand-outline" size={19} color="rgba(255,255,255,0.65)" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </>
  );
}

// ─── Top navigation bar ───────────────────────────────────────────────────────

function TopBar({
  images,
  index,
  hasMultiple,
  insets,
  onClose,
}: {
  images: string[];
  index: number;
  hasMultiple: boolean;
  insets: ReturnType<typeof useSafeAreaInsets>;
  onClose: () => void;
}) {
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.glassBtn}>
        <Ionicons name="arrow-back" size={20} color="#fff" />
      </TouchableOpacity>

      {hasMultiple ? (
        <View style={styles.counterPill}>
          <Text style={styles.counterText}>{index + 1} / {images.length}</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }} />
      )}
    </View>
  );
}

// ─── Exported ImageViewer ─────────────────────────────────────────────────────

type ViewerProps = {
  images: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
  meta?: PostViewerMeta;
};

function AnimatedImageViewer({ images, initialIndex = 0, visible, onClose, meta }: ViewerProps) {
  const {
    useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
    default: AnimatedRN,
  } = _RA!;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex]   = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);

  // Overlay visibility — animated opacity for smooth show/hide
  const [overlayVisible, setOverlayVisible] = useState(true);
  const overlayAnim = useRef(new Animated.Value(1)).current;

  function toggleOverlay() {
    const next = !overlayVisible;
    setOverlayVisible(next);
    Animated.timing(overlayAnim, {
      toValue: next ? 1 : 0,
      duration: OVERLAY_FADE,
      useNativeDriver: true,
    }).start();
  }

  // Reset overlay when viewer opens
  useEffect(() => {
    if (visible) {
      setOverlayVisible(true);
      overlayAnim.setValue(1);
    }
  }, [visible]);

  const slideX       = useSharedValue(0);
  const slideOpacity = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      const safeIdx = Math.min(initialIndex, Math.max(0, images.length - 1));
      setIndex(safeIdx);
      setZoomed(false);
      slideX.value       = 0;
      slideOpacity.value = 1;
    }
  }, [visible, initialIndex]);

  const animateSlide = useCallback((dir: "left" | "right", nextIdx: number) => {
    const targetX = dir === "left" ? -width : width;
    slideX.value = withTiming(targetX, { duration: 200 }, () => {
      slideX.value       = -targetX;
      runOnJS(setIndex)(nextIdx);
      slideOpacity.value = 0;
      slideX.value       = withSpring(0, ZOOM_SPRING);
      slideOpacity.value = withTiming(1, { duration: 180 });
    });
  }, [width]);

  const goLeft  = useCallback(() => { if (index < images.length - 1) animateSlide("left",  index + 1); }, [index, images.length, animateSlide]);
  const goRight = useCallback(() => { if (index > 0)                  animateSlide("right", index - 1); }, [index, animateSlide]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: slideOpacity.value,
  }));

  const navigateToPost = useCallback(() => {
    if (!meta?.postId) return;
    onClose();
    setTimeout(() => router.push({ pathname: "/post/[id]", params: { id: meta.postId } } as any), 120);
  }, [meta?.postId, onClose]);

  if (!visible || images.length === 0) return null;
  const hasMultiple = images.length > 1;

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose} hardwareAccelerated>
      <StatusBar style="light" />
      <View style={styles.root}>
        {/* Ambient blurred background */}
        <Image
          source={{ uri: images[index] }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={Platform.OS === "ios" ? 70 : 18}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.82)" }]} />

        {/* Main image — full screen */}
        <AnimatedRN.View style={[styles.slideWrap, { width, height }, slideStyle]}>
          <AnimatedZoomSlideWithRoot
            key={index}
            uri={images[index]}
            width={width}
            height={height}
            isActive
            onClose={onClose}
            onSwipeLeft={goLeft}
            onSwipeRight={goRight}
            onScaleChange={(s) => setZoomed(s > 1.05)}
            onSingleTap={toggleOverlay}
          />
        </AnimatedRN.View>

        {/* ── All overlay chrome animated together ── */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: overlayAnim, pointerEvents: overlayVisible ? "box-none" : "none" },
          ]}
        >
          {/* Top bar */}
          <TopBar
            images={images} index={index} hasMultiple={hasMultiple}
            insets={insets} onClose={onClose}
          />

          {/* Side nav arrows */}
          {hasMultiple && !zoomed && (
            <>
              <TouchableOpacity
                style={[styles.navBtn, styles.navLeft, { top: height / 2 - 24 }]}
                onPress={goRight} disabled={index === 0} activeOpacity={0.65}
              >
                <Ionicons name="chevron-back" size={30} color="#fff"
                  style={{ opacity: index === 0 ? 0.18 : 1 } as any} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navBtn, styles.navRight, { top: height / 2 - 24 }]}
                onPress={goLeft} disabled={index === images.length - 1} activeOpacity={0.65}
              >
                <Ionicons name="chevron-forward" size={30} color="#fff"
                  style={{ opacity: index === images.length - 1 ? 0.18 : 1 } as any} />
              </TouchableOpacity>
            </>
          )}

          {/* Post chrome — author row + action bar + reply input */}
          {meta && (
            <PostChrome
              meta={meta}
              zoomed={zoomed}
              insets={insets}
              onClose={onClose}
              onNavigateToPost={navigateToPost}
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function SimpleImageViewer({ images, initialIndex = 0, visible, onClose, meta }: ViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex]   = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);

  // Overlay visibility
  const [overlayVisible, setOverlayVisible] = useState(true);
  const overlayAnim = useRef(new Animated.Value(1)).current;

  function toggleOverlay() {
    const next = !overlayVisible;
    setOverlayVisible(next);
    Animated.timing(overlayAnim, {
      toValue: next ? 1 : 0,
      duration: OVERLAY_FADE,
      useNativeDriver: true,
    }).start();
  }

  useEffect(() => {
    if (visible) {
      setIndex(Math.min(initialIndex, Math.max(0, images.length - 1)));
      setZoomed(false);
      setOverlayVisible(true);
      overlayAnim.setValue(1);
    }
  }, [visible, initialIndex]);

  const navigateToPost = useCallback(() => {
    if (!meta?.postId) return;
    onClose();
    setTimeout(() => router.push({ pathname: "/post/[id]", params: { id: meta.postId } } as any), 120);
  }, [meta?.postId, onClose]);

  if (!visible || images.length === 0) return null;
  const hasMultiple = images.length > 1;

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar style="light" />
      <View style={styles.root}>
        <Image
          source={{ uri: images[index] }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={Platform.OS === "ios" ? 70 : 18}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.82)" }]} />

        <View style={[styles.slideWrap, { width, height }]}>
          <SimpleZoomSlide
            key={index}
            uri={images[index]}
            width={width}
            height={height}
            isActive
            onClose={onClose}
            onSwipeLeft={() => { if (index < images.length - 1) setIndex(index + 1); }}
            onSwipeRight={() => { if (index > 0) setIndex(index - 1); }}
            onScaleChange={(s) => setZoomed(s > 1.05)}
            onSingleTap={toggleOverlay}
          />
        </View>

        {/* ── All overlay chrome animated together ── */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: overlayAnim, pointerEvents: overlayVisible ? "box-none" : "none" },
          ]}
        >
          <TopBar
            images={images} index={index} hasMultiple={hasMultiple}
            insets={insets} onClose={onClose}
          />

          {hasMultiple && (
            <>
              <TouchableOpacity
                style={[styles.navBtn, styles.navLeft, { top: height / 2 - 24 }]}
                onPress={() => { if (index > 0) setIndex(index - 1); }}
                disabled={index === 0} activeOpacity={0.65}
              >
                <Ionicons name="chevron-back" size={30} color="#fff"
                  style={{ opacity: index === 0 ? 0.18 : 1 } as any} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navBtn, styles.navRight, { top: height / 2 - 24 }]}
                onPress={() => { if (index < images.length - 1) setIndex(index + 1); }}
                disabled={index === images.length - 1} activeOpacity={0.65}
              >
                <Ionicons name="chevron-forward" size={30} color="#fff"
                  style={{ opacity: index === images.length - 1 ? 0.18 : 1 } as any} />
              </TouchableOpacity>
            </>
          )}

          {meta && (
            <PostChrome
              meta={meta}
              zoomed={false}
              insets={insets}
              onClose={onClose}
              onNavigateToPost={navigateToPost}
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// Exported component — picks animated or simple viewer at mount time.
export function ImageViewer(props: ViewerProps) {
  if (RA_AVAILABLE) return <AnimatedImageViewer {...props} />;
  return <SimpleImageViewer {...props} />;
}

// ─── useImageViewer hook ───────────────────────────────────────────────────────

export function useImageViewer() {
  const [state, setState] = useState<{
    visible: boolean;
    images: string[];
    index: number;
    meta?: PostViewerMeta;
  }>({ visible: false, images: [], index: 0 });

  const openViewer = useCallback(
    (images: string[], index = 0, meta?: PostViewerMeta) =>
      setState({ visible: true, images, index, meta }),
    []
  );
  const closeViewer = useCallback(
    () => setState((s) => ({ ...s, visible: false })),
    []
  );
  return { ...state, openViewer, closeViewer };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
    zIndex: 20,
  },

  glassBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.13)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },

  counterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  counterText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },

  slideWrap: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "visible",
  },

  navBtn: {
    position: "absolute",
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  navLeft:  { left: 4 },
  navRight: { right: 4 },

  // ── Author row ──────────────────────────────────────────────────────────────
  authorRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  authorInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  authorName: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    flexShrink: 1,
  },
  authorHandle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  followBtn: {
    marginLeft: 10,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  followBtnText: {
    color: "#000",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  followingTag: {
    marginLeft: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  followingTagText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Bottom chrome ───────────────────────────────────────────────────────────
  bottomChrome: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: "rgba(0,0,0,0.50)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },

  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 20,
  },
  actionStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  actionCount: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  actionIcon: {
    padding: 4,
  },

  replyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  replyPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 38,
  },
  replyInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
    margin: 0,
  },
  sendBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  expandBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
});
