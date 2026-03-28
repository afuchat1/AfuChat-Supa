import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
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
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

const afuSymbol = require("@/assets/images/afu-symbol.png");

function useCardDimensions() {
  const { width, height } = useWindowDimensions();
  const isSmall = width < 360;
  const isTiny = width < 320;
  const maxW = Math.min(width - (isTiny ? 32 : 48), 400);
  const maxH = (height - 200) / 0.6;
  const cardW = Math.max(200, Math.min(maxW, maxH));
  const cardH = cardW * (isSmall ? 0.62 : 0.6);
  const scale = Math.max(0.55, Math.min(cardW / 380, 1.15));
  return { cardW, cardH, scale, isSmall, isTiny, screenW: width, screenH: height };
}

function toAfuId(uuid: string): string {
  const hex = uuid.replace(/-/g, "").slice(0, 8);
  const num = parseInt(hex, 16) % 100000000;
  return num.toString().padStart(8, "0");
}

function formatAfuId(id: string): string {
  return `${id.slice(0, 4)} ${id.slice(4)}`;
}

function buildQrValue(uuid: string): string {
  return `afuchat://id/${toAfuId(uuid)}`;
}

function GradeInfo(grade: string): { label: string; colors: [string, string]; icon: string; textColor: string } {
  const map: Record<string, { label: string; colors: [string, string]; icon: string; textColor: string }> = {
    bronze: { label: "Bronze", colors: ["#CD7F32", "#A0602A"], icon: "shield-outline", textColor: "#CD7F32" },
    silver: { label: "Silver", colors: ["#C0C0C0", "#909090"], icon: "shield-half-outline", textColor: "#808080" },
    gold: { label: "Gold", colors: ["#D4A853", "#B8860B"], icon: "shield", textColor: "#B8860B" },
    platinum: { label: "Platinum", colors: ["#4ECDC4", "#3BA8A1"], icon: "star", textColor: "#3BA8A1" },
    diamond: { label: "Diamond", colors: ["#B9F2FF", "#4FC3F7"], icon: "diamond-outline", textColor: "#0288D1" },
    legend: { label: "Legend", colors: ["#FF6B6B", "#E53E3E"], icon: "flame", textColor: "#E53E3E" },
  };
  return map[grade] || { label: "Explorer", colors: ["#8E8E93", "#636366"], icon: "compass-outline", textColor: "#636366" };
}

function HoloShimmer({ cardW }: { cardW: number }) {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.linear }), -1, false);
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-cardW * 2, cardW * 2]) }],
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

