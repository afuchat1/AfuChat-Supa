import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { dismissToast, registerToastListener, type ToastItem } from "@/lib/toast";

const TYPE_CONFIG: Record<
  ToastItem["type"],
  { bg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  error:   { bg: "#FF3B30", icon: "alert-circle"        },
  success: { bg: "#34C759", icon: "checkmark-circle"    },
  info:    { bg: "#007AFF", icon: "information-circle"  },
  warning: { bg: "#FF9500", icon: "warning"             },
};

function SingleToast({
  item,
  onAnimatedOut,
}: {
  item: ToastItem;
  onAnimatedOut: (id: string) => void;
}) {
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const config = TYPE_CONFIG[item.type];
  const dismissingRef = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 200,
        friction: 22,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const animateOut = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 80,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onAnimatedOut(item.id);
    });
  }, [item.id, onAnimatedOut]);

  function handlePress() {
    animateOut();
    dismissToast(item.id);
  }

  return (
    <Animated.View
      style={[
        s.toast,
        { backgroundColor: config.bg, transform: [{ translateY }], opacity },
      ]}
    >
      <TouchableOpacity
        style={s.toastInner}
        onPress={handlePress}
        activeOpacity={0.88}
      >
        <Ionicons name={config.icon} size={19} color="#fff" />
        <Text style={s.text} numberOfLines={3}>
          {item.message}
        </Text>
        <TouchableOpacity onPress={handlePress} hitSlop={8}>
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.75)" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function ToastContainer() {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const visibleRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return registerToastListener((incoming) => {
      setToasts((prev) => {
        const incomingIds = new Set(incoming.map((t) => t.id));
        const nextPrev = prev.filter(
          (t) => incomingIds.has(t.id) || visibleRef.current.has(t.id),
        );
        const existingIds = new Set(nextPrev.map((t) => t.id));
        const brandNew = incoming.filter((t) => !existingIds.has(t.id));
        const merged = [...nextPrev];
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
      style={[s.container, { bottom: insets.bottom + 90, pointerEvents: "box-none" }]}
    >
      {toasts.map((item) => (
        <SingleToast
          key={item.id}
          item={item}
          onAnimatedOut={handleAnimatedOut}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    gap: 8,
    zIndex: 9999,
  },
  toast: {
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.22,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  toastInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  text: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
  },
});
