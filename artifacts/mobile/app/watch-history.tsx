/**
 * Watch History Screen
 *
 * Shows all videos the signed-in user has watched, grouped by date.
 * Clearing history removes all server records AND resets the feed algorithm's
 * seen-video demotion weights — giving the user a genuinely fresh For You feed.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { showAlert } from "@/lib/alert";
import { showToast } from "@/lib/toast";
import {
  getWatchHistory,
  removeFromWatchHistory,
  clearAllWatchHistory,
  type WatchHistoryEntry,
} from "@/lib/watchHistory";
import { encodeId } from "@/lib/shortId";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = diff / 60000;
  if (mins < 1)   return "Just now";
  if (mins < 60)  return `${Math.floor(mins)}m ago`;
  const hrs = mins / 60;
  if (hrs < 24)   return `${Math.floor(hrs)}h ago`;
  const days = hrs / 24;
  if (days < 7)   return `${Math.floor(days)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getSectionKey(iso: string): string {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7)   return "This Week";
  if (diff < 30)  return "This Month";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

type Section = {
  title: string;
  data:  WatchHistoryEntry[];
};

function buildSections(items: WatchHistoryEntry[]): Section[] {
  const map = new Map<string, WatchHistoryEntry[]>();
  const ORDER = ["Today", "Yesterday", "This Week", "This Month"];

  for (const item of items) {
    const key = getSectionKey(item.watchedAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  const sections: Section[] = [];
  // Deterministic ordering for fixed keys
  for (const key of ORDER) {
    if (map.has(key)) {
      sections.push({ title: key, data: map.get(key)! });
      map.delete(key);
    }
  }
  // Remaining month/year groups in insertion order (already desc)
  for (const [key, data] of map) {
    sections.push({ title: key, data });
  }

  return sections;
}

// ─── Row component ───────────────────────────────────────────────────────────

type RowProps = {
  item:    WatchHistoryEntry;
  colors:  any;
  onPress: () => void;
  onDelete: () => void;
};

function HistoryRow({ item, colors, onPress, onDelete }: RowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const deleteOpacity = useRef(new Animated.Value(0)).current;
  const [swiped, setSwiped] = useState(false);

  const handleSwipeConfirm = () => {
    showAlert("Remove from history?", "This video will be removed from your watch history.", [
      { text: "Cancel", style: "cancel", onPress: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        setSwiped(false);
      }},
      { text: "Remove", style: "destructive", onPress: onDelete },
    ]);
  };

  const progressWidth = `${Math.round((item.progress ?? 0) * 100)}%`;
  const hasProgress = (item.progress ?? 0) > 0.02;

  return (
    <View style={[styles.rowWrap, { borderBottomColor: colors.border }]}>
      <Animated.View style={{ transform: [{ translateX }] }}>
        <TouchableOpacity
          style={styles.row}
          onPress={onPress}
          activeOpacity={0.75}
        >
          {/* Thumbnail */}
          <View style={[styles.thumbWrap, { backgroundColor: colors.card }]}>
            {item.thumbnail ? (
              <>
                <ExpoImage
                  source={{ uri: item.thumbnail }}
                  style={styles.thumb}
                  contentFit="cover"
                  transition={0}
                />
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.5)"]}
                  style={StyleSheet.absoluteFill}
                />
                {/* Progress bar at bottom of thumbnail */}
                {hasProgress && (
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: progressWidth as any,
                          backgroundColor: "#00BCD4",
                        },
                      ]}
                    />
                  </View>
                )}
              </>
            ) : (
              <View style={[styles.thumbPlaceholder, { backgroundColor: colors.card }]}>
                <Ionicons name="videocam" size={22} color={colors.textMuted} />
              </View>
            )}
            {/* Play icon overlay */}
            <View style={styles.playOverlay}>
              <View style={styles.playCircle}>
                <Ionicons name="play" size={11} color="#fff" style={{ marginLeft: 2 }} />
              </View>
            </View>
          </View>

          {/* Text info */}
          <View style={styles.info}>
            <Text
              style={[styles.title, { color: colors.text }]}
              numberOfLines={2}
            >
              {item.title || "Video"}
            </Text>
            <View style={styles.meta}>
              <Ionicons name="time" size={12} color={colors.textMuted} />
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                {formatRelative(item.watchedAt)}
              </Text>
              {item.watchCount > 1 && (
                <>
                  <Text style={[styles.dot, { color: colors.textMuted }]}>·</Text>
                  <Ionicons name="repeat" size={12} color={colors.textMuted} />
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>
                    {item.watchCount}×
                  </Text>
                </>
              )}
              {hasProgress && (
                <>
                  <Text style={[styles.dot, { color: colors.textMuted }]}>·</Text>
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>
                    {Math.round((item.progress ?? 0) * 100)}% watched
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Delete button */}
          <TouchableOpacity
            onPress={handleSwipeConfirm}
            hitSlop={12}
            style={styles.deleteBtn}
          >
            <Ionicons name="trash" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ title, colors }: { title: string; colors: any }) {
  return (
    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function WatchHistoryScreen() {
  const { user }            = useAuth();
  const { colors, isDark }  = useTheme();
  const insets              = useSafeAreaInsets();

  const [items, setItems]         = useState<WatchHistoryEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing]   = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (silent = false) => {
    if (!user) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const data = await getWatchHistory({ limit: 200 });
      setItems(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  // ── Delete single ────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (postId: string) => {
    setItems((prev) => prev.filter((i) => i.postId !== postId));
    await removeFromWatchHistory(postId);
  }, []);

  // ── Clear all ────────────────────────────────────────────────────────────

  const handleClearAll = useCallback(() => {
    if (items.length === 0) return;

    showAlert(
      "Clear Watch History?",
      "This will delete all your watch history and reset the For You video algorithm \u2014 you'll start seeing fresh content immediately.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear History",
          style: "destructive",
          onPress: async () => {
            setClearing(true);
            const { ok, error } = await clearAllWatchHistory({ resetLearnedWeights: false });
            setClearing(false);
            if (ok) {
              setItems([]);
              showToast("Watch history cleared. Algorithm reset", { type: "success" });
            } else {
              showToast(error || "Failed to clear history", { type: "error" });
            }
          },
        },
      ],
    );
  }, [items.length]);

  // ── Navigate to video ─────────────────────────────────────────────────────

  const handleVideoPress = useCallback((item: WatchHistoryEntry) => {
    const shortId = encodeId(item.postId);
    router.push(`/video/${shortId}` as any);
  }, []);

  // ── Sections ──────────────────────────────────────────────────────────────

  const sections = buildSections(items);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlassHeader
        title="Watch History"
        onBack={() => router.back()}
        right={
          items.length > 0 ? (
            <TouchableOpacity
              onPress={handleClearAll}
              disabled={clearing}
              style={styles.clearBtn}
            >
              {clearing ? (
                <ActivityIndicator size="small" color="#FF3B30" />
              ) : (
                <Text style={styles.clearText}>Clear All</Text>
              )}
            </TouchableOpacity>
          ) : undefined
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent || "#00BCD4"} size="large" />
        </View>
      ) : !user ? (
        <View style={styles.center}>
          <Ionicons name="person" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Sign in to see watch history
          </Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: "#00BCD410" }]}>
            <Ionicons name="time" size={42} color="#00BCD4" />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No watch history yet
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Videos you watch will appear here. Your history also powers the "For You" algorithm.
          </Text>
        </View>
      ) : (
        <>
          {/* Algorithm info banner */}
          <View style={[styles.infoBanner, { backgroundColor: "#00BCD408", borderColor: "#00BCD420" }]}>
            <Ionicons name="time-outline" size={14} color="#00BCD4" />
            <Text style={[styles.infoText, { color: colors.textMuted }]}>
              {items.length} video{items.length !== 1 ? "s" : ""} · Clearing history resets your For You algorithm
            </Text>
          </View>

          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <HistoryRow
                item={item}
                colors={colors}
                onPress={() => handleVideoPress(item)}
                onDelete={() => handleDelete(item.postId)}
              />
            )}
            renderSectionHeader={({ section }) => (
              <SectionHeader title={section.title} colors={colors} />
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accent || "#00BCD4"}
              />
            }
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled
          />
        </>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const THUMB_W = 108;
const THUMB_H = 72;

const styles = StyleSheet.create({
  container: { flex: 1 },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingBottom: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },

  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  infoText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flexShrink: 1,
  },

  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  rowWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },

  thumbWrap: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  thumbPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  playOverlay: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  playCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  info: { flex: 1 },
  title: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 19,
    marginBottom: 4,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  dot: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },

  deleteBtn: {
    padding: 6,
  },

  clearBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    minWidth: 72,
    alignItems: "flex-end",
  },
  clearText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#FF3B30",
  },
});
