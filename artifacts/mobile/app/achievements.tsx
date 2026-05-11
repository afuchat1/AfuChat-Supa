import React, { useState } from "react";
import {
  ScrollView,
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
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

function useBadgeSize() {
  const { width } = useWindowDimensions();
  return (width - 48 - 24) / 3;
}

type Achievement = {
  id: string;
  title: string;
  desc: string;
  icon: string;
  category: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  xpReward: number;
  unlocked: boolean;
  progress?: number;
  total?: number;
};

const RARITY_COLORS: Record<string, [string, string]> = {
  common: ["#8E8E93", "#636366"],
  rare: ["#007AFF", "#0040DD"],
  epic: ["#AF52DE", "#7B00D4"],
  legendary: ["#FF9500", "#FF3B30"],
};

const RARITY_GLOW: Record<string, string> = {
  common: "#8E8E93",
  rare: "#007AFF",
  epic: "#AF52DE",
  legendary: "#FF9500",
};

const CATEGORIES = ["All", "Social", "Gaming", "Collector", "Premium", "Elite"];

function buildAchievements(profile: any, isPremium: boolean): Achievement[] {
  const xp = profile?.xp || 0;
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const acoin = profile?.acoin || 0;

  return [
    { id: "welcome", title: "Welcome to AfuChat", desc: "Created your account", icon: "home", category: "Social", rarity: "common", xpReward: 0, unlocked: true },
    { id: "verified", title: "Verified Identity", desc: "Got the verified badge", icon: "checkmark-circle", category: "Elite", rarity: "rare", xpReward: 500, unlocked: profile?.is_verified || false },
    { id: "premium_user", title: "Premium Member", desc: "Subscribed to AfuChat Premium", icon: "star", category: "Premium", rarity: "rare", xpReward: 1000, unlocked: isPremium },
    { id: "xp_1000", title: "Rising Star", desc: "Earned 1,000 XP", icon: "trending-up", category: "Social", rarity: "common", xpReward: 100, unlocked: xp >= 1000, progress: Math.min(xp, 1000), total: 1000 },
    { id: "xp_5000", title: "Socialite", desc: "Earned 5,000 XP", icon: "people", category: "Social", rarity: "rare", xpReward: 300, unlocked: xp >= 5000, progress: Math.min(xp, 5000), total: 5000 },
    { id: "xp_25000", title: "Legend", desc: "Earned 25,000 XP", icon: "flame", category: "Elite", rarity: "epic", xpReward: 1000, unlocked: xp >= 25000, progress: Math.min(xp, 25000), total: 25000 },
    { id: "xp_100000", title: "Immortal", desc: "Earned 100,000 XP", icon: "infinite", category: "Elite", rarity: "legendary", xpReward: 5000, unlocked: xp >= 100000, progress: Math.min(xp, 100000), total: 100000 },
    { id: "level_10", title: "Level 10", desc: "Reached level 10", icon: "ribbon", category: "Social", rarity: "common", xpReward: 200, unlocked: level >= 10, progress: Math.min(level, 10), total: 10 },
    { id: "level_50", title: "Level 50", desc: "Reached level 50", icon: "medal", category: "Elite", rarity: "epic", xpReward: 2000, unlocked: level >= 50, progress: Math.min(level, 50), total: 50 },
    { id: "rich", title: "Coin Collector", desc: "Accumulated 1,000 ACoins", icon: "cash", category: "Collector", rarity: "rare", xpReward: 500, unlocked: acoin >= 1000, progress: Math.min(acoin, 1000), total: 1000 },
    { id: "big_spender", title: "Big Spender", desc: "Accumulated 10,000 ACoins", icon: "wallet", category: "Collector", rarity: "epic", xpReward: 1500, unlocked: acoin >= 10000, progress: Math.min(acoin, 10000), total: 10000 },
    { id: "profile_complete", title: "Identity Forged", desc: "Completed your profile setup", icon: "person-circle", category: "Social", rarity: "common", xpReward: 100, unlocked: profile?.onboarding_completed || false },
    { id: "golden", title: "Gold Status", desc: "Reached Gold subscription tier", icon: "trophy", category: "Premium", rarity: "legendary", xpReward: 2000, unlocked: profile?.current_grade === "gold" || profile?.current_grade === "platinum" },
    { id: "org_verified", title: "Organization", desc: "Got organization verification", icon: "business", category: "Elite", rarity: "legendary", xpReward: 3000, unlocked: profile?.is_organization_verified || false },
    { id: "early_bird", title: "Early Adopter", desc: "One of the first AfuChat users", icon: "rocket", category: "Elite", rarity: "legendary", xpReward: 5000, unlocked: false },
    { id: "admin", title: "System Admin", desc: "Trusted with admin powers", icon: "shield", category: "Elite", rarity: "legendary", xpReward: 10000, unlocked: profile?.is_admin || false },
  ];
}

function AchievementBadge({ achievement }: { achievement: Achievement }) {
  const { colors } = useTheme();
  const BADGE_SIZE = useBadgeSize();
  const rarity = RARITY_COLORS[achievement.rarity];
  const glowColor = RARITY_GLOW[achievement.rarity];
  const progressPct = achievement.progress != null && achievement.total
    ? Math.min(achievement.progress / achievement.total, 1)
    : achievement.unlocked ? 1 : 0;

  return (
    <View style={[styles.badgeWrapper, { width: BADGE_SIZE }]}>
      <View style={[
        styles.badgeContainer,
        { width: BADGE_SIZE - 8, height: BADGE_SIZE - 8 },
        achievement.unlocked && { borderColor: `${glowColor}44`, borderWidth: 1.5 },
        !achievement.unlocked && { borderColor: colors.border, borderWidth: 1 },
      ]}>
        {achievement.unlocked ? (
          <LinearGradient colors={rarity} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badgeInner}>
            <Ionicons name={achievement.icon as any} size={26} color="#fff" />
          </LinearGradient>
        ) : (
          <View style={[styles.badgeInner, { backgroundColor: colors.backgroundTertiary }]}>
            <Ionicons name={achievement.icon as any} size={26} color={colors.textMuted} />
            <View style={styles.lockOverlay}>
              <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
            </View>
          </View>
        )}
        {achievement.unlocked && (
          <View style={[styles.unlockedDot]} />
        )}
      </View>

      <Text style={[styles.badgeTitle, { color: achievement.unlocked ? colors.text : colors.textMuted }]} numberOfLines={2}>
        {achievement.title}
      </Text>

      {achievement.progress != null && !achievement.unlocked && (
        <View style={[styles.progressBar, { width: BADGE_SIZE - 16, backgroundColor: colors.backgroundTertiary }]}>
          <View style={[styles.progressFill, { width: `${progressPct * 100}%`, backgroundColor: glowColor }]} />
        </View>
      )}

      <Text style={[styles.rarityLabel, { color: glowColor }]}>
        {achievement.rarity.toUpperCase()}
      </Text>
    </View>
  );
}

