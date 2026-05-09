import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ReferralSkeleton } from "@/components/ui/Skeleton";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import * as Clipboard from "expo-clipboard";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";

type ReferralEntry = {
  id: string;
  referred_id: string;
  referred_display_name: string;
  referred_handle: string;
  referred_avatar_url: string | null;
  reward_given: boolean;
  created_at: string;
  joined_days_ago: number;
};

type MilestoneConfig = {
  count: number;
  label: string;
  icon: string;
  color: string;
  reward: string;
};

const MILESTONES: MilestoneConfig[] = [
  { count: 1,  label: "First Invite",    icon: "star-outline",         color: "#8E8E93", reward: "+2,000 ACoin" },
  { count: 3,  label: "Connector",       icon: "people-outline",       color: "#34C759", reward: "+500 Bonus" },
  { count: 5,  label: "Ambassador",      icon: "ribbon-outline",       color: "#007AFF", reward: "+1,000 Bonus" },
  { count: 10, label: "Champion",        icon: "trophy-outline",       color: "#FF9F0A", reward: "+2,500 Bonus" },
  { count: 25, label: "Legend",          icon: "diamond-outline",      color: "#BF5AF2", reward: "+7,500 Bonus" },
  { count: 50, label: "Elite Referrer",  icon: "flash-outline",        color: "#FFD60A", reward: "+20,000 Bonus" },
];

function getMilestoneStatus(total: number) {
  let achieved = MILESTONES.filter((m) => total >= m.count);
  let current = achieved[achieved.length - 1] ?? null;
  let next = MILESTONES.find((m) => total < m.count) ?? null;
  return { current, next, achieved };
}

function AvatarInitial({ name, uri, size = 40 }: { name: string; uri?: string | null; size?: number }) {
  const initial = (name || "U").slice(0, 1).toUpperCase();
  const hue = (name.charCodeAt(0) * 37) % 360;
  const bg = `hsl(${hue}, 55%, 52%)`;
  return uri ? (
    <ExpoImage
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
    />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontFamily: "Inter_700Bold" }}>{initial}</Text>
    </View>
  );
}

function MilestoneChip({ m, achieved, colors }: { m: MilestoneConfig; achieved: boolean; colors: any }) {
  return (
    <View style={[
      styles.milestoneChip,
      {
        backgroundColor: achieved ? m.color + "18" : colors.backgroundTertiary,
        borderColor: achieved ? m.color + "50" : colors.border,
      },
    ]}>
      <Ionicons name={m.icon as any} size={16} color={achieved ? m.color : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: achieved ? m.color : colors.textMuted }}>
          {m.count} {m.count === 1 ? "invite" : "invites"}
        </Text>
        <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: achieved ? colors.textSecondary : colors.textMuted }}>
          {m.label} · {m.reward}
        </Text>
      </View>
      {achieved && <Ionicons name="checkmark-circle" size={16} color={m.color} />}
    </View>
  );
}

