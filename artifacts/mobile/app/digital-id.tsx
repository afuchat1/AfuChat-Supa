import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = Math.min(SCREEN_W - 48, 360);
const CARD_H = CARD_W * 0.62;

function toAfuId(uuid: string): string {
  const hex = uuid.replace(/-/g, "").slice(0, 8);
  const num = parseInt(hex, 16) % 100000000;
  return num.toString().padStart(8, "0");
}

function GradeInfo(grade: string): { label: string; colors: [string, string]; icon: string } {
  const map: Record<string, { label: string; colors: [string, string]; icon: string }> = {
    bronze: { label: "Bronze", colors: ["#CD7F32", "#8B4513"], icon: "shield-outline" },
    silver: { label: "Silver", colors: ["#C0C0C0", "#808080"], icon: "shield-half-outline" },
    gold: { label: "Gold", colors: ["#D4A853", "#B8860B"], icon: "shield" },
    platinum: { label: "Platinum", colors: ["#00C2CB", "#006E78"], icon: "star" },
    diamond: { label: "Diamond", colors: ["#B9F2FF", "#4FC3F7"], icon: "diamond-outline" },
    legend: { label: "Legend", colors: ["#FF6B6B", "#FF1744"], icon: "flame" },
  };
  return map[grade] || { label: "Explorer", colors: ["#8E8E93", "#636366"], icon: "compass-outline" };
}

function HoloShimmer() {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 2800, easing: Easing.linear }),
      -1,
      false
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-CARD_W * 2, CARD_W * 2]) }],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]} pointerEvents="none">
      <Animated.View style={[styles.shimmerStreak, style]} />
    </Animated.View>
  );
}

function FloatingOrb({ delay, x, y, size, color }: { delay: number; x: string; y: string; size: number; color: string }) {
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1, { duration: 3000 + delay * 200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 3000 + delay * 200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    ));
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(float.value, [0, 1], [0, -12]) }],
    opacity: interpolate(float.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
  }));
  return (
    <Animated.View
      style={[{ position: "absolute", left: x as any, top: y as any, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
      pointerEvents="none"
    />
  );
}

function CardFront({ profile, grade }: { profile: any; grade: ReturnType<typeof GradeInfo> }) {
  const afuId = toAfuId(profile?.id || "00000000");
  const joinYear = profile?.id ? new Date().getFullYear() : 2024;
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["#0D1117", "#0A2540", "#0D1117"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <FloatingOrb delay={0} x="10%" y="20%" size={80} color="#00C2CB" />
      <FloatingOrb delay={500} x="65%" y="10%" size={60} color="#AF52DE" />
      <FloatingOrb delay={1000} x="80%" y="60%" size={40} color="#FF6B6B" />
      <HoloShimmer />
      <View style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          <View>
            <Text style={styles.cardAppName}>AfuChat</Text>
            <LinearGradient colors={grade.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradeBadge}>
              <Ionicons name={grade.icon as any} size={11} color="#fff" />
              <Text style={styles.gradeText}>{grade.label}</Text>
            </LinearGradient>
          </View>
          <View style={styles.avatarWrapper}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.cardAvatar} />
            ) : (
              <View style={[styles.cardAvatar, styles.cardAvatarFallback]}>
                <Text style={styles.avatarInitial}>
                  {(profile?.display_name || "?")[0].toUpperCase()}
                </Text>
              </View>
            )}
            <LinearGradient colors={grade.colors} style={styles.avatarRing} />
          </View>
        </View>
        <View style={styles.cardMidRow}>
          <Text style={styles.displayName} numberOfLines={1}>
            {profile?.display_name || "AfuChat User"}
          </Text>
          <Text style={styles.handleText}>@{profile?.handle || "user"}</Text>
        </View>
        <View style={styles.cardBottomRow}>
          <View>
            <Text style={styles.idLabel}>AFUID</Text>
            <Text style={styles.idNumber}>{afuId}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.idLabel}>MEMBER SINCE</Text>
            <Text style={styles.idNumber}>{joinYear}</Text>
          </View>
        </View>
      </View>
      <LinearGradient
        colors={["transparent", `${grade.colors[0]}22`, `${grade.colors[1]}44`]}
        style={[StyleSheet.absoluteFill, { opacity: 0.6 }]}
        start={{ x: 0, y: 0.6 }}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
      />
    </View>
  );
}

