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
  image_url: string | null;
  view_count: number;
  post_likes: { count: number }[];
  comment_count: number;
  share_count: number;
  created_at: string;
  post_type: string;
};

type Story = {
  id: string;
  caption: string | null;
  media_url: string | null;
  media_type: string | null;
  view_count: number;
  like_count: number;
  created_at: string;
};

type ContentItem = {
  id: string;
  label: string;
  thumb: string | null;
  views: number;
  likes: number;
  type: "post" | "video" | "article" | "story";
  created_at: string;
};

type DayBucket = { date: string; label: string; count: number };

type FilterTab = "all" | "post" | "video" | "article" | "story";

function getLikes(post: Post): number {
  return post.post_likes?.[0]?.count ?? 0;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon, iconColor, label, value, sub, colors,
}: {
  icon: string; iconColor: string; label: string; value: string; sub?: string; colors: any;
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
    flex: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    padding: 14, gap: 4, alignItems: "flex-start", minWidth: 100,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  value: { fontSize: 22, fontFamily: "Inter_700Bold" },
  label: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sub: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 2 },
});

// ─── Breakdown Bar ────────────────────────────────────────────────────────────

function BreakdownBar({
  items, total, colors,
}: {
  items: { label: string; count: number; color: string }[];
  total: number;
  colors: any;
}) {
  if (total === 0) return null;
  return (
    <View style={bb.wrap}>
      {/* Stacked bar */}
      <View style={bb.bar}>
        {items.map((it) => {
          const pct = total > 0 ? (it.count / total) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <View
              key={it.label}
              style={{ width: `${pct}%`, backgroundColor: it.color, height: "100%" }}
            />
          );
        })}
      </View>
      {/* Legend */}
      <View style={bb.legend}>
        {items.filter((it) => it.count > 0).map((it) => (
          <View key={it.label} style={bb.legendItem}>
            <View style={[bb.dot, { backgroundColor: it.color }]} />
            <Text style={[bb.legendLabel, { color: colors.textMuted }]}>
              {it.label} · <Text style={{ color: colors.text }}>{fmtNum(it.count)}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const bb = StyleSheet.create({
  wrap: { gap: 10 },
  bar: { height: 10, borderRadius: 6, flexDirection: "row", overflow: "hidden", backgroundColor: "transparent" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
});

// ─── Upload Trend Bar Chart ────────────────────────────────────────────────────

function TrendChart({ buckets, colors, accent }: { buckets: DayBucket[]; colors: any; accent: string }) {
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
                  style={[tc.barFill, {
                    height: `${Math.max(pct * 100, b.count > 0 ? 6 : 0)}%`,
                    backgroundColor: b.count > 0 ? accent : colors.border,
                    borderRadius: 4,
                  }]}
                />
              </View>
              <Text style={[tc.barLabel, { color: colors.textMuted }]} numberOfLines={1}>{b.label}</Text>
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

// ─── Content Row (unified for all types) ─────────────────────────────────────

const TYPE_META: Record<ContentItem["type"], { icon: string; color: string; label: string }> = {
  post:    { icon: "document-text", color: "#34C759", label: "Post" },
  video:   { icon: "videocam",      color: "#FF9500", label: "Video" },
  article: { icon: "newspaper",     color: "#007AFF", label: "Article" },
  story:   { icon: "albums",        color: "#BF5AF2", label: "Story" },
};

function ContentRow({
  item, rank, colors, accent,
}: { item: ContentItem; rank: number; colors: any; accent: string }) {
  const meta = TYPE_META[item.type];
  const caption = item.label.trim().replace(/\n/g, " ").slice(0, 60) || "Untitled";

  const handlePress = () => {
    if (item.type === "story") return; // stories don't have a detail route
    router.push({ pathname: "/post/[id]", params: { id: item.id } } as any);
  };

  return (
    <TouchableOpacity
      style={[cr.row, { borderBottomColor: colors.border }]}
      activeOpacity={item.type === "story" ? 1 : 0.75}
      onPress={handlePress}
    >
      {/* Rank badge */}
      <View style={[cr.rankWrap, { backgroundColor: rank <= 3 ? accent + "18" : colors.border + "40" }]}>
        <Text style={[cr.rank, { color: rank <= 3 ? accent : colors.textMuted }]}>{rank}</Text>
      </View>

      {/* Thumbnail */}
      <View style={[cr.thumb, { backgroundColor: colors.border + "60" }]}>
        {item.thumb ? (
          <Image source={{ uri: item.thumb }} style={cr.thumbImg} resizeMode="cover" />
        ) : (
          <Ionicons name={meta.icon as any} size={20} color={meta.color} />
        )}
        {/* Type chip */}
        <View style={[cr.typeChip, { backgroundColor: meta.color }]}>
          <Ionicons name={meta.icon as any} size={7} color="#fff" />
        </View>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={[cr.caption, { color: colors.text }]} numberOfLines={2}>{caption}</Text>
        <Text style={[cr.date, { color: colors.textMuted }]}>{fmtDate(item.created_at)}</Text>
      </View>

      {/* Stats */}
      <View style={cr.stats}>
        <View style={cr.statRow}>
          <Ionicons name="eye-outline" size={12} color={colors.textMuted} />
          <Text style={[cr.statVal, { color: colors.text }]}>{fmtNum(item.views)}</Text>
        </View>
        <View style={cr.statRow}>
          <Ionicons name="heart-outline" size={12} color={colors.textMuted} />
          <Text style={[cr.statVal, { color: colors.textMuted }]}>{fmtNum(item.likes)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const cr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rankWrap: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rank: { fontSize: 12, fontFamily: "Inter_700Bold" },
  thumb: { width: 52, height: 52, borderRadius: 10, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  typeChip: { position: "absolute", bottom: 3, right: 3, borderRadius: 4, width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  caption: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  date: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  stats: { gap: 4, alignItems: "flex-end" },
  statRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  statVal: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, colors }: { title: string; colors: any }) {
  return <Text style={[sh.text, { color: colors.textMuted }]}>{title.toUpperCase()}</Text>;
}
const sh = StyleSheet.create({
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 8, marginLeft: 2 },
});

// ─── Filter Tabs ──────────────────────────────────────────────────────────────

const FILTER_TABS: { key: FilterTab; label: string; icon: string }[] = [
  { key: "all",     label: "All",      icon: "apps" },
  { key: "post",    label: "Posts",    icon: "document-text" },
  { key: "video",   label: "Videos",   icon: "videocam" },
  { key: "article", label: "Articles", icon: "newspaper" },
  { key: "story",   label: "Stories",  icon: "albums" },
];

function FilterTabs({
  active, onChange, colors, accent,
}: { active: FilterTab; onChange: (t: FilterTab) => void; colors: any; accent: string }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={ft.row}
    >
      {FILTER_TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <TouchableOpacity
            key={t.key}
            style={[ft.chip, { backgroundColor: isActive ? accent : colors.surface, borderColor: isActive ? accent : colors.border }]}
            onPress={() => onChange(t.key)}
            activeOpacity={0.7}
          >
            <Ionicons name={t.icon as any} size={13} color={isActive ? "#fff" : colors.textMuted} />
            <Text style={[ft.label, { color: isActive ? "#fff" : colors.textMuted }]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const ft = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium" },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreatorAnalyticsScreen() {
  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  // Aggregated stats
  const [allItems, setAllItems]     = useState<ContentItem[]>([]);
  const [trendBuckets, setTrendBuckets] = useState<DayBucket[]>([]);

  // Per-type counts
  const [storyCount, setStoryCount]     = useState(0);
  const [postCount, setPostCount]       = useState(0);
  const [videoCount, setVideoCount]     = useState(0);
  const [articleCount, setArticleCount] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // ── Fetch posts + stories in parallel ──────────────────────────────────
    const [postsRes, storiesRes] = await Promise.all([
      supabase
        .from("posts")
        .select("id, content, video_url, image_url, view_count, comment_count, share_count, created_at, post_type, post_likes(count)")
        .eq("author_id", user.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("stories")
        .select("id, caption, media_url, media_type, view_count, created_at")
        .eq("user_id", user.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const posts: Post[] = (postsRes.data ?? []) as Post[];
    const storiesRaw: any[] = storiesRes.data ?? [];

    // ── Fetch story like counts (graceful — table may not exist) ───────────
    let storyLikeCounts: Record<string, number> = {};
    if (storiesRaw.length > 0) {
      const storyIds = storiesRaw.map((s) => s.id);
      const { data: likesData } = await supabase
        .from("story_likes")
        .select("story_id")
        .in("story_id", storyIds);
      if (likesData) {
        for (const row of likesData) {
          storyLikeCounts[row.story_id] = (storyLikeCounts[row.story_id] || 0) + 1;
        }
      }
    }

    const stories: Story[] = storiesRaw.map((s) => ({
      id: s.id,
      caption: s.caption,
      media_url: s.media_url,
      media_type: s.media_type,
      view_count: s.view_count || 0,
      like_count: storyLikeCounts[s.id] || 0,
      created_at: s.created_at,
    }));

    // ── Map to unified ContentItem list ───────────────────────────────────
    const postItems: ContentItem[] = posts.map((p) => {
      let type: ContentItem["type"] = "post";
      if (p.post_type === "video" || !!p.video_url) type = "video";
      else if (p.post_type === "article") type = "article";

      return {
        id: p.id,
        label: p.content || "",
        thumb: p.image_url,
        views: p.view_count ?? 0,
        likes: getLikes(p),
        type,
        created_at: p.created_at,
      };
    });

    const storyItems: ContentItem[] = stories.map((s) => ({
      id: s.id,
      label: s.caption || "Story",
      thumb: s.media_type?.startsWith("image") ? s.media_url : null,
      views: s.view_count,
      likes: s.like_count,
      type: "story",
      created_at: s.created_at,
    }));

    const combined = [...postItems, ...storyItems].sort((a, b) => b.views - a.views);
    setAllItems(combined);

    // ── Per-type counts ───────────────────────────────────────────────────
    setPostCount(postItems.filter((i) => i.type === "post").length);
    setVideoCount(postItems.filter((i) => i.type === "video").length);
    setArticleCount(postItems.filter((i) => i.type === "article").length);
    setStoryCount(storyItems.length);

    // ── Upload trend: last 14 days (all content types) ────────────────────
    const days: DayBucket[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
      const count = combined.filter((it) => dayKey(it.created_at) === key).length;
      days.push({ date: key, label, count });
    }
    setTrendBuckets(days);

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  // ── Filtered list for current tab ─────────────────────────────────────────
  const filtered = activeTab === "all" ? allItems : allItems.filter((i) => i.type === activeTab);
  const topItems = filtered.slice(0, 10);

  // ── Aggregate totals for current tab ─────────────────────────────────────
  const totalViews  = filtered.reduce((s, i) => s + i.views, 0);
  const totalLikes  = filtered.reduce((s, i) => s + i.likes, 0);
  const totalCount  = filtered.length;
  const avgViews    = totalCount > 0 ? Math.round(totalViews / totalCount) : 0;

  const grandTotal  = allItems.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Custom In-Page Header with Back Button ──────────────────────── */}
      <View style={[hdr.wrap, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top }]}>
        <TouchableOpacity style={hdr.backBtn} onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[hdr.title, { color: colors.text }]}>Creator Analytics</Text>
          <Text style={[hdr.sub, { color: colors.textMuted }]}>Last 90 days</Text>
        </View>
        <TouchableOpacity
          style={[hdr.refreshBtn, { backgroundColor: colors.backgroundSecondary }]}
          onPress={onRefresh}
          disabled={refreshing}
        >
          {refreshing
            ? <ActivityIndicator size="small" color={accent} />
            : <Ionicons name="refresh" size={18} color={accent} />}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={accent} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.content, { paddingTop: 14, paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
        >
          {/* ── Content Type Filter Tabs ──────────────────────────── */}
          <FilterTabs active={activeTab} onChange={setActiveTab} colors={colors} accent={accent} />

          {/* ── Overview Stats ────────────────────────────────────── */}
          <View style={{ marginTop: 8 }}>
            <SectionHeader
              title={activeTab === "all" ? "Overview · all content" : `Overview · ${FILTER_TABS.find(t => t.key === activeTab)?.label}`}
              colors={colors}
            />
            <View style={s.statGrid}>
              <StatCard icon="eye" iconColor={accent} label="Total Views" value={fmtNum(totalViews)} colors={colors} />
              <StatCard icon="heart" iconColor="#FF375F" label="Total Likes" value={fmtNum(totalLikes)} colors={colors} />
            </View>
            <View style={[s.statGrid, { marginTop: 10 }]}>
              <StatCard icon="cloud-upload" iconColor="#34C759" label={activeTab === "all" ? "All Content" : "Count"} value={fmtNum(totalCount)} colors={colors} />
              <StatCard icon="bar-chart" iconColor="#FF9500" label="Avg Views" value={fmtNum(avgViews)} sub="per item" colors={colors} />
            </View>
          </View>

          {/* ── Content Breakdown (only on "All" tab) ─────────────── */}
          {activeTab === "all" && grandTotal > 0 && (
            <View style={{ marginTop: 8 }}>
              <SectionHeader title="Content breakdown" colors={colors} />
              <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <BreakdownBar
                  total={grandTotal}
                  items={[
                    { label: "Posts",    count: postCount,    color: TYPE_META.post.color },
                    { label: "Videos",   count: videoCount,   color: TYPE_META.video.color },
                    { label: "Articles", count: articleCount, color: TYPE_META.article.color },
                    { label: "Stories",  count: storyCount,   color: TYPE_META.story.color },
                  ]}
                  colors={colors}
                />
              </View>
            </View>
          )}

          {/* ── Upload Trend ──────────────────────────────────────── */}
          <View style={{ marginTop: 8 }}>
            <SectionHeader title="Upload trend · last 14 days" colors={colors} />
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TrendChart buckets={trendBuckets} colors={colors} accent={accent} />
            </View>
          </View>

          {/* ── Top Performing ───────────────────────────────────── */}
          {topItems.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <SectionHeader
                title={activeTab === "all" ? "Top performing content" : `Top ${FILTER_TABS.find(t => t.key === activeTab)?.label?.toLowerCase()}`}
                colors={colors}
              />
              <View style={[s.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {topItems.map((item, i) => (
                  <ContentRow
                    key={item.id}
                    item={item}
                    rank={i + 1}
                    colors={colors}
                    accent={accent}
                  />
                ))}
              </View>
            </View>
          )}

          {/* ── Empty State ───────────────────────────────────────── */}
          {grandTotal === 0 && (
            <View style={s.empty}>
              <Ionicons name="bar-chart-outline" size={48} color={colors.border} />
              <Text style={[s.emptyTitle, { color: colors.textMuted }]}>No content yet</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                Start posting, sharing stories or uploading videos to see your analytics here.
              </Text>
            </View>
          )}
          {grandTotal > 0 && filtered.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="funnel-outline" size={48} color={colors.border} />
              <Text style={[s.emptyTitle, { color: colors.textMuted }]}>No {activeTab}s yet</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                You haven't created any {activeTab === "story" ? "stories" : `${activeTab}s`} in the last 90 days.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const hdr = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});

const s = StyleSheet.create({
  content: { gap: 10, paddingHorizontal: 14 },
  statGrid: { flexDirection: "row", gap: 10 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  listCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 30 },
});