function AnimatedProgressBar({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 900, useNativeDriver: false }).start();
  }, [pct]);
  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: "#00000015", overflow: "hidden" }}>
      <Animated.View style={{ height: "100%", width, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

export default function ReferralScreen() {
  const { colors, accent } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeShare, setActiveShare] = useState<"link" | "code">("link");

  const referralLink = `https://afuchat.com/${profile?.handle || ""}`;
  const referralCode = (profile?.handle || "").toUpperCase();

  const totalReferrals = referrals.length;
  const rewardedCount = referrals.filter((r) => r.reward_given).length;
  const pendingCount = totalReferrals - rewardedCount;
  const totalAcoinEarned = rewardedCount * 2000;

  const { current: currentMilestone, next: nextMilestone, achieved } = getMilestoneStatus(totalReferrals);
  const nextPct = nextMilestone
    ? Math.min((totalReferrals - (currentMilestone?.count ?? 0)) / (nextMilestone.count - (currentMilestone?.count ?? 0)), 1)
    : 1;

  const loadReferrals = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("referrals")
        .select("id, reward_given, created_at, referred_id")
        .eq("referrer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.warn("[referral] query error:", error.message);
        setLoading(false);
        return;
      }

      if (data && data.length > 0) {
        const referredIds = data.map((r: any) => r.referred_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, handle, avatar_url")
          .in("id", referredIds);

        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
        const now = Date.now();

        const entries: ReferralEntry[] = data.map((r: any) => {
          const p = profileMap.get(r.referred_id);
          const joinedMs = new Date(r.created_at).getTime();
          return {
            id: r.id,
            referred_id: r.referred_id,
            referred_display_name: p?.display_name || "User",
            referred_handle: p?.handle || "",
            referred_avatar_url: p?.avatar_url || null,
            reward_given: r.reward_given,
            created_at: r.created_at,
            joined_days_ago: Math.floor((now - joinedMs) / 86400000),
          };
        });

        setReferrals(entries);
      } else {
        setReferrals([]);
      }
    } catch (e) {
      console.error("[referral] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadReferrals(); }, [loadReferrals]);

  async function handleShare() {
    Haptics.selectionAsync();
    const text = activeShare === "code"
      ? `Use my referral code ${referralCode} when signing up on AfuChat and get 1 week of free Platinum! Download: https://afuchat.com`
      : `Join me on AfuChat! Sign up with my link and get 1 week of free Platinum premium: ${referralLink}`;
    try {
      await Share.share({ message: text, url: referralLink });
    } catch {}
  }

  async function handleCopy() {
    Haptics.selectionAsync();
    const value = activeShare === "code" ? referralCode : referralLink;
    await Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Referral Program</Text>
        <TouchableOpacity onPress={loadReferrals}>
          <Ionicons name="refresh-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero gradient card */}
        <LinearGradient
          colors={[accent, Colors.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroIconWrap}>
            <Ionicons name="gift" size={36} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Invite Friends, Earn Together</Text>
          <Text style={styles.heroSub}>
            Every friend who joins earns them 1 week Platinum — and you earn 2,000 ACoin instantly.
          </Text>
        </LinearGradient>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="people" size={22} color={accent} />
            <Text style={[styles.statValue, { color: colors.text }]}>{totalReferrals}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Friends Joined</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="checkmark-circle" size={22} color="#34C759" />
            <Text style={[styles.statValue, { color: colors.text }]}>{rewardedCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Rewarded</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="flash" size={22} color="#FFD60A" />
            <Text style={[styles.statValue, { color: colors.text }]}>{totalAcoinEarned.toLocaleString()}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>ACoin Earned</Text>
          </View>
        </View>

        {/* Share section */}
        <View style={[styles.shareCard, { backgroundColor: colors.surface }]}>
          {/* Toggle: link vs code */}
          <View style={[styles.toggleRow, { backgroundColor: colors.backgroundTertiary }]}>
            <TouchableOpacity
              style={[styles.toggleBtn, activeShare === "link" && { backgroundColor: colors.surface }]}
              onPress={() => setActiveShare("link")}
            >
              <Ionicons name="link-outline" size={14} color={activeShare === "link" ? accent : colors.textMuted} />
              <Text style={[styles.toggleText, { color: activeShare === "link" ? accent : colors.textMuted }]}>Link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, activeShare === "code" && { backgroundColor: colors.surface }]}
              onPress={() => setActiveShare("code")}
            >
              <Ionicons name="code-outline" size={14} color={activeShare === "code" ? accent : colors.textMuted} />
              <Text style={[styles.toggleText, { color: activeShare === "code" ? accent : colors.textMuted }]}>Code</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.shareSublabel, { color: colors.textMuted }]}>
            {activeShare === "link" ? "Your Referral Link" : "Your Referral Code"}
          </Text>
          <View style={[styles.linkRow, { backgroundColor: colors.inputBg }]}>
            <Text style={[styles.linkText, { color: colors.text }]} numberOfLines={1}>
              {activeShare === "link" ? referralLink : referralCode}
            </Text>
            <TouchableOpacity style={[styles.copyBtn, { backgroundColor: copied ? "#34C75920" : accent + "15" }]} onPress={handleCopy}>
              <Ionicons
                name={copied ? "checkmark" : "copy-outline"}
                size={16}
                color={copied ? "#34C759" : accent}
              />
              <Text style={[styles.copyBtnText, { color: copied ? "#34C759" : accent }]}>
                {copied ? "Copied!" : "Copy"}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.shareBtn, { backgroundColor: accent }]} onPress={handleShare} activeOpacity={0.85}>
            <Ionicons name="share-social" size={18} color="#fff" />
            <Text style={styles.shareBtnText}>Share {activeShare === "code" ? "Code" : "Link"}</Text>
          </TouchableOpacity>
        </View>

        {/* Milestone progress */}
        {nextMilestone && (
          <View style={[styles.milestoneCard, { backgroundColor: colors.surface }]}>
            <View style={styles.milestoneTitleRow}>
              <Ionicons name="trophy" size={16} color="#FF9F0A" />
              <Text style={[styles.milestoneTitleText, { color: colors.text }]}>Next Milestone</Text>
              <View style={{ marginLeft: "auto" }}>
                <Text style={[styles.milestoneProgress, { color: accent }]}>
                  {totalReferrals} / {nextMilestone.count}
                </Text>
              </View>
            </View>
            <AnimatedProgressBar pct={nextPct} color={nextMilestone.color} />
            <Text style={[styles.milestoneSubtext, { color: colors.textMuted }]}>
              {nextMilestone.count - totalReferrals} more invite{nextMilestone.count - totalReferrals !== 1 ? "s" : ""} to unlock{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: nextMilestone.color }}>
                {nextMilestone.label}
              </Text>
              {" "}({nextMilestone.reward})
            </Text>
          </View>
        )}

        {/* All milestones */}
        <View style={[styles.milestonesSection, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Milestone Rewards</Text>
          {MILESTONES.map((m) => (
            <MilestoneChip key={m.count} m={m} achieved={totalReferrals >= m.count} colors={colors} />
          ))}
        </View>

        {/* Referral list */}
        {loading ? (
          <ReferralSkeleton />
        ) : referrals.length > 0 ? (
          <View style={[styles.listSection, { backgroundColor: colors.surface }]}>
            <View style={styles.listHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Your Referrals{" "}
                <Text style={{ color: colors.textMuted, fontFamily: "Inter_400Regular" }}>({totalReferrals})</Text>
              </Text>
              {pendingCount > 0 && (
                <View style={[styles.pendingBadge, { backgroundColor: "#FF9F0A20" }]}>
                  <Text style={[styles.pendingBadgeText, { color: "#FF9F0A" }]}>{pendingCount} pending</Text>
                </View>
              )}
            </View>

            {referrals.map((r, idx) => (
              <TouchableOpacity
                key={r.id}
                style={[styles.referralRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                onPress={() => router.push({ pathname: "/contact/[id]", params: { id: r.referred_id } })}
                activeOpacity={0.7}
              >
                <AvatarInitial name={r.referred_display_name} uri={r.referred_avatar_url} size={42} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.referralName, { color: colors.text }]}>{r.referred_display_name}</Text>
                  <Text style={[styles.referralHandle, { color: colors.textMuted }]}>
                    @{r.referred_handle} · {r.joined_days_ago === 0 ? "today" : `${r.joined_days_ago}d ago`}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  {r.reward_given ? (
                    <View style={[styles.rewardBadge, { backgroundColor: "#34C75918" }]}>
                      <Ionicons name="checkmark-circle" size={12} color="#34C759" />
                      <Text style={[styles.rewardBadgeText, { color: "#34C759" }]}>+2,000 ACoin</Text>
                    </View>
                  ) : (
                    <View style={[styles.rewardBadge, { backgroundColor: "#FF9F0A18" }]}>
                      <Ionicons name="time-outline" size={12} color="#FF9F0A" />
                      <Text style={[styles.rewardBadgeText, { color: "#FF9F0A" }]}>Pending</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
            <Ionicons name="people-outline" size={52} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No referrals yet</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Share your link or code to start earning rewards for every friend who joins.
            </Text>
            <TouchableOpacity style={[styles.shareBtn, { backgroundColor: accent, marginTop: 4 }]} onPress={handleShare} activeOpacity={0.85}>
              <Ionicons name="share-social" size={16} color="#fff" />
              <Text style={styles.shareBtnText}>Share Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* How it works */}
        <View style={[styles.howCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>How It Works</Text>
          {[
            { icon: "link-outline",       color: accent,     text: "Share your referral link or code with friends" },
            { icon: "person-add-outline", color: "#34C759",  text: "They sign up on AfuChat using your link or code" },
            { icon: "diamond-outline",    color: "#BF5AF2",  text: "They instantly get 1 week of free Platinum premium" },
            { icon: "flash",              color: "#FFD60A",  text: "You earn 2,000 ACoin added to your account" },
            { icon: "trophy-outline",     color: "#FF9F0A",  text: "Hit milestones to unlock bonus ACoin rewards" },
          ].map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepIcon, { backgroundColor: step.color + "18" }]}>
                <Ionicons name={step.icon as any} size={16} color={step.color} />
              </View>
              <Text style={[styles.stepText, { color: colors.textSecondary }]}>{step.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },

  heroCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heroTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff", textAlign: "center" },
  heroSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.88)", textAlign: "center", lineHeight: 19 },

  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center", gap: 6 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },

  shareCard: { borderRadius: 16, padding: 16, gap: 12 },
  toggleRow: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  shareSublabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  linkRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  linkText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  copyBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
  },
  shareBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  milestoneCard: { borderRadius: 14, padding: 16, gap: 10 },
  milestoneTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  milestoneTitleText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  milestoneProgress: { fontSize: 13, fontFamily: "Inter_700Bold" },
  milestoneSubtext: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  milestonesSection: { borderRadius: 14, padding: 16, gap: 10 },
  milestoneChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },

  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 4 },

  listSection: { borderRadius: 14, padding: 16, gap: 0 },
  listHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  pendingBadge: { marginLeft: "auto", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pendingBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  referralRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  referralName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  referralHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  rewardBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rewardBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  emptyState: { borderRadius: 16, padding: 32, alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },

  howCard: { borderRadius: 14, padding: 16, gap: 14 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stepText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
