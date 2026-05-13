import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";
import {
  getOfflineVideos,
  getRecentlyWatchedVideos,
  getOfflineCacheStats,
  clearAllOfflineVideos,
  removeOfflineVideo,
  clearExpiredOfflineVideos,
  type OfflineVideoEntry,
} from "@/lib/videoCache";

const MS_24H = 24 * 60 * 60 * 1000;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelativeTime(ms?: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type SectionData = {
  title: string;
  subtitle: string;
  accent: boolean;
  data: OfflineVideoEntry[];
};

export default function OfflineVideosScreen() {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();

  const [sections, setSections] = useState<SectionData[]>([]);
  const [stats, setStats] = useState<{ count: number; bytes: number }>({ count: 0, bytes: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await clearExpiredOfflineVideos();
      const [recent, all, st] = await Promise.all([
        getRecentlyWatchedVideos(24),
        getOfflineVideos(),
        getOfflineCacheStats(),
      ]);
      setStats(st);

      const recentIds = new Set(recent.map((v) => v.postId));
      const older = all.filter((v) => !recentIds.has(v.postId));

      const built: SectionData[] = [];
      if (recent.length > 0) {
        built.push({
          title: "Watched Today",
          subtitle: "Ready to play offline",
          accent: true,
          data: recent,
        });
      }
      if (older.length > 0) {
        built.push({
          title: "All Saved Videos",
          subtitle: "Older than 24 hours",
          accent: false,
          data: older,
        });
      }
      setSections(built);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleClearAll() {
    Alert.alert(
      "Clear Offline Videos",
      "All saved videos will be removed from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            await clearAllOfflineVideos();
            setSections([]);
            setStats({ count: 0, bytes: 0 });
          },
        },
      ],
    );
  }

  async function handleRemove(postId: string) {
    await removeOfflineVideo(postId);
    const updated = sections.map((s) => ({
      ...s,
      data: s.data.filter((v) => v.postId !== postId),
    })).filter((s) => s.data.length > 0);
    setSections(updated);
    const allRemaining = updated.flatMap((s) => s.data);
    setStats({ count: allRemaining.length, bytes: allRemaining.reduce((a, v) => a + v.fileSize, 0) });
  }

  const allCount = sections.reduce((a, s) => a + s.data.length, 0);
  const recentCount = sections.find((s) => s.accent)?.data.length ?? 0;

  const StatsHeader = (
    <>
      {/* Stats card */}
      <View style={[styles.statsCard, { backgroundColor: colors.surface }]}>
        <View style={styles.statsTop}>
          <View style={[styles.iconBadge, { backgroundColor: accent + "22" }]}>
            <Ionicons name="cloud-download-outline" size={22} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statsTitle, { color: colors.text }]}>
              {stats.count} {stats.count === 1 ? "video" : "videos"} · {formatBytes(stats.bytes)}
            </Text>
            <Text style={[styles.statsSub, { color: colors.textMuted }]}>
              {recentCount > 0
                ? `${recentCount} watched in the last 24 hrs · saved offline`
                : "Saved permanently on this device"}
            </Text>
          </View>
          {stats.count > 0 && (
            <TouchableOpacity onPress={handleClearAll} hitSlop={8} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Clear all</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Info pills */}
        <View style={styles.pillRow}>
          <View style={[styles.pill, { backgroundColor: accent + "18" }]}>
            <Ionicons name="wifi-outline" size={13} color={accent} />
            <Text style={[styles.pillText, { color: accent }]}>Watch offline anytime</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="sync-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.pillText, { color: colors.textMuted }]}>No re-download</Text>
          </View>
        </View>

        <View style={[styles.infoBox, { backgroundColor: colors.backgroundSecondary }]}>
          <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
          <Text style={[styles.infoText, { color: colors.textMuted }]}>
            Videos you watch in the feed are saved automatically. They live on your device
            permanently — open them here to re-watch without any internet connection.
          </Text>
        </View>
      </View>
    </>
  );

  const EmptyState = (
    <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
      <View style={[styles.emptyIconWrap, { backgroundColor: colors.backgroundSecondary }]}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No offline videos yet</Text>
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
        Videos you watch in the feed are saved here automatically. Watch a few videos and they'll
        appear here so you can re-watch them without internet.
      </Text>
    </View>
  );

  function renderSectionHeader({ section }: { section: SectionData }) {
    return (
      <View style={styles.sectionHeaderWrap}>
        {section.accent && (
          <View style={[styles.sectionAccentDot, { backgroundColor: accent }]} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>{section.title}</Text>
          <Text style={[styles.sectionSub, { color: colors.textMuted }]}>{section.subtitle}</Text>
        </View>
        <Text style={[styles.sectionCount, { color: colors.textMuted }]}>
          {section.data.length}
        </Text>
      </View>
    );
  }

  function renderItem({ item, index, section }: { item: OfflineVideoEntry; index: number; section: SectionData }) {
    const isFirst = index === 0;
    const isLast = index === section.data.length - 1;
    return (
      <View style={[
        styles.videoRow,
        { backgroundColor: colors.surface },
        isFirst && styles.rowFirst,
        isLast && styles.rowLast,
      ]}>
        {/* Thumbnail */}
        <View style={styles.thumb}>
          {item.thumbnail ? (
            <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.thumbPlaceholder]}>
              <Ionicons name="videocam" size={22} color="rgba(255,255,255,0.4)" />
            </View>
          )}
          {/* Offline ready badge */}
          <View style={styles.offlineBadge}>
            <Ionicons name="checkmark-circle" size={9} color="#fff" />
            <Text style={styles.offlineBadgeText}>Offline</Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.videoInfo}>
          <Text style={[styles.videoTitle, { color: colors.text }]} numberOfLines={2}>
            {item.title || "Video"}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.videoMeta, { color: colors.textMuted }]}>
              {formatBytes(item.fileSize)}
            </Text>
            {item.watchedAt && (
              <>
                <View style={[styles.metaDot, { backgroundColor: colors.textMuted }]} />
                <Text style={[styles.videoMeta, { color: colors.textMuted }]}>
                  {formatRelativeTime(item.watchedAt)}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Play */}
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/video/[id]", params: { id: item.postId } })}
          hitSlop={8}
          style={[styles.playBtn, { backgroundColor: accent + "22" }]}
        >
          <Ionicons name="play" size={16} color={accent} />
        </TouchableOpacity>

        {/* Remove */}
        <TouchableOpacity onPress={() => handleRemove(item.postId)} hitSlop={8} style={styles.removeBtn}>
          <Ionicons name="trash-outline" size={18} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Offline Videos" />

      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator color={accent} size="large" />
        </View>
      ) : allCount === 0 ? (
        <SectionList
          sections={[]}
          keyExtractor={(v) => v.postId}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
          ListHeaderComponent={StatsHeader}
          ListEmptyComponent={EmptyState}
          renderSectionHeader={() => null}
          renderItem={() => null}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(v) => v.postId}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={StatsHeader}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          )}
          SectionSeparatorComponent={() => <View style={{ height: 16 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centerLoader: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { paddingTop: 20, paddingHorizontal: 16, gap: 0 },

  statsCard: { borderRadius: 14, padding: 16, marginBottom: 20 },
  statsTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  iconBadge: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  statsTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  statsSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FF3B30",
  },
  clearBtnText: { color: "#FF3B30", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  pillRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pillText: { fontSize: 11, fontFamily: "Inter_500Medium" },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    padding: 10,
  },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  sectionHeaderWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 8,
    paddingTop: 4,
  },
  sectionAccentDot: { width: 8, height: 8, borderRadius: 4 },
  sectionLabel: { fontSize: 14, fontFamily: "Inter_700Bold" },
  sectionSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  sectionCount: { fontSize: 12, fontFamily: "Inter_500Medium" },

  videoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  rowFirst: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  rowLast: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 14 + 72 + 12 },

  thumb: {
    width: 72,
    height: 54,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#111",
    flexShrink: 0,
  },
  thumbPlaceholder: {
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
  },
  offlineBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  offlineBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_600SemiBold" },

  videoInfo: { flex: 1 },
  videoTitle: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 19 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5 },
  videoMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },

  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyCard: {
    borderRadius: 14,
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, maxWidth: 300 },
});
