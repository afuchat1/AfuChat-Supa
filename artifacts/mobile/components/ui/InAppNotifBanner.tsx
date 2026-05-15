/**
 * InAppNotifBanner — foreground heads-up banner with interactive action buttons.
 *
 * Behaviour:
 *   - Slides in from top, auto-dismisses after 5 s
 *   - Tap the banner body → navigate to the relevant screen
 *   - Swipe up → dismiss
 *   - Tap "expand" chevron → reveal action buttons
 *   - Message notifications → inline reply text input + Send button
 *   - Follow notifications → Follow Back button
 *   - Post/like/mention/reply notifications → Like + Reply (inline) + View
 *   - Order notifications → View Order
 *   - Gift, payment, system → tap-to-navigate only
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { BannerPayload, dismissBanner, subscribeBanner } from "@/lib/notifBannerStore";
import { supabase } from "@/lib/supabase";

const BRAND = "#00BCD4";
const SWIPE_DISMISS_THRESHOLD = -32;
const AUTO_DISMISS_MS = 5500;
const EXPANDED_AUTO_DISMISS_MS = 12000;

const TYPE_META: Record<string, { icon: string; color: string }> = {
  message:  { icon: "chatbubble",           color: "#00BCD4" },
  follow:   { icon: "person-add",           color: "#007AFF" },
  like:     { icon: "heart",                color: "#FF2D55" },
  reply:    { icon: "return-down-back",     color: "#5AC8FA" },
  mention:  { icon: "at",                   color: "#AF52DE" },
  gift:     { icon: "gift",                 color: "#FF9500" },
  order:    { icon: "bag-check",            color: "#34C759" },
  escrow:   { icon: "cash",                 color: "#34C759" },
  payment:  { icon: "wallet",               color: "#34C759" },
  call:     { icon: "call",                 color: "#34C759" },
  live:     { icon: "radio",               color: "#FF3B30" },
  channel:  { icon: "megaphone",           color: "#FF9500" },
  system:   { icon: "information-circle",  color: "#8E8E93" },
};

type ActionState = "idle" | "loading" | "done" | "error";

export function InAppNotifBanner() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [payload, setPayload] = useState<BannerPayload | null>(null);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [actionMsg, setActionMsg] = useState("");
  const [likedLocal, setLikedLocal] = useState(false);
  const [followedLocal, setFollowedLocal] = useState(false);

  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;
  const latestPayload = useRef<BannerPayload | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyInputRef = useRef<TextInput>(null);

  const resetDismissTimer = useCallback((delayMs: number) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => dismissBanner(), delayMs);
  }, []);

  const slideIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, tension: 180, friction: 14, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [translateY, opacity]);

  const slideOut = useCallback((onDone?: () => void) => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.spring(translateY, { toValue: -120, tension: 200, friction: 12, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        setVisible(false);
        setExpanded(false);
        setReplyText("");
        setActionState("idle");
        setActionMsg("");
        setLikedLocal(false);
        setFollowedLocal(false);
        expandAnim.setValue(0);
        onDone?.();
      }
    });
  }, [translateY, opacity, expandAnim]);

  useEffect(() => {
    const unsub = subscribeBanner((p) => {
      if (p) {
        latestPayload.current = p;
        translateY.setValue(-120);
        opacity.setValue(0);
        expandAnim.setValue(0);
        setPayload(p);
        setVisible(true);
        setExpanded(false);
        setReplyText("");
        setActionState("idle");
        setActionMsg("");
        setLikedLocal(false);
        setFollowedLocal(false);
        slideIn();
        resetDismissTimer(AUTO_DISMISS_MS);
      } else {
        slideOut();
      }
    });
    return () => {
      unsub();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [slideIn, slideOut, translateY, opacity, expandAnim, resetDismissTimer]);

  const toggleExpand = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    Animated.spring(expandAnim, {
      toValue: next ? 1 : 0,
      tension: 200,
      friction: 18,
      useNativeDriver: false,
    }).start();
    if (next) {
      resetDismissTimer(EXPANDED_AUTO_DISMISS_MS);
      if (latestPayload.current?.type === "message") {
        setTimeout(() => replyInputRef.current?.focus(), 300);
      }
    } else {
      resetDismissTimer(AUTO_DISMISS_MS);
      Keyboard.dismiss();
    }
  }, [expanded, expandAnim, resetDismissTimer]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !expanded,
      onMoveShouldSetPanResponder: (_, g) => !expanded && Math.abs(g.dy) > 4,
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
  const type = payload.type || "system";

  function handleTap() {
    dismissBanner();
    const p = latestPayload.current;
    if (!p) return;
    if (p.url)     { router.push(p.url as any);           return; }
    if (p.chatId)  { router.push(`/chat/${p.chatId}` as any);    return; }
    if (p.postId)  { router.push(`/p/${p.postId}` as any);       return; }
    if (p.actorId) { router.push(`/contact/${p.actorId}` as any); return; }
    router.push("/notifications" as any);
  }

  async function handleSendReply() {
    const text = replyText.trim();
    if (!text) return;
    const p = latestPayload.current;
    if (!p) return;
    setActionState("loading");
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Not signed in");

      if (type === "message" && p.chatId) {
        await supabase.from("messages").insert({
          chat_id: p.chatId,
          sender_id: session.user.id,
          encrypted_content: text,
        });
        setActionMsg("Message sent!");
      } else if ((type === "reply" || type === "mention" || type === "like") && p.postId) {
        await supabase.from("post_replies").insert({
          post_id: p.postId,
          author_id: session.user.id,
          content: text,
        });
        setActionMsg("Reply sent!");
      }
      setActionState("done");
      setReplyText("");
      Keyboard.dismiss();
      setTimeout(() => dismissBanner(), 1800);
    } catch {
      setActionState("error");
      setActionMsg("Failed to send");
    }
  }

  async function handleFollowBack() {
    const p = latestPayload.current;
    if (!p?.actorId) return;
    setActionState("loading");
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Not signed in");
      await supabase.from("follows").insert({
        follower_id: session.user.id,
        following_id: p.actorId,
      });
      setFollowedLocal(true);
      setActionState("done");
      setActionMsg("Following!");
      setTimeout(() => dismissBanner(), 1800);
    } catch {
      setActionState("error");
      setActionMsg("Could not follow");
    }
  }

  async function handleLike() {
    const p = latestPayload.current;
    if (!p?.postId) return;
    setActionState("loading");
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Not signed in");
      await supabase.from("post_acknowledgments").insert({
        post_id: p.postId,
        user_id: session.user.id,
      });
      setLikedLocal(true);
      setActionState("done");
      setActionMsg("Liked!");
      setTimeout(() => {
        setActionState("idle");
        setActionMsg("");
      }, 1500);
    } catch {
      setActionState("done");
      setActionMsg("Already liked");
    }
  }

  const isLoading = actionState === "loading";

  const expandHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, type === "message" ? 90 : type === "follow" ? 72 : 80],
  });

  const top = insets.top + (Platform.OS === "android" ? 6 : 4);

  const cardBg = isDark
    ? "rgba(28,28,32,0.97)"
    : "rgba(255,255,255,0.97)";

  return (
    <Animated.View
      style={[styles.wrapper, { top, transform: [{ translateY }], opacity }]}
      {...(!expanded ? panResponder.panHandlers : {})}
    >
      {/* ── Main card row ── */}
      <Pressable
        onPress={handleTap}
        style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}
        android_ripple={{ color: "rgba(0,0,0,0.06)" }}
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: meta.color + "22" }]}>
          {payload.avatarUrl ? (
            <ExpoImage source={{ uri: payload.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Text style={[styles.avatarInitial, { color: meta.color }]}>{initials}</Text>
          )}
          <View style={[styles.typeDot, { backgroundColor: meta.color }]}>
            <Ionicons name={meta.icon as any} size={8} color="#fff" />
          </View>
        </View>

        {/* Text */}
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {payload.title}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={expanded ? 3 : 1}>
            {payload.body}
          </Text>
        </View>

        {/* Controls: expand chevron + close */}
        <View style={styles.controls}>
          {hasActions(type) && (
            <Pressable
              onPress={(e) => { e.stopPropagation(); toggleExpand(); }}
              hitSlop={10}
              style={styles.chevronBtn}
            >
              <Animated.View style={{
                transform: [{
                  rotate: expandAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }),
                }],
              }}>
                <Ionicons name="chevron-down" size={16} color={meta.color} />
              </Animated.View>
            </Pressable>
          )}
          <Pressable
            onPress={(e) => { e.stopPropagation(); dismissBanner(); }}
            hitSlop={12}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={15} color={colors.textMuted} />
          </Pressable>
        </View>
      </Pressable>

      {/* ── Expanded actions panel ── */}
      <Animated.View style={[styles.actionsPanel, { backgroundColor: cardBg, borderColor: colors.border, maxHeight: expandHeight, overflow: "hidden" }]}>
        {actionState === "done" || actionState === "error" ? (
          <View style={styles.actionFeedback}>
            <Ionicons
              name={actionState === "done" ? "checkmark-circle" : "alert-circle"}
              size={18}
              color={actionState === "done" ? "#10B981" : "#FF3B30"}
            />
            <Text style={{ color: actionState === "done" ? "#10B981" : "#FF3B30", fontSize: 14, fontFamily: "Inter_600SemiBold", marginLeft: 6 }}>
              {actionMsg}
            </Text>
          </View>
        ) : (
          <>
            {/* Message quick-reply */}
            {type === "message" && (
              <View style={styles.replyRow}>
                <TextInput
                  ref={replyInputRef}
                  style={[styles.replyInput, { backgroundColor: colors.backgroundSecondary || colors.background, color: colors.text, borderColor: colors.border }]}
                  placeholder="Reply…"
                  placeholderTextColor={colors.textMuted}
                  value={replyText}
                  onChangeText={setReplyText}
                  returnKeyType="send"
                  onSubmitEditing={handleSendReply}
                  editable={!isLoading}
                  multiline={false}
                />
                <Pressable
                  android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: false }}
                  style={[styles.sendBtn, { backgroundColor: BRAND, opacity: (!replyText.trim() || isLoading) ? 0.5 : 1, overflow: "hidden" }]}
                  onPress={handleSendReply}
                  disabled={!replyText.trim() || isLoading}
                >
                  <Ionicons name="send" size={15} color="#fff" />
                </Pressable>
              </View>
            )}

            {/* Post/reply/mention/like actions */}
            {(type === "reply" || type === "mention" || type === "like") && (
              <View style={styles.actionButtons}>
                <Pressable
                  android_ripple={{ color: "rgba(255,45,85,0.2)", borderless: false }}
                  style={[styles.actionBtn, { backgroundColor: likedLocal ? "#FF2D55" : colors.border + "50", borderColor: "#FF2D55", overflow: "hidden" }]}
                  onPress={handleLike}
                  disabled={isLoading || likedLocal}
                >
                  <Ionicons name={likedLocal ? "heart" : "heart-outline"} size={14} color={likedLocal ? "#fff" : "#FF2D55"} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: likedLocal ? "#fff" : "#FF2D55", marginLeft: 4 }}>
                    {likedLocal ? "Liked" : "Like"}
                  </Text>
                </Pressable>
                <Pressable
                  android_ripple={{ color: "rgba(0,188,212,0.2)", borderless: false }}
                  style={[styles.actionBtn, { backgroundColor: colors.border + "50", borderColor: BRAND, overflow: "hidden" }]}
                  onPress={() => { dismissBanner(); if (payload.postId) router.push(`/p/${payload.postId}` as any); }}
                >
                  <Ionicons name="return-down-back-outline" size={14} color={BRAND} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: BRAND, marginLeft: 4 }}>Reply</Text>
                </Pressable>
                <Pressable
                  android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: false }}
                  style={[styles.actionBtn, { backgroundColor: colors.border + "50", borderColor: colors.border, overflow: "hidden" }]}
                  onPress={() => { dismissBanner(); if (payload.postId) router.push(`/p/${payload.postId}` as any); }}
                >
                  <Ionicons name="eye-outline" size={14} color={colors.textSecondary} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.textSecondary, marginLeft: 4 }}>View</Text>
                </Pressable>
              </View>
            )}

            {/* Follow actions */}
            {type === "follow" && (
              <View style={styles.actionButtons}>
                <Pressable
                  android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: false }}
                  style={[styles.actionBtn, { flex: 1, backgroundColor: followedLocal ? "#10B981" : BRAND, borderColor: followedLocal ? "#10B981" : BRAND, justifyContent: "center", overflow: "hidden" }]}
                  onPress={handleFollowBack}
                  disabled={isLoading || followedLocal}
                >
                  <Ionicons name={followedLocal ? "checkmark-circle" : "person-add"} size={14} color="#fff" />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff", marginLeft: 5 }}>
                    {followedLocal ? "Following" : "Follow Back"}
                  </Text>
                </Pressable>
                <Pressable
                  android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: false }}
                  style={[styles.actionBtn, { backgroundColor: colors.border + "50", borderColor: colors.border, overflow: "hidden" }]}
                  onPress={() => { dismissBanner(); if (payload.actorId) router.push(`/contact/${payload.actorId}` as any); }}
                >
                  <Ionicons name="person-circle-outline" size={14} color={colors.textSecondary} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.textSecondary, marginLeft: 4 }}>Profile</Text>
                </Pressable>
                <Pressable
                  android_ripple={{ color: "rgba(0,0,0,0.06)", borderless: false }}
                  style={[styles.actionBtn, { backgroundColor: colors.border + "50", borderColor: colors.border, overflow: "hidden" }]}
                  onPress={dismissBanner}
                >
                  <Ionicons name="close-circle-outline" size={14} color={colors.textMuted} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.textMuted, marginLeft: 4 }}>Dismiss</Text>
                </Pressable>
              </View>
            )}

            {/* Order actions */}
            {(type === "order" || type === "escrow") && (
              <View style={styles.actionButtons}>
                <Pressable
                  android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: false }}
                  style={[styles.actionBtn, { flex: 1, backgroundColor: "#34C759", borderColor: "#34C759", justifyContent: "center", overflow: "hidden" }]}
                  onPress={() => { dismissBanner(); if (payload.url) router.push(payload.url as any); }}
                >
                  <Ionicons name="bag-check-outline" size={14} color="#fff" />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff", marginLeft: 5 }}>View Order</Text>
                </Pressable>
                <Pressable
                  android_ripple={{ color: "rgba(0,0,0,0.06)", borderless: false }}
                  style={[styles.actionBtn, { backgroundColor: colors.border + "50", borderColor: colors.border, overflow: "hidden" }]}
                  onPress={dismissBanner}
                >
                  <Ionicons name="close-outline" size={14} color={colors.textMuted} />
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.textMuted, marginLeft: 4 }}>Dismiss</Text>
                </Pressable>
              </View>
            )}

            {/* Gift / payment actions */}
            {(type === "gift" || type === "payment") && (
              <View style={styles.actionButtons}>
                <Pressable
                  android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: false }}
                  style={[styles.actionBtn, { flex: 1, backgroundColor: "#FF9500", borderColor: "#FF9500", justifyContent: "center", overflow: "hidden" }]}
                  onPress={() => { dismissBanner(); router.push("/(tabs)/me" as any); }}
                >
                  <Ionicons name="wallet-outline" size={14} color="#fff" />
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff", marginLeft: 5 }}>View Wallet</Text>
                </Pressable>
                <Pressable
                  android_ripple={{ color: "rgba(0,0,0,0.06)", borderless: false }}
                  style={[styles.actionBtn, { backgroundColor: colors.border + "50", borderColor: colors.border, overflow: "hidden" }]}
                  onPress={dismissBanner}
                >
                  <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.textMuted }}>Dismiss</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </Animated.View>

      {/* Drag pill */}
      {!expanded && (
        <View style={[styles.dragPill, { backgroundColor: colors.textMuted + "55" }]} />
      )}
    </Animated.View>
  );
}

function hasActions(type: string): boolean {
  return ["message", "follow", "like", "reply", "mention", "order", "escrow", "gift", "payment"].includes(type);
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 10,
    right: 10,
    zIndex: 9999,
    elevation: 20,
    alignItems: "center",
  },
  card: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      web: { boxShadow: "0 6px 14px rgba(0,0,0,0.22)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 14, elevation: 12 },
    }),
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    position: "relative",
  },
  avatarImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarInitial: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  typeDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
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
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    lineHeight: 17,
  },
  body: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  chevronBtn: {
    padding: 4,
  },
  closeBtn: {
    padding: 4,
  },
  actionsPanel: {
    width: "100%",
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    ...Platform.select({
      web: { boxShadow: "0 6px 12px rgba(0,0,0,0.18)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 10 },
    }),
  },
  replyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  replyInput: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionFeedback: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    justifyContent: "center",
  },
  dragPill: {
    width: 34,
    height: 4,
    borderRadius: 2,
    marginTop: 6,
  },
});
