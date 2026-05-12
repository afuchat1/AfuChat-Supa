/**
 * AfuChat — Creator Studio v2
 * Tabs: Overview · Analytics · Monetize · Content · Payouts
 *
 * Advanced features:
 *  - Creator level system (Bronze → Silver → Gold → Diamond)
 *  - SVG smooth bezier line chart with area fill
 *  - 7D / 30D / 90D period selector
 *  - Engagement rate & follower growth KPIs
 *  - Revenue goal tracker with animated progress
 *  - Posting streak tracker
 *  - Quick content creation grid
 *  - ACoin → UGX payout flow
 *  - Tips received section
 *  - Top revenue stream ranking
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, {
  Path,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Circle,
} from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";
import { MONETIZE_FEATURES, formatAcoin } from "@/lib/monetize";
import { PremiumGate } from "@/components/ui/PremiumGate";
import { isOnline } from "@/lib/offlineStore";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import * as Haptics from "@/lib/haptics";

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get("window");
const GOLD = "#D4A853";
const ACOIN_TO_UGX = 100;

type StudioTab = "overview" | "analytics" | "monetize" | "content" | "payouts";
type Period    = "7D" | "30D" | "90D";
type CreatorSettings = Record<string, { enabled: boolean; price: number }>;

// Creator levels
const CREATOR_LEVELS = [
  { id: "bronze",   label: "Bronze",   min: 0,     color: "#CD7F32", icon: "🥉" },
  { id: "silver",   label: "Silver",   min: 500,   color: "#C0C0C0", icon: "🥈" },
  { id: "gold",     label: "Gold",     min: 2000,  color: "#D4A853", icon: "🥇" },
  { id: "diamond",  label: "Diamond",  min: 10000, color: "#B9F2FF", icon: "💎" },
];

function getCreatorLevel(totalEarned: number) {
  let level = CREATOR_LEVELS[0];
  for (const l of CREATOR_LEVELS) {
    if (totalEarned >= l.min) level = l;
  }
  const idx    = CREATOR_LEVELS.indexOf(level);
  const next   = CREATOR_LEVELS[idx + 1] ?? null;
  const pct    = next
    ? Math.min((totalEarned - level.min) / (next.min - level.min), 1)
    : 1;
  return { level, next, pct };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUGX(n: number) {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `UGX ${(n / 1_000).toFixed(1)}K`;
  return `UGX ${n}`;
}

function getDays(n: number): { day: string; label: string; shortLabel: string; val: number }[] {
  return Array.from({ length: n }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return {
      day:        d.toISOString().split("T")[0],
      label:      d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      shortLabel: i % Math.max(1, Math.floor(n / 6)) === 0
        ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "",
      val: 0,
    };
  });
}

// ─── SVG Line Chart ───────────────────────────────────────────────────────────

const CHART_H = 140;
const CHART_PAD = 24;

function makePath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  const d: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1x = p0.x + (p1.x - p0.x) * 0.45;
    const cp1y = p0.y;
    const cp2x = p1.x - (p1.x - p0.x) * 0.45;
    const cp2y = p1.y;
    d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`);
  }
  return d.join(" ");
}

function makeAreaPath(pts: { x: number; y: number }[], bottom: number): string {
  if (pts.length < 2) return "";
  const line = makePath(pts);
  return `${line} L ${pts[pts.length - 1].x} ${bottom} L ${pts[0].x} ${bottom} Z`;
}

function LineChart({
  data,
  color,
  accentId,
}: {
  data: { val: number }[];
  color: string;
  accentId: string;
}) {
  const w = SW - 32;
  const h = CHART_H;
  const max = Math.max(...data.map((d) => d.val), 1);
  const pts = data.map((d, i) => ({
    x: CHART_PAD + (i / (data.length - 1)) * (w - CHART_PAD * 2),
    y: CHART_PAD + (1 - d.val / max) * (h - CHART_PAD * 2),
  }));
  const linePath = makePath(pts);
  const areaPath = makeAreaPath(pts, h);
  const lastPt   = pts[pts.length - 1];

  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgGradient id={`area-${accentId}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </SvgGradient>
      </Defs>
      {/* Area fill */}
      <Path d={areaPath} fill={`url(#area-${accentId})`} />
      {/* Line */}
      <Path d={linePath} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Last point dot */}
      <Circle cx={lastPt.x} cy={lastPt.y} r={5} fill={color} />
      <Circle cx={lastPt.x} cy={lastPt.y} r={9} fill={color} opacity={0.2} />
    </Svg>
  );
}

// ─── Category meta ────────────────────────────────────────────────────────────

const CAT_META: Record<string, { label: string; icon: string; color: string }> = {
  messaging:   { label: "Messaging",   icon: "chatbubble-outline",  color: "#00BCD4" },
  profile:     { label: "Profile",     icon: "person-outline",      color: "#FF9500" },
  content:     { label: "Content",     icon: "play-circle-outline", color: "#FF2D55" },
  marketplace: { label: "Marketplace", icon: "storefront-outline",  color: "#FFD60A" },
  community:   { label: "Community",   icon: "people-outline",      color: "#BF5AF2" },
};

const FEATURE_ROUTES: Record<string, string> = {
  paid_communities: "/paid-communities",
  digital_events:   "/digital-events",
  freelance:        "/freelance",
  username_market:  "/username-market",
};

const CONTENT_ACTIONS = [
  { label: "Short Video",  icon: "videocam-outline",         color: "#FF2D55", route: "/moments/create-video" },
  { label: "Post",         icon: "images-outline",           color: "#007AFF", route: "/moments/create" },
  { label: "Story",        icon: "aperture-outline",         color: "#FF9500", route: "/stories/camera" },
  { label: "Article",      icon: "document-text-outline",    color: "#34C759", route: "/moments/create-article" },
  { label: "Duet",         icon: "people-circle-outline",    color: "#AF52DE", route: "/moments/create-duet" },
  { label: "Live",         icon: "radio-outline",            color: "#FF3B30", route: "/moments/create-video" },
  { label: "Paid Comm.",   icon: "lock-closed-outline",      color: "#BF5AF2", route: "/paid-communities" },
  { label: "Event",        icon: "calendar-outline",         color: "#FF6B35", route: "/digital-events" },
];

