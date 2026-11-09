import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

type Rarity = "common" | "rare" | "epic" | "legendary";
type Category = "All" | "Social" | "Creator" | "Messenger" | "Wallet" | "Elite" | "Community";

type Achievement = {
  id: string;
  title: string;
  desc: string;
  howTo: string;
  icon: string;
  category: Exclude<Category, "All">;
  rarity: Rarity;
  xpReward: number;
  unlocked: boolean;
  progress?: number;
  total?: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = ["All", "Social", "Creator", "Messenger", "Wallet", "Elite", "Community"];

const RARITY_GRADIENT: Record<Rarity, [string, string]> = {
  common:    ["#636366", "#48484A"],
  rare:      ["#0A84FF", "#0040DD"],
  epic:      ["#BF5AF2", "#7B00D4"],
  legendary: ["#FF9F0A", "#FF3B30"],
};

const RARITY_COLOR: Record<Rarity, string> = {
  common:    "#8E8E93",
  rare:      "#0A84FF",
  epic:      "#BF5AF2",
  legendary: "#FF9F0A",
};

const RARITY_LABEL: Record<Rarity, string> = {
  common:    "COMMON",
  rare:      "RARE",
  epic:      "EPIC",
  legendary: "LEGENDARY",
};

const RANK_TIERS = [
  { min: 0,   max: 15,  title: "Rookie",      icon: "leaf",         color: "#8E8E93" },
  { min: 15,  max: 25,  title: "Scout",       icon: "compass",      color: "#34C759" },
  { min: 25,  max: 35,  title: "Challenger",  icon: "shield",       color: "#0A84FF" },
  { min: 35,  max: 42,  title: "Champion",    icon: "medal",        color: "#BF5AF2" },
  { min: 42,  max: 100, title: "Legend",      icon: "flame",                color: "#FF9F0A" },
];

// ─── Supabase stats ───────────────────────────────────────────────────────────

type Stats = {
  posts: number;
  stories: number;
  messages: number;
};

async function fetchStats(userId: string): Promise<Stats> {
  const safe = async <T,>(p: PromiseLike<T>, fallback: T): Promise<T> => {
    try { return await p; } catch { return fallback; }
  };

  const [posts, stories, messages] = await Promise.all([
    safe(
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId)
        .then(r => r.count ?? 0), 0),
    safe(
      supabase.from("stories").select("id", { count: "exact", head: true }).eq("user_id", userId)
        .then(r => r.count ?? 0), 0),
    safe(
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("sender_id", userId)
        .then(r => r.count ?? 0), 0),
  ]);

  return { posts, stories, messages };
}

// ─── Achievement definitions ──────────────────────────────────────────────────

