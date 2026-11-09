import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
const ND = Platform.OS !== "web";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { dismissToast, registerToastListener, type ToastItem } from "@/lib/toast";
import { impactAsync, notificationAsync, ImpactFeedbackStyle, NotificationFeedbackType } from "@/lib/haptics";
import { STATUS } from "@/constants/colors";
import { T } from "@/constants/theme";

// ─── Type-based defaults ──────────────────────────────────────────────────────

const TYPE_ICON: Record<ToastItem["type"], keyof typeof Ionicons.glyphMap> = {
  error:   "alert-circle",
  success: "checkmark-circle",
  info:    "information-circle",
  warning: "warning",
};

// All colors sourced from STATUS design tokens — no raw hex values
const TYPE_COLOR: Record<ToastItem["type"], string> = {
  error:   STATUS.error,
  success: STATUS.success,
  info:    STATUS.info,
  warning: STATUS.warning,
};

// ─── Default toast (dark pill) ────────────────────────────────────────────────

function DefaultToast({
  item,
  onAnimatedOut,
}: {
  item: ToastItem;
  onAnimatedOut: (id: string) => void;
}) {
  const translateY    = useRef(new Animated.Value(60)).current;
  const opacity       = useRef(new Animated.Value(0)).current;
  const scale         = useRef(new Animated.Value(0.92)).current;
  const dismissingRef = useRef(false);

  const icon = (item.icon ?? TYPE_ICON[item.type]) as keyof typeof Ionicons.glyphMap;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, tension: 220, friction: 20, useNativeDriver: ND }),
      Animated.timing(opacity,    { toValue: 1, duration: T.motion.fast, useNativeDriver: ND }),
      Animated.spring(scale,      { toValue: 1, tension: 220, friction: 20, useNativeDriver: ND }),
    ]).start();
  }, []);

  const animateOut = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    Animated.parallel([
      Animated.timing(translateY, { toValue: 60,  duration: T.motion.base,        useNativeDriver: ND }),
      Animated.timing(opacity,    { toValue: 0,   duration: T.motion.fast + 10,   useNativeDriver: ND }),
      Animated.timing(scale,      { toValue: 0.9, duration: T.motion.base,        useNativeDriver: ND }),
    ]).start(() => onAnimatedOut(item.id));
  }, [item.id, onAnimatedOut]);

  useEffect(() => {
    if (!item.duration || item.duration <= 0) return;
    const t = setTimeout(animateOut, item.duration);
    return () => clearTimeout(t);
  }, [item.duration, animateOut]);

  return (
    <Animated.View style={[s.pill, { opacity, transform: [{ translateY }, { scale }] }]}>
      <Pressable
        onPress={() => { impactAsync(ImpactFeedbackStyle.Light); animateOut(); dismissToast(item.id); }}
        style={s.pillInner}
        android_ripple={{ color: "rgba(255,255,255,0.08)", borderless: false }}
      >
        <View style={[s.pillIconWrap, { backgroundColor: TYPE_COLOR[item.type] + "22" }]}>
          <Ionicons name={icon} size={16} color={TYPE_COLOR[item.type]} />
        </View>
        <Text style={s.pillText} numberOfLines={2}>
          {item.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Action toast (colored banner) ───────────────────────────────────────────

function ActionToast({
  item,
  onAnimatedOut,
}: {
  item: ToastItem;
  onAnimatedOut: (id: string) => void;
}) {
  const translateY    = useRef(new Animated.Value(60)).current;
  const opacity       = useRef(new Animated.Value(0)).current;
  const dismissingRef = useRef(false);

  const icon     = (item.icon ?? TYPE_ICON[item.type]) as keyof typeof Ionicons.glyphMap;
  const accentBg = TYPE_COLOR[item.type];

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, tension: 220, friction: 20, useNativeDriver: ND }),
      Animated.timing(opacity,    { toValue: 1, duration: T.motion.fast, useNativeDriver: ND }),
    ]).start();
  }, []);

  const animateOut = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    Animated.parallel([
      Animated.timing(translateY, { toValue: 60, duration: T.motion.base,      useNativeDriver: ND }),
      Animated.timing(opacity,    { toValue: 0,  duration: T.motion.fast + 10, useNativeDriver: ND }),
    ]).start(() => onAnimatedOut(item.id));
  }, [item.id, onAnimatedOut]);

  useEffect(() => {
    if (!item.duration || item.duration <= 0) return;
    const t = setTimeout(animateOut, item.duration);
    return () => clearTimeout(t);
  }, [item.duration, animateOut]);

  function handleAction() {
    notificationAsync(NotificationFeedbackType.Success);
    item.onAction?.();
    animateOut();
    dismissToast(item.id);
  }

  function handleDismiss() {
    impactAsync(ImpactFeedbackStyle.Light);
    animateOut();
    dismissToast(item.id);
  }

  return (
    <Animated.View
      style={[
        s.actionToast,
        { backgroundColor: accentBg, opacity, transform: [{ translateY }] },
      ]}
    >
      <Pressable
        style={s.actionInner}
        onPress={handleDismiss}
        android_ripple={{ color: "rgba(0,0,0,0.12)", borderless: false }}
      >
        <Ionicons name={icon} size={18} color="#fff" />
        <Text style={s.actionText} numberOfLines={2}>
          {item.message}
        </Text>
        {!!item.actionLabel && (
          <TouchableOpacity
            onPress={handleAction}
            hitSlop={8}
            style={s.actionBtn}
            activeOpacity={T.states.pressed}
          >
            <Text style={s.actionBtnText}>{item.actionLabel.toUpperCase()}</Text>
          </TouchableOpacity>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

export function ToastContainer() {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const visibleRef          = useRef<Set<string>>(new Set());

  useEffect(() => {
    return registerToastListener((incoming) => {
      setToasts((prev) => {
        const incomingIds = new Set(incoming.map((t) => t.id));
        const kept        = prev.filter((t) => incomingIds.has(t.id) || visibleRef.current.has(t.id));
        const existingIds = new Set(kept.map((t) => t.id));
        const brandNew    = incoming.filter((t) => !existingIds.has(t.id));
        const merged      = [...kept];
        for (const t of brandNew) {
          visibleRef.current.add(t.id);
          merged.push(t);
        }
        return merged.slice(-3);
      });
    });
  }, []);

  const handleAnimatedOut = useCallback((id: string) => {
    visibleRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <View
      style={[s.container, { bottom: insets.bottom + 86, pointerEvents: "box-none" } as any]}
    >
      {toasts.map((item) =>
        item.variant === "action" ? (
          <ActionToast key={item.id} item={item} onAnimatedOut={handleAnimatedOut} />
        ) : (
          <DefaultToast key={item.id} item={item} onAnimatedOut={handleAnimatedOut} />
        )
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const SHADOW = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  android: { elevation: T.elevation.modal },
  web: { boxShadow: "0 6px 16px rgba(0,0,0,0.28)" } as any,
  default: {},
});

const s = StyleSheet.create({
  container: {
    position: "absolute",
    left: T.space.xl,
    right: T.space.xl,
    gap: T.space.sm,
    zIndex: 9999,
    alignItems: "center",
  },

  // ── Default (dark pill) ────────────────────────────────────────────────────
  pill: {
    alignSelf: "center",
    backgroundColor: "#1C1C1F",
    borderRadius: T.radius.pill,
    maxWidth: 340,
    minWidth: 120,
    borderWidth: T.border.hairline,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
    ...SHADOW,
  },
  pillInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: T.space.sm,
    paddingVertical: 11,
    paddingHorizontal: T.space.xl,
  },
  pillIconWrap: {
    width: 26,
    height: 26,
    borderRadius: T.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: {
    color: "#fff",
    ...T.body,
    fontSize: 14,
    flexShrink: 1,
  },

  // ── Action (colored banner) ────────────────────────────────────────────────
  actionToast: {
    alignSelf: "stretch",
    borderRadius: T.radius.md,
    overflow: "hidden",
    ...SHADOW,
  },
  actionInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: T.space.md,
    paddingVertical: T.space.md + 1,
    paddingHorizontal: T.space.lg - 2,
  },
  actionText: {
    flex: 1,
    color: "#fff",
    ...T.body,
    fontSize: 14,
  },
  actionBtn: {
    paddingHorizontal: T.space.md,
    paddingVertical: T.space.sm - 2,
    borderRadius: T.radius.sm,
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  actionBtnText: {
    color: "#fff",
    ...T.label,
    fontSize: 12,
    letterSpacing: 0.5,
  },
});
