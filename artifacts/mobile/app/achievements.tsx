import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
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
const BADGE_SIZE = (SCREEN_W - 48 - 24) / 3;

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
    {
      id: "welcome",
      title: "Welcome to AfuChat",
      desc: "Created your account",
      icon: "home",
      category: "Social",
      rarity: "common",
      xpReward: 0,
      unlocked: true,
    },
    {
      id: "verified",
      title: "Verified Identity",
      desc: "Got the verified badge",
      icon: "checkmark-circle",
      category: "Elite",
      rarity: "rare",
      xpReward: 500,
      unlocked: profile?.is_verified || false,
    },
    {
      id: "premium_user",
      title: "Premium Member",
      desc: "Subscribed to AfuChat Premium",
      icon: "star",
      category: "Premium",
      rarity: "rare",
      xpReward: 1000,
      unlocked: isPremium,
    },
    {
      id: "xp_1000",
      title: "Rising Star",
      desc: "Earned 1,000 XP",
      icon: "trending-up",
      category: "Social",
      rarity: "common",
      xpReward: 100,
      unlocked: xp >= 1000,
      progress: Math.min(xp, 1000),
      total: 1000,
    },
    {
      id: "xp_5000",
      title: "Socialite",
      desc: "Earned 5,000 XP",
      icon: "people",
      category: "Social",
      rarity: "rare",
      xpReward: 300,
      unlocked: xp >= 5000,
      progress: Math.min(xp, 5000),
      total: 5000,
    },
    {
      id: "xp_25000",
      title: "Legend",
      desc: "Earned 25,000 XP",
      icon: "flame",
      category: "Elite",
      rarity: "epic",
      xpReward: 1000,
      unlocked: xp >= 25000,
      progress: Math.min(xp, 25000),
      total: 25000,
    },
    {
      id: "xp_100000",
      title: "Immortal",
      desc: "Earned 100,000 XP",
      icon: "infinite",
      category: "Elite",
      rarity: "legendary",
      xpReward: 5000,
      unlocked: xp >= 100000,
      progress: Math.min(xp, 100000),
      total: 100000,
    },
    {
      id: "level_10",
      title: "Level 10",
      desc: "Reached level 10",
      icon: "ribbon",
      category: "Social",
      rarity: "common",
      xpReward: 200,
      unlocked: level >= 10,
      progress: Math.min(level, 10),
      total: 10,
    },
    {
      id: "level_50",
      title: "Level 50",
      desc: "Reached level 50",
      icon: "medal",
      category: "Elite",
      rarity: "epic",
      xpReward: 2000,
      unlocked: level >= 50,
      progress: Math.min(level, 50),
      total: 50,
    },
    {
      id: "rich",
      title: "Coin Collector",
      desc: "Accumulated 1,000 ACoins",
      icon: "cash",
      category: "Collector",
      rarity: "rare",
      xpReward: 500,
      unlocked: acoin >= 1000,
      progress: Math.min(acoin, 1000),
      total: 1000,
    },
    {
      id: "big_spender",
      title: "Big Spender",
      desc: "Accumulated 10,000 ACoins",
      icon: "wallet",
      category: "Collector",
      rarity: "epic",
      xpReward: 1500,
      unlocked: acoin >= 10000,
      progress: Math.min(acoin, 10000),
      total: 10000,
    },
    {
      id: "profile_complete",
      title: "Identity Forged",
      desc: "Completed your profile setup",
      icon: "person-circle",
      category: "Social",
      rarity: "common",
      xpReward: 100,
      unlocked: profile?.onboarding_completed || false,
    },
    {
      id: "golden",
      title: "Gold Status",
      desc: "Reached Gold subscription tier",
      icon: "trophy",
      category: "Premium",
      rarity: "legendary",
      xpReward: 2000,
      unlocked: profile?.current_grade === "gold" || profile?.current_grade === "platinum",
    },
    {
      id: "org_verified",
      title: "Organization",
      desc: "Got organization verification",
      icon: "business",
      category: "Elite",
      rarity: "legendary",
      xpReward: 3000,
      unlocked: profile?.is_organization_verified || false,
    },
    {
      id: "early_bird",
      title: "Early Adopter",
      desc: "One of the first AfuChat users",
      icon: "rocket",
      category: "Elite",
      rarity: "legendary",
      xpReward: 5000,
      unlocked: false,
    },
    {
      id: "admin",
      title: "System Admin",
      desc: "Trusted with admin powers",
      icon: "shield",
      category: "Elite",
      rarity: "legendary",
      xpReward: 10000,
      unlocked: profile?.is_admin || false,
    },
  ];
}

