import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "@/lib/haptics";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { initiateCall } from "@/lib/callSignaling";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";

/* ─── Types ───────────────────────────────────────────────────────────────── */

type CallStatus = "ringing" | "active" | "ended" | "declined" | "missed" | "busy";
type CallType   = "voice" | "video";
type FilterTab  = "all" | "missed" | "incoming" | "outgoing";

type CallEntry = {
  id: string;
  call_type: CallType;
  status: CallStatus;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  caller_id: string;
  callee_id: string;
  chat_id: string | null;
  other_id: string;
  other_name: string;
  other_handle: string;
  other_avatar: string | null;
  other_verified: boolean;
  direction: "outgoing" | "incoming";
};

type StatCard = { label: string; value: string; icon: string; color: string };

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function fmtDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function fmtTotalDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)  return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatFullTimestamp(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function statusMeta(entry: CallEntry): { color: string; label: string; iconName: string } {
  const { status, direction, call_type } = entry;
  const isVideo = call_type === "video";
  if (status === "missed")   return { color: "#FF3B30", label: "Missed",   iconName: isVideo ? "videocam" : "call" };
  if (status === "declined") return { color: "#FF9500", label: "Declined", iconName: isVideo ? "videocam" : "call" };
  if (status === "busy")     return { color: "#FF9500", label: "Busy",     iconName: isVideo ? "videocam" : "call" };
  if (status === "ended" && direction === "outgoing") return { color: "#34C759", label: "Outgoing", iconName: isVideo ? "videocam-outline" : "call-outline" };
  if (status === "ended" && direction === "incoming") return { color: "#30D158", label: "Incoming", iconName: isVideo ? "videocam-outline" : "call-outline" };
  return { color: "#8E8E93", label: "Cancelled", iconName: "call-outline" };
}

function groupByDate(calls: CallEntry[]): Array<{ label: string; data: CallEntry[] }> {
  const now = new Date();
  const todayStr     = now.toDateString();
  const yesterdayStr = new Date(now.getTime() - 86400000).toDateString();
  const weekAgo      = now.getTime() - 7 * 86400000;
  const buckets: Record<string, CallEntry[]> = {
    Today: [], Yesterday: [], "This Week": [], Earlier: [],
  };
  for (const c of calls) {
    const d = new Date(c.started_at);
    const ds = d.toDateString();
    if (ds === todayStr) buckets["Today"].push(c);
    else if (ds === yesterdayStr) buckets["Yesterday"].push(c);
    else if (d.getTime() >= weekAgo) buckets["This Week"].push(c);
    else buckets["Earlier"].push(c);
  }
  return Object.entries(buckets)
    .filter(([, data]) => data.length > 0)
    .map(([label, data]) => ({ label, data }));
}

/* ─── Main screen ─────────────────────────────────────────────────────────── */

export default function CallHistoryScreen() {
  const { user } = useAuth();
  const { colors, accent, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const headerTop = Platform.OS === "ios" ? insets.top : Math.max(insets.top, 16);

  const [calls, setCalls]             = useState<CallEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [filter, setFilter]           = useState<FilterTab>("all");
  const [search, setSearch]           = useState("");
  const [callingId, setCallingId]     = useState<string | null>(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [showSearch, setShowSearch]   = useState(false);

  /* ── Fetch ── */
  const load = useCallback(async (bg = false) => {
    if (!user) return;
    if (!bg) setLoading(true);

    const { data } = await supabase
      .from("calls")
      .select(
        "id, call_type, status, started_at, answered_at, ended_at, duration_seconds, caller_id, callee_id, chat_id, " +
        "caller:caller_id(id, display_name, handle, avatar_url, is_verified), " +
        "callee:callee_id(id, display_name, handle, avatar_url, is_verified)"
      )
      .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
      .not("status", "eq", "ringing")
      .order("started_at", { ascending: false })
      .limit(300);

    if (data) {
      const mapped: CallEntry[] = (data as any[]).map((c) => {
        const isCaller = c.caller_id === user.id;
        const other    = isCaller ? c.callee : c.caller;
        return {
          id: c.id,
          call_type: c.call_type,
          status: c.status,
          started_at: c.started_at,
          answered_at: c.answered_at || null,
          ended_at: c.ended_at || null,
          duration_seconds: c.duration_seconds || null,
          caller_id: c.caller_id,
          callee_id: c.callee_id,
          chat_id: c.chat_id || null,
          other_id: isCaller ? c.callee_id : c.caller_id,
          other_name: other?.display_name || "Unknown",
          other_handle: other?.handle || "",
          other_avatar: other?.avatar_url || null,
          other_verified: !!other?.is_verified,
          direction: isCaller ? "outgoing" : "incoming",
        };
      });
      setCalls(mapped);
    }

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  /* ── Callback ── */
  async function callBack(entry: CallEntry, type: CallType) {
    if (!user || callingId) return;
    setCallingId(entry.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const callId = await initiateCall({
        calleeId: entry.other_id,
        chatId:   entry.chat_id || undefined,
        callType: type,
        callerId: user.id,
      });
      router.push({ pathname: "/call/[id]", params: { id: callId } });
    } catch (_) {}
    setCallingId(null);
  }

  /* ── Delete a single call log entry ── */
  async function deleteEntry(id: string) {
    Alert.alert("Remove Entry", "Remove this call from your history?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          setCalls((prev) => prev.filter((c) => c.id !== id));
          await supabase.from("calls").delete().eq("id", id);
        },
      },
    ]);
  }

  /* ── Clear all ── */
  async function clearAll() {
    Alert.alert("Clear All History", "This will remove all calls from your history permanently.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear All", style: "destructive",
        onPress: async () => {
          if (!user) return;
          const ids = calls.map((c) => c.id);
          setCalls([]);
          await supabase.from("calls").delete().in("id", ids);
        },
      },
    ]);
  }

  /* ── Derived data ── */
  const filtered = (() => {
    let result = calls;
    if (filter === "missed")   result = result.filter((c) => c.status === "missed");
    if (filter === "incoming") result = result.filter((c) => c.direction === "incoming");
    if (filter === "outgoing") result = result.filter((c) => c.direction === "outgoing");
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        c.other_name.toLowerCase().includes(q) ||
        c.other_handle.toLowerCase().includes(q)
      );
    }
    return result;
  })();

  const groups = groupByDate(filtered);
  const missedCount   = calls.filter((c) => c.status === "missed" && c.direction === "incoming").length;
  const answeredCalls = calls.filter((c) => c.status === "ended" && c.duration_seconds);
  const totalDuration = answeredCalls.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0);
  const mostCalledMap: Record<string, { name: string; count: number }> = {};
  for (const c of calls) {
    if (!mostCalledMap[c.other_id]) mostCalledMap[c.other_id] = { name: c.other_name, count: 0 };
    mostCalledMap[c.other_id].count += 1;
  }
  const mostCalled = Object.values(mostCalledMap).sort((a, b) => b.count - a.count)[0];

  const stats: StatCard[] = [
    { label: "Total Calls", value: String(calls.length), icon: "call", color: accent },
    { label: "Talk Time", value: totalDuration > 0 ? fmtTotalDuration(totalDuration) : "—", icon: "time-outline", color: "#34C759" },
    { label: "Missed", value: String(missedCount), icon: "call-outline", color: missedCount > 0 ? "#FF3B30" : colors.textMuted },
    { label: "Most Called", value: mostCalled ? mostCalled.name.split(" ")[0] : "—", icon: "person-outline", color: "#007AFF" },
  ];

  const FILTER_TABS: Array<{ key: FilterTab; label: string }> = [
    { key: "all",      label: "All" },
    { key: "missed",   label: "Missed" },
    { key: "incoming", label: "Incoming" },
    { key: "outgoing", label: "Outgoing" },
  ];

  /* ─── Call Row ──────────────────────────────────────────────────────────── */
  function CallRow({ item }: { item: CallEntry }) {
    const meta     = statusMeta(item);
    const isMissed = item.status === "missed";
    const isVideo  = item.call_type === "video";
    const busy     = callingId === item.id;
    const expanded = expandedId === item.id;

    const voiceColor = "#34C759";
    const videoColor = "#007AFF";

    return (
      <View style={[styles.rowWrap, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => setExpandedId(expanded ? null : item.id)}
          onLongPress={() => deleteEntry(item.id)}
          activeOpacity={0.75}
          delayLongPress={500}
        >
          {/* Missed call indicator stripe */}
          {isMissed && (
            <View style={[styles.missedStripe, { backgroundColor: "#FF3B30" }]} />
          )}

          {/* Avatar */}
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.other_id } })}
            activeOpacity={0.8}
          >
            <Avatar uri={item.other_avatar} name={item.other_name} size={48} />
          </TouchableOpacity>

          {/* Info */}
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text
                style={[styles.rowName, { color: isMissed ? "#FF3B30" : colors.text }]}
                numberOfLines={1}
              >
                {item.other_name}
              </Text>
              {item.other_verified && <VerifiedBadge isVerified size={13} />}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              {/* Direction arrow */}
              <Ionicons
                name={
                  item.direction === "outgoing"
                    ? "arrow-up-outline"
                    : isMissed ? "arrow-down-outline" : "arrow-down-outline"
                }
                size={11}
                color={isMissed ? "#FF3B30" : item.direction === "outgoing" ? "#34C759" : "#30D158"}
              />
              <Ionicons
                name={isVideo ? (isMissed ? "videocam" : "videocam-outline") : (isMissed ? "call" : "call-outline")}
                size={12}
                color={meta.color}
              />
              <Text style={[styles.rowMeta, { color: isMissed ? "#FF3B30" : colors.textMuted }]}>
                {item.direction === "outgoing" ? "Outgoing" : meta.label}
                {isVideo ? " · Video" : " · Voice"}
                {item.duration_seconds && item.duration_seconds > 0
                  ? ` · ${fmtDuration(item.duration_seconds)}`
                  : ""}
              </Text>
            </View>

            <Text style={[styles.rowTime, { color: colors.textMuted }]}>
              {formatTimestamp(item.started_at)}
            </Text>
          </View>

          {/* Quick call buttons */}
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity
              style={[styles.callBtn, { backgroundColor: voiceColor + "1A" }]}
              onPress={() => callBack(item, "voice")}
              disabled={!!callingId}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              {busy && item.call_type === "voice"
                ? <ActivityIndicator size="small" color={voiceColor} />
                : <Ionicons name="call" size={17} color={voiceColor} />
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.callBtn, { backgroundColor: videoColor + "1A" }]}
              onPress={() => callBack(item, "video")}
              disabled={!!callingId}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              {busy && item.call_type === "video"
                ? <ActivityIndicator size="small" color={videoColor} />
                : <Ionicons name="videocam" size={17} color={videoColor} />
              }
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* Expanded detail panel */}
        {expanded && (
          <View style={[styles.expandedPanel, { backgroundColor: isDark ? colors.background : "#F9F9F9", borderTopColor: colors.border }]}>
            <View style={styles.expandedRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.expandedText, { color: colors.textSecondary }]}>{formatFullTimestamp(item.started_at)}</Text>
            </View>
            {item.duration_seconds && item.duration_seconds > 0 ? (
              <View style={styles.expandedRow}>
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.expandedText, { color: colors.textSecondary }]}>Duration: {fmtDuration(item.duration_seconds)}</Text>
              </View>
            ) : null}
            <View style={styles.expandedRow}>
              <Ionicons name={item.direction === "outgoing" ? "arrow-up-outline" : "arrow-down-outline"} size={14} color={colors.textMuted} />
              <Text style={[styles.expandedText, { color: colors.textSecondary }]}>
                {item.direction === "outgoing" ? "You called" : "They called you"}
              </Text>
            </View>
            <View style={styles.expandedRow}>
              <Ionicons name={item.call_type === "video" ? "videocam-outline" : "call-outline"} size={14} color={colors.textMuted} />
              <Text style={[styles.expandedText, { color: colors.textSecondary }]}>
                {item.call_type === "video" ? "Video call" : "Voice call"} · {meta.label}
              </Text>
            </View>
            <View style={[styles.expandedActions, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.expandedBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.other_id } })}
                activeOpacity={0.8}
              >
                <Ionicons name="person-outline" size={14} color={colors.text} />
                <Text style={[styles.expandedBtnText, { color: colors.text }]}>Profile</Text>
              </TouchableOpacity>
              {item.chat_id && (
                <TouchableOpacity
                  style={[styles.expandedBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.chat_id! } })}
                  activeOpacity={0.8}
                >
                  <Ionicons name="chatbubble-outline" size={14} color={accent} />
                  <Text style={[styles.expandedBtnText, { color: accent }]}>Message</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.expandedBtn, { backgroundColor: "#FF3B3010", borderColor: "#FF3B3030" }]}
                onPress={() => deleteEntry(item.id)}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={14} color="#FF3B30" />
                <Text style={[styles.expandedBtnText, { color: "#FF3B30" }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: headerTop }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {showSearch ? "" : "Call History"}
        </Text>
        <View style={{ flexDirection: "row", gap: 0 }}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => { setShowSearch((v) => !v); setSearch(""); }}
            hitSlop={8}
          >
            <Ionicons name={showSearch ? "close" : "search-outline"} size={20} color={colors.text} />
          </TouchableOpacity>
          {calls.length > 0 && (
            <TouchableOpacity style={styles.headerBtn} onPress={clearAll} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color="#FF3B30" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Search bar ── */}
      {showSearch && (
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={[styles.searchInner, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search by name or handle…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoFocus
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── Stats cards (only when not searching and has calls) ── */}
      {!showSearch && !loading && calls.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsScroll}
          style={[styles.statsRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        >
          {stats.map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={[styles.statIcon, { backgroundColor: s.color + "18" }]}>
                <Ionicons name={s.icon as any} size={16} color={s.color} />
              </View>
              <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Filter tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScroll}
        style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
      >
        {FILTER_TABS.map((t) => {
          const active = filter === t.key;
          const badge = t.key === "missed" && missedCount > 0 ? missedCount : null;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && { borderBottomColor: accent, borderBottomWidth: 2.5 }]}
              onPress={() => setFilter(t.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, { color: active ? accent : colors.textMuted, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                {t.label}
              </Text>
              {badge ? (
                <View style={[styles.tabBadge, { backgroundColor: "#FF3B30" }]}>
                  <Text style={styles.tabBadgeText}>{badge > 99 ? "99+" : badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Content ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={accent} size="large" />
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.center}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.surface }]}>
            <Ionicons
              name={filter === "missed" ? "call" : filter === "incoming" ? "arrow-down" : filter === "outgoing" ? "arrow-up" : "call-outline"}
              size={34}
              color={filter === "missed" ? "#FF3B30" : colors.textMuted}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {search.trim()
              ? "No results"
              : filter === "missed" ? "No missed calls"
              : filter === "incoming" ? "No incoming calls"
              : filter === "outgoing" ? "No outgoing calls"
              : "No call history"}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {search.trim()
              ? `No calls matching "${search}"`
              : filter === "missed" ? "You're all caught up!"
              : "Your calls will appear here."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.label}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={accent}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: group }) => (
            <View>
              {/* Section header */}
              <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
                <Text style={[styles.sectionText, { color: colors.textMuted }]}>{group.label}</Text>
                <View style={[styles.sectionLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{group.data.length}</Text>
              </View>

              {/* Rows */}
              {group.data.map((call, idx) => (
                <View key={call.id}>
                  <CallRow item={call} />
                  {idx < group.data.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: colors.border, marginLeft: 76 }]} />
                  )}
                </View>
              ))}
            </View>
          )}
        />
      )}
    </View>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 40 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },

  searchBar: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },

  statsRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  statsScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  statCard: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 90,
  },
  statIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },

  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabScroll: { paddingHorizontal: 8, gap: 0 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 2.5,
    borderBottomColor: "transparent",
  },
  tabText: { fontSize: 14 },
  tabBadge: { borderRadius: 9, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },

  sectionHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  sectionText: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth },
  sectionCount: { fontSize: 11, fontFamily: "Inter_400Regular" },

  rowWrap: { overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    position: "relative",
  },
  missedStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, borderRadius: 2 },
  rowName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowTime: { fontSize: 11, fontFamily: "Inter_400Regular" },

  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  expandedPanel: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  expandedText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  expandedActions: { flexDirection: "row", gap: 8, marginTop: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  expandedBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  expandedBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  divider: { height: StyleSheet.hairlineWidth },

  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
});
