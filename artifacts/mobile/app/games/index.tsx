import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { safeRouter } from "@/lib/navUtils";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { supabase } from "@/lib/supabase";

export default function GamesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(1)).current;
  const [playerCount, setPlayerCount] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("life_earth_saves")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => { if (count !== null) setPlayerCount(count); });
  }, []);

  function onPressIn() {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  }
  function onPressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <GlassHeader title="AfuGames" />

      <View style={[s.inner, { paddingBottom: insets.bottom + 32 }]}>

        {/* Hero */}
        <LinearGradient
          colors={["#0a0f1e", "#1c1100", "#0a0f1e"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.hero}
        >
          <View style={s.heroOrb1} />
          <View style={s.heroOrb2} />
          <Text style={s.heroEmoji}>🏙️</Text>
          <Text style={s.heroTitle}>KAMPALA HUSTLE</Text>
          <Text style={s.heroSub}>Pro Edition · Life Simulation</Text>
          <Text style={s.heroTagline}>
            Born in Kampala with UGX 150k. Grind your way from street hustler to coffee estate tycoon — or collapse trying.
          </Text>
        </LinearGradient>

        {/* Game Card */}
        <Pressable
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          onPress={() => safeRouter.replace({ pathname: "/app/afugames", params: { section: "play", id: "kampala" } } as any)}
        >
          <Animated.View style={{ transform: [{ scale }] }}>
            <LinearGradient
              colors={["#0f1a00", "#1c2400"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.card}
            >
              {/* Live badge */}
              <View style={s.liveBadge}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>LIVE</Text>
                {playerCount !== null && (
                  <Text style={s.liveCount}>{playerCount.toLocaleString()} hustlers</Text>
                )}
              </View>

              {/* Card top */}
              <View style={s.cardTop}>
                <LinearGradient colors={["#d97706", "#f59e0b"]} style={s.cardIcon}>
                  <Text style={{ fontSize: 30 }}>🏙️</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>KAMPALA HUSTLE</Text>
                  <Text style={s.cardSub}>Ugandan Life Simulation · Pro Edition</Text>
                </View>
              </View>

              <Text style={s.cardDesc}>
                Start at age 18 with nothing. Get a boda, study at Makerere, invest in coffee estates, dodge the URA, and retire rich — or die trying.
              </Text>

              {/* Feature pills */}
              <View style={s.pillRow}>
                {["🏍️ Boda Hustle", "🎓 Makerere", "☕ Coffee Trade", "🏆 Live Rankings", "💰 ACoin Rewards"].map(p => (
                  <View key={p} style={s.pill}>
                    <Text style={s.pillText}>{p}</Text>
                  </View>
                ))}
              </View>

              <View style={s.divider} />

              <View style={s.cardFooter}>
                <View style={s.cardFooterLeft}>
                  <Text style={s.cardFooterLabel}>Every hustle is different</Text>
                  <Text style={s.cardFooterSub}>Your real profile · Saves progress</Text>
                </View>
                <View style={s.cardCta}>
                  <Text style={s.cardCtaText}>Play</Text>
                  <Ionicons name="arrow-forward" size={14} color="#0a0f1e" />
                </View>
              </View>
            </LinearGradient>
          </Animated.View>
        </Pressable>

        {/* Info row */}
        <View style={s.infoRow}>
          {[
            { icon: "⚡", label: "Inflation", sub: "Real Kampala economy" },
            { icon: "🤝", label: "Connections", sub: "Network to survive" },
            { icon: "🏆", label: "ACoin Rewards", sub: "Earn on milestones" },
          ].map(item => (
            <View key={item.label} style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={s.infoIcon}>{item.icon}</Text>
              <Text style={[s.infoLabel, { color: colors.text }]}>{item.label}</Text>
              <Text style={[s.infoSub, { color: colors.textMuted }]}>{item.sub}</Text>
            </View>
          ))}
        </View>

      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  inner: { flex: 1, padding: 16, gap: 14 },

  hero: { borderRadius: 22, padding: 26, alignItems: "center", overflow: "hidden", position: "relative", gap: 6 },
  heroOrb1: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: "#d9770620", top: -70, right: -50 },
  heroOrb2: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "#f59e0b15", bottom: -50, left: -30 },
  heroEmoji: { fontSize: 44 },
  heroTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#f8fafc", letterSpacing: 3 },
  heroSub: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#f59e0b", letterSpacing: 0.5 },
  heroTagline: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)", textAlign: "center", lineHeight: 18, maxWidth: 280, marginTop: 4 },

  card: { borderRadius: 22, padding: 18, gap: 12, overflow: "hidden", borderWidth: 0.5, borderColor: "rgba(245,158,11,0.2)" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: "rgba(34,197,94,0.15)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  liveText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#22c55e", letterSpacing: 1 },
  liveCount: { fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)" },

  cardTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  cardIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#f8fafc", letterSpacing: 1 },
  cardSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", marginTop: 2 },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.65)", lineHeight: 20 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  pill: { backgroundColor: "rgba(245,158,11,0.1)", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5, borderColor: "rgba(245,158,11,0.2)" },
  pillText: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(245,158,11,0.9)" },
  divider: { height: 0.5, backgroundColor: "rgba(255,255,255,0.08)" },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardFooterLeft: { gap: 2 },
  cardFooterLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  cardFooterSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)" },
  cardCta: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#f59e0b", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  cardCtaText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#0a0f1e" },

  infoRow: { flexDirection: "row", gap: 10 },
  infoCard: { flex: 1, borderRadius: 14, padding: 12, gap: 4, borderWidth: 0.5, alignItems: "center" },
  infoIcon: { fontSize: 22 },
  infoLabel: { fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "center" },
  infoSub: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 13 },
});
