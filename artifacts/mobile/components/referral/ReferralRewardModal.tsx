/**
 * ReferralRewardModal — shown to the invitee immediately after onboarding
 * when they signed up with a referral code.
 *
 * Shows:
 *  - Animated platinum crown with pulsing glow
 *  - Referrer's avatar + name ("Invited by …")
 *  - "7 days free Platinum" reward badge
 *  - "Your friend earned +2,000 Nexa" secondary reward
 *  - Floating star particles for celebration
 *  - Single CTA to start using the app
 */

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReferralRewardModalProps = {
  visible: boolean;
  referrerName: string;
  referrerHandle: string;
  referrerAvatar?: string | null;
  onDismiss: () => void;
};

// ─── Star particle ────────────────────────────────────────────────────────────

type StarProps = { x: number; delay: number; color: string };

function Star({ x, delay, color }: StarProps) {
  const translateY = useRef(new Animated.Value(60)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const scale      = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(translateY, { toValue: -120, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(opacity,    { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(opacity,    { toValue: 0, duration: 1400, delay: 800, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.3, duration: 1000, delay: 600, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(translateY, { toValue: 60, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{ position: "absolute", left: x, bottom: "30%", opacity, transform: [{ translateY }, { scale }] }}>
      <Ionicons name="star" size={12} color={color} />
    </Animated.View>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

const PLATINUM = "#A855F7";
const GOLD     = "#F59E0B";
const STARS = [
  { x: 14,  delay: 0,    color: GOLD     },
  { x: 55,  delay: 400,  color: PLATINUM },
  { x: 100, delay: 200,  color: "#60A5FA"},
  { x: 155, delay: 700,  color: GOLD     },
  { x: 200, delay: 100,  color: PLATINUM },
  { x: 248, delay: 500,  color: "#34D399"},
  { x: 290, delay: 300,  color: GOLD     },
];

export function ReferralRewardModal({
  visible,
  referrerName,
  referrerHandle,
  referrerAvatar,
  onDismiss,
}: ReferralRewardModalProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // Card entrance
  const cardScale   = useRef(new Animated.Value(0.82)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  // Crown pulse
  const crownScale  = useRef(new Animated.Value(1)).current;
  const crownGlow   = useRef(new Animated.Value(0)).current;
  // Reward badge bounce
  const badgeY      = useRef(new Animated.Value(24)).current;
  const badgeOpac   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Entrance
    Animated.parallel([
      Animated.spring(cardScale,   { toValue: 1, damping: 13, stiffness: 110, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();

    // Crown pulse — starts after card is in
    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(crownScale, { toValue: 1.14, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(crownGlow,  { toValue: 1,    duration: 800, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(crownScale, { toValue: 1,    duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(crownGlow,  { toValue: 0,    duration: 800, useNativeDriver: true }),
          ]),
        ])
      ).start();
    }, 300);

    // Badge slides up
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(badgeY,    { toValue: 0, damping: 11, stiffness: 100, useNativeDriver: true }),
        Animated.timing(badgeOpac, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    }, 500);
  }, [visible]);

  const initials = referrerName
    ? referrerName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        {/* Floating stars */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {STARS.map((s, i) => <Star key={i} {...s} />)}
        </View>

        <Animated.View style={[styles.card, { backgroundColor: colors.surface, transform: [{ scale: cardScale }], opacity: cardOpacity }]}>

          {/* ── Gradient header with crown ── */}
          <LinearGradient
            colors={["#7C3AED", "#A855F7", "#C084FC"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            {/* Crown icon with animated glow */}
            <Animated.View style={[styles.crownWrap, { transform: [{ scale: crownScale }] }]}>
              <Animated.View style={[
                styles.crownGlow,
                { opacity: crownGlow, shadowColor: GOLD, shadowRadius: 18, shadowOpacity: 1 },
              ]} />
              <Text style={styles.crownEmoji}>👑</Text>
            </Animated.View>

            <Text style={styles.headerTitle}>You're In!</Text>
            <Text style={styles.headerSub}>Your Platinum access is ready</Text>
          </LinearGradient>

          {/* ── Body ── */}
          <View style={styles.body}>

            {/* Referred by */}
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>INVITED BY</Text>
            <View style={styles.referrerRow}>
              {referrerAvatar ? (
                <ExpoImage source={{ uri: referrerAvatar }} style={styles.avatar} contentFit="cover" />
              ) : (
                <LinearGradient colors={["#7C3AED", "#A855F7"]} style={styles.avatar}>
                  <Text style={styles.initials}>{initials}</Text>
                </LinearGradient>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.referrerName, { color: colors.text }]} numberOfLines={1}>{referrerName}</Text>
                <Text style={[styles.referrerHandle, { color: colors.textSecondary }]}>@{referrerHandle}</Text>
              </View>
              <View style={[styles.friendBadge, { backgroundColor: PLATINUM + "20" }]}>
                <Ionicons name="people-outline" size={12} color={PLATINUM} />
                <Text style={[styles.friendBadgeText, { color: PLATINUM }]}>Friend</Text>
              </View>
            </View>

            {/* Reward cards */}
            <Animated.View style={{ transform: [{ translateY: badgeY }], opacity: badgeOpac, gap: 10 }}>

              {/* Platinum reward */}
              <LinearGradient
                colors={["#7C3AED18", "#A855F710"]}
                style={[styles.rewardCard, { borderColor: PLATINUM + "40" }]}
              >
                <View style={[styles.rewardIcon, { backgroundColor: PLATINUM + "22" }]}>
                  <Ionicons name="diamond" size={20} color={PLATINUM} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rewardTitle, { color: colors.text }]}>7 Days Free Platinum</Text>
                  <Text style={[styles.rewardDesc, { color: colors.textSecondary }]}>
                    AI image generation, verified badge, exclusive gifts & more
                  </Text>
                </View>
                <View style={[styles.rewardBadge, { backgroundColor: PLATINUM }]}>
                  <Text style={styles.rewardBadgeText}>FREE</Text>
                </View>
              </LinearGradient>

              {/* Referrer reward */}
              <LinearGradient
                colors={[GOLD + "18", GOLD + "10"]}
                style={[styles.rewardCard, { borderColor: GOLD + "40" }]}
              >
                <View style={[styles.rewardIcon, { backgroundColor: GOLD + "22" }]}>
                  <Ionicons name="flash" size={20} color={GOLD} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rewardTitle, { color: colors.text }]}>
                    {referrerName.split(" ")[0]} earned +2,000 Nexa
                  </Text>
                  <Text style={[styles.rewardDesc, { color: colors.textSecondary }]}>
                    Your friend was rewarded for the invite — that's teamwork!
                  </Text>
                </View>
                <Ionicons name="checkmark-circle" size={22} color={GOLD} />
              </LinearGradient>

            </Animated.View>
          </View>

          {/* ── CTA button ── */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <TouchableOpacity activeOpacity={0.87} onPress={onDismiss}>
              <LinearGradient
                colors={["#7C3AED", "#A855F7"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.ctaBtn}
              >
                <Text style={styles.ctaText}>Start Exploring</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 18,
  },
  header: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 24,
    gap: 6,
  },
  crownWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  crownGlow: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#F59E0B30",
  },
  crownEmoji: {
    fontSize: 48,
    lineHeight: 54,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: -0.4,
  },
  headerSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.82)",
    fontFamily: "Inter_400Regular",
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  referrerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  initials: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  referrerName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  referrerHandle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  friendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  friendBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  rewardCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  rewardIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rewardTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  rewardDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
  },
  rewardBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  rewardBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
