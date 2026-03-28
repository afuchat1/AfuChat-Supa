import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  ScrollView,
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
import QRCode from "react-native-qrcode-svg";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

const afuSymbol = require("@/assets/images/afu-symbol.png");

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = Math.min(SCREEN_W - 48, 380);
const CARD_H = CARD_W * 0.6;

function toAfuId(uuid: string): string {
  const hex = uuid.replace(/-/g, "").slice(0, 8);
  const num = parseInt(hex, 16) % 100000000;
  return num.toString().padStart(8, "0");
}

function formatAfuId(id: string): string {
  return `${id.slice(0, 4)} ${id.slice(4)}`;
}

function encodeCardPayload(profile: any, isPremium: boolean, stats: any): string {
  const payload = {
    v: 1,
    t: "afuchat_id",
    id: profile?.id || "",
    afu_id: toAfuId(profile?.id || "00000000"),
    handle: profile?.handle || "",
    name: profile?.display_name || "",
    bio: profile?.bio || "",
    country: profile?.country || "",
    region: profile?.region || "",
    gender: profile?.gender || "",
    lang: profile?.language || "",
    website: profile?.website_url || "",
    verified: profile?.is_verified || false,
    premium: isPremium,
    grade: profile?.current_grade || "explorer",
    xp: profile?.xp || 0,
    acoin: profile?.acoin || 0,
    level: Math.floor(Math.sqrt((profile?.xp || 0) / 100)) + 1,
    joined: profile?.created_at || "",
    interests: profile?.interests || [],
    tipping: profile?.tipping_enabled || false,
    stats: stats || {},
  };
  const json = JSON.stringify(payload);
  let encoded = "";
  try {
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    encoded = btoa(binary);
  } catch {
    encoded = btoa(unescape(encodeURIComponent(json)));
  }
  return `afuchat://id/${encoded}`;
}

function GradeInfo(grade: string): { label: string; colors: [string, string]; icon: string; textColor: string } {
  const map: Record<string, { label: string; colors: [string, string]; icon: string; textColor: string }> = {
    bronze: { label: "Bronze", colors: ["#CD7F32", "#A0602A"], icon: "shield-outline", textColor: "#CD7F32" },
    silver: { label: "Silver", colors: ["#C0C0C0", "#909090"], icon: "shield-half-outline", textColor: "#808080" },
    gold: { label: "Gold", colors: ["#D4A853", "#B8860B"], icon: "shield", textColor: "#B8860B" },
    platinum: { label: "Platinum", colors: ["#00C2CB", "#008B93"], icon: "star", textColor: "#008B93" },
    diamond: { label: "Diamond", colors: ["#B9F2FF", "#4FC3F7"], icon: "diamond-outline", textColor: "#0288D1" },
    legend: { label: "Legend", colors: ["#FF6B6B", "#E53E3E"], icon: "flame", textColor: "#E53E3E" },
  };
  return map[grade] || { label: "Explorer", colors: ["#8E8E93", "#636366"], icon: "compass-outline", textColor: "#636366" };
}

function HoloShimmer() {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.linear }), -1, false);
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
        withTiming(1, { duration: 3500 + delay * 150, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 3500 + delay * 150, easing: Easing.inOut(Easing.sin) })
      ), -1, false
    ));
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(float.value, [0, 1], [0, -10]) }],
    opacity: interpolate(float.value, [0, 0.5, 1], [0.15, 0.35, 0.15]),
  }));
  return (
    <Animated.View
      style={[{ position: "absolute", left: x as any, top: y as any, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
      pointerEvents="none"
    />
  );
}

function MicroPattern() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.patternDot1} />
      <View style={styles.patternDot2} />
      <View style={styles.patternDot3} />
      <View style={styles.patternLine} />
    </View>
  );
}

