import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

const { width, height } = Dimensions.get("window");
const afuSymbol = require("@/assets/images/afu-symbol.png");

const TAGLINES = [
  "Chat. Flex. Belong.",
  "Prestige beyond followers.",
  "Send red envelopes 🧧",
  "Your 3D identity awaits.",
  "Status goods. Real clout.",
  "Find your people instantly.",
];

const FEATURES = [
  { emoji: "👑", title: "Prestige Tiers", desc: "Bronze to Legend — earn status with ACoin. Others will notice.", color: "#D4A853" },
  { emoji: "💬", title: "Smart Conversations", desc: "Smart replies, forwarding, drafts. Messaging done right.", color: "#00C2CB" },
  { emoji: "🧧", title: "Red Envelopes", desc: "Send money in style. Split ACoin with friends in group chats.", color: "#FF3B30" },
  { emoji: "💎", title: "Virtual Shop", desc: "Exclusive digital goods. Frame your aura. Own rare items.", color: "#AF52DE" },
  { emoji: "🌐", title: "Discover Feed", desc: "Real posts. Real people. A vibrant global community.", color: "#34C759" },
  { emoji: "🎮", title: "Mini Programs", desc: "Games, tools, and apps inside the chat. No installs needed.", color: "#FF9500" },
  { emoji: "🪙", title: "ACoin Wallet", desc: "Your in-app currency. Earn, spend, gift, and flex your balance.", color: "#FFD700" },
  { emoji: "🔒", title: "Secure & Private", desc: "End-to-end encryption. Your data, your rules.", color: "#8E8E93" },
];

const SOCIAL_PROOF = [
  { value: "50K+", label: "Members" },
  { value: "1M+", label: "Messages sent" },
  { value: "200+", label: "Countries" },
  { value: "4.9★", label: "App rating" },
];

const RECENT_ACTIVITY = [
  { name: "Yuki T.", emoji: "🇯🇵", action: "reached Diamond tier", time: "2m ago", color: "#B9F2FF" },
  { name: "Marcus L.", emoji: "🇺🇸", action: "sent a red envelope 🧧", time: "4m ago", color: "#FF3B30" },
  { name: "Aisha B.", emoji: "🇳🇬", action: "bought Crown Aura 👑", time: "7m ago", color: "#D4A853" },
  { name: "Chen W.", emoji: "🇨🇳", action: "went Legend tier", time: "12m ago", color: "#FF9500" },
  { name: "Sofia M.", emoji: "🇧🇷", action: "joined AfuChat", time: "18m ago", color: "#00C2CB" },
];

function TaglineCycler() {
  const [idx, setIdx] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true, easing: Easing.out(Easing.ease) }).start(() => {
        setIdx((i) => (i + 1) % TAGLINES.length);
        Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true, easing: Easing.out(Easing.ease) }).start();
      });
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <Animated.Text style={[styles.taglineCycler, { opacity: fade }]}>
      {TAGLINES[idx]}
    </Animated.Text>
  );
}