function buildAchievements(profile: any, isPremium: boolean, stats: Stats): Achievement[] {
  const xp       = profile?.xp      ?? 0;
  const acoin    = profile?.acoin    ?? 0;
  const level    = Math.floor(Math.sqrt(xp / 100)) + 1;
  const { posts, stories, messages } = stats;

  const mk = (
    id: string, title: string, desc: string, howTo: string,
    icon: string, category: Exclude<Category,"All">, rarity: Rarity,
    xpReward: number, unlocked: boolean,
    progress?: number, total?: number,
  ): Achievement => ({ id, title, desc, howTo, icon, category, rarity, xpReward, unlocked, progress, total });

  return [
    // ── Social ───────────────────────────────────────────────────────────────
    mk("welcome",      "Welcome Aboard",    "Created your AfuChat account",      "Sign up for AfuChat",                 "home",           "Social", "common",    0,      true),
    mk("profile_done", "Identity Forged",   "Completed your full profile",        "Finish all onboarding steps",         "person-circle",  "Social", "common",    100,    profile?.onboarding_completed ?? false),
    mk("phone_linked", "Phone Verified",    "Linked your phone number",           "Add a phone number to your profile",  "phone-portrait", "Social", "common",    50,     !!profile?.phone_number),
    mk("set_country",  "World Explorer",    "Added your country to your profile", "Set your country in your profile",    "earth",          "Social", "common",    50,     !!profile?.country),
    mk("interests",    "Curiosity Seeker",  "Picked 5 or more interests",         "Select interests during onboarding",  "heart",          "Social", "common",    100,    (profile?.interests?.length ?? 0) >= 5, Math.min(profile?.interests?.length ?? 0, 5), 5),
    mk("xp_1k",        "Rising Star",       "Earned 1,000 XP",                    "Keep being active on AfuChat",        "trending-up",    "Social", "common",    100,    xp >= 1_000,    Math.min(xp, 1_000),   1_000),
    mk("xp_5k",        "Socialite",         "Earned 5,000 XP",                    "Stay active by posting, chatting, and reacting",     "people",         "Social", "rare",      300,    xp >= 5_000,    Math.min(xp, 5_000),   5_000),
    mk("xp_10k",       "Networker",         "Earned 10,000 XP",                   "Keep engaging with the community",    "git-network",    "Social", "rare",      500,    xp >= 10_000,   Math.min(xp, 10_000),  10_000),
    mk("xp_25k",       "Influencer",        "Earned 25,000 XP",                   "Be consistently active for months",   "megaphone",      "Social", "epic",      1_000,  xp >= 25_000,   Math.min(xp, 25_000),  25_000),
    mk("xp_50k",       "Hall of Fame",      "Earned 50,000 XP",                   "Become one of the top AfuChat users", "podium",         "Social", "epic",      2_000,  xp >= 50_000,   Math.min(xp, 50_000),  50_000),
    mk("xp_100k",      "Immortal",          "Earned 100,000 XP",                  "A true AfuChat legend",               "infinite",       "Social", "legendary", 5_000,  xp >= 100_000,  Math.min(xp, 100_000), 100_000),
    mk("lvl_10",       "Level 10",          "Reached level 10",                   "Keep earning XP to level up",         "ribbon",         "Social", "common",    200,    level >= 10,  Math.min(level, 10),  10),
    mk("lvl_25",       "Level 25",          "Reached level 25",                   "Keep earning XP to level up",         "medal",          "Social", "rare",      500,    level >= 25,  Math.min(level, 25),  25),
    mk("lvl_50",       "Level 50",          "Reached level 50",                   "Keep earning XP to level up",         "trophy",         "Social", "epic",      2_000,  level >= 50,  Math.min(level, 50),  50),
    mk("lvl_100",      "Century Club",      "Reached level 100",                  "A true dedication to AfuChat",        "star",           "Social", "legendary", 10_000, level >= 100, Math.min(level, 100), 100),

    // ── Creator ──────────────────────────────────────────────────────────────
    mk("first_post",  "Debut Post",        "Published your first post",          "Create a post on your feed",          "create",         "Creator", "common",    50,     posts >= 1,   Math.min(posts, 1),   1),
    mk("posts_10",    "Content Creator",   "Published 10 posts",                 "Keep posting to the community",       "newspaper",      "Creator", "common",    200,    posts >= 10,  Math.min(posts, 10),  10),
    mk("posts_50",    "Prolific",          "Published 50 posts",                 "Stay consistent with your content",   "library",        "Creator", "rare",      500,    posts >= 50,  Math.min(posts, 50),  50),
    mk("posts_100",   "Thought Leader",    "Published 100 posts",                "100 posts milestone. Amazing!",      "bulb",           "Creator", "epic",      1_000,  posts >= 100, Math.min(posts, 100), 100),
    mk("posts_500",   "Content Machine",   "Published 500 posts",                "One of AfuChat's top creators",       "planet",         "Creator", "legendary", 3_000,  posts >= 500, Math.min(posts, 500), 500),
    mk("first_story", "Story Teller",      "Posted your first story",            "Share a story that disappears in 24h","images",         "Creator", "common",    50,     stories >= 1,   Math.min(stories, 1),   1),
    mk("stories_20",  "Story Master",      "Posted 20 stories",                  "Share moments consistently",          "film",           "Creator", "rare",      300,    stories >= 20,  Math.min(stories, 20),  20),
    mk("stories_100", "Director's Cut",    "Posted 100 stories",                 "A true storyteller",                  "videocam",       "Creator", "epic",      1_000,  stories >= 100, Math.min(stories, 100), 100),

    // ── Messenger ────────────────────────────────────────────────────────────
    mk("msg_1",     "Ice Breaker",        "Sent your first message",            "Start a conversation with anyone",    "chatbubble",      "Messenger", "common",    50,     messages >= 1,     Math.min(messages, 1),     1),
    mk("msg_50",    "Chatterbox",         "Sent 50 messages",                   "Keep the conversations going",        "chatbubbles",     "Messenger", "common",    100,    messages >= 50,    Math.min(messages, 50),    50),
    mk("msg_500",   "Social Butterfly",   "Sent 500 messages",                  "You love to chat!",                   "chatbubbles",     "Messenger", "rare",      300,    messages >= 500,   Math.min(messages, 500),   500),
    mk("msg_2k",    "Talk of the Town",   "Sent 2,000 messages",                "One of AfuChat's most active chatters","mic",            "Messenger", "epic",      1_000,  messages >= 2_000, Math.min(messages, 2_000), 2_000),
    mk("msg_10k",   "Motormouth",         "Sent 10,000 messages",               "You never stop talking. We love it", "radio",           "Messenger", "legendary", 5_000,  messages >= 10_000,Math.min(messages, 10_000),10_000),

    // ── Wallet ───────────────────────────────────────────────────────────────
    mk("coins_1",    "First Coins",       "Earned your first ACoins",           "Complete any action that rewards ACoins","cash",          "Wallet", "common",    50,     acoin >= 1,      Math.min(acoin, 1),      1),
    mk("coins_500",  "Saver",             "Accumulated 500 ACoins",             "Keep earning ACoins through activity",   "save",          "Wallet", "common",    100,    acoin >= 500,    Math.min(acoin, 500),    500),
    mk("coins_1k",   "Coin Collector",    "Accumulated 1,000 ACoins",           "Earn ACoins by being active daily",      "wallet",        "Wallet", "rare",      300,    acoin >= 1_000,  Math.min(acoin, 1_000),  1_000),
    mk("coins_5k",   "Gold Stash",        "Accumulated 5,000 ACoins",           "Keep saving ACoins through activity",   "cube",          "Wallet", "rare",      500,    acoin >= 5_000,  Math.min(acoin, 5_000),  5_000),
    mk("coins_10k",  "Big Spender",       "Accumulated 10,000 ACoins",          "A true AfuChat economist",               "diamond",       "Wallet", "epic",      1_000,  acoin >= 10_000, Math.min(acoin, 10_000), 10_000),
    mk("coins_50k",  "Crypto Whale",      "Accumulated 50,000 ACoins",          "One of the wealthiest users on AfuChat", "logo-bitcoin",  "Wallet", "legendary", 3_000,  acoin >= 50_000, Math.min(acoin, 50_000), 50_000),


    // ── Community ────────────────────────────────────────────────────────────
    mk("premium",    "Premium Member",    "Subscribed to AfuChat Premium",      "Upgrade your plan in the store",      "star",           "Community", "rare",      1_000,  isPremium),
    mk("grade_gold", "Gold Status",       "Reached Gold subscription tier",     "Upgrade to Gold or Platinum plan",    "ribbon",         "Community", "epic",      2_000,  ["gold","platinum"].includes(profile?.current_grade ?? "")),
    mk("platinum",   "Platinum Status",   "Reached Platinum subscription tier", "Upgrade to the Platinum plan",        "diamond",        "Community", "legendary", 5_000,  profile?.current_grade === "platinum"),

    // ── Elite ────────────────────────────────────────────────────────────────
    mk("verified",    "Verified Identity",    "Got the blue verified badge",         "Apply for verification in Settings",  "checkmark-circle","Elite", "rare",      500,    profile?.is_verified ?? false),
    mk("org_verified","Organisation",         "Got organisation verification",       "Apply for org verification",          "business",        "Elite", "legendary", 3_000,  profile?.is_organization_verified ?? false),
    mk("biz_mode",    "Business Mode",        "Activated Business Mode",             "Enable Business Mode in your profile","briefcase",       "Elite", "rare",      500,    profile?.is_business_mode ?? false),
    mk("early_bird",  "Early Adopter",        "One of AfuChat's founding users",     "Be among the very first users",       "rocket",          "Elite", "legendary", 5_000,  false),
    mk("support",     "Support Hero",         "Became an AfuChat support staff",     "Join the AfuChat support team",       "headset",         "Elite", "legendary", 5_000,  profile?.is_support_staff ?? false),
    mk("admin",       "System Admin",         "Trusted with full admin powers",      "Be appointed as a system admin",      "shield-checkmark","Elite", "legendary", 10_000, profile?.is_admin ?? false),
  ];
}

