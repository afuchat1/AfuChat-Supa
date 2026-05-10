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
import { GlassHeader } from "@/components/ui/GlassHeader";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── Reward steps config ─────────────────────────────────────────────────────
// Each invite always gives +2,000 Nexa automatically.
// These steps are *milestone bonus* rewards on top of the base per-invite Nexa.
type RewardStep = {
  step: number;
  invites: number;
  title: string;
  role: string;
  nexaBase: number;          // Nexa earned per invite up to this point (cumulative base)
  bonusNexa: number;         // Milestone bonus on top
  icon: string;
  color: string;
  description: string;
};

const REWARD_STEPS: RewardStep[] = [
  {
    step: 1, invites: 1,
    title: "First Invite",   role: "Newcomer",
    nexaBase: 2000,          bonusNexa: 0,
    icon: "hand-right-outline", color: "#34C759",
    description: "Your first friend joins AfuChat",
  },
  {
    step: 2, invites: 3,
    title: "Connector",      role: "Social Starter",
    nexaBase: 6000,          bonusNexa: 1500,
    icon: "people-outline",  color: "#007AFF",
    description: "3 friends have signed up with your link",
  },
  {
    step: 3, invites: 5,
    title: "Ambassador",     role: "Rising Star",
    nexaBase: 10000,         bonusNexa: 3000,
    icon: "ribbon-outline",  color: "#5856D6",
    description: "5 friends joined — you're on a roll",
  },
  {
    step: 4, invites: 10,
    title: "Champion",       role: "Top Recruiter",
    nexaBase: 20000,         bonusNexa: 7500,
    icon: "trophy-outline",  color: "#FF9F0A",
    description: "10 friends — the crowd is growing",
  },
  {
    step: 5, invites: 25,
    title: "Influencer",     role: "Community Builder",
    nexaBase: 50000,         bonusNexa: 18000,
    icon: "megaphone-outline", color: "#FF375F",
    description: "25 friends — you're building a movement",
  },
  {
    step: 6, invites: 50,
    title: "Legend",         role: "Elite Referrer",
    nexaBase: 100000,        bonusNexa: 40000,
    icon: "diamond-outline", color: "#BF5AF2",
    description: "50 friends — a true AfuChat legend",
  },
  {
    step: 7, invites: 100,
    title: "Hall of Fame",   role: "AfuChat Icon",
    nexaBase: 200000,        bonusNexa: 125000,
    icon: "flash",           color: "#FFD60A",
    description: "100 friends — your name is in the history books",
  },
];

const NEXA_PER_INVITE = 2000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getStepStatus(total: number, step: RewardStep): "done" | "active" | "locked" {
  if (total >= step.invites) return "done";
  const prev = REWARD_STEPS.find(s => s.step === step.step - 1);
  if (!prev || total >= prev.invites) return "active";
  return "locked";
}