function SummaryBar({ achievements }: { achievements: Achievement[] }) {
  const { colors } = useTheme();
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const total = achievements.length;
  const pct = unlocked / total;

  return (
    <View style={[styles.summaryBar, { backgroundColor: colors.surface }]}>
      <View style={[styles.summaryTop]}>
        <View>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>🏆 {unlocked} / {total} Unlocked</Text>
          <Text style={[styles.summaryXp, { color: colors.textMuted }]}>Keep earning to collect them all</Text>
        </View>
        <View style={[styles.pctBadge, { backgroundColor: colors.accent + "22" }]}>
          <Text style={[styles.pctText, { color: colors.accent }]}>{Math.round(pct * 100)}%</Text>
        </View>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.backgroundTertiary }]}>
        <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: colors.accent }]} />
      </View>
    </View>
  );
}

export default function AchievementsScreen() {
  const { profile, isPremium } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const BADGE_SIZE = useBadgeSize();
  const [selectedCategory, setSelectedCategory] = useState("All");

  const achievements = buildAchievements(profile, isPremium);
  const filtered = selectedCategory === "All" ? achievements : achievements.filter((a) => a.category === selectedCategory);

  return (
    <View style={[styles.screen, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Achievements</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        <SummaryBar achievements={achievements} />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
          style={{ marginVertical: 12 }}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => setSelectedCategory(cat)}
              style={[
                styles.categoryChip,
                { backgroundColor: selectedCategory === cat ? colors.accent : colors.surface, borderColor: selectedCategory === cat ? colors.accent : colors.border },
              ]}
            >
              <Text style={[styles.categoryText, { color: selectedCategory === cat ? "#fff" : colors.textSecondary }]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.badgeGrid}>
          {filtered.map((a) => <AchievementBadge key={a.id} achievement={a} />)}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", letterSpacing: -0.2 },
  summaryBar: { margin: 16, borderRadius: 16, padding: 16 },
  summaryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  summaryTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  summaryXp: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  pctBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  pctText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  categoryRow: { paddingHorizontal: 16, gap: 8 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  categoryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 8, justifyContent: "space-between" },
  badgeWrapper: { alignItems: "center", marginBottom: 20 },
  badgeContainer: { borderRadius: 18, overflow: "hidden", position: "relative" },
  badgeInner: { width: "100%", height: "100%", borderRadius: 16, alignItems: "center", justifyContent: "center" },
  unlockedDot: { position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: "#34C759", borderWidth: 1.5, borderColor: "#fff" },
  badgeTitle: { fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 5, lineHeight: 14 },
  rarityLabel: { fontSize: 8, fontFamily: "Inter_700Bold", marginTop: 2, letterSpacing: 1 },
  progressBar: { height: 2, borderRadius: 1, marginTop: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 1 },
  lockOverlay: { position: "absolute", bottom: 4, right: 4, backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 5, padding: 2 },
});
