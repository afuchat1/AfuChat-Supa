import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import {
  getOfflineVideos,
  getOfflineCacheStats,
  clearAllOfflineVideos,
  removeOfflineVideo,
  clearExpiredOfflineVideos,
  type OfflineVideoEntry,
} from "@/lib/videoCache";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function OfflineVideosScreen() {
  if (Platform.OS === "web") return null;
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const [videos, setVideos] = useState<OfflineVideoEntry[]>([]);
  const [stats, setStats] = useState<{ count: number; bytes: number }>({ count: 0, bytes: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await clearExpiredOfflineVideos();
      const [vids, st] = await Promise.all([getOfflineVideos(), getOfflineCacheStats()]);
      setVideos(vids);
      setStats(st);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleClearAll() {
    Alert.alert(
      "Clear Offline Videos",
      "All cached videos will be removed from this device. They'll be re-cached automatically as you watch them again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            await clearAllOfflineVideos();
            setVideos([]);
            setStats({ count: 0, bytes: 0 });
          },
        },
      ],
    );
  }

  async function handleRemove(postId: string) {
    await removeOfflineVideo(postId);
    const updated = videos.filter((v) => v.postId !== postId);
    setVideos(updated);
    setStats({ count: updated.length, bytes: updated.reduce((a, v) => a + v.fileSize, 0) });
  }

  const ListHeader = (
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
              Saved permanently on this device
            </Text>
          </View>
          {stats.count > 0 && (
            <TouchableOpacity onPress={handleClearAll} hitSlop={8} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Clear all</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.infoBox, { backgroundColor: colors.backgroundSecondary }]}>
          <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
          <Text style={[styles.infoText, { color: colors.textMuted }]}>
            Videos are saved automatically when you watch them. They stay on your device permanently until you delete them — no re-downloading needed, even without internet.
          </Text>
        </View>
      </View>

      {videos.length > 0 && (
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>CACHED VIDEOS</Text>
      )}
    </>
  );

  const EmptyState = (
    <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
      <View style={[styles.emptyIconWrap, { backgroundColor: colors.backgroundSecondary }]}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No offline videos yet</Text>
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
        Videos you watch in the feed are automatically saved here so you can re-watch them anytime without an internet connection.
      </Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Header */}
      <View style={[styles.header, {
        paddingTop: insets.top + 10,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <TouchableOpacity style={styles.headerSide} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={accent} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Offline Videos</Text>
        <View style={styles.headerSide} />
      </View>

      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator color={accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(v) => v.postId}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={EmptyState}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          )}
          renderItem={({ item, index }) => (
            <View style={[
              styles.videoRow,
              { backgroundColor: colors.surface },
              index === 0 && styles.rowFirst,
              index === videos.length - 1 && styles.rowLast,
            ]}>
              {/* Thumbnail */}
              <View style={styles.thumb}>
                {item.thumbnail ? (
                  <Image
                    source={{ uri: item.thumbnail }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.thumbPlaceholder]}>
                    <Ionicons name="videocam" size={22} color="rgba(255,255,255,0.4)" />
                  </View>
                )}
                <View style={styles.expiryBadge}>
                  <Ionicons name="checkmark-circle" size={9} color="#fff" />
                  <Text style={styles.expiryText}>Saved</Text>
                </View>
              </View>

              {/* Info */}
              <View style={styles.videoInfo}>
                <Text style={[styles.videoTitle, { color: colors.text }]} numberOfLines={2}>
                  {item.title || "Video"}
                </Text>
                <Text style={[styles.videoMeta, { color: colors.textMuted }]}>
                  {formatBytes(item.fileSize)}
                </Text>
              </View>

              {/* Play button */}
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
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: { width: 44, alignItems: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  centerLoader: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { paddingTop: 24, paddingHorizontal: 16, gap: 0 },

  statsCard: { borderRadius: 14, padding: 16, marginBottom: 24 },
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
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    padding: 10,
  },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingLeft: 4,
  },

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
  expiryBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  expiryText: { color: "#fff", fontSize: 9, fontFamily: "Inter_600SemiBold" },

  videoInfo: { flex: 1 },
  videoTitle: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 19 },
  videoMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

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