function CardFront({ profile, grade, isPremium, scale, cardW }: { profile: any; grade: ReturnType<typeof GradeInfo>; isPremium: boolean; scale: number; cardW: number }) {
  const afuId = formatAfuId(toAfuId(profile?.id || "00000000"));
  const joinDate = profile?.created_at ? new Date(profile.created_at) : null;
  const joinStr = joinDate ? joinDate.toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "\u2014";
  const s = scale;

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={["#080E18", "#0C1929", "#0A1220"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <FloatingOrb delay={0} x="8%" y="15%" size={90 * s} color={Colors.brand} />
      <FloatingOrb delay={600} x="70%" y="8%" size={55 * s} color={grade.colors[0]} />
      <FloatingOrb delay={1200} x="75%" y="65%" size={35 * s} color={Colors.brand} />
      <MicroPattern />
      <HoloShimmer cardW={cardW} />
      <LinearGradient colors={[`${grade.colors[0]}08`, `${grade.colors[0]}18`, `${grade.colors[1]}30`]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 1 }} pointerEvents="none" />

      <View style={[styles.cardContent, { padding: Math.max(12, 20 * s) }]}>
        <View style={styles.cardTopRow}>
          <View style={styles.brandRow}>
            <Image source={afuSymbol} style={[styles.brandSymbol, { width: 26 * s, height: 26 * s, borderRadius: 7 * s, tintColor: "#4ECDC4" }]} resizeMode="contain" />
            <View>
              <Text style={[styles.cardAppName, { fontSize: Math.max(9, 12 * s) }]}>AFUCHAT</Text>
              <Text style={[styles.cardSubtitle, { fontSize: Math.max(6, 8 * s) }]}>DIGITAL IDENTITY</Text>
            </View>
          </View>
          <View style={styles.avatarOuter}>
            <LinearGradient colors={grade.colors} style={[styles.avatarGradientRing, { width: 50 * s, height: 50 * s, borderRadius: 25 * s, padding: 2 * s }]}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={{ width: 46 * s, height: 46 * s, borderRadius: 23 * s }} />
              ) : (
                <View style={[{ width: 46 * s, height: 46 * s, borderRadius: 23 * s }, styles.cardAvatarFallback]}>
                  <Text style={[styles.avatarInitial, { fontSize: 20 * s }]}>{(profile?.display_name || "?")[0].toUpperCase()}</Text>
                </View>
              )}
            </LinearGradient>
            {isPremium && (
              <View style={[styles.premiumBadge, { width: 16 * s, height: 16 * s, borderRadius: 8 * s }]}><Ionicons name="diamond" size={Math.max(6, 8 * s)} color="#fff" /></View>
            )}
          </View>
        </View>

        <View style={styles.cardMidRow}>
          <Text style={[styles.displayName, { fontSize: Math.max(14, 19 * s) }]} numberOfLines={1}>{profile?.display_name || "AfuChat User"}</Text>
          <View style={styles.handleGradeRow}>
            <Text style={[styles.handleText, { fontSize: Math.max(10, 13 * s) }]}>@{profile?.handle || "user"}</Text>
            <LinearGradient colors={grade.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.gradeBadge, { paddingHorizontal: 7 * s, paddingVertical: 2 * s }]}>
              <Ionicons name={grade.icon as any} size={Math.max(7, 9 * s)} color="#fff" />
              <Text style={[styles.gradeText, { fontSize: Math.max(7, 9 * s) }]}>{grade.label}</Text>
            </LinearGradient>
          </View>
          {(profile?.country || profile?.region) ? (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={Math.max(8, 10 * s)} color="#4ECDC4" />
              <Text style={[styles.locationText, { fontSize: Math.max(8, 10 * s) }]}>{[profile?.region, profile?.country].filter(Boolean).join(", ")}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.cardBottomRow, { paddingTop: 8 * s }]}>
          <View>
            <Text style={[styles.idLabel, { fontSize: Math.max(6, 8 * s) }]}>AFU ID</Text>
            <Text style={[styles.idNumber, { fontSize: Math.max(10, 12 * s) }]}>{afuId}</Text>
          </View>
          <View style={styles.bottomCenter}>
            <Text style={[styles.idLabel, { fontSize: Math.max(6, 8 * s) }]}>STATUS</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { width: 5 * s, height: 5 * s, borderRadius: 3 * s }]} />
              <Text style={[styles.idNumber, { color: "#34C759", fontSize: Math.max(10, 12 * s) }]}>Active</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.idLabel, { fontSize: Math.max(6, 8 * s) }]}>SINCE</Text>
            <Text style={[styles.idNumber, { fontSize: Math.max(10, 12 * s) }]}>{joinStr}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function CardBack({ profile, grade, isPremium, qrValue, scale, cardW }: { profile: any; grade: ReturnType<typeof GradeInfo>; isPremium: boolean; qrValue: string; scale: number; cardW: number }) {
  const xp = profile?.xp || 0;
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const acoin = profile?.acoin || 0;
  const afuId = formatAfuId(toAfuId(profile?.id || "00000000"));
  const handle = profile?.handle || "user";
  const s = scale;

  const qrSize = Math.max(48, Math.round(72 * s));
  const qrBoxSize = qrSize + 16;

  const cardStats = [
    { label: "NEXA", value: xp.toLocaleString(), icon: "flash" as const, color: Colors.brand },
    { label: "LEVEL", value: level.toString(), icon: "trending-up" as const, color: "#FF9500" },
    { label: "ACOIN", value: acoin.toLocaleString(), icon: "diamond" as const, color: Colors.gold },
  ];

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={["#0A1220", "#080E18", "#0F0A1E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <FloatingOrb delay={300} x="5%" y="60%" size={50 * s} color={grade.colors[0]} />
      <FloatingOrb delay={900} x="80%" y="20%" size={40 * s} color={Colors.brand} />
      <MicroPattern />
      <HoloShimmer cardW={cardW} />

      <View style={[styles.cardContent, { padding: Math.max(12, 20 * s) }]}>
        <View style={styles.backTopRow}>
          <View style={styles.brandRow}>
            <Image source={afuSymbol} style={[styles.brandSymbol, { width: 26 * s, height: 26 * s, borderRadius: 7 * s, tintColor: "#4ECDC4" }]} resizeMode="contain" />
            <Text style={[styles.cardAppName, { fontSize: Math.max(9, 12 * s) }]}>AFUCHAT</Text>
          </View>
          {isPremium && (
            <LinearGradient colors={[Colors.gold, "#B8860B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.premiumTag, { paddingHorizontal: 8 * s, paddingVertical: 3 * s }]}>
              <Ionicons name="diamond" size={Math.max(7, 9 * s)} color="#fff" />
              <Text style={[styles.premiumTagText, { fontSize: Math.max(7, 9 * s) }]}>PREMIUM</Text>
            </LinearGradient>
          )}
        </View>

        <View style={[styles.statsRow, { gap: 6 * s }]}>
          {cardStats.map((st) => (
            <View key={st.label} style={[styles.statBox, { borderRadius: 10 * s, paddingVertical: 8 * s, paddingHorizontal: 6 * s }]}>
              <Ionicons name={st.icon} size={Math.max(10, 14 * s)} color={st.color} style={{ marginBottom: 3 * s }} />
              <Text style={[styles.statValue, { fontSize: Math.max(12, 16 * s) }]}>{st.value}</Text>
              <Text style={[styles.statLabel, { fontSize: Math.max(6, 8 * s) }]}>{st.label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.backBottomRow, { gap: 10 * s }]}>
          <View style={[styles.qrBox, { width: qrBoxSize, height: qrBoxSize, borderRadius: 12 * s }]}>
            <QRCode value={qrValue} size={qrSize} color="#0A1220" backgroundColor="#fff" quietZone={2} />
          </View>
          <View style={styles.backBottomInfo}>
            <Text style={[styles.idLabel, { fontSize: Math.max(6, 8 * s) }]}>AFU ID</Text>
            <Text style={[styles.idNumber, { fontSize: Math.max(11, 15 * s), letterSpacing: 2 * s }]}>{afuId}</Text>
            <Text style={[styles.idLabel, { marginTop: 4 * s, fontSize: Math.max(6, 8 * s) }]}>SCAN TO PAY</Text>
            <Text style={[styles.idNumber, { color: Colors.brand, fontSize: Math.max(10, 12 * s) }]}>@{handle}</Text>
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
  const { cardW, cardH, scale, isSmall, isTiny } = useCardDimensions();
  const grade = GradeInfo(profile?.current_grade || "explorer");
  const [qrPayload, setQrPayload] = useState(user?.id ? buildQrValue(user.id) : `afuchat://id/00000000`);

  const cardRef = useRef<View>(null);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
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
    if (user?.id) {
      setQrPayload(buildQrValue(user.id));
    }
  }, [user]);

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

  async function captureCardWeb(): Promise<string | null> {
    if (typeof document === "undefined") return null;
    let domNode: HTMLElement | null = document.querySelector('[data-testid="afu-card-capture"]');
    if (!domNode) {
      const ref = cardRef.current as any;
      if (ref) {
        domNode = (ref as any)._nativeTag ? null : (ref as any);
      }
    }
    if (!domNode) return null;
    try {
      const { toPng } = await import("html-to-image");
      return await toPng(domNode, { quality: 1, pixelRatio: 3, cacheBust: true, skipAutoScale: true });
    } catch (e) {
      console.warn("html-to-image failed:", e);
      return null;
    }
  }

  const handleSaveCard = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (Platform.OS === "web") {
        const dataUri = await captureCardWeb();
        if (!dataUri) {
          setSaving(false);
          return;
        }
        const link = document.createElement("a");
        link.href = dataUri;
        link.download = `AfuChat_ID_${toAfuId(profile?.id || "00000000")}.png`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        setTimeout(() => document.body.removeChild(link), 100);
      } else {
        const { captureRef } = await import("react-native-view-shot");
        const uri = await captureRef(cardRef, { format: "png", quality: 1 });
        const cacheDir = FileSystem.cacheDirectory;
        if (!cacheDir) {
          await Share.share({ message: `AfuChat ID: ${formatAfuId(toAfuId(profile?.id || "00000000"))}` });
          return;
        }
        const filename = `AfuChat_ID_${toAfuId(profile?.id || "00000000")}.png`;
        const dest = `${cacheDir}${filename}`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(dest, { mimeType: "image/png", dialogTitle: "Save your AfuChat ID Card" });
        } else {
          await Share.share({ url: dest });
        }
      }
    } catch (e) {
      console.warn("Failed to save card:", e);
    } finally {
      setSaving(false);
    }
  }, [profile, saving]);

  const handlePrintCard = useCallback(async () => {
    if (printing) return;
    setPrinting(true);
    try {
      if (Platform.OS === "web") {
        const dataUri = await captureCardWeb();
        if (!dataUri) {
          setPrinting(false);
          return;
        }
        const printWin = window.open("", "_blank");
        if (printWin) {
          printWin.document.write(`<!DOCTYPE html><html><head><title>AfuChat ID Card</title><style>@page{margin:0.5in}body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fff;font-family:sans-serif}img{max-width:100%;width:420px;border-radius:20px;box-shadow:0 8px 32px rgba(0,0,0,0.18)}h2{margin:24px 0 4px;color:#4ECDC4;font-size:14px;letter-spacing:2px}p{color:#888;font-size:11px;margin:0}</style></head><body><h2>AFUCHAT DIGITAL ID</h2><p>AFU ID: ${formatAfuId(toAfuId(profile?.id || "00000000"))}</p><br/><img src="${dataUri}" /><script>setTimeout(function(){window.print();},400);<\/script></body></html>`);
          printWin.document.close();
        }
      } else {
        await handleSaveCard();
      }
    } catch (e) {
      console.warn("Failed to print card:", e);
    } finally {
      setPrinting(false);
    }
  }, [profile, printing, handleSaveCard]);

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
        <View style={[styles.cardContainer, { paddingVertical: isSmall ? 16 : 24 }]}>
          <Animated.View style={[styles.glowRing, glowStyle, { width: cardW + 28, height: cardH + 28, borderRadius: 26, top: (isSmall ? 16 : 24) - 14, borderColor: grade.colors[0], shadowColor: grade.colors[0] }]} pointerEvents="none" />
          <View ref={cardRef} style={{ borderRadius: 18, overflow: "hidden" }} testID="afu-card-capture">
            <TouchableOpacity onPress={flip} activeOpacity={1} style={{ width: cardW, height: cardH }}>
              <Animated.View style={[styles.card, frontStyle, { width: cardW, height: cardH }]}>
                <CardFront profile={profile} grade={grade} isPremium={isPremium} scale={scale} cardW={cardW} />
              </Animated.View>
              <Animated.View style={[styles.card, backStyle, { width: cardW, height: cardH, position: "absolute", top: 0 }]}>
                <CardBack profile={profile} grade={grade} isPremium={isPremium} qrValue={qrPayload} scale={scale} cardW={cardW} />
              </Animated.View>
            </TouchableOpacity>
          </View>
          <View style={styles.tapHintRow}>
            <Ionicons name="sync-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.tapHint, { color: colors.textMuted }]}>Tap card to flip</Text>
          </View>
        </View>

        <View style={[styles.infoFooter, { paddingHorizontal: isTiny ? 16 : 24 }]}>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.saveCardBtn, { flex: 1, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSaveCard}
              disabled={saving || printing}
              activeOpacity={0.8}
            >
              <LinearGradient colors={[Colors.brand, "#40B5AE"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveCardGradient}>
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="download-outline" size={20} color="#fff" />
                )}
                <Text style={styles.saveCardText}>{saving ? "Saving..." : "Save Card"}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.printCardBtn, { opacity: printing ? 0.7 : 1 }]}
              onPress={handlePrintCard}
              disabled={saving || printing}
              activeOpacity={0.8}
            >
              <View style={styles.printCardInner}>
                {printing ? (
                  <ActivityIndicator size="small" color={Colors.brand} />
                ) : (
                  <Ionicons name="print-outline" size={20} color={Colors.brand} />
                )}
                <Text style={styles.printCardText}>{printing ? "..." : "Print"}</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={[styles.securityCard, { backgroundColor: isDark ? "#0D1B2A" : `${Colors.brand}08`, borderColor: isDark ? "#1A3040" : `${Colors.brand}20`, borderWidth: 1 }]}>
            <Ionicons name="qr-code-outline" size={18} color={Colors.brand} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.securityTitle, { color: colors.text }]}>Scannable QR Code</Text>
              <Text style={[styles.securitySub, { color: colors.textMuted }]}>Flip the card to reveal your QR code. Others can scan it to send you ACoin instantly.</Text>
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
  cardContainer: { alignItems: "center" },
  glowRing: { position: "absolute", borderWidth: 1, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 24 },
  card: { borderRadius: 18, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 14 },
  cardContent: { flex: 1, justifyContent: "space-between" },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandSymbol: { width: 26, height: 26, borderRadius: 7 },
  cardAppName: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 2.5 },
  cardSubtitle: { color: "rgba(255,255,255,0.35)", fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 2, marginTop: 1 },
  gradeBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  gradeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_600SemiBold" },
  avatarOuter: { position: "relative" },
  avatarGradientRing: { alignItems: "center", justifyContent: "center" },
  cardAvatarFallback: { backgroundColor: "#1E3A5F", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#fff", fontFamily: "Inter_700Bold" },
  premiumBadge: { position: "absolute", bottom: -1, right: -1, backgroundColor: Colors.gold, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#080E18" },
  cardMidRow: { marginTop: -2 },
  displayName: { color: "#fff", fontSize: 19, fontFamily: "Inter_700Bold" },
  handleGradeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  handleText: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "Inter_400Regular" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  locationText: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontFamily: "Inter_500Medium" },
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
  qrBox: { backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 4 },
  backBottomRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  backBottomInfo: {},
  tapHintRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 14 },
  tapHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actionRow: { flexDirection: "row", gap: 10 },
  saveCardBtn: { borderRadius: 16, overflow: "hidden" },
  saveCardGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 16 },
  saveCardText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  printCardBtn: { borderRadius: 16, overflow: "hidden", borderWidth: 2, borderColor: "#4ECDC4" },
  printCardInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, paddingHorizontal: 18 },
  printCardText: { color: "#4ECDC4", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  infoFooter: { paddingHorizontal: 24, gap: 12, marginTop: 8 },
  securityCard: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14 },
  securityTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  securitySub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  idChip: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 14, gap: 12 },
  idChipLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  idChipValue: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: 3 },
});
