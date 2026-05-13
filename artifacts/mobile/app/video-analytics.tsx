import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Post = {
  id: string;
  content: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  created_at: string;
  post_type: string;
};

type DayBucket = { date: string; label: string; count: number };

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  iconColor,
  label,
  value,
  sub,
  colors,
}: {
  icon: string;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
  colors: any;
}) {
  return (
    <View style={[sc.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[sc.iconWrap, { backgroundColor: iconColor + "18" }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <Text style={[sc.value, { color: colors.text }]}>{value}</Text>
      <Text style={[sc.label, { color: colors.textMuted }]}>{label}</Text>
      {!!sub && <Text style={[sc.sub, { color: iconColor }]}>{sub}</Text>}
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 4,
    alignItems: "flex-start",
    minWidth: 100,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  value: { fontSize: 22, fontFamily: "Inter_700Bold" },
  label: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sub: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 2 },
});

// ─── Upload Trend Bar Chart ────────────────────────────────────────────────────

function TrendChart({
  buckets,
  colors,
  accent,
}: {
  buckets: DayBucket[];
  colors: any;
  accent: string;
}) {
  const max = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <View style={tc.wrap}>
      <View style={tc.bars}>
        {buckets.map((b) => {
          const pct = b.count / max;
          return (
            <View key={b.date} style={tc.barCol}>
              <View style={tc.barTrack}>
                <View
                  style={[
                    tc.barFill,
                    {
                      height: `${Math.max(pct * 100, b.count > 0 ? 6 : 0)}%`,
                      backgroundColor: b.count > 0 ? accent : colors.border,
                      borderRadius: 4,
                    },
                  ]}
                />
              </View>
              <Text style={[tc.barLabel, { color: colors.textMuted }]} numberOfLines={1}>
                {b.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const tc = StyleSheet.create({
  wrap: { paddingTop: 4 },
  bars: { flexDirection: "row", alignItems: "flex-end", height: 90, gap: 4 },
  barCol: { flex: 1, alignItems: "center", gap: 4, height: "100%" },
  barTrack: { flex: 1, width: "100%", justifyContent: "flex-end" },
  barFill: { width: "100%", minHeight: 0 },
  barLabel: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },
});

// ─── Top Video Row ────────────────────────────────────────────────────────────

function TopVideoRow({
  post,
  rank,
  colors,
  accent,
}: {
  post: Post;
  rank: number;
  colors: any;
  accent: string;
}) {
  const caption = post.content?.replace(/\n/g, " ").slice(0, 60) || "Untitled";
  const isVideo = post.post_type === "video";

  return (
    <TouchableOpacity
      style={[vr.row, { borderBottomColor: colors.border }]}
      activeOpacity={0.75}
      onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.id } } as any)}
    >
      {/* Rank */}
      <View style={[vr.rankWrap, { backgroundColor: rank <= 3 ? accent + "18" : colors.border + "40" }]}>
        <Text style={[vr.rank, { color: rank <= 3 ? accent : colors.textMuted }]}>{rank}</Text>
      </View>

      {/* Thumbnail */}
      <View style={[vr.thumb, { backgroundColor: colors.border }]}>
        {post.thumbnail_url ? (
          <Image source={{ uri: post.thumbnail_url }} style={vr.thumbImg} resizeMode="cover" />
        ) : (
          <Ionicons name={isVideo ? "videocam" : "image"} size={20} color={colors.textMuted} />
        )}
        {isVideo && (
          <View style={vr.videoChip}>
            <Ionicons name="play" size={8} color="#fff" />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={[vr.caption, { color: colors.text }]} numberOfLines={2}>
          {caption}
        </Text>
        <Text style={[vr.date, { color: colors.textMuted }]}>{fmtDate(post.created_at)}</Text>
      </View>

      {/* Stats */}
      <View style={vr.stats}>
        <View style={vr.statRow}>
          <Ionicons name="eye-outline" size={12} color={colors.textMuted} />
          <Text style={[vr.statVal, { color: colors.text }]}>{fmtNum(post.view_count)}</Text>
        </View>
        <View style={vr.statRow}>
          <Ionicons name="heart-outline" size={12} color={colors.textMuted} />
          <Text style={[vr.statVal, { color: colors.textMuted }]}>{fmtNum(post.like_count)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const vr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rankWrap: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rank: { fontSize: 12, fontFamily: "Inter_700Bold" },
  thumb: { width: 52, height: 52, borderRadius: 10, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  videoChip: { position: "absolute", bottom: 4, right: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 4, padding: 2 },
  caption: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  date: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  stats: { gap: 4, alignItems: "flex-end" },
  statRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  statVal: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={[sh.text, { color: colors.textMuted }]}>{title.toUpperCase()}</Text>
  );
}
const sh = StyleSheet.create({
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 8, marginLeft: 2 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function VideoAnalyticsScreen() {
  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [totalViews, setTotalViews] = useState(0);
  const [totalPosts, setTotalPosts] = useState(0);
  const [totalLikes, setTotalLikes] = useState(0);
  const [topPosts, setTopPosts] = useState<Post[]>([]);
  const [trendBuckets, setTrendBuckets] = useState<DayBucket[]>([]);

  const load = useCallback(async () => {
    if (!user) return;

    // ── Fetch all user posts (last 90 days for trend) ──────────────────────
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data: posts } = await supabase
      .from("posts")
      .select("id, content, video_url, thumbnail_url, view_count, like_count, comment_count, share_count, created_at, post_type")
      .eq("author_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!posts) { setLoading(false); setRefreshing(false); return; }

    // ── Aggregate totals ───────────────────────────────────────────────────
    const tViews = posts.reduce((s, p) => s + (p.view_count ?? 0), 0);
    const tLikes = posts.reduce((s, p) => s + (p.like_count ?? 0), 0);
    setTotalViews(tViews);
    setTotalLikes(tLikes);
    setTotalPosts(posts.length);

    // ── Top 10 by views ────────────────────────────────────────────────────
    const sorted = [...posts].sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0));
    setTopPosts(sorted.slice(0, 10));

    // ── Upload trend: last 14 days ─────────────────────────────────────────
    const days: DayBucket[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
      const count = posts.filter((p) => dayKey(p.created_at) === key).length;
      days.push({ date: key, label, count });
    }
    setTrendBuckets(days);

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const avgViews = totalPosts > 0 ? Math.round(totalViews / totalPosts) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
      <Stack.Screen
        options={{
          title: "Analytics",
          headerBackTitle: "Profile",
          headerStyle: { backgroundColor: colors.surface as any },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: "Inter_700Bold", color: colors.text },
          headerShadowVisible: false,
        }}
      />

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={accent} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.content, { paddingTop: 16, paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
        >
          {/* ── Stat Cards ───────────────────────────────────────── */}
          <SectionHeader title="Overview · last 90 days" colors={colors} />
          <View style={s.statGrid}>
            <StatCard
              icon="eye"
              iconColor={accent}
              label="Total Views"
              value={fmtNum(totalViews)}
              colors={colors}
            />
            <StatCard
              icon="cloud-upload"
              iconColor="#34C759"
              label="Posts"
              value={fmtNum(totalPosts)}
              colors={colors}
            />
          </View>
          <View style={s.statGrid}>
            <StatCard
              icon="heart"
              iconColor="#FF375F"
              label="Total Likes"
              value={fmtNum(totalLikes)}
              colors={colors}
            />
            <StatCard
              icon="bar-chart"
              iconColor="#FF9500"
              label="Avg Views"
              value={fmtNum(avgViews)}
              sub="per post"
              colors={colors}
            />
          </View>

          {/* ── Upload Trend ─────────────────────────────────────── */}
          <View style={{ marginTop: 6 }}>
            <SectionHeader title="Upload trend · last 14 days" colors={colors} />
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TrendChart buckets={trendBuckets} colors={colors} accent={accent} />
            </View>
          </View>

          {/* ── Top Performing ───────────────────────────────────── */}
          {topPosts.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <SectionHeader title="Top performing posts" colors={colors} />
              <View style={[s.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {topPosts.map((post, i) => (
                  <TopVideoRow
                    key={post.id}
                    post={post}
                    rank={i + 1}
                    colors={colors}
                    accent={accent}
                  />
                ))}
              </View>
            </View>
          )}

          {totalPosts === 0 && !loading && (
            <View style={s.empty}>
              <Ionicons name="bar-chart-outline" size={48} color={colors.border} />
              <Text style={[s.emptyTitle, { color: colors.textMuted }]}>No posts yet</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>Start posting to see your analytics here.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  content: { gap: 10, paddingHorizontal: 14 },
  statGrid: { flexDirection: "row", gap: 10 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  listCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 30 },
});