function ActivityTicker() {
  const [idx, setIdx] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(slideAnim, { toValue: -30, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        slideAnim.setValue(30);
        setIdx((i) => (i + 1) % RECENT_ACTIVITY.length);
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const item = RECENT_ACTIVITY[idx];
  return (
    <View style={styles.tickerWrap}>
      <View style={[styles.tickerDot, { backgroundColor: Colors.brand }]} />
      <Animated.View style={{ transform: [{ translateY: slideAnim }], flex: 1 }}>
        <Text style={styles.tickerText} numberOfLines={1}>
          <Text style={{ color: item.color }}>{item.emoji} {item.name}</Text>
          {" "}{item.action}{" "}
          <Text style={styles.tickerTime}>{item.time}</Text>
        </Text>
      </Animated.View>
    </View>
  );
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const bgAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(bgAnim, { toValue: 1, duration: 8000, useNativeDriver: false, easing: Easing.inOut(Easing.ease) })
    ).start();
  }, []);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#070B0F", "#0D1117", "#0A1628"]}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Decorative glow orbs */}
      <View style={[styles.orb, { top: -80, left: -60, backgroundColor: Colors.brand + "20" }]} />
      <View style={[styles.orb, { top: height * 0.3, right: -100, width: 280, height: 280, backgroundColor: "#7B2FBE18" }]} />
      <View style={[styles.orb, { bottom: 100, left: -40, width: 220, height: 220, backgroundColor: "#D4A85312" }]} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Hero */}
        <View style={[styles.hero, { paddingTop: insets.top + 20 }]}>
          <View style={styles.logoRow}>
            <View style={styles.logoBg}>
              <Image source={afuSymbol} style={styles.logoImg} resizeMode="contain" tintColor={Colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.appName}>AfuChat</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live • 2,847 online now</Text>
              </View>
            </View>
          </View>

          <TaglineCycler />

          <Text style={styles.heroSub}>
            The next generation social platform with prestige tiers, virtual goods, red envelopes, and a community that rewards being real.
          </Text>

          <ActivityTicker />
        </View>

        {/* Social proof stats */}
        <View style={styles.statsRow}>
          {SOCIAL_PROOF.map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Feature grid */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Everything you've been missing</Text>
        </View>

        <View style={styles.featureGrid}>
          {FEATURES.map((f) => (
            <View key={f.title} style={[styles.featureCard, { borderColor: f.color + "30" }]}>
              <LinearGradient
                colors={[f.color + "18", "transparent"]}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <Text style={styles.featureEmoji}>{f.emoji}</Text>
              <Text style={[styles.featureTitle, { color: f.color }]}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          ))}
        </View>

        {/* Prestige tier showcase */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Rise through the ranks</Text>
          <Text style={styles.sectionSub}>Earn ACoin. Level up. Be seen.</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
          {[
            { emoji: "🥉", label: "Bronze", min: "0", color: "#CD7F32" },
            { emoji: "🥈", label: "Silver", min: "500", color: "#C0C0C0" },
            { emoji: "🥇", label: "Gold", min: "2K", color: "#D4A853" },
            { emoji: "💎", label: "Diamond", min: "10K", color: "#B9F2FF" },
            { emoji: "⬛", label: "Obsidian", min: "50K", color: "#AF52DE" },
            { emoji: "👑", label: "Legend", min: "200K", color: "#FF9500" },
          ].map((tier, i) => (
            <LinearGradient
              key={tier.label}
              colors={[tier.color + "33", tier.color + "11"]}
              style={[styles.tierPill, { borderColor: tier.color + "50" }]}
            >
              <Text style={styles.tierPillEmoji}>{tier.emoji}</Text>
              <Text style={[styles.tierPillLabel, { color: tier.color }]}>{tier.label}</Text>
              <Text style={styles.tierPillMin}>{tier.min} ACoin</Text>
            </LinearGradient>
          ))}
        </ScrollView>

        {/* Gap closer section */}
        <View style={styles.gapSection}>
          <LinearGradient
            colors={[Colors.brand + "22", "#7B2FBE22"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.gapCard, { borderColor: Colors.brand + "44" }]}
          >
            <Text style={styles.gapTitle}>Don't fall behind.</Text>
            <Text style={styles.gapDesc}>
              Every day you wait is another day someone else climbs ahead of you on the Rich List. Early members earn bonus ACoins and get exclusive founder badges.
            </Text>
            <View style={styles.gapBadges}>
              <View style={[styles.gapBadge, { backgroundColor: Colors.gold + "22" }]}>
                <Text style={[styles.gapBadgeText, { color: Colors.gold }]}>🎖️ Founder's Seal</Text>
              </View>
              <View style={[styles.gapBadge, { backgroundColor: Colors.brand + "22" }]}>
                <Text style={[styles.gapBadgeText, { color: Colors.brand }]}>🪙 Bonus ACoin</Text>
              </View>
              <View style={[styles.gapBadge, { backgroundColor: "#FF9500" + "22" }]}>
                <Text style={[styles.gapBadgeText, { color: "#FF9500" }]}>⚡ Early Access</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Browse public feed teaser */}
        <TouchableOpacity
          style={styles.browseTeaser}
          onPress={() => router.push("/(auth)/browse")}
          activeOpacity={0.85}
        >
          <View style={styles.browseTeaserLeft}>
            <Text style={styles.browseTeaserTitle}>See what's happening</Text>
            <Text style={styles.browseTeaserSub}>Browse the public feed — no account needed</Text>
          </View>
          <View style={[styles.browseTeaserBtn, { backgroundColor: Colors.brand + "22" }]}>
            <Ionicons name="eye-outline" size={18} color={Colors.brand} />
          </View>
        </TouchableOpacity>

        {/* CTAs */}
        <View style={styles.ctaSection}>
          <TouchableOpacity
            style={styles.ctaPrimary}
            onPress={() => router.push("/(auth)/register")}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={[Colors.brand, "#00A8B0"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
            <Ionicons name="person-add" size={20} color="#fff" />
            <Text style={styles.ctaPrimaryText}>Create Free Account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ctaSecondary}
            onPress={() => router.push("/(auth)/login")}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaSecondaryText}>Already have an account? Sign In</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>By joining, you agree to our </Text>
          <TouchableOpacity onPress={() => router.push("/terms")}>
            <Text style={[styles.footerLink, { color: Colors.brand }]}>Terms</Text>
          </TouchableOpacity>
          <Text style={styles.footerText}> and </Text>
          <TouchableOpacity onPress={() => router.push("/privacy")}>
            <Text style={[styles.footerLink, { color: Colors.brand }]}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#070B0F" },
  orb: { position: "absolute", width: 320, height: 320, borderRadius: 160 },

  hero: { paddingHorizontal: 22, paddingBottom: 28 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 28 },
  logoBg: { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.brand + "22", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.brand + "44" },
  logoImg: { width: 36, height: 36 },
  appName: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#00FF88" },
  liveText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#00FF88" },

  taglineCycler: { fontSize: 34, fontFamily: "Inter_700Bold", color: "#FFFFFF", lineHeight: 42, marginBottom: 14 },
  heroSub: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#8E9BAD", lineHeight: 23, marginBottom: 18 },

  tickerWrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFFFF0A", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, overflow: "hidden" },
  tickerDot: { width: 7, height: 7, borderRadius: 4 },
  tickerText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#A0ADB8", flex: 1 },
  tickerTime: { color: "#555F6B", fontSize: 12 },

  statsRow: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 16, paddingVertical: 20, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#FFFFFF12", marginBottom: 8 },
  statItem: { alignItems: "center" },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#6B7A8D", marginTop: 2 },

  sectionHeader: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 14 },
  sectionTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  sectionSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7A8D", marginTop: 3 },

  featureGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 14, gap: 10 },
  featureCard: { width: (width - 38) / 2, borderRadius: 16, padding: 16, borderWidth: 1, overflow: "hidden" },
  featureEmoji: { fontSize: 28, marginBottom: 8 },
  featureTitle: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 5 },
  featureDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7A8D", lineHeight: 17 },

  tierPill: { borderRadius: 16, padding: 14, alignItems: "center", minWidth: 90, borderWidth: 1 },
  tierPillEmoji: { fontSize: 28, marginBottom: 6 },
  tierPillLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  tierPillMin: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#6B7A8D", marginTop: 2 },

  gapSection: { paddingHorizontal: 20, paddingTop: 24 },
  gapCard: { borderRadius: 20, padding: 22, borderWidth: 1.5, overflow: "hidden" },
  gapTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff", marginBottom: 10 },
  gapDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#8E9BAD", lineHeight: 21, marginBottom: 16 },
  gapBadges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gapBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  gapBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  browseTeaser: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginTop: 18, backgroundColor: "#FFFFFF0A", borderRadius: 14, padding: 16, gap: 14, borderWidth: 1, borderColor: "#FFFFFF12" },
  browseTeaserLeft: { flex: 1 },
  browseTeaserTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  browseTeaserSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7A8D", marginTop: 2 },
  browseTeaserBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  ctaSection: { paddingHorizontal: 22, gap: 12, marginTop: 28 },
  ctaPrimary: { height: 56, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, overflow: "hidden" },
  ctaPrimaryText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
  ctaSecondary: { alignItems: "center", paddingVertical: 14 },
  ctaSecondaryText: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#6B7A8D" },

  footer: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", paddingHorizontal: 22, paddingTop: 8, gap: 0 },
  footerText: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#444D57" },
  footerLink: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
