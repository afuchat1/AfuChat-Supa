import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import {
  formatStatus,
  listMatches,
  type WatchMatch,
} from "@/lib/watchTogether";

type Filter = "live" | "upcoming" | "finished";

export default function WatchTogetherListScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [matches, setMatches] = useState<WatchMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("live");
  const [viewerCounts, setViewerCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const data = await listMatches();
      setMatches(data);
    } catch (e) {
      console.warn("[watch] listMatches failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Subscribe to live match updates so scores tick in real time.
  useEffect(() => {
    const ch = supabase
      .channel("watch_matches:list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watch_matches" },
        (payload) => {
          setMatches((prev) => {
            if (payload.eventType === "INSERT") {
              return [payload.new as WatchMatch, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              return prev.map((m) =>
                m.id === (payload.new as WatchMatch).id ? (payload.new as WatchMatch) : m
              );
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((m) => m.id !== (payload.old as WatchMatch).id);
            }
            return prev;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // Track approximate viewer count per match via a lobby presence channel.
  useEffect(() => {
    if (!matches.length) return;
    const channels = matches.map((m) => {
      const ch = supabase.channel(`watch:lobby:${m.id}`, {
        config: { presence: { key: `lobby-${Math.random().toString(36).slice(2, 8)}` } },
      });
      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const total = Object.values(state).reduce((acc, arr: any) => acc + (arr?.length || 0), 0);
        setViewerCounts((prev) => ({ ...prev, [m.id]: total }));
      });
      ch.subscribe();
      return ch;
    });
    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [matches.map((m) => m.id).join(",")]);

  const filtered = useMemo(() => {
    if (filter === "live") return matches.filter((m) => m.status === "live" || m.status === "ht");
    if (filter === "upcoming") return matches.filter((m) => m.status === "scheduled");
    return matches.filter((m) => m.status === "ft" || m.status === "postponed");
  }, [matches, filter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const renderItem = ({ item }: { item: WatchMatch }) => {
    const isLive = item.status === "live" || item.status === "ht";
    const viewers = viewerCounts[item.id] ?? 0;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(`/watch/${item.id}` as any)}
        style={[styles.card, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
      >
        <View style={styles.cardTop}>
          <Text style={[styles.league, { color: colors.textMuted }]} numberOfLines={1}>
            {item.league || item.sport.toUpperCase()}
          </Text>
          <View style={styles.cardTopRight}>
            {isLive ? (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>{formatStatus(item)}</Text>
              </View>
            ) : (
              <Text style={[styles.timeText, { color: colors.textSecondary }]}>{formatStatus(item)}</Text>
            )}
          </View>
        </View>

        <View style={styles.teamsRow}>
          <View style={styles.teamCol}>
            {item.home_logo ? (
              <Image source={{ uri: item.home_logo }} style={styles.logo} />
            ) : (
              <View style={[styles.logoFallback, { backgroundColor: colors.border }]}>
                <Text style={[styles.logoFallbackText, { color: colors.text }]}>
                  {item.home_team.slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.teamName, { color: colors.text }]} numberOfLines={1}>
              {item.home_team}
            </Text>
          </View>

          <View style={styles.scoreCol}>
            <Text style={[styles.score, { color: colors.text }]}>
              {item.home_score} — {item.away_score}
            </Text>
            {item.venue ? (
              <Text style={[styles.venue, { color: colors.textMuted }]} numberOfLines={1}>
                {item.venue}
              </Text>
            ) : null}
          </View>

          <View style={styles.teamCol}>
            {item.away_logo ? (
              <Image source={{ uri: item.away_logo }} style={styles.logo} />
            ) : (
              <View style={[styles.logoFallback, { backgroundColor: colors.border }]}>
                <Text style={[styles.logoFallbackText, { color: colors.text }]}>
                  {item.away_team.slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.teamName, { color: colors.text }]} numberOfLines={1}>
              {item.away_team}
            </Text>
          </View>
        </View>

        <View style={[styles.cardBottom, { borderTopColor: colors.border }]}>
          <View style={styles.cardBottomLeft}>
            <Ionicons name="people" size={14} color={colors.textMuted} />
            <Text style={[styles.viewersText, { color: colors.textMuted }]}>
              {viewers > 0 ? `${viewers} watching` : "Be the first to watch"}
            </Text>
          </View>
          <View style={styles.cardBottomRight}>
            <Ionicons name="chatbubbles" size={14} color={colors.brand} />
            <Text style={[styles.joinText, { color: colors.brand }]}>Join room</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Watch Together</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.filterRow}>
        {(["live", "upcoming", "finished"] as Filter[]).map((f) => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.filterChip,
                { backgroundColor: active ? colors.brand : colors.backgroundSecondary, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.filterChipText, { color: active ? "#fff" : colors.text }]}>
                {f === "live" ? "🔴 Live" : f === "upcoming" ? "Upcoming" : "Finished"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="football-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No matches here</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            {filter === "live" ? "Nothing is live right now. Check back soon." : "Pull to refresh."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700" },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 12 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterChipText: { fontSize: 13, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: "600", marginTop: 12 },
  emptyBody: { fontSize: 13, marginTop: 4, textAlign: "center" },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTopRight: {},
  league: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5, flex: 1, textTransform: "uppercase" },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF3B30",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  timeText: { fontSize: 13, fontWeight: "600" },
  teamsRow: { flexDirection: "row", alignItems: "center", marginTop: 14, marginBottom: 12 },
  teamCol: { flex: 1, alignItems: "center", gap: 8 },
  logo: { width: 44, height: 44, borderRadius: 22 },
  logoFallback: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  logoFallbackText: { fontSize: 14, fontWeight: "700" },
  teamName: { fontSize: 13, fontWeight: "600", maxWidth: 110, textAlign: "center" },
  scoreCol: { flex: 1, alignItems: "center" },
  score: { fontSize: 24, fontWeight: "800" },
  venue: { fontSize: 11, marginTop: 2, maxWidth: 120, textAlign: "center" },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  cardBottomLeft: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardBottomRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewersText: { fontSize: 12 },
  joinText: { fontSize: 13, fontWeight: "600" },
});