function ParticleBurst({ visible }: { visible: boolean }) {
  const particles = Array.from({ length: 8 }, (_, i) => {
    const scale = useSharedValue(0);
    const opacity = useSharedValue(0);
    const angle = (i / 8) * Math.PI * 2;
    const distance = 36 + Math.random() * 16;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const x = useSharedValue(0);
    const y = useSharedValue(0);

    useEffect(() => {
      if (visible) {
        scale.value = withDelay(i * 30, withSequence(
          withSpring(1, { damping: 8 }),
          withDelay(200, withTiming(0, { duration: 400 }))
        ));
        opacity.value = withDelay(i * 30, withSequence(
          withTiming(1, { duration: 100 }),
          withDelay(300, withTiming(0, { duration: 300 }))
        ));
        x.value = withDelay(i * 30, withTiming(dx, { duration: 600, easing: Easing.out(Easing.cubic) }));
        y.value = withDelay(i * 30, withTiming(dy, { duration: 600, easing: Easing.out(Easing.cubic) }));
      }
    }, [visible]);

    const style = useAnimatedStyle(() => ({
      transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
      opacity: opacity.value,
    }));

    return <Animated.View key={i} style={[styles.particle, style]} />;
  });

  return <View style={styles.particleContainer} pointerEvents="none">{particles}</View>;
}