function CardBack({ profile }: { profile: any }) {
  const xp = profile?.xp || 0;
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const afuId = toAfuId(profile?.id || "00000000");

  const stats = [
    { label: "XP", value: xp.toLocaleString() },
    { label: "Level", value: level.toString() },
    { label: "ACoins", value: (profile?.acoin || 0).toLocaleString() },
  ];

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["#0A2540", "#0D1117", "#1A0A2E"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <HoloShimmer />
      <View style={styles.cardContent}>
        <Text style={[styles.cardAppName, { marginBottom: 12 }]}>Digital Profile</Text>
        <View style={styles.statsRow}>
          {stats.map((s) => (
            <View key={s.label} style={styles.statBox}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.qrArea}>
          <View style={styles.qrBox}>
            <Ionicons name="qr-code-outline" size={52} color="#00C2CB" />
          </View>
          <View style={{ marginLeft: 16 }}>
            <Text style={styles.qrLabel}>AFUID</Text>
            <Text style={styles.idNumber}>{afuId}</Text>
            <Text style={[styles.qrLabel, { marginTop: 8 }]}>SCAN TO ADD</Text>
            <Text style={[styles.qrLabel, { color: "#00C2CB", marginTop: 2 }]}>@{profile?.handle || "user"}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function DigitalIdScreen() {
  const { profile } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const grade = GradeInfo(profile?.current_grade || "explorer");

  const flipProgress = useSharedValue(0);
  const isFlipped = useRef(false);
  const cardScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.5);

  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.4, { duration: 2000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    cardScale.value = withDelay(300, withSpring(1, { damping: 12 }));
  }, []);

  function flip() {
    isFlipped.current = !isFlipped.current;
    cardScale.value = withSequence(
      withSpring(0.95, { damping: 10 }),
      withSpring(1, { damping: 10 })
    );
    flipProgress.value = withTiming(isFlipped.current ? 1 : 0, {
      duration: 600,
      easing: Easing.inOut(Easing.cubic),
    });
  }

  const frontStyle = useAnimatedStyle(() => {
    const rot = interpolate(flipProgress.value, [0, 1], [0, 180]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rot}deg` }, { scale: cardScale.value }],
      opacity: rot > 90 ? 0 : 1,
      zIndex: rot > 90 ? 0 : 1,
      backfaceVisibility: "hidden",
    };
  });

  const backStyle = useAnimatedStyle(() => {
    const rot = interpolate(flipProgress.value, [0, 1], [180, 360]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rot}deg` }, { scale: cardScale.value }],
      opacity: rot < 270 ? 0 : 1,
      zIndex: rot < 270 ? 0 : 1,
      backfaceVisibility: "hidden",
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Check out my AfuChat Digital ID! I'm @${profile?.handle} — find me on AfuChat! 🌟`,
      });
    } catch {}
  }, [profile]);

  return (
    <View style={[styles.screen, { backgroundColor: isDark ? "#05080F" : "#0D1117", paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Digital ID</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Ionicons name="share-outline" size={22} color="#00C2CB" />
        </TouchableOpacity>
      </View>

      <View style={styles.cardContainer}>
        <Animated.View style={[styles.glowRing, glowStyle, { borderColor: grade.colors[0] }]} pointerEvents="none" />

        <TouchableOpacity onPress={flip} activeOpacity={1} style={{ width: CARD_W, height: CARD_H }}>
          <Animated.View style={[styles.card, frontStyle, { width: CARD_W, height: CARD_H }]}>
            <CardFront profile={profile} grade={grade} />
          </Animated.View>
          <Animated.View style={[styles.card, backStyle, { width: CARD_W, height: CARD_H, position: "absolute", top: 0 }]}>
            <CardBack profile={profile} />
          </Animated.View>
        </TouchableOpacity>

        <Text style={styles.tapHint}>Tap card to flip</Text>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>Your Identity</Text>
        <View style={[styles.infoCard, { backgroundColor: "#111827" }]}>
          {[
            { icon: "person-outline", label: "Display Name", value: profile?.display_name || "—" },
            { icon: "at-outline", label: "Handle", value: `@${profile?.handle || "—"}` },
            { icon: "id-card-outline", label: "AfuChat ID", value: toAfuId(profile?.id || "00000000") },
            { icon: "trophy-outline", label: "Grade", value: grade.label },
            { icon: "star-outline", label: "Total XP", value: (profile?.xp || 0).toLocaleString() },
          ].map((item, i) => (
            <View key={i} style={[styles.infoRow, i > 0 && { borderTopWidth: 1, borderTopColor: "#1E2D3D" }]}>
              <View style={styles.infoIcon}>
                <Ionicons name={item.icon as any} size={16} color="#00C2CB" />
              </View>
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={styles.infoValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  shareBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  cardContainer: {
    alignItems: "center",
    paddingVertical: 28,
  },
  glowRing: {
    position: "absolute",
    width: CARD_W + 32,
    height: CARD_H + 32,
    borderRadius: 28,
    borderWidth: 1,
    shadowColor: "#00C2CB",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  card: {
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  cardContent: { flex: 1, padding: 20, justifyContent: "space-between" },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardAppName: { color: "#00C2CB", fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  gradeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  gradeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  avatarWrapper: { position: "relative", width: 52, height: 52 },
  cardAvatar: { width: 52, height: 52, borderRadius: 26 },
  cardAvatarFallback: { backgroundColor: "#1E3A5F", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#00C2CB", fontSize: 22, fontFamily: "Inter_700Bold" },
  avatarRing: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 28,
    opacity: 0.5,
    borderWidth: 2,
    borderColor: "transparent",
  },
  cardMidRow: { paddingVertical: 4 },
  displayName: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  handleText: { color: "#6B90B4", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 10,
  },
  idLabel: { color: "#4A7A9B", fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  idNumber: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 1, marginTop: 2 },
  shimmerStreak: {
    width: 60,
    height: "200%",
    backgroundColor: "rgba(255,255,255,0.06)",
    transform: [{ rotate: "25deg" }],
    top: "-50%",
  },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  statValue: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { color: "#4A7A9B", fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  qrArea: { flexDirection: "row", alignItems: "center" },
  qrBox: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: "rgba(0,194,203,0.08)",
    borderWidth: 1,
    borderColor: "rgba(0,194,203,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  qrLabel: { color: "#4A7A9B", fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  tapHint: { color: "#4A7A9B", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 14 },
  infoSection: { flex: 1, paddingHorizontal: 24 },
  infoTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  infoCard: { borderRadius: 16, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(0,194,203,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: { flex: 1, color: "#6B90B4", fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