function getNextStep(total: number): RewardStep | null {
  return REWARD_STEPS.find(s => total < s.invites) ?? null;
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

function AnimatedBar({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 1000, useNativeDriver: false }).start();
  }, [pct]);
  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  return (
    <View style={{ height: 5, borderRadius: 3, backgroundColor: "#00000012", overflow: "hidden" }}>
      <Animated.View style={{ height: "100%", width, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

// ─── Reward Step Row ──────────────────────────────────────────────────────────
function StepRow({ step, total, isLast, accent, colors }: {
  step: RewardStep; total: number; isLast: boolean; accent: string; colors: any;
}) {
  const status = getStepStatus(total, step);
  const isDone   = status === "done";
  const isActive = status === "active";
  const isLocked = status === "locked";

  const circleColor = isDone ? step.color : isActive ? accent : colors.backgroundTertiary;
  const circleBorder = isDone ? step.color : isActive ? accent : colors.border;
  const lineColor    = isDone ? step.color : colors.border;

  const moreNeeded = step.invites - total;

  return (
    <View style={styles.stepRow}>
      {/* Left: circle + connecting line */}
      <View style={styles.stepLeft}>
        <View style={[styles.stepCircle, { backgroundColor: circleColor, borderColor: circleBorder }]}>
          {isDone ? (
            <Ionicons name="checkmark" size={14} color="#fff" />
          ) : isActive ? (
            <Ionicons name={step.icon as any} size={13} color="#fff" />
          ) : (
            <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
          )}
        </View>
        {!isLast && (
          <View style={[styles.stepLine, { backgroundColor: isDone ? step.color + "60" : colors.border }]} />
        )}
      </View>

      {/* Right: content card */}
      <View style={[
        styles.stepContent,
        {
          backgroundColor: isDone ? step.color + "10" : isActive ? accent + "08" : colors.surface,
          borderColor: isDone ? step.color + "30" : isActive ? accent + "25" : colors.border,
          opacity: isLocked ? 0.55 : 1,
        },
        !isLast && { marginBottom: 0 },
      ]}>
        {/* Step header */}
        <View style={styles.stepHeader}>
          <View style={styles.stepTitleRow}>
            <Text style={[styles.stepTitle, { color: isDone ? step.color : isActive ? colors.text : colors.textMuted }]}>
              {step.title}
            </Text>
            {isDone && (
              <View style={[styles.stepBadge, { backgroundColor: step.color + "20" }]}>
                <Text style={[styles.stepBadgeText, { color: step.color }]}>Unlocked</Text>
              </View>
            )}
            {isActive && (
              <View style={[styles.stepBadge, { backgroundColor: accent + "18" }]}>
                <Text style={[styles.stepBadgeText, { color: accent }]}>In Progress</Text>
              </View>
            )}
          </View>
          <Text style={[styles.stepRole, { color: colors.textMuted }]}>
            {step.invites} invite{step.invites !== 1 ? "s" : ""} · {step.role}
          </Text>
        </View>

        {/* Nexa rewards */}
        <View style={styles.stepRewards}>
          <View style={styles.stepRewardRow}>
            <Ionicons name="flash" size={13} color="#FFD60A" />
            <Text style={[styles.stepRewardText, { color: colors.text }]}>
              +{(step.nexaBase).toLocaleString()} Nexa base
            </Text>
          </View>
          {step.bonusNexa > 0 && (
            <View style={styles.stepRewardRow}>
              <Ionicons name="gift-outline" size={13} color={step.color} />
              <Text style={[styles.stepRewardText, { color: step.color }]}>
                +{step.bonusNexa.toLocaleString()} milestone bonus
              </Text>
            </View>
          )}
        </View>

        {/* Progress for active step */}
        {isActive && (
          <View style={{ marginTop: 10, gap: 5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
                {total} / {step.invites} invites
              </Text>
              <Text style={[styles.progressLabel, { color: accent }]}>
                {moreNeeded} more to unlock
              </Text>
            </View>
            <AnimatedBar
              pct={step.invites > 0 ? Math.min(total / step.invites, 1) : 0}
              color={accent}
            />
          </View>
        )}

        {/* Description */}
        <Text style={[styles.stepDesc, { color: colors.textMuted }]}>{step.description}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
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

  const totalReferrals   = referrals.length;
  const rewardedCount    = referrals.filter(r => r.reward_given).length;
  const nexaEarned       = rewardedCount * NEXA_PER_INVITE;
  const nextStep         = getNextStep(totalReferrals);
  const doneSteps        = REWARD_STEPS.filter(s => totalReferrals >= s.invites);
  const totalBonusNexa   = doneSteps.reduce((acc, s) => acc + s.bonusNexa, 0);
  const totalNexaAll     = nexaEarned + totalBonusNexa;
  const currentStep      = doneSteps[doneSteps.length - 1] ?? null;

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
          return {
            id: r.id,
            referred_id: r.referred_id,
            referred_display_name: p?.display_name || "User",
            referred_handle: p?.handle || "",
            referred_avatar_url: p?.avatar_url || null,
            reward_given: r.reward_given ?? true,
            created_at: r.created_at,
            joined_days_ago: Math.floor((now - new Date(r.created_at).getTime()) / 86400000),
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
    try { await Share.share({ message: text, url: referralLink }); } catch {}
  }

  async function handleCopy() {
    Haptics.selectionAsync();
    await Clipboard.setStringAsync(activeShare === "code" ? referralCode : referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* ── Header ── */}
      <GlassHeader
        title="Referral Rewards"
        right={
          <TouchableOpacity onPress={loadReferrals} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
            <Ionicons name="refresh-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 36 }]} showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <LinearGradient
          colors={[accent, Colors.brand]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroEyebrow}>Total Nexa Earned</Text>
              <Text style={styles.heroNexa}>{totalNexaAll.toLocaleString()} ⚡</Text>
              <Text style={styles.heroSub}>{totalReferrals} friend{totalReferrals !== 1 ? "s" : ""} joined · {rewardedCount} rewarded</Text>
            </View>
            <View style={styles.heroIconBg}>
              <Ionicons name="flash" size={34} color="#FFD60A" />
            </View>
          </View>

          {/* Base earn callout */}
          <View style={styles.heroBadge}>
            <Ionicons name="person-add-outline" size={14} color="rgba(255,255,255,0.9)" />
            <Text style={styles.heroBadgeText}>Every invite = +2,000 Nexa instantly</Text>
          </View>

          {/* Active step progress */}
          {nextStep && (
            <View style={styles.heroProgress}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                <Text style={styles.heroProgressLabel}>
                  Next: {nextStep.title} ({nextStep.invites} invites)
                </Text>
                <Text style={styles.heroProgressLabel}>
                  {totalReferrals}/{nextStep.invites}
                </Text>
              </View>
              <View style={{ height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
                <View style={{
                  height: "100%",
                  width: `${Math.min((totalReferrals / nextStep.invites) * 100, 100)}%`,
                  backgroundColor: "#fff",
                  borderRadius: 3,
                }} />
              </View>
              {nextStep.bonusNexa > 0 && (
                <Text style={[styles.heroProgressLabel, { marginTop: 4, opacity: 0.85 }]}>
                  Unlock +{nextStep.bonusNexa.toLocaleString()} bonus Nexa
                </Text>
              )}
            </View>
          )}
          {!nextStep && totalReferrals >= REWARD_STEPS[REWARD_STEPS.length - 1].invites && (
            <View style={styles.heroBadge}>
              <Ionicons name="trophy" size={14} color="#FFD60A" />
              <Text style={styles.heroBadgeText}>You've reached the Hall of Fame!</Text>
            </View>
          )}
        </LinearGradient>

        {/* ── Share card ── */}
        <View style={[styles.shareCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.toggleRow, { backgroundColor: colors.backgroundTertiary }]}>
            {(["link", "code"] as const).map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.toggleBtn, activeShare === type && { backgroundColor: colors.surface }]}
                onPress={() => setActiveShare(type)}
              >
                <Ionicons name={type === "link" ? "link-outline" : "code-outline"} size={14}
                  color={activeShare === type ? accent : colors.textMuted} />
                <Text style={[styles.toggleText, { color: activeShare === type ? accent : colors.textMuted }]}>
                  {type === "link" ? "Link" : "Code"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.shareSublabel, { color: colors.textMuted }]}>
            {activeShare === "link" ? "Your Referral Link" : "Your Referral Code"}
          </Text>

          <View style={[styles.linkRow, { backgroundColor: colors.inputBg }]}>
            <Text style={[styles.linkText, { color: colors.text }]} numberOfLines={1}>
              {activeShare === "link" ? referralLink : referralCode}
            </Text>
            <TouchableOpacity
              style={[styles.copyBtn, { backgroundColor: copied ? "#34C75920" : accent + "15" }]}
              onPress={handleCopy}
            >
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={copied ? "#34C759" : accent} />
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

        {/* ── Reward Steps ── */}
        <View style={[styles.stepsSection, { backgroundColor: colors.surface }]}>
          <View style={styles.stepsSectionHeader}>
            <Ionicons name="trophy" size={16} color="#FF9F0A" />
            <Text style={[styles.stepsSectionTitle, { color: colors.text }]}>Reward Steps</Text>
            <View style={[styles.stepCounter, { backgroundColor: accent + "18" }]}>
              <Text style={[styles.stepCounterText, { color: accent }]}>
                {doneSteps.length}/{REWARD_STEPS.length} unlocked
              </Text>
            </View>
          </View>

          <Text style={[styles.stepsSubtitle, { color: colors.textMuted }]}>
            Invite friends to unlock each step and collect Nexa bonuses. Every invite also earns +2,000 Nexa instantly.
          </Text>

          <View style={styles.stepsContainer}>
            {REWARD_STEPS.map((step, idx) => (
              <StepRow
                key={step.step}
                step={step}
                total={totalReferrals}
                isLast={idx === REWARD_STEPS.length - 1}
                accent={accent}
                colors={colors}
              />
            ))}
          </View>
        </View>

        {/* ── Referral list ── */}
        {loading ? (
          <ReferralSkeleton />
        ) : referrals.length > 0 ? (
          <View style={[styles.listSection, { backgroundColor: colors.surface }]}>
            <Text style={[styles.listTitle, { color: colors.text }]}>
              Your Referrals
              <Text style={{ color: colors.textMuted, fontFamily: "Inter_400Regular" }}> ({totalReferrals})</Text>
            </Text>
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
                      <Ionicons name="flash" size={11} color="#FFD60A" />
                      <Text style={[styles.rewardBadgeText, { color: "#34C759" }]}>+2,000 Nexa</Text>
                    </View>
                  ) : (
                    <View style={[styles.rewardBadge, { backgroundColor: "#FF9F0A18" }]}>
                      <Ionicons name="time-outline" size={11} color="#FF9F0A" />
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
            <Ionicons name="people-outline" size={50} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No referrals yet</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Share your link to start earning Nexa and unlocking reward steps.
            </Text>
            <TouchableOpacity style={[styles.shareBtn, { backgroundColor: accent, marginTop: 4 }]} onPress={handleShare} activeOpacity={0.85}>
              <Ionicons name="share-social" size={16} color="#fff" />
              <Text style={styles.shareBtnText}>Share Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── How it works ── */}
        <View style={[styles.howCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.howTitle, { color: colors.text }]}>How It Works</Text>
          {[
            { icon: "link-outline",        color: accent,    text: "Share your referral link or code" },
            { icon: "person-add-outline",  color: "#34C759", text: "Friend signs up using your link" },
            { icon: "diamond-outline",     color: "#BF5AF2", text: "They get 1 week of free Platinum" },
            { icon: "flash",               color: "#FFD60A", text: "You earn 2,000 Nexa instantly" },
            { icon: "trophy-outline",      color: "#FF9F0A", text: "Keep inviting to unlock reward steps and bonus Nexa" },
          ].map((s, i) => (
            <View key={i} style={styles.howRow}>
              <View style={[styles.howIcon, { backgroundColor: s.color + "18" }]}>
                <Ionicons name={s.icon as any} size={15} color={s.color} />
              </View>
              <Text style={[styles.howText, { color: colors.textSecondary }]}>{s.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row", alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },

  content: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },

  // Hero
  heroCard: { borderRadius: 20, padding: 20, gap: 14 },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  heroEyebrow: { fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  heroNexa: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#fff" },
  heroSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 4 },
  heroIconBg: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, alignSelf: "flex-start" },
  heroBadgeText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#fff" },
  heroProgress: { backgroundColor: "rgba(255,255,255,0.15)", padding: 12, borderRadius: 12 },
  heroProgressLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.9)" },

  // Share
  shareCard: { borderRadius: 16, padding: 16, gap: 12 },
  toggleRow: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 3 },
  toggleBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 8 },
  toggleText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  shareSublabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  linkRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  linkText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  copyBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 13 },
  shareBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  // Steps section wrapper
  stepsSection: { borderRadius: 16, padding: 16 },
  stepsSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  stepsSectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", flex: 1 },
  stepCounter: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  stepCounterText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  stepsSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginBottom: 16 },
  stepsContainer: { gap: 0 },

  // Individual step row
  stepRow: { flexDirection: "row", gap: 12 },
  stepLeft: { alignItems: "center", width: 30 },
  stepCircle: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 2,
    alignItems: "center", justifyContent: "center",
    zIndex: 1,
  },
  stepLine: { width: 2, flex: 1, marginVertical: 2, borderRadius: 1 },

  stepContent: {
    flex: 1, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, marginBottom: 8, gap: 6,
  },
  stepHeader: { gap: 3 },
  stepTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  stepBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  stepBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  stepRole: { fontSize: 11, fontFamily: "Inter_500Medium" },
  stepRewards: { gap: 4, marginTop: 2 },
  stepRewardRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  stepRewardText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  progressLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  stepDesc: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 15 },

  // Referral list
  listSection: { borderRadius: 14, padding: 16 },
  listTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  referralRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  referralName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  referralHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  rewardBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rewardBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  // Empty state
  emptyState: { borderRadius: 16, padding: 32, alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },

  // How it works
  howCard: { borderRadius: 14, padding: 16, gap: 12 },
  howTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  howRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  howIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  howText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