// ─── Animated progress bar ────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 900, useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={pb.track}>
      <Animated.View style={[pb.fill, { backgroundColor: color, width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  fill:  { height: 6, borderRadius: 3 },
});

// ─── Metric card ─────────────────────────────────────────────────────────────

function MetricCard({
  label, value, delta, deltaLabel, color, icon, onPress, colors,
}: {
  label: string; value: string; delta?: number; deltaLabel?: string;
  color: string; icon: string; onPress?: () => void; colors: any;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <TouchableOpacity
      style={[mc.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
    >
      <View style={[mc.iconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[mc.value, { color: colors.text }]}>{value}</Text>
      <Text style={[mc.label, { color: colors.textMuted }]} numberOfLines={1}>{label}</Text>
      {delta !== undefined && (
        <View style={[mc.delta, { backgroundColor: (positive ? "#34C759" : "#FF3B30") + "18" }]}>
          <Ionicons name={positive ? "trending-up" : "trending-down"} size={10} color={positive ? "#34C759" : "#FF3B30"} />
          <Text style={[mc.deltaText, { color: positive ? "#34C759" : "#FF3B30" }]}>
            {Math.abs(delta)}% {deltaLabel ?? "vs last period"}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
const mc = StyleSheet.create({
  card:      { flex: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 4, minWidth: (SW - 52) / 2 },
  iconWrap:  { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  value:     { fontSize: 20, fontFamily: "Inter_700Bold" },
  label:     { fontSize: 12, fontFamily: "Inter_400Regular" },
  delta:     { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start", marginTop: 2 },
  deltaText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CreatorStudioScreen() {
  const { colors, accent, isDark } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const pillX  = useRef(new Animated.Value(0)).current;

  const TABS: { key: StudioTab; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
    { key: "overview",  label: "Overview",  icon: "home-outline"          },
    { key: "analytics", label: "Analytics", icon: "analytics-outline"     },
    { key: "monetize",  label: "Monetize",  icon: "cash-outline"          },
    { key: "content",   label: "Content",   icon: "add-circle-outline"    },
    { key: "payouts",   label: "Payouts",   icon: "wallet-outline"        },
  ];
  const tabW = (SW - 32) / TABS.length;

  // ── State ─────────────────────────────────────────────────────────────────

  const [tab,             setTab]             = useState<StudioTab>("overview");
  const [period,          setPeriod]          = useState<Period>("30D");
  const [settings,        setSettings]        = useState<CreatorSettings>({});
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingId,        setSavingId]        = useState<string | null>(null);
  const [totalEarned,     setTotalEarned]     = useState(0);
  const [prevEarned,      setPrevEarned]      = useState(0);
  const [earningsByFeature, setEarningsByFeature] = useState<Record<string, number>>({});
  const [chartData,       setChartData]       = useState<{ val: number }[]>([]);
  const [totalViews,      setTotalViews]      = useState(0);
  const [totalLikes,      setTotalLikes]      = useState(0);
  const [prevViews,       setPrevViews]       = useState(0);
  const [followerCount,   setFollowerCount]   = useState<number>(profile?.followers_count ?? 0);
  const [tipsTotal,       setTipsTotal]       = useState(0);
  const [streak,          setStreak]          = useState(0);
  const [payoutHistory,   setPayoutHistory]   = useState<any[]>([]);
  const [loadingPayouts,  setLoadingPayouts]  = useState(false);
  const [editingFeature,  setEditingFeature]  = useState<string | null>(null);
  const [editPrice,       setEditPrice]       = useState("");
  const [editEnabled,     setEditEnabled]     = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);
  const [goalTarget,      setGoalTarget]      = useState(5000);
  const [showGoalEdit,    setShowGoalEdit]    = useState(false);
  const [goalInput,       setGoalInput]       = useState("");

  // ── Derived ───────────────────────────────────────────────────────────────

  const { level, next: nextLevel, pct: levelPct } = useMemo(() => getCreatorLevel(totalEarned), [totalEarned]);
  const acoinBalance  = profile?.acoin ?? 0;
  const activeFeatures = Object.values(settings).filter((s) => s.enabled).length;
  const categories     = Array.from(new Set(MONETIZE_FEATURES.map((f) => f.category)));
  const earnedDelta    = prevEarned > 0 ? Math.round(((totalEarned - prevEarned) / prevEarned) * 100) : 0;
  const viewsDelta     = prevViews  > 0 ? Math.round(((totalViews - prevViews) / prevViews) * 100) : 0;
  const engagementRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(1) : "0.0";
  const periodDays     = period === "7D" ? 7 : period === "30D" ? 30 : 90;

  // Top 3 revenue streams
  const topStreams = useMemo(() => {
    return Object.entries(earningsByFeature)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, amt]) => {
        const f = MONETIZE_FEATURES.find((x) => x.id === id);
        return { id, amt, label: f?.title ?? id, emoji: f?.emoji ?? "💰", color: f?.color ?? accent };
      });
  }, [earningsByFeature]);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const loadSettings = useCallback(async () => {
    if (!user) return;
    setLoadingSettings(true);
    const { data } = await supabase
      .from("creator_monetize_settings")
      .select("feature_id, enabled, price")
      .eq("user_id", user.id);
    const map: CreatorSettings = {};
    for (const f of MONETIZE_FEATURES) map[f.id] = { enabled: false, price: 50 };
    for (const row of (data ?? [])) map[row.feature_id] = { enabled: row.enabled, price: row.price };
    setSettings(map);
    setLoadingSettings(false);
  }, [user]);

  const loadEarnings = useCallback(async () => {
    if (!user) return;
    const days = getDays(periodDays);
    const cutoff = days[0].day;
    const prevCutoff = (() => {
      const d = new Date(cutoff);
      d.setDate(d.getDate() - periodDays);
      return d.toISOString().split("T")[0];
    })();

    const [{ data: txData }, { data: creatorData }, { data: tipsData }] = await Promise.all([
      supabase.from("acoin_transactions").select("transaction_type, amount, created_at").eq("user_id", user.id).gt("amount", 0).gte("created_at", cutoff),
      supabase.from("creator_earnings").select("amount_ugx, views_count, likes_count, earned_date").eq("user_id", user.id).gte("earned_date", cutoff).order("earned_date", { ascending: false }).limit(periodDays + 5),
      supabase.from("acoin_transactions").select("amount").eq("user_id", user.id).eq("transaction_type", "tip").gt("amount", 0).gte("created_at", cutoff),
    ]);

    // Previous period
    const [{ data: prevTxData }, { data: prevCreatorData }] = await Promise.all([
      supabase.from("acoin_transactions").select("transaction_type, amount, created_at").eq("user_id", user.id).gt("amount", 0).gte("created_at", prevCutoff).lt("created_at", cutoff),
      supabase.from("creator_earnings").select("amount_ugx, views_count").eq("user_id", user.id).gte("earned_date", prevCutoff).lt("earned_date", cutoff),
    ]);

    // Current period aggregation
    const byFeature: Record<string, number> = {};
    for (const tx of (txData ?? [])) {
      if (tx.transaction_type?.startsWith("monetize_")) {
        const key = tx.transaction_type.replace("monetize_", "");
        byFeature[key] = (byFeature[key] ?? 0) + tx.amount;
        const de = days.find((d) => d.day === tx.created_at?.split("T")[0]);
        if (de) de.val += tx.amount;
      }
    }
    let total = Object.values(byFeature).reduce((a, b) => a + b, 0);
    let views = 0, likes = 0;
    for (const row of (creatorData ?? [])) {
      const ac = Math.floor((row.amount_ugx ?? 0) / ACOIN_TO_UGX);
      if (ac > 0) {
        byFeature["post_engagement"] = (byFeature["post_engagement"] ?? 0) + ac;
        total += ac;
        const de = days.find((d) => d.day === row.earned_date);
        if (de) de.val += ac;
      }
      views += row.views_count ?? 0;
      likes += row.likes_count ?? 0;
    }

    // Tips
    const tipsSum = (tipsData ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
    if (tipsSum > 0) {
      byFeature["tips"] = (byFeature["tips"] ?? 0) + tipsSum;
      total += tipsSum;
    }

    // Previous period totals
    let prevTotal = (prevTxData ?? []).filter((t) => t.transaction_type?.startsWith("monetize_")).reduce((s, t) => s + t.amount, 0);
    let prevV = 0;
    for (const row of (prevCreatorData ?? [])) { prevTotal += Math.floor((row.amount_ugx ?? 0) / ACOIN_TO_UGX); prevV += row.views_count ?? 0; }

    // Streak: count consecutive days with any earning from today backwards
    let streakCount = 0;
    const todayStr  = new Date().toISOString().split("T")[0];
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].val > 0 || (i === days.length - 1)) streakCount++;
      else break;
    }

    setTotalEarned(total);
    setPrevEarned(prevTotal);
    setEarningsByFeature(byFeature);
    setChartData(days);
    setTotalViews(views);
    setTotalLikes(likes);
    setPrevViews(prevV);
    setTipsTotal(tipsSum);
    setStreak(Math.max(0, streakCount - 1));
  }, [user, periodDays]);

  const loadPayouts = useCallback(async () => {
    if (!user) return;
    setLoadingPayouts(true);
    const { data } = await supabase
      .from("acoin_transactions")
      .select("amount, transaction_type, created_at, metadata")
      .eq("user_id", user.id)
      .eq("transaction_type", "payout_request")
      .order("created_at", { ascending: false })
      .limit(20);
    setPayoutHistory(data ?? []);
    setLoadingPayouts(false);
  }, [user]);

  useEffect(() => {
    loadSettings();
    loadEarnings();
    refreshProfile?.();
  }, [loadSettings, loadEarnings]);

  useEffect(() => {
    if (tab === "payouts") loadPayouts();
  }, [tab]);

  // ── Actions ───────────────────────────────────────────────────────────────

  function switchTab(t: StudioTab) {
    const idx = TABS.findIndex((x) => x.key === t);
    Animated.spring(pillX, { toValue: idx * tabW, useNativeDriver: true, damping: 22, stiffness: 200 }).start();
    setTab(t);
    Haptics.selectionAsync();
  }

  async function saveSetting(featureId: string, enabled: boolean, price: number) {
    if (!isOnline()) { showAlert("No internet", "Saving requires an internet connection."); return; }
    if (!user) return;
    setSavingId(featureId);
    await supabase.from("creator_monetize_settings").upsert(
      { user_id: user.id, feature_id: featureId, enabled, price: Math.max(1, price) },
      { onConflict: "user_id,feature_id" }
    );
    setSettings((prev) => ({ ...prev, [featureId]: { enabled, price } }));
    setSavingId(null);
    setEditingFeature(null);
  }

  function openEdit(featureId: string) {
    const cur = settings[featureId] ?? { enabled: false, price: 50 };
    setEditingFeature(featureId);
    setEditPrice(String(cur.price));
    setEditEnabled(cur.enabled);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadSettings(), loadEarnings(), refreshProfile?.()]);
    if (tab === "payouts") await loadPayouts();
    setRefreshing(false);
  }

  // ── Overview ──────────────────────────────────────────────────────────────

  function renderOverview() {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={cs.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
      >
        {/* ── Creator Level Hero ── */}
        <LinearGradient
          colors={isDark ? ["#1a1208", "#2a1f08", "#1a1208"] : ["#2a1f08", "#3d2e0f", "#2a1f08"]}
          style={cs.levelCard}
        >
          <View style={cs.levelRow}>
            <View style={{ flex: 1 }}>
              <Text style={cs.levelSuperLabel}>CREATOR LEVEL</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
                <Text style={{ fontSize: 36 }}>{level.icon}</Text>
                <View>
                  <Text style={[cs.levelName, { color: level.color }]}>{level.label} Creator</Text>
                  {nextLevel && (
                    <Text style={cs.levelSub}>{nextLevel.min - totalEarned} ACoin to {nextLevel.label}</Text>
                  )}
                </View>
              </View>
              <View style={{ marginTop: 12 }}>
                <ProgressBar pct={levelPct} color={level.color} />
              </View>
            </View>
            <View style={cs.streakWrap}>
              <Text style={{ fontSize: 22 }}>🔥</Text>
              <Text style={[cs.streakNum, { color: level.color }]}>{streak}</Text>
              <Text style={cs.streakLabel}>day streak</Text>
            </View>
          </View>

          <View style={cs.levelStats}>
            <View style={cs.levelStat}>
              <Text style={[cs.levelStatVal, { color: GOLD }]}>{formatAcoin(totalEarned)} 🪙</Text>
              <Text style={cs.levelStatLabel}>Total Earned</Text>
            </View>
            <View style={cs.levelStatDiv} />
            <View style={cs.levelStat}>
              <Text style={[cs.levelStatVal, { color: "#fff" }]}>{activeFeatures}/{MONETIZE_FEATURES.length}</Text>
              <Text style={cs.levelStatLabel}>Active Features</Text>
            </View>
            <View style={cs.levelStatDiv} />
            <View style={cs.levelStat}>
              <Text style={[cs.levelStatVal, { color: "#fff" }]}>{formatAcoin(acoinBalance)} 🪙</Text>
              <Text style={cs.levelStatLabel}>Balance</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Earning Goal ── */}
        <TouchableOpacity
          style={[cs.goalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => { setGoalInput(String(goalTarget)); setShowGoalEdit(true); }}
          activeOpacity={0.85}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={[cs.goalTitle, { color: colors.text }]}>🎯  Earning Goal</Text>
            <Text style={[cs.goalPct, { color: accent }]}>{Math.min(Math.round((totalEarned / goalTarget) * 100), 100)}%</Text>
          </View>
          <View style={[pb.track, { backgroundColor: colors.backgroundTertiary }]}>
            <View style={[pb.fill, { backgroundColor: accent, width: `${Math.min((totalEarned / goalTarget) * 100, 100)}%` as any }]} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 7 }}>
            <Text style={[cs.goalSub, { color: colors.textMuted }]}>{formatAcoin(totalEarned)} earned</Text>
            <Text style={[cs.goalSub, { color: colors.textMuted }]}>Goal: {formatAcoin(goalTarget)} ACoin</Text>
          </View>
        </TouchableOpacity>

        {/* ── KPI grid ── */}
        <Text style={[cs.sectionTitle, { color: colors.text }]}>This Period ({period})</Text>
        <View style={cs.kpiGrid}>
          <MetricCard label="ACoin Earned" value={`${formatAcoin(totalEarned)} 🪙`} delta={earnedDelta} color={GOLD} icon="cash-outline" colors={colors} onPress={() => switchTab("analytics")} />
          <MetricCard label="Post Views"   value={totalViews > 0 ? formatAcoin(totalViews) : "—"} delta={viewsDelta} color="#007AFF" icon="eye-outline" colors={colors} onPress={() => switchTab("analytics")} />
        </View>
        <View style={[cs.kpiGrid, { marginTop: 8 }]}>
          <MetricCard label="Tips Received"    value={tipsTotal > 0 ? `${formatAcoin(tipsTotal)} 🪙` : "—"} color="#FF9500" icon="heart-outline" colors={colors} />
          <MetricCard label="Engagement Rate"  value={`${engagementRate}%`} color="#34C759" icon="trending-up-outline" colors={colors} onPress={() => switchTab("analytics")} />
        </View>

        {/* ── Top Revenue Streams ── */}
        {topStreams.length > 0 && (
          <>
            <Text style={[cs.sectionTitle, { color: colors.text }]}>Top Revenue Streams</Text>
            <View style={[cs.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {topStreams.map((s, i) => (
                <View key={s.id}>
                  {i > 0 && <View style={[cs.sep, { backgroundColor: colors.border }]} />}
                  <View style={cs.streamRow}>
                    <View style={[cs.streamRank, { backgroundColor: [GOLD, "#C0C0C0", "#CD7F32"][i] + "22" }]}>
                      <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: [GOLD, "#C0C0C0", "#CD7F32"][i] }}>#{i + 1}</Text>
                    </View>
                    <Text style={{ fontSize: 22, marginHorizontal: 4 }}>{s.emoji}</Text>
                    <Text style={[cs.streamLabel, { color: colors.text }]} numberOfLines={1}>{s.label}</Text>
                    <Text style={[cs.streamAmt, { color: GOLD }]}>+{formatAcoin(s.amt)} 🪙</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Quick Actions ── */}
        <Text style={[cs.sectionTitle, { color: colors.text }]}>Quick Launch</Text>
        <View style={[cs.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { label: "Paid Communities", emoji: "🏰", route: "/paid-communities" },
            { label: "Digital Events",   emoji: "🎫", route: "/digital-events" },
            { label: "Freelance Market", emoji: "💼", route: "/freelance" },
            { label: "Username Market",  emoji: "🏷️", route: "/username-market" },
          ].map((item, i, arr) => (
            <View key={item.route}>
              {i > 0 && <View style={[cs.sep, { backgroundColor: colors.border }]} />}
              <TouchableOpacity style={cs.quickRow} onPress={() => router.push(item.route as any)} activeOpacity={0.75}>
                <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
                <Text style={[cs.quickLabel, { color: colors.text }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  function renderAnalytics() {
    const hasData = chartData.some((d) => d.val > 0);
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={cs.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        {/* Period selector */}
        <View style={[cs.periodBar, { backgroundColor: colors.backgroundSecondary }]}>
          {(["7D", "30D", "90D"] as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[cs.periodBtn, period === p && { backgroundColor: accent }]}
              onPress={() => { setPeriod(p); Haptics.selectionAsync(); }}
              activeOpacity={0.8}
            >
              <Text style={[cs.periodLabel, { color: period === p ? "#fff" : colors.textMuted }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Line chart */}
        <View style={[cs.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <View>
              <Text style={[cs.chartTitle, { color: colors.textMuted }]}>ACoin Earned</Text>
              <Text style={[cs.chartValue, { color: GOLD }]}>{formatAcoin(totalEarned)} 🪙</Text>
            </View>
            {earnedDelta !== 0 && (
              <View style={[cs.deltaPill, { backgroundColor: (earnedDelta >= 0 ? "#34C759" : "#FF3B30") + "18" }]}>
                <Ionicons name={earnedDelta >= 0 ? "trending-up" : "trending-down"} size={12} color={earnedDelta >= 0 ? "#34C759" : "#FF3B30"} />
                <Text style={[cs.deltaPillText, { color: earnedDelta >= 0 ? "#34C759" : "#FF3B30" }]}>{earnedDelta >= 0 ? "+" : ""}{earnedDelta}%</Text>
              </View>
            )}
          </View>
          {hasData ? (
            <>
              <LineChart data={chartData} color={GOLD} accentId="earnings" />
              {/* X-axis labels */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, marginTop: 4 }}>
                {chartData.filter((_, i) => i === 0 || i === Math.floor(chartData.length / 2) || i === chartData.length - 1).map((d, i) => (
                  <Text key={i} style={[cs.xLabel, { color: colors.textMuted }]}>{d.shortLabel || d.label.slice(0, 6)}</Text>
                ))}
              </View>
            </>
          ) : (
            <View style={cs.chartEmpty}>
              <Text style={{ fontSize: 36 }}>📊</Text>
              <Text style={[cs.chartEmptyText, { color: colors.textMuted }]}>No earnings in this period</Text>
            </View>
          )}
        </View>

        {/* Engagement stats */}
        <Text style={[cs.sectionTitle, { color: colors.text }]}>Engagement</Text>
        <View style={cs.kpiGrid}>
          <MetricCard label="Total Views"   value={totalViews > 0 ? formatAcoin(totalViews) : "—"} delta={viewsDelta} color="#007AFF" icon="eye-outline" colors={colors} />
          <MetricCard label="Total Likes"   value={totalLikes > 0 ? formatAcoin(totalLikes) : "—"} color="#FF2D55" icon="heart-outline" colors={colors} />
        </View>
        <View style={[cs.kpiGrid, { marginTop: 8 }]}>
          <MetricCard label="Engagement Rate"  value={`${engagementRate}%`} color="#34C759" icon="stats-chart-outline" colors={colors} />
          <MetricCard label="Followers"         value={followerCount > 0 ? formatAcoin(followerCount) : "—"} color="#BF5AF2" icon="people-outline" colors={colors} />
        </View>

        {/* Revenue breakdown by feature */}
        {Object.keys(earningsByFeature).length > 0 && (
          <>
            <Text style={[cs.sectionTitle, { color: colors.text }]}>Revenue by Source</Text>
            <View style={[cs.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {Object.entries(earningsByFeature)
                .sort((a, b) => b[1] - a[1])
                .map(([id, amt], i, arr) => {
                  const f = MONETIZE_FEATURES.find((x) => x.id === id);
                  const barPct = totalEarned > 0 ? amt / totalEarned : 0;
                  return (
                    <View key={id}>
                      {i > 0 && <View style={[cs.sep, { backgroundColor: colors.border }]} />}
                      <View style={{ padding: 14, gap: 7 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={{ fontSize: 20, marginRight: 8 }}>{f?.emoji ?? "💰"}</Text>
                          <Text style={[cs.streamLabel, { color: colors.text, flex: 1 }]} numberOfLines={1}>{f?.title ?? id}</Text>
                          <Text style={[cs.streamAmt, { color: GOLD }]}>{formatAcoin(amt)} 🪙</Text>
                        </View>
                        <View style={[cs.barTrack, { backgroundColor: colors.backgroundTertiary }]}>
                          <View style={[cs.barFill, { width: `${barPct * 100}%` as any, backgroundColor: f?.color ?? accent }]} />
                        </View>
                      </View>
                    </View>
                  );
                })}
            </View>
          </>
        )}

        {/* Best posting days */}
        <Text style={[cs.sectionTitle, { color: colors.text }]}>Posting Streak</Text>
        <View style={[cs.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 40 }}>🔥</Text>
            <View>
              <Text style={[cs.streakBig, { color: colors.text }]}>{streak} day{streak !== 1 ? "s" : ""}</Text>
              <Text style={[cs.streakSmall, { color: colors.textMuted }]}>Current earning streak</Text>
            </View>
          </View>
          <View style={[cs.sep, { backgroundColor: colors.border, marginVertical: 14 }]} />
          <Text style={[{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 }]}>
            Keep your streak alive by earning ACoin every day. Longer streaks unlock bonus multipliers for Silver and above members.
          </Text>
        </View>
      </ScrollView>
    );
  }

  // ── Monetize ──────────────────────────────────────────────────────────────

  function renderMonetize() {
    if (loadingSettings) {
      return (
        <View style={{ padding: 16, gap: 10, marginTop: 4 }}>
          {[1,2,3,4,5].map((i) => <ListRowSkeleton key={i} />)}
        </View>
      );
    }
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={cs.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        {/* Info banner */}
        <View style={[cs.infoBanner, { backgroundColor: accent + "14" }]}>
          <Ionicons name="information-circle-outline" size={16} color={accent} />
          <Text style={[cs.infoBannerText, { color: accent }]}>
            {activeFeatures} of {MONETIZE_FEATURES.length} features active · Earnings paid out in ACoin
          </Text>
        </View>

        {categories.map((cat) => {
          const meta    = CAT_META[cat];
          const catFeat = MONETIZE_FEATURES.filter((f) => f.category === cat);
          return (
            <View key={cat} style={{ gap: 6 }}>
              <View style={cs.catHeader}>
                <View style={[cs.catIcon, { backgroundColor: meta.color + "20" }]}>
                  <Ionicons name={meta.icon as any} size={13} color={meta.color} />
                </View>
                <Text style={[cs.catLabel, { color: colors.textMuted }]}>{meta.label.toUpperCase()}</Text>
              </View>
              <View style={[cs.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {catFeat.map((feature, fi) => {
                  const s        = settings[feature.id] ?? { enabled: false, price: 50 };
                  const isMarket = !!FEATURE_ROUTES[feature.id];
                  const earnings = earningsByFeature[feature.id] ?? 0;
                  return (
                    <View key={feature.id}>
                      {fi > 0 && <View style={[cs.sep, { backgroundColor: colors.border, marginLeft: 70 }]} />}
                      <TouchableOpacity
                        style={cs.featRow}
                        onPress={() => isMarket ? router.push(FEATURE_ROUTES[feature.id] as any) : openEdit(feature.id)}
                        activeOpacity={0.8}
                      >
                        <View style={[cs.featEmoji, { backgroundColor: feature.color + "18" }]}>
                          <Text style={{ fontSize: 20 }}>{feature.emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 2 }}>
                            <Text style={[cs.featName, { color: colors.text }]}>{feature.title}</Text>
                            {earnings > 0 && (
                              <View style={[cs.earnMini, { backgroundColor: GOLD + "20" }]}>
                                <Text style={[cs.earnMiniTxt, { color: GOLD }]}>+{formatAcoin(earnings)}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[cs.featDesc, { color: colors.textMuted }]}>{feature.description}</Text>
                          {s.enabled && !isMarket && (
                            <Text style={[cs.featPrice, { color: feature.color }]}>{s.price} ACoin / interaction</Text>
                          )}
                        </View>
                        {savingId === feature.id ? (
                          <ActivityIndicator size="small" color={accent} />
                        ) : isMarket ? (
                          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                        ) : (
                          <Switch
                            value={s.enabled}
                            onValueChange={(val) => val ? openEdit(feature.id) : saveSetting(feature.id, false, s.price)}
                            trackColor={{ false: colors.backgroundTertiary, true: feature.color }}
                            thumbColor="#fff"
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  }

  // ── Content ───────────────────────────────────────────────────────────────

  function renderContent() {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={cs.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        <Text style={[cs.sectionTitle, { color: colors.text, marginTop: 0 }]}>Create Content</Text>
        <View style={cs.contentGrid}>
          {CONTENT_ACTIONS.map((item) => (
            <TouchableOpacity
              key={item.route + item.label}
              style={[cs.contentCell, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.8}
            >
              <View style={[cs.contentIcon, { backgroundColor: item.color + "18" }]}>
                <Ionicons name={item.icon as any} size={22} color={item.color} />
              </View>
              <Text style={[cs.contentLabel, { color: colors.text }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[cs.sectionTitle, { color: colors.text }]}>Content Channels</Text>
        <View style={[cs.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { label: "My Posts",     emoji: "📱", route: "/my-posts" },
            { label: "Moments",      emoji: "🎬", route: "/moments" },
            { label: "Stories",      emoji: "✨", route: "/stories/create" },
            { label: "Saved Posts",  emoji: "🔖", route: "/saved-posts" },
          ].map((item, i, arr) => (
            <View key={item.route}>
              {i > 0 && <View style={[cs.sep, { backgroundColor: colors.border }]} />}
              <TouchableOpacity style={cs.quickRow} onPress={() => router.push(item.route as any)} activeOpacity={0.75}>
                <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
                <Text style={[cs.quickLabel, { color: colors.text }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <Text style={[cs.sectionTitle, { color: colors.text }]}>Creator Tools</Text>
        <View style={[cs.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {[
            { label: "Prestige & Badges", emoji: "🏆", route: "/prestige" },
            { label: "Digital ID",        emoji: "🪪", route: "/digital-id" },
            { label: "Collections",       emoji: "🗂️",  route: "/collections" },
            { label: "Referral Program",  emoji: "🎁", route: "/referral" },
          ].map((item, i) => (
            <View key={item.route}>
              {i > 0 && <View style={[cs.sep, { backgroundColor: colors.border }]} />}
              <TouchableOpacity style={cs.quickRow} onPress={() => router.push(item.route as any)} activeOpacity={0.75}>
                <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
                <Text style={[cs.quickLabel, { color: colors.text }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  // ── Payouts ───────────────────────────────────────────────────────────────

  function renderPayouts() {
    const ugxValue = acoinBalance * ACOIN_TO_UGX;
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={cs.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
      >
        {/* Balance hero */}
        <LinearGradient colors={["#0a2a1a", "#0d3b23", "#0a2a1a"]} style={cs.payoutHero}>
          <Text style={cs.payHeroLabel}>ACoin Balance</Text>
          <Text style={[cs.payHeroValue, { color: "#4CD964" }]}>{formatAcoin(acoinBalance)} 🪙</Text>
          <Text style={[cs.payHeroSub, { color: "rgba(255,255,255,0.5)" }]}>≈ {fmtUGX(ugxValue)}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <TouchableOpacity
              style={[cs.payBtn, { backgroundColor: "#4CD964" }]}
              onPress={() => router.push("/wallet" as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-up-circle-outline" size={16} color="#fff" />
              <Text style={cs.payBtnText}>Withdraw</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cs.payBtn, { backgroundColor: "rgba(255,255,255,0.12)" }]}
              onPress={() => router.push("/wallet" as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="wallet-outline" size={16} color="#fff" />
              <Text style={cs.payBtnText}>Wallet</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Conversion rates */}
        <View style={[cs.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 16 }]}>
          <Text style={[cs.sectionTitle, { color: colors.text, marginTop: 0, marginBottom: 12 }]}>Conversion Rates</Text>
          {[
            { acoin: 100,    ugx: 10_000  },
            { acoin: 500,    ugx: 50_000  },
            { acoin: 1_000,  ugx: 100_000 },
            { acoin: 10_000, ugx: 1_000_000 },
          ].map((r) => (
            <View key={r.acoin} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <View style={[cs.rateLeft, { backgroundColor: GOLD + "14" }]}>
                <Text style={[cs.rateText, { color: GOLD }]}>{formatAcoin(r.acoin)} 🪙</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
              <View style={[cs.rateRight, { backgroundColor: "#4CD96414" }]}>
                <Text style={[cs.rateText, { color: "#4CD964" }]}>{fmtUGX(r.ugx)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Earnings summary */}
        <Text style={[cs.sectionTitle, { color: colors.text }]}>Earnings Summary</Text>
        <View style={cs.kpiGrid}>
          <MetricCard label="Tips Received" value={tipsTotal > 0 ? `${formatAcoin(tipsTotal)} 🪙` : "—"} color="#FF9500" icon="heart-outline" colors={colors} />
          <MetricCard label="From Features" value={Object.values(earningsByFeature).reduce((a, b) => a + b, 0) > 0 ? `${formatAcoin(Object.values(earningsByFeature).reduce((a, b) => a + b, 0))} 🪙` : "—"} color={accent} icon="toggle-outline" colors={colors} />
        </View>

        {/* Payout history */}
        <Text style={[cs.sectionTitle, { color: colors.text }]}>Payout History</Text>
        {loadingPayouts ? (
          <View style={{ padding: 16, gap: 10 }}>{[1,2,3].map((i) => <ListRowSkeleton key={i} />)}</View>
        ) : payoutHistory.length === 0 ? (
          <View style={[cs.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ fontSize: 36 }}>💸</Text>
            <Text style={[cs.emptyTitle, { color: colors.text }]}>No payouts yet</Text>
            <Text style={[cs.emptySub, { color: colors.textMuted }]}>Withdraw your ACoin balance via the Wallet to initiate a payout.</Text>
            <TouchableOpacity style={[cs.emptyBtn, { backgroundColor: accent }]} onPress={() => router.push("/wallet" as any)}>
              <Text style={cs.emptyBtnText}>Open Wallet</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[cs.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {payoutHistory.map((item, i) => (
              <View key={i}>
                {i > 0 && <View style={[cs.sep, { backgroundColor: colors.border }]} />}
                <View style={cs.payHistRow}>
                  <View style={[cs.payHistIcon, { backgroundColor: "#4CD96418" }]}>
                    <Ionicons name="arrow-up-circle-outline" size={20} color="#4CD964" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.text }]}>Withdrawal Request</Text>
                    <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 2 }]}>
                      {new Date(item.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                  <Text style={[{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#4CD964" }]}>{formatAcoin(Math.abs(item.amount))} 🪙</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  // ── Edit feature modal ────────────────────────────────────────────────────

  const editFeatureDef = editingFeature ? MONETIZE_FEATURES.find((f) => f.id === editingFeature) : null;

  // ── Root ──────────────────────────────────────────────────────────────────

  return (
    <PremiumGate tier="silver" title="Creator Studio" description="Creator Studio tools are available for Silver members and above.">
      <View style={[cs.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>

        {/* Header */}
        <View style={[cs.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={cs.headerBack}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[cs.headerTitle, { color: colors.text }]}>Creator Studio</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text style={{ fontSize: 14 }}>{level.icon}</Text>
              <Text style={[cs.headerSub, { color: level.color }]}>{level.label} Creator</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => router.push("/wallet" as any)} hitSlop={10} style={cs.walletPill}>
            <Text style={[cs.walletText, { color: GOLD }]}>{formatAcoin(acoinBalance)} 🪙</Text>
          </TouchableOpacity>
        </View>

        {/* Animated tab bar */}
        <View style={[cs.tabBarWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={[cs.tabBar, { backgroundColor: colors.backgroundSecondary }]}>
            <Animated.View style={[cs.tabPill, { width: tabW - 6, backgroundColor: accent, transform: [{ translateX: Animated.add(pillX, new Animated.Value(3)) }] }]} />
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <TouchableOpacity key={t.key} style={[cs.tab, { width: tabW }]} onPress={() => switchTab(t.key)} activeOpacity={0.75}>
                  <Ionicons name={t.icon} size={13} color={active ? "#fff" : colors.textMuted} />
                  <Text style={[cs.tabLabel, { color: active ? "#fff" : colors.textMuted }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Content */}
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>
          {tab === "overview"  && renderOverview()}
          {tab === "analytics" && renderAnalytics()}
          {tab === "monetize"  && renderMonetize()}
          {tab === "content"   && renderContent()}
          {tab === "payouts"   && renderPayouts()}
        </View>

        {/* Feature edit bottom sheet */}
        <Modal visible={!!editingFeature} transparent animationType="slide" onRequestClose={() => setEditingFeature(null)}>
          <View style={cs.modalOverlay}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEditingFeature(null)} />
            <View style={[cs.modalSheet, { backgroundColor: colors.surface }]}>
              <View style={[cs.dragHandle, { backgroundColor: colors.border }]} />
              {editFeatureDef && (
                <>
                  <View style={cs.modalHead}>
                    <View style={[cs.modalEmoji, { backgroundColor: editFeatureDef.color + "20" }]}>
                      <Text style={{ fontSize: 28 }}>{editFeatureDef.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[cs.modalTitle, { color: colors.text }]}>{editFeatureDef.title}</Text>
                      <Text style={[cs.modalDesc, { color: colors.textMuted }]}>{editFeatureDef.description}</Text>
                    </View>
                  </View>

                  <Text style={[cs.inputLabel, { color: colors.textMuted }]}>Price per interaction</Text>
                  <View style={[cs.priceStepper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                    <TouchableOpacity style={[cs.stepBtn, { backgroundColor: editFeatureDef.color + "18" }]} onPress={() => setEditPrice((p) => String(Math.max(1, parseInt(p || "0") - 10)))} hitSlop={10}>
                      <Ionicons name="remove" size={20} color={editFeatureDef.color} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, alignItems: "center" }}>
                      <TextInput style={[cs.priceInput, { color: colors.text }]} value={editPrice} onChangeText={setEditPrice} keyboardType="number-pad" textAlign="center" />
                      <Text style={[cs.priceUnit, { color: colors.textMuted }]}>ACoin per interaction</Text>
                    </View>
                    <TouchableOpacity style={[cs.stepBtn, { backgroundColor: editFeatureDef.color + "18" }]} onPress={() => setEditPrice((p) => String(parseInt(p || "0") + 10))} hitSlop={10}>
                      <Ionicons name="add" size={20} color={editFeatureDef.color} />
                    </TouchableOpacity>
                  </View>

                  <View style={[cs.enableRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[cs.enableLabel, { color: colors.text }]}>Activate feature</Text>
                      <Text style={[cs.enableSub, { color: colors.textMuted }]}>Start charging your audience now</Text>
                    </View>
                    <Switch value={editEnabled} onValueChange={setEditEnabled} trackColor={{ false: colors.backgroundTertiary, true: editFeatureDef.color }} thumbColor="#fff" />
                  </View>

                  <View style={cs.modalBtns}>
                    <TouchableOpacity style={[cs.cancelBtn, { borderColor: colors.border }]} onPress={() => setEditingFeature(null)}>
                      <Text style={[cs.cancelText, { color: colors.text }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[cs.saveBtn, { backgroundColor: editFeatureDef.color }]} onPress={() => saveSetting(editingFeature!, editEnabled, parseInt(editPrice) || 50)}>
                      {savingId === editingFeature
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={cs.saveBtnText}>Save Changes</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* Goal edit modal */}
        <Modal visible={showGoalEdit} transparent animationType="slide" onRequestClose={() => setShowGoalEdit(false)}>
          <View style={cs.modalOverlay}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowGoalEdit(false)} />
            <View style={[cs.modalSheet, { backgroundColor: colors.surface }]}>
              <View style={[cs.dragHandle, { backgroundColor: colors.border }]} />
              <Text style={[cs.modalTitle, { color: colors.text }]}>🎯  Set Earning Goal</Text>
              <Text style={[cs.modalDesc, { color: colors.textMuted }]}>How many ACoin do you want to earn?</Text>
              <View style={[cs.priceStepper, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <TouchableOpacity style={[cs.stepBtn, { backgroundColor: accent + "18" }]} onPress={() => setGoalInput((p) => String(Math.max(100, parseInt(p || "0") - 500)))} hitSlop={10}>
                  <Ionicons name="remove" size={20} color={accent} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <TextInput style={[cs.priceInput, { color: colors.text }]} value={goalInput} onChangeText={setGoalInput} keyboardType="number-pad" textAlign="center" />
                  <Text style={[cs.priceUnit, { color: colors.textMuted }]}>ACoin target</Text>
                </View>
                <TouchableOpacity style={[cs.stepBtn, { backgroundColor: accent + "18" }]} onPress={() => setGoalInput((p) => String(parseInt(p || "0") + 500))} hitSlop={10}>
                  <Ionicons name="add" size={20} color={accent} />
                </TouchableOpacity>
              </View>
              <View style={cs.modalBtns}>
                <TouchableOpacity style={[cs.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowGoalEdit(false)}>
                  <Text style={[cs.cancelText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[cs.saveBtn, { backgroundColor: accent }]} onPress={() => { setGoalTarget(Math.max(100, parseInt(goalInput) || 5000)); setShowGoalEdit(false); }}>
                  <Text style={cs.saveBtnText}>Set Goal</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </View>
    </PremiumGate>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerBack:  { padding: 6 },
  headerTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  headerSub:   { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  walletPill:  { marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: GOLD + "18" },
  walletText:  { fontSize: 13, fontFamily: "Inter_700Bold" },

  tabBarWrap: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  tabBar:     { flexDirection: "row", borderRadius: 14, padding: 3, position: "relative", overflow: "hidden" },
  tabPill:    { position: "absolute", top: 3, bottom: 3, borderRadius: 11, zIndex: 0 },
  tab:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 7, zIndex: 1 },
  tabLabel:   { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  scroll: { gap: 12, paddingBottom: 80 },

  // Shared card
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  sep:    { height: StyleSheet.hairlineWidth },

  // ── Overview ──────────────────────────────────────────────────────────────

  levelCard:    { borderRadius: 20, padding: 20, gap: 14 },
  levelRow:     { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  levelSuperLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.4)", letterSpacing: 1 },
  levelName:    { fontSize: 20, fontFamily: "Inter_700Bold" },
  levelSub:     { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", marginTop: 2 },
  streakWrap:   { alignItems: "center", gap: 2 },
  streakNum:    { fontSize: 22, fontFamily: "Inter_700Bold" },
  streakLabel:  { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)" },
  levelStats:   { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: 14 },
  levelStat:    { flex: 1, alignItems: "center" },
  levelStatDiv: { width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.12)", marginVertical: 2 },
  levelStatVal: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 2 },
  levelStatLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)" },

  goalCard:  { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  goalTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  goalPct:   { fontSize: 15, fontFamily: "Inter_700Bold" },
  goalSub:   { fontSize: 11, fontFamily: "Inter_400Regular" },

  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 4 },
  kpiGrid:      { flexDirection: "row", gap: 8 },

  streamRow:   { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  streamRank:  { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  streamLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  streamAmt:   { fontSize: 13, fontFamily: "Inter_700Bold" },

  quickRow:   { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  quickLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },

  // ── Analytics ─────────────────────────────────────────────────────────────

  periodBar: { flexDirection: "row", borderRadius: 12, padding: 3, alignSelf: "flex-start", gap: 2 },
  periodBtn: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 10 },
  periodLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  chartCard:    { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, overflow: "hidden" },
  chartTitle:   { fontSize: 12, fontFamily: "Inter_500Medium" },
  chartValue:   { fontSize: 26, fontFamily: "Inter_700Bold", marginTop: 2 },
  deltaPill:    { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  deltaPillText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  xLabel:       { fontSize: 9, fontFamily: "Inter_400Regular" },
  chartEmpty:   { height: CHART_H, alignItems: "center", justifyContent: "center", gap: 8 },
  chartEmptyText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  barTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  barFill:  { height: 4, borderRadius: 2 },

  streakBig:   { fontSize: 28, fontFamily: "Inter_700Bold" },
  streakSmall: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },

  // ── Monetize ──────────────────────────────────────────────────────────────

  infoBanner:     { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 14 },
  infoBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  catHeader:      { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  catIcon:        { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  catLabel:       { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  featRow:        { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  featEmoji:      { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  featName:       { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  featDesc:       { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  featPrice:      { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 3 },
  earnMini:       { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  earnMiniTxt:    { fontSize: 10, fontFamily: "Inter_700Bold" },

  // ── Content ───────────────────────────────────────────────────────────────

  contentGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  contentCell: {
    width: (SW - 32 - 30) / 4,
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  contentIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  contentLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", textAlign: "center" },

  // ── Payouts ───────────────────────────────────────────────────────────────

  payoutHero:  { borderRadius: 20, padding: 22, alignItems: "center", gap: 4 },
  payHeroLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)" },
  payHeroValue: { fontSize: 38, fontFamily: "Inter_700Bold" },
  payHeroSub:   { fontSize: 14, fontFamily: "Inter_400Regular" },
  payBtn:       { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  payBtnText:   { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  rateLeft:  { flex: 1, padding: 8, borderRadius: 10, alignItems: "center" },
  rateRight: { flex: 1, padding: 8, borderRadius: 10, alignItems: "center" },
  rateText:  { fontSize: 14, fontFamily: "Inter_700Bold" },

  payHistRow:  { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  payHistIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  emptyCard:    { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 32, alignItems: "center", gap: 10 },
  emptyTitle:   { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub:     { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyBtn:     { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 4 },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },

  // ── Modals ────────────────────────────────────────────────────────────────

  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 20,
  },
  dragHandle:  { width: 38, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  modalHead:   { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  modalEmoji:  { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  modalTitle:  { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 3 },
  modalDesc:   { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  inputLabel:  { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4 },

  priceStepper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
    gap: 8,
  },
  stepBtn:    { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  priceInput: { fontSize: 30, fontFamily: "Inter_700Bold", padding: 0 },
  priceUnit:  { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },

  enableRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  enableLabel: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 2 },
  enableSub:   { fontSize: 12, fontFamily: "Inter_400Regular" },

  modalBtns:  { flexDirection: "row", gap: 12 },
  cancelBtn:  { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  saveBtn:    { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
