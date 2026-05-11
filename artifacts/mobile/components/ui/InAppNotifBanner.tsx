/**
 * InAppNotifBanner — slide-down notification banner shown while app is foregrounded.
 *
 * Mimics iOS / Android heads-up notification style:
 *   - Slides in from top, auto-dismisses after ~4.5 s
 *   - Tap navigates to the relevant screen
 *   - Swipe up to dismiss early
 *   - Avatar initial or image on the left
 *   - Shows notification type icon (message, like, follow, order…)
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { BannerPayload, dismissBanner, subscribeBanner } from "@/lib/notifBannerStore";

const BANNER_H = 72;
const SWIPE_DISMISS_THRESHOLD = -32;

const TYPE_META: Record<string, { icon: string; color: string }> = {
  message:  { icon: "chatbubble",           color: "#00BCD4" },
  follow:   { icon: "person-add",           color: "#007AFF" },
  like:     { icon: "heart",                color: "#FF2D55" },
  reply:    { icon: "return-down-back",     color: "#5AC8FA" },
  mention:  { icon: "at",                   color: "#AF52DE" },
  gift:     { icon: "gift",                 color: "#FF9500" },
  order:    { icon: "bag-check",            color: "#34C759" },
  escrow:   { icon: "cash",                 color: "#34C759" },
  payment:  { icon: "wallet",              color: "#34C759" },
  call:     { icon: "call",                 color: "#34C759" },
  live:     { icon: "radio",               color: "#FF3B30" },
  channel:  { icon: "megaphone",           color: "#FF9500" },
  system:   { icon: "information-circle",  color: "#8E8E93" },
};

export function InAppNotifBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [payload, setPayload] = useState<BannerPayload | null>(null);
  const [visible, setVisible] = useState(false);

  const translateY = useRef(new Animated.Value(-(BANNER_H + 20))).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const latestPayload = useRef<BannerPayload | null>(null);

  const slideIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0,  tension: 180, friction: 14, useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 1,  duration: 180,              useNativeDriver: true }),
    ]).start();
  }, [translateY, opacity]);

  const slideOut = useCallback((onDone?: () => void) => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: -(BANNER_H + 60), tension: 200, friction: 12, useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 0, duration: 160,               useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) { setVisible(false); onDone?.(); }
    });
  }, [translateY, opacity]);

  useEffect(() => {
    const unsub = subscribeBanner((p) => {
      if (p) {
        latestPayload.current = p;
        translateY.setValue(-(BANNER_H + 20));
        opacity.setValue(0);
        setPayload(p);
        setVisible(true);
        slideIn();
      } else {
        slideOut();
      }
    });
    return unsub;
  }, [slideIn, slideOut, translateY, opacity]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        if (g.dy < 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < SWIPE_DISMISS_THRESHOLD || g.vy < -0.8) {
          dismissBanner();
        } else {
          slideIn();
        }
      },
    })
  ).current;

  if (!visible || !payload) return null;

  const meta = TYPE_META[payload.type || "system"] ?? TYPE_META.system;
  const initials = (payload.title ?? "?").slice(0, 1).toUpperCase();

  function handleTap() {
    dismissBanner();
    const p = latestPayload.current;
    if (!p) return;
    if (p.url) { router.push(p.url as any); return; }
    if (p.chatId)  { router.push(`/chat/${p.chatId}` as any);     return; }
    if (p.postId)  { router.push(`/p/${p.postId}` as any);        return; }
    if (p.actorId) { router.push(`/contact/${p.actorId}` as any); return; }
    router.push("/notifications" as any);
  }

  const top = insets.top + (Platform.OS === "android" ? 6 : 4);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { top, transform: [{ translateY }], opacity },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable
        onPress={handleTap}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        android_ripple={{ color: "rgba(0,0,0,0.08)" }}
      >
        {/* Left avatar / icon */}
        <View style={[styles.avatar, { backgroundColor: meta.color + "22" }]}>
          {payload.avatarUrl ? (
            <ExpoImage
              source={{ uri: payload.avatarUrl }}
              style={styles.avatarImg}
              contentFit="cover"
            />
          ) : (
            <Text style={[styles.avatarInitial, { color: meta.color }]}>{initials}</Text>
          )}
          {/* Type badge dot */}
          <View style={[styles.typeDot, { backgroundColor: meta.color }]}>
            <Ionicons name={meta.icon as any} size={8} color="#fff" />
          </View>
        </View>

        {/* Text */}
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {payload.title}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>
            {payload.body}
          </Text>
        </View>

        {/* Dismiss × */}
        <Pressable
          onPress={(e) => { e.stopPropagation(); dismissBanner(); }}
          hitSlop={12}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </Pressable>

      {/* Drag indicator */}
      <View style={[styles.dragPill, { backgroundColor: colors.textMuted + "55" }]} />
    </Animated.View>
  );
}

const { width: W } = Dimensions.get("window");

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 9999,
    elevation: 20,
    alignItems: "center",
  },
  card: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    position: "relative",
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarInitial: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  typeDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  textWrap: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    lineHeight: 18,
  },
  body: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  closeBtn: {
    padding: 4,
    flexShrink: 0,
  },
  dragPill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: 6,
  },
});