function AchievementBadge({ achievement, index }: { achievement: Achievement; index: number }) {
  const { colors } = useTheme();
  const [showBurst, setShowBurst] = useState(false);
  const scale = useSharedValue(0);
  const rotateY = useSharedValue(achievement.unlocked ? 0 : 1);
  const glowPulse = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withDelay(
      index * 60,
      withSpring(1, { damping: 12, stiffness: 180 })
    );

    if (achievement.unlocked) {
      glowPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.4, { duration: 1800, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      );
    }
  }, []);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: achievement.unlocked ? glowPulse.value : 0,
    shadowOpacity: glowPulse.value,
  }));

  const rarity = RARITY_COLORS[achievement.rarity];
  const glowColor = RARITY_GLOW[achievement.rarity];

  const handlePress = () => {
    if (achievement.unlocked) {
      setShowBurst(true);
      setTimeout(() => setShowBurst(false), 1000);
    }
  };

  const progressPct = achievement.progress != null && achievement.total
    ? Math.min(achievement.progress / achievement.total, 1)
    : achievement.unlocked ? 1 : 0;

  return (
    <Animated.View style={[{ width: BADGE_SIZE, alignItems: "center", marginBottom: 20 }, badgeStyle]}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8} style={{ alignItems: "center" }}>
        <View style={{ width: BADGE_SIZE - 8, height: BADGE_SIZE - 8, position: "relative" }}>
          <Animated.View
            style={[
              styles.badgeGlow,
              glowStyle,
              {
                shadowColor: glowColor,
                borderColor: `${glowColor}44`,
              },
            ]}
            pointerEvents="none"
          />
          {achievement.unlocked ? (
            <LinearGradient
              colors={rarity}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.badgeInner}
            >
              <Ionicons name={achievement.icon as any} size={28} color="#fff" />
            </LinearGradient>
          ) : (
            <View style={[styles.badgeInner, { backgroundColor: colors.backgroundTertiary }]}>
              <Ionicons name={achievement.icon as any} size={28} color={colors.textMuted} />
              <View style={styles.lockOverlay}>
                <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
              </View>
            </View>
          )}
          {achievement.unlocked && (
            <View style={[styles.unlockedDot, { backgroundColor: "#00FF88" }]} />
          )}
          <ParticleBurst visible={showBurst} />
        </View>
        <Text
          style={[styles.badgeTitle, { color: achievement.unlocked ? colors.text : colors.textMuted }]}
          numberOfLines={2}
        >
          {achievement.title}
        </Text>
        {achievement.progress != null && !achievement.unlocked && (
          <View style={[styles.progressBar, { backgroundColor: colors.backgroundTertiary }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressPct * 100}%`, backgroundColor: glowColor },
              ]}
            />
          </View>
        )}
        <Text style={[styles.rarityLabel, { color: glowColor }]}>
          {achievement.rarity.toUpperCase()}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function SummaryBar({ achievements }: { achievements: Achievement[] }) {
  const { colors } = useTheme();
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const total = achievements.length;
  const pct = unlocked / total;
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    fillWidth.value = withDelay(400, withTiming(pct, { duration: 1200, easing: Easing.out(Easing.cubic) }));
  }, []);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value * 100}%` as any,
  }));

  return (
    <View style={[styles.summaryBar, { backgroundColor: colors.surface }]}>
      <LinearGradient
        colors={["#FF9500", "#AF52DE", "#007AFF", "#00C2CB"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.summaryGradient}
      >
        <Text style={styles.summaryTitle}>🏆 {unlocked} / {total} Achievements</Text>
        <Text style={styles.summaryXp}>Collect them all!</Text>
      </LinearGradient>
      <View style={[styles.progressTrack, { backgroundColor: colors.backgroundTertiary }]}>
        <Animated.View style={[styles.progressMega, fillStyle]}>
          <LinearGradient
            colors={["#00C2CB", "#AF52DE", "#FF9500"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  );
}

export default function AchievementsScreen() {
  const { profile, isPremium } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState("All");

  const achievements = buildAchievements(profile, isPremium);
  const filtered =
    selectedCategory === "All"
      ? achievements
      : achievements.filter((a) => a.category === selectedCategory);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
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
          style={{ marginVertical: 16 }}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => setSelectedCategory(cat)}
              style={[
                styles.categoryChip,
                {
                  backgroundColor:
                    selectedCategory === cat ? Colors.brand : colors.surface,
                  borderColor: selectedCategory === cat ? Colors.brand : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.categoryText,
                  { color: selectedCategory === cat ? "#fff" : colors.textSecondary },
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.badgeGrid}>
          {filtered.map((a, i) => (
            <AchievementBadge key={a.id} achievement={a} index={i} />
          ))}
        </View>
      </ScrollView>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  summaryBar: { margin: 16, borderRadius: 18, overflow: "hidden" },
  summaryGradient: { padding: 20 },
  summaryTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  summaryXp: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 4, fontFamily: "Inter_400Regular" },
  progressTrack: { height: 4, marginHorizontal: 16, marginBottom: 16, borderRadius: 2, overflow: "hidden" },
  progressMega: { height: 4, borderRadius: 2, overflow: "hidden" },
  categoryRow: { paddingHorizontal: 16, gap: 8 },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
    justifyContent: "space-between",
  },
  badgeInner: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeGlow: {
    position: "absolute",
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 22,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
  },
  unlockedDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeTitle: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 14,
  },
  rarityLabel: { fontSize: 8, fontFamily: "Inter_700Bold", marginTop: 2, letterSpacing: 1 },
  progressBar: { height: 2, width: BADGE_SIZE - 16, borderRadius: 1, marginTop: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 1 },
  lockOverlay: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 6,
    padding: 2,
  },
  particleContainer: { position: "absolute", top: "50%", left: "50%", width: 0, height: 0 },
  particle: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF9500",
    marginLeft: -3,
    marginTop: -3,
  },
});