// ─── Hooks & helpers ──────────────────────────────────────────────────────────

function useBadgeSize() {
  const { width } = useWindowDimensions();
  const containerWidth = width;
  const cols = 3;
  return (containerWidth - 48 - 8 * (cols - 1)) / cols;
}

function getRank(unlocked: number) {
  return RANK_TIERS.find(r => unlocked >= r.min && unlocked < r.max) ?? RANK_TIERS[RANK_TIERS.length - 1];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RarityPill({ rarity }: { rarity: Rarity }) {
  return (
    <View style={[pill.wrap, { backgroundColor: RARITY_COLOR[rarity] + "22" }]}>
      <View style={[pill.dot, { backgroundColor: RARITY_COLOR[rarity] }]} />
      <Text style={[pill.text, { color: RARITY_COLOR[rarity] }]}>{RARITY_LABEL[rarity]}</Text>
    </View>
  );
}

const pill = StyleSheet.create({
  wrap:  { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  dot:   { width: 6, height: 6, borderRadius: 3 },
  text:  { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
});

// ── Hero card ─────────────────────────────────────────────────────────────────

function HeroCard({ achievements }: { achievements: Achievement[] }) {
  const { colors } = useTheme();
  const unlocked = achievements.filter(a => a.unlocked).length;
  const total    = achievements.length;
  const pct      = unlocked / total;
  const rank     = getRank(unlocked);

  const rarityCounts = (["legendary","epic","rare","common"] as Rarity[]).map(r => ({
    r,
    count: achievements.filter(a => a.rarity === r && a.unlocked).length,
    total: achievements.filter(a => a.rarity === r).length,
  }));

  return (
    <View style={hero.wrap}>
      <LinearGradient
        colors={["#1a1a2e", "#16213e", "#0f3460"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={hero.gradient}
      >
        {/* Top row */}
        <View style={hero.topRow}>
          <View>
            <Text style={hero.rankLabel}>ACHIEVEMENT RANK</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Ionicons name={rank.icon as any} size={22} color={rank.color} />
              <Text style={[hero.rankTitle, { color: rank.color }]}>{rank.title}</Text>
            </View>
          </View>
          <View style={hero.scoreBox}>
            <Text style={hero.scoreNum}>{unlocked}</Text>
            <Text style={hero.scoreOf}>/ {total}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={hero.trackWrap}>
          <View style={hero.track}>
            <LinearGradient
              colors={[rank.color, rank.color + "99"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[hero.fill, { width: `${pct * 100}%` as any }]}
            />
          </View>
          <Text style={hero.pctText}>{Math.round(pct * 100)}% complete</Text>
        </View>

        {/* Rarity breakdown */}
        <View style={hero.rarityRow}>
          {rarityCounts.map(({ r, count, total: t }) => (
            <View key={r} style={hero.rarityItem}>
              <View style={[hero.rarityDot, { backgroundColor: RARITY_COLOR[r] }]} />
              <Text style={hero.rarityCount}>{count}<Text style={hero.rarityOf}>/{t}</Text></Text>
              <Text style={[hero.rarityName, { color: RARITY_COLOR[r] }]}>{RARITY_LABEL[r].slice(0,3)}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

const hero = StyleSheet.create({
  wrap:       { marginHorizontal: 16, marginTop: 16, borderRadius: 20, overflow: "hidden", ...Platform.select({ web: { boxShadow: "0 4px 12px rgba(0,0,0,0.30)" } as any, default: { elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 } }) },
  gradient:   { padding: 20 },
  topRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  rankLabel:  { color: "rgba(255,255,255,0.5)", fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  rankTitle:  { fontSize: 22, fontFamily: "Inter_700Bold" },
  scoreBox:   { alignItems: "flex-end" },
  scoreNum:   { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold", lineHeight: 40 },
  scoreOf:    { color: "rgba(255,255,255,0.45)", fontSize: 13, fontFamily: "Inter_500Medium" },
  trackWrap:  { marginTop: 16 },
  track:      { height: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 3, overflow: "hidden" },
  fill:       { height: "100%", borderRadius: 3 },
  pctText:    { color: "rgba(255,255,255,0.45)", fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 6 },
  rarityRow:  { flexDirection: "row", marginTop: 18, gap: 0, justifyContent: "space-between" },
  rarityItem: { alignItems: "center", gap: 3 },
  rarityDot:  { width: 8, height: 8, borderRadius: 4 },
  rarityCount:{ color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  rarityOf:   { color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "Inter_400Regular" },
  rarityName: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
});

// ── Almost There carousel ─────────────────────────────────────────────────────

function AlmostThere({ achievements, onPress }: { achievements: Achievement[]; onPress: (a: Achievement) => void }) {
  const { colors } = useTheme();
  const candidates = achievements
    .filter(a => !a.unlocked && a.progress != null && a.total != null && a.progress / a.total > 0.3)
    .sort((a, b) => (b.progress! / b.total!) - (a.progress! / a.total!))
    .slice(0, 8);

  if (!candidates.length) return null;

  return (
    <View style={{ marginTop: 20 }}>
      <Text style={[at.heading, { color: colors.text }]}>⚡ Almost There</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={at.row}>
        {candidates.map(a => {
          const pct = Math.round((a.progress! / a.total!) * 100);
          const color = RARITY_COLOR[a.rarity];
          return (
            <TouchableOpacity key={a.id} style={[at.card, { backgroundColor: colors.surface }]} onPress={() => onPress(a)} activeOpacity={0.8}>
              <View style={[at.iconWrap, { backgroundColor: color + "20" }]}>
                <Ionicons name={a.icon as any} size={22} color={color} />
              </View>
              <Text style={[at.title, { color: colors.text }]} numberOfLines={2}>{a.title}</Text>
              <View style={[at.track, { backgroundColor: colors.backgroundTertiary }]}>
                <View style={[at.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
              </View>
              <Text style={[at.pct, { color: color }]}>{pct}%</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const at = StyleSheet.create({
  heading: { fontSize: 15, fontFamily: "Inter_700Bold", marginLeft: 16, marginBottom: 10 },
  row:     { paddingHorizontal: 16, gap: 10 },
  card:    { width: 120, borderRadius: 14, padding: 12, gap: 6 },
  iconWrap:{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title:   { fontSize: 11, fontFamily: "Inter_600SemiBold", lineHeight: 15 },
  track:   { height: 4, borderRadius: 2, overflow: "hidden" },
  fill:    { height: "100%", borderRadius: 2 },
  pct:     { fontSize: 11, fontFamily: "Inter_700Bold" },
});

// ── Achievement badge ─────────────────────────────────────────────────────────

function AchievementBadge({ achievement, onPress }: { achievement: Achievement; onPress: () => void }) {
  const { colors } = useTheme();
  const SIZE = useBadgeSize();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowColor = RARITY_COLOR[achievement.rarity];
  const pct = achievement.progress != null && achievement.total
    ? achievement.progress / achievement.total : achievement.unlocked ? 1 : 0;

  return (
    <TouchableOpacity
      style={[badge.wrap, { width: SIZE }]}
      onPress={onPress}
      activeOpacity={0.85}
      onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.93, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
      onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start()}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: "center" }}>
        {/* Icon container */}
        <View style={[
          badge.iconBox,
          { width: SIZE - 10, height: SIZE - 10 },
          achievement.unlocked
            ? { borderColor: glowColor + "55", borderWidth: 1.5, ...Platform.select({ web: { boxShadow: `0 2px 8px ${glowColor}80` } as any, default: { shadowColor: glowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4 } }) }
            : { borderColor: colors.border, borderWidth: 1 },
        ]}>
          {achievement.unlocked ? (
            <LinearGradient
              colors={RARITY_GRADIENT[achievement.rarity]}
              start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
              style={badge.inner}
            >
              <Ionicons name={achievement.icon as any} size={Math.round(SIZE * 0.28)} color="#fff" />
            </LinearGradient>
          ) : (
            <View style={[badge.inner, { backgroundColor: colors.backgroundTertiary }]}>
              <Ionicons name={achievement.icon as any} size={Math.round(SIZE * 0.28)} color={colors.textMuted + "88"} />
              <View style={badge.lock}>
                <Ionicons name="lock-closed" size={9} color={colors.textMuted} />
              </View>
            </View>
          )}

          {achievement.unlocked && (
            <View style={badge.greenDot} />
          )}
        </View>

        {/* Progress arc bar */}
        {!achievement.unlocked && achievement.total != null && (
          <View style={[badge.progTrack, { width: SIZE - 20, backgroundColor: colors.backgroundTertiary }]}>
            <View style={[badge.progFill, { width: `${pct * 100}%` as any, backgroundColor: glowColor }]} />
          </View>
        )}

        <Text style={[badge.title, { color: achievement.unlocked ? colors.text : colors.textMuted }]} numberOfLines={2}>
          {achievement.title}
        </Text>
        <View style={[badge.rarityTag, { backgroundColor: glowColor + "18" }]}>
          <Text style={[badge.rarityText, { color: glowColor }]}>
            {achievement.rarity === "legendary" ? "LEG" : RARITY_LABEL[achievement.rarity].slice(0, 3)}
          </Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const badge = StyleSheet.create({
  wrap:     { alignItems: "center", marginBottom: 22 },
  iconBox:  { borderRadius: 20, overflow: "hidden", position: "relative" },
  inner:    { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  lock:     { position: "absolute", bottom: 5, right: 5, backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 5, padding: 2 },
  greenDot: { position: "absolute", top: 5, right: 5, width: 9, height: 9, borderRadius: 4.5, backgroundColor: "#34C759", borderWidth: 1.5, borderColor: "#fff" },
  progTrack:{ height: 3, borderRadius: 1.5, overflow: "hidden", marginTop: 5 },
  progFill: { height: "100%", borderRadius: 1.5 },
  title:    { fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 5, lineHeight: 14, paddingHorizontal: 2 },
  rarityTag:{ marginTop: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
  rarityText:{ fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
});

// ── Detail Modal ──────────────────────────────────────────────────────────────

function DetailModal({ achievement, onClose }: { achievement: Achievement | null; onClose: () => void }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: achievement ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [achievement]);

  if (!achievement) return null;
  const glowColor = RARITY_COLOR[achievement.rarity];
  const pct = achievement.progress != null && achievement.total
    ? Math.round((achievement.progress / achievement.total) * 100) : achievement.unlocked ? 100 : 0;

  return (
    <Modal transparent visible={!!achievement} animationType="fade" onRequestClose={onClose}>
      <Pressable style={dm.backdrop} onPress={onClose}>
        <Animated.View style={[dm.sheet, { backgroundColor: colors.surface, opacity }]}>
          <Pressable onPress={() => {}}>
            {/* Icon */}
            <View style={dm.iconWrap}>
              {achievement.unlocked ? (
                <LinearGradient
                  colors={RARITY_GRADIENT[achievement.rarity]}
                  start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
                  style={[dm.iconBg, Platform.select({ web: { boxShadow: `0 4px 16px ${glowColor}99` } as any, default: { shadowColor: glowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 8 } })]}
                >
                  <Ionicons name={achievement.icon as any} size={40} color="#fff" />
                </LinearGradient>
              ) : (
                <View style={[dm.iconBg, { backgroundColor: colors.backgroundTertiary }]}>
                  <Ionicons name={achievement.icon as any} size={40} color={colors.textMuted} />
                </View>
              )}
            </View>

            {/* Status */}
            <View style={dm.statusRow}>
              <RarityPill rarity={achievement.rarity} />
              {achievement.unlocked && (
                <View style={dm.unlockedBadge}>
                  <Ionicons name="checkmark-circle" size={12} color="#34C759" />
                  <Text style={dm.unlockedText}>UNLOCKED</Text>
                </View>
              )}
            </View>

            {/* Title & desc */}
            <Text style={[dm.title, { color: colors.text }]}>{achievement.title}</Text>
            <Text style={[dm.desc, { color: colors.textSecondary }]}>{achievement.desc}</Text>

            {/* How to unlock */}
            <View style={[dm.howBox, { backgroundColor: colors.backgroundTertiary }]}>
              <Ionicons name="information-circle" size={15} color={glowColor} />
              <Text style={[dm.howText, { color: colors.textSecondary }]}>{achievement.howTo}</Text>
            </View>

            {/* Progress */}
            {achievement.total != null && (
              <View style={{ marginTop: 14 }}>
                <View style={dm.progRow}>
                  <Text style={[dm.progLabel, { color: colors.textMuted }]}>Progress</Text>
                  <Text style={[dm.progValue, { color: glowColor }]}>
                    {achievement.progress?.toLocaleString() ?? 0} / {achievement.total.toLocaleString()}
                  </Text>
                </View>
                <View style={[dm.track, { backgroundColor: colors.backgroundTertiary }]}>
                  <LinearGradient
                    colors={RARITY_GRADIENT[achievement.rarity]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[dm.fill, { width: `${pct}%` as any }]}
                  />
                </View>
              </View>
            )}

            {/* XP reward */}
            {achievement.xpReward > 0 && (
              <View style={[dm.xpRow, { backgroundColor: "#FF9F0A" + "18" }]}>
                <Ionicons name="flash" size={15} color="#FF9F0A" />
                <Text style={dm.xpText}>
                  {achievement.unlocked ? "Earned" : "Reward"}:{" "}
                  <Text style={{ color: "#FF9F0A", fontFamily: "Inter_700Bold" }}>
                    +{achievement.xpReward.toLocaleString()} XP
                  </Text>
                </Text>
              </View>
            )}

            <TouchableOpacity style={[dm.closeBtn, { backgroundColor: glowColor }]} onPress={onClose}>
              <Text style={dm.closeTxt}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const dm = StyleSheet.create({
  backdrop:     { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet:        { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  iconWrap:     { alignItems: "center", marginBottom: 16 },
  iconBg:       { width: 88, height: 88, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  statusRow:    { flexDirection: "row", gap: 10, marginBottom: 14, justifyContent: "center" },
  unlockedBadge:{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#34C75922", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  unlockedText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#34C759", letterSpacing: 1.2 },
  title:        { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 6 },
  desc:         { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 14 },
  howBox:       { flexDirection: "row", gap: 8, padding: 12, borderRadius: 12, alignItems: "flex-start" },
  howText:      { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  progRow:      { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  progLabel:    { fontSize: 12, fontFamily: "Inter_500Medium" },
  progValue:    { fontSize: 12, fontFamily: "Inter_700Bold" },
  track:        { height: 8, borderRadius: 4, overflow: "hidden" },
  fill:         { height: "100%", borderRadius: 4 },
  xpRow:        { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, padding: 10, borderRadius: 10 },
  xpText:       { fontSize: 13, fontFamily: "Inter_500Medium", color: "#8E8E93" },
  closeBtn:     { marginTop: 20, height: 50, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  closeTxt:     { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AchievementsScreen() {
  const { profile, user, isPremium } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [selectedCategory, setSelectedCategory] = useState<Category>("All");
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [stats, setStats] = useState<Stats>({ posts: 0, stories: 0, messages: 0 });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoadingStats(false); return; }
    fetchStats(user.id)
      .then(s => { setStats(s); setLoadingStats(false); })
      .catch(() => setLoadingStats(false));
  }, [user?.id]);

  const achievements = useMemo(
    () => buildAchievements(profile, isPremium, stats),
    [profile, isPremium, stats],
  );

  const filtered = useMemo(
    () => selectedCategory === "All" ? achievements : achievements.filter(a => a.category === selectedCategory),
    [achievements, selectedCategory],
  );

  const unlockedFiltered  = filtered.filter(a => a.unlocked);
  const lockedFiltered    = filtered.filter(a => !a.unlocked);

  return (
    <View style={[sc.screen, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      {/* Header */}
      {(
        <View style={[sc.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={sc.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.accent} />
          </TouchableOpacity>
          <Text style={[sc.headerTitle, { color: colors.text }]}>Achievements</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        {/* Hero */}
        <HeroCard achievements={achievements} />

        {/* Almost There */}
        <AlmostThere achievements={achievements} onPress={setSelectedAchievement} />

        {/* Category tabs */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={sc.tabsRow}
          style={{ marginTop: 20 }}
        >
          {CATEGORIES.map(cat => {
            const active = cat === selectedCategory;
            const count  = cat === "All"
              ? achievements.filter(a => a.unlocked).length
              : achievements.filter(a => a.category === cat && a.unlocked).length;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[sc.tab, {
                  backgroundColor: active ? colors.accent : colors.surface,
                  borderColor: active ? colors.accent : colors.border,
                }]}
              >
                <Text style={[sc.tabText, { color: active ? "#fff" : colors.textSecondary }]}>{cat}</Text>
                {count > 0 && (
                  <View style={[sc.tabBadge, { backgroundColor: active ? "rgba(255,255,255,0.25)" : colors.accent + "22" }]}>
                    <Text style={[sc.tabBadgeText, { color: active ? "#fff" : colors.accent }]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Unlocked section */}
        {unlockedFiltered.length > 0 && (
          <>
            <View style={sc.sectionHeader}>
              <View style={[sc.sectionDot, { backgroundColor: "#34C759" }]} />
              <Text style={[sc.sectionTitle, { color: colors.text }]}>Unlocked ({unlockedFiltered.length})</Text>
            </View>
            <View style={sc.grid}>
              {unlockedFiltered.map(a => (
                <AchievementBadge key={a.id} achievement={a} onPress={() => setSelectedAchievement(a)} />
              ))}
            </View>
          </>
        )}

        {/* Locked section */}
        {lockedFiltered.length > 0 && (
          <>
            <View style={sc.sectionHeader}>
              <View style={[sc.sectionDot, { backgroundColor: colors.textMuted }]} />
              <Text style={[sc.sectionTitle, { color: colors.text }]}>Locked ({lockedFiltered.length})</Text>
            </View>
            <View style={sc.grid}>
              {lockedFiltered.map(a => (
                <AchievementBadge key={a.id} achievement={a} onPress={() => setSelectedAchievement(a)} />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Detail modal */}
      <DetailModal achievement={selectedAchievement} onClose={() => setSelectedAchievement(null)} />
    </View>
  );
}

const sc = StyleSheet.create({
  screen:       { flex: 1 },
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn:      { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle:  { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  tabsRow:      { paddingHorizontal: 16, gap: 8 },
  tab:          { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1 },
  tabText:      { fontSize: 13, fontFamily: "Inter_500Medium" },
  tabBadge:     { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99, minWidth: 20, alignItems: "center" },
  tabBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  sectionHeader:{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, marginTop: 22, marginBottom: 12 },
  sectionDot:   { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  grid:         { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 8, justifyContent: "space-between" },
});