function CardFront({ profile, grade, isPremium }: { profile: any; grade: ReturnType<typeof GradeInfo>; isPremium: boolean }) {
  const afuId = formatAfuId(toAfuId(profile?.id || "00000000"));
  const joinDate = profile?.created_at ? new Date(profile.created_at) : null;
  const joinStr = joinDate ? joinDate.toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "\u2014";

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={["#080E18", "#0C1929", "#0A1220"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <FloatingOrb delay={0} x="8%" y="15%" size={90} color={Colors.brand} />
      <FloatingOrb delay={600} x="70%" y="8%" size={55} color={grade.colors[0]} />
      <FloatingOrb delay={1200} x="75%" y="65%" size={35} color={Colors.brand} />
      <MicroPattern />
      <HoloShimmer />
      <LinearGradient colors={[`${grade.colors[0]}08`, `${grade.colors[0]}18`, `${grade.colors[1]}30`]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 1 }} pointerEvents="none" />

      <View style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          <View style={styles.brandRow}>
            <Image source={afuSymbol} style={styles.brandSymbol} resizeMode="contain" />
            <View>
              <Text style={styles.cardAppName}>AFUCHAT</Text>
              <Text style={styles.cardSubtitle}>DIGITAL IDENTITY</Text>
            </View>
          </View>
          <View style={styles.avatarOuter}>
            <LinearGradient colors={grade.colors} style={styles.avatarGradientRing}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.cardAvatar} />
              ) : (
                <View style={[styles.cardAvatar, styles.cardAvatarFallback]}>
                  <Text style={styles.avatarInitial}>{(profile?.display_name || "?")[0].toUpperCase()}</Text>
                </View>
              )}
            </LinearGradient>
            {isPremium && (
              <View style={styles.premiumBadge}><Ionicons name="diamond" size={8} color="#fff" /></View>
            )}
          </View>
        </View>

        <View style={styles.cardMidRow}>
          <Text style={styles.displayName} numberOfLines={1}>{profile?.display_name || "AfuChat User"}</Text>
          <View style={styles.handleGradeRow}>
            <Text style={styles.handleText}>@{profile?.handle || "user"}</Text>
            <LinearGradient colors={grade.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradeBadge}>
              <Ionicons name={grade.icon as any} size={9} color="#fff" />
              <Text style={styles.gradeText}>{grade.label}</Text>
            </LinearGradient>
          </View>
        </View>

        <View style={styles.cardBottomRow}>
          <View>
            <Text style={styles.idLabel}>AFU ID</Text>
            <Text style={styles.idNumber}>{afuId}</Text>
          </View>
          <View style={styles.bottomCenter}>
            <Text style={styles.idLabel}>STATUS</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={[styles.idNumber, { color: "#34C759" }]}>Active</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.idLabel}>SINCE</Text>
            <Text style={styles.idNumber}>{joinStr}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function CardBack({ profile, grade, isPremium, qrValue }: { profile: any; grade: ReturnType<typeof GradeInfo>; isPremium: boolean; qrValue: string }) {
  const xp = profile?.xp || 0;
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const acoin = profile?.acoin || 0;
  const afuId = formatAfuId(toAfuId(profile?.id || "00000000"));
  const handle = profile?.handle || "user";

  const cardStats = [
    { label: "NEXA", value: xp.toLocaleString(), icon: "flash" as const, color: Colors.brand },
    { label: "LEVEL", value: level.toString(), icon: "trending-up" as const, color: "#FF9500" },
    { label: "ACOIN", value: acoin.toLocaleString(), icon: "diamond" as const, color: Colors.gold },
  ];

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={["#0A1220", "#080E18", "#0F0A1E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <FloatingOrb delay={300} x="5%" y="60%" size={50} color={grade.colors[0]} />
      <FloatingOrb delay={900} x="80%" y="20%" size={40} color={Colors.brand} />
      <MicroPattern />
      <HoloShimmer />

      <View style={styles.cardContent}>
        <View style={styles.backTopRow}>
          <View style={styles.brandRow}>
            <Image source={afuSymbol} style={styles.brandSymbol} resizeMode="contain" />
            <Text style={styles.cardAppName}>AFUCHAT</Text>
          </View>
          {isPremium && (
            <LinearGradient colors={[Colors.gold, "#B8860B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.premiumTag}>
              <Ionicons name="diamond" size={9} color="#fff" />
              <Text style={styles.premiumTagText}>PREMIUM</Text>
            </LinearGradient>
          )}
        </View>

        <View style={styles.statsRow}>
          {cardStats.map((s) => (
            <View key={s.label} style={styles.statBox}>
              <Ionicons name={s.icon} size={14} color={s.color} style={{ marginBottom: 4 }} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.backBottomRow}>
          <View style={styles.qrBox}>
            <QRCode value={qrValue} size={48} color={Colors.brand} backgroundColor="transparent" />
          </View>
          <View style={styles.backBottomInfo}>
            <Text style={styles.idLabel}>AFU ID</Text>
            <Text style={[styles.idNumber, { fontSize: 14, letterSpacing: 2 }]}>{afuId}</Text>
            <Text style={[styles.idLabel, { marginTop: 6 }]}>SCAN TO VERIFY</Text>
            <Text style={[styles.idNumber, { color: Colors.brand }]}>@{handle}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function DigitalIdScreen() {
  const { user, profile, isPremium } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const grade = GradeInfo(profile?.current_grade || "explorer");
  const [qrPayload, setQrPayload] = useState(`afuchat://user/${profile?.handle || "user"}`);

  const flipProgress = useSharedValue(0);
  const isFlipped = useRef(false);
  const cardScale = useSharedValue(0.92);
  const glowOpacity = useSharedValue(0.4);

  useEffect(() => {
    cardScale.value = withDelay(100, withSpring(1, { damping: 14, stiffness: 90 }));
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.3, { duration: 2200, easing: Easing.inOut(Easing.sin) })
      ), -1, false
    );
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all([
          supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", user.id),
          supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", user.id),
          supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", user.id),
          supabase.from("gift_transactions").select("id", { count: "exact", head: true }).eq("sender_id", user.id),
          supabase.from("gift_transactions").select("id", { count: "exact", head: true }).eq("receiver_id", user.id),
          supabase.from("xp_transfers").select("id", { count: "exact", head: true }).eq("sender_id", user.id),
          supabase.from("xp_transfers").select("id", { count: "exact", head: true }).eq("receiver_id", user.id),
          supabase.from("acoin_transactions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
          supabase.from("red_envelopes").select("id", { count: "exact", head: true }).eq("sender_id", user.id),
          supabase.from("red_envelope_claims").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        ]);

        if (cancelled) return;

        const sc = (r: { count: number | null; error: any }) => (r.error ? 0 : r.count || 0);

        const createdAt = profile?.created_at ? new Date(profile.created_at) : new Date();
        const daysOnPlatform = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));

        const statsObj = {
          followers: sc(results[0]),
          following: sc(results[1]),
          posts: sc(results[2]),
          gifts_sent: sc(results[3]),
          gifts_recv: sc(results[4]),
          nexa_sent: sc(results[5]),
          nexa_recv: sc(results[6]),
          acoin_tx: sc(results[7]),
          envelopes_sent: sc(results[8]),
          envelopes_recv: sc(results[9]),
          days: daysOnPlatform,
        };

        const encoded = encodeCardPayload(profile, isPremium, statsObj);
        setQrPayload(encoded);
      } catch (e) {
        console.warn("Failed to build QR payload:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [user, profile]);

  function flip() {
    isFlipped.current = !isFlipped.current;
    cardScale.value = withSequence(withSpring(0.94, { damping: 10 }), withSpring(1, { damping: 10 }));
    flipProgress.value = withTiming(isFlipped.current ? 1 : 0, { duration: 650, easing: Easing.inOut(Easing.cubic) });
  }

  const frontStyle = useAnimatedStyle(() => {
    const rot = interpolate(flipProgress.value, [0, 1], [0, 180]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rot}deg` }, { scale: cardScale.value }],
      opacity: rot > 90 ? 0 : 1, zIndex: rot > 90 ? 0 : 1, backfaceVisibility: "hidden" as const,
    };
  });

  const backStyle = useAnimatedStyle(() => {
    const rot = interpolate(flipProgress.value, [0, 1], [180, 360]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rot}deg` }, { scale: cardScale.value }],
      opacity: rot < 270 ? 0 : 1, zIndex: rot < 270 ? 0 : 1, backfaceVisibility: "hidden" as const,
    };
  });

  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  const handleShare = useCallback(async () => {
    try {
      await Share.share({ message: `Check out my AfuChat Digital ID! I'm @${profile?.handle} on AfuChat. Afu ID: ${formatAfuId(toAfuId(profile?.id || "00000000"))}` });
    } catch {}
  }, [profile]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Digital ID</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Ionicons name="share-outline" size={22} color={Colors.brand} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32, flexGrow: 1, justifyContent: "center" }} showsVerticalScrollIndicator={false}>
        <View style={styles.cardContainer}>
          <Animated.View style={[styles.glowRing, glowStyle, { borderColor: grade.colors[0], shadowColor: grade.colors[0] }]} pointerEvents="none" />
          <TouchableOpacity onPress={flip} activeOpacity={1} style={{ width: CARD_W, height: CARD_H }}>
            <Animated.View style={[styles.card, frontStyle, { width: CARD_W, height: CARD_H }]}>
              <CardFront profile={profile} grade={grade} isPremium={isPremium} />
            </Animated.View>
            <Animated.View style={[styles.card, backStyle, { width: CARD_W, height: CARD_H, position: "absolute", top: 0 }]}>
              <CardBack profile={profile} grade={grade} isPremium={isPremium} qrValue={qrPayload} />
            </Animated.View>
          </TouchableOpacity>
          <View style={styles.tapHintRow}>
            <Ionicons name="sync-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.tapHint, { color: colors.textMuted }]}>Tap card to flip</Text>
          </View>
        </View>

        <View style={styles.infoFooter}>
          <View style={[styles.securityCard, { backgroundColor: isDark ? "#0D1B2A" : `${Colors.brand}08`, borderColor: isDark ? "#1A3040" : `${Colors.brand}20`, borderWidth: 1 }]}>
            <Ionicons name="qr-code-outline" size={18} color={Colors.brand} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.securityTitle, { color: colors.text }]}>Encoded Identity</Text>
              <Text style={[styles.securitySub, { color: colors.textMuted }]}>Your full profile data is encoded in the QR code. Only visible when scanned by an authorized device.</Text>
            </View>
          </View>

          <View style={[styles.idChip, { backgroundColor: isDark ? "#111827" : colors.surface, borderColor: isDark ? "#1E2D3D" : colors.border, borderWidth: isDark ? 0 : StyleSheet.hairlineWidth }]}>
            <Ionicons name="finger-print" size={20} color={Colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.idChipLabel, { color: colors.textMuted }]}>Your Afu ID</Text>
              <Text style={[styles.idChipValue, { color: colors.text }]}>{formatAfuId(toAfuId(profile?.id || "00000000"))}</Text>
            </View>
            <TouchableOpacity onPress={handleShare}>
              <Ionicons name="copy-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  shareBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  cardContainer: { alignItems: "center", paddingVertical: 24 },
  glowRing: { position: "absolute", width: CARD_W + 28, height: CARD_H + 28, borderRadius: 26, borderWidth: 1, top: 24 - 14, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 24 },
  card: { borderRadius: 20, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 28, elevation: 14 },
  cardContent: { flex: 1, padding: 20, justifyContent: "space-between" },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandSymbol: { width: 26, height: 26, borderRadius: 7 },
  cardAppName: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 2.5 },
  cardSubtitle: { color: "rgba(255,255,255,0.35)", fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 2, marginTop: 1 },
  gradeBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  gradeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_600SemiBold" },
  avatarOuter: { position: "relative" },
  avatarGradientRing: { width: 50, height: 50, borderRadius: 25, padding: 2, alignItems: "center", justifyContent: "center" },
  cardAvatar: { width: 46, height: 46, borderRadius: 23 },
  cardAvatarFallback: { backgroundColor: "#1E3A5F", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  premiumBadge: { position: "absolute", bottom: -1, right: -1, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.gold, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#080E18" },
  cardMidRow: { marginTop: -2 },
  displayName: { color: "#fff", fontSize: 19, fontFamily: "Inter_700Bold" },
  handleGradeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  handleText: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "Inter_400Regular" },
  cardBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)", paddingTop: 10 },
  bottomCenter: { alignItems: "center" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#34C759" },
  idLabel: { color: "rgba(255,255,255,0.35)", fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  idNumber: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 1, marginTop: 2 },
  shimmerStreak: { width: 50, height: "200%", backgroundColor: "rgba(255,255,255,0.04)", transform: [{ rotate: "25deg" }], top: "-50%" },
  patternDot1: { position: "absolute", top: "15%", right: "12%", width: 2, height: 2, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.06)" },
  patternDot2: { position: "absolute", top: "45%", right: "25%", width: 2, height: 2, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.04)" },
  patternDot3: { position: "absolute", bottom: "20%", left: "40%", width: 2, height: 2, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.05)" },
  patternLine: { position: "absolute", bottom: 0, left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.03)" },
  backTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  premiumTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  premiumTagText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  statsRow: { flexDirection: "row", gap: 8 },
  statBox: { flex: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, alignItems: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.06)" },
  statValue: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { color: "rgba(255,255,255,0.4)", fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 1.2, marginTop: 2 },
  qrBox: { width: 64, height: 64, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center", padding: 4 },
  backBottomRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backBottomInfo: {},
  tapHintRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 14 },
  tapHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  infoFooter: { paddingHorizontal: 24, gap: 12, marginTop: 8 },
  securityCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14 },
  securityTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  securitySub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  idChip: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14, gap: 12 },
  idChipLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  idChipValue: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: 3 },
});
