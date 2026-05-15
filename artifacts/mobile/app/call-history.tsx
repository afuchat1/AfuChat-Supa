import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
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
import { Swipeable } from "react-native-gesture-handler";
import * as Haptics from "@/lib/haptics";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { initiateCall } from "@/lib/callSignaling";
import { showAlert } from "@/lib/alert";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

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

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

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

/* ─── Swipeable delete action ───────────────────────────────────────────────── */

function DeleteAction({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={st.swipeDelete} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name="trash-outline" size={22} color="#fff" />
      <Text style={st.swipeDeleteText}>Delete</Text>
    </TouchableOpacity>
  );
}

/* ─── Call Row ───────────────────────────────────────────────────────────────── */

function CallRow({
  item,
  accent,
  colors,
  isDark,
  callingId,
  onCallBack,
  onDelete,
  onNavigateToProfile,
  onNavigateToChat,
}: {
  item: CallEntry;
  accent: string;
  colors: any;
  isDark: boolean;
  callingId: string | null;
  onCallBack: (entry: CallEntry, type: CallType) => void;
  onDelete: (id: string) => void;
  onNavigateToProfile: (id: string) => void;
  onNavigateToChat: (id: string) => void;
}) {
  const meta     = statusMeta(item);
  const isMissed = item.status === "missed";
  const isVideo  = item.call_type === "video";
  const busy     = callingId === item.id;
  const [expanded, setExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  function toggleExpand() {
    Animated.spring(expandAnim, {
      toValue: expanded ? 0 : 1,
      useNativeDriver: false,
      damping: 18,
      stiffness: 200,
    }).start();
    setExpanded((v) => !v);
  }

  const VOICE_COLOR = "#34C759";
  const VIDEO_COLOR = "#007AFF";

  const directionIcon = item.direction === "outgoing" ? "arrow-up" : "arrow-down";
  const directionColor = isMissed ? "#FF3B30" : item.direction === "outgoing" ? VOICE_COLOR : "#30D158";

  return (
    <Swipeable
      renderRightActions={() => (
        <DeleteAction onPress={() => onDelete(item.id)} />
      )}
      overshootRight={false}
    >
      <View style={[st.rowCard, { backgroundColor: isDark ? colors.surface : "#FFFFFF" }]}>
        {/* Missed stripe */}
        {isMissed && <View style={[st.missedStripe, { backgroundColor: "#FF3B30" }]} />}

        {/* Main row */}
        <TouchableOpacity
          style={st.rowMain}
          onPress={toggleExpand}
          activeOpacity={0.78}
        >
          {/* Avatar + call type badge */}
          <TouchableOpacity
            onPress={() => onNavigateToProfile(item.other_id)}
            activeOpacity={0.8}
            style={st.avatarWrap}
          >
            <Avatar uri={item.other_avatar} name={item.other_name} size={52} />
            <View
              style={[
                st.callTypeBadge,
                { backgroundColor: isVideo ? VIDEO_COLOR : VOICE_COLOR },
              ]}
            >
              <Ionicons
                name={isVideo ? "videocam" : "call"}
                size={9}
                color="#fff"
              />
            </View>
          </TouchableOpacity>

          {/* Info */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 }}>
              <Text
                style={[st.rowName, { color: isMissed ? "#FF3B30" : colors.text }]}
                numberOfLines={1}
              >
                {item.other_name}
              </Text>
              {item.other_verified && <VerifiedBadge isVerified size={13} />}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name={directionIcon as any} size={11} color={directionColor} />
              <Text
                style={[st.rowMeta, { color: isMissed ? "#FF3B30" : colors.textSecondary }]}
                numberOfLines={1}
              >
                {isMissed ? "Missed" : item.direction === "outgoing" ? "Outgoing" : "Incoming"}
                {" · "}
                {isVideo ? "Video" : "Voice"}
                {item.duration_seconds && item.duration_seconds > 0
                  ? ` · ${fmtDuration(item.duration_seconds)}`
                  : ""}
              </Text>
            </View>
          </View>

          {/* Time + chevron */}
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <Text style={[st.rowTime, { color: colors.textMuted }]}>
              {formatTimestamp(item.started_at)}
            </Text>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={13}
              color={colors.textMuted}
            />
          </View>
        </TouchableOpacity>

        {/* Quick call buttons */}
        <View style={[st.callBtnRow, { borderTopColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]}>
          <TouchableOpacity
            style={[st.callBtn, { backgroundColor: VOICE_COLOR + "15" }]}
            onPress={() => onCallBack(item, "voice")}
            disabled={!!callingId}
            activeOpacity={0.75}
          >
            {busy && item.call_type === "voice" ? (
              <ActivityIndicator size="small" color={VOICE_COLOR} />
            ) : (
              <>
                <Ionicons name="call" size={16} color={VOICE_COLOR} />
                <Text style={[st.callBtnLabel, { color: VOICE_COLOR }]}>Voice</Text>
              </>
            )}
          </TouchableOpacity>
          <View style={[st.callBtnDivider, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]} />
          <TouchableOpacity
            style={[st.callBtn, { backgroundColor: VIDEO_COLOR + "15" }]}
            onPress={() => onCallBack(item, "video")}
            disabled={!!callingId}
            activeOpacity={0.75}
          >
            {busy && item.call_type === "video" ? (
              <ActivityIndicator size="small" color={VIDEO_COLOR} />
            ) : (
              <>
                <Ionicons name="videocam" size={16} color={VIDEO_COLOR} />
                <Text style={[st.callBtnLabel, { color: VIDEO_COLOR }]}>Video</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Expandable detail panel */}
        <Animated.View
          style={[
            st.expandPanel,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "#F7F7F7",
              borderTopColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
              maxHeight: expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 180] }),
              opacity: expandAnim,
              overflow: "hidden",
            },
          ]}
        >
          <View style={st.expandInner}>
            <View style={st.expandRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
              <Text style={[st.expandText, { color: colors.textSecondary }]}>
                {formatFullTimestamp(item.started_at)}
              </Text>
            </View>
            {item.duration_seconds && item.duration_seconds > 0 ? (
              <View style={st.expandRow}>
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={[st.expandText, { color: colors.textSecondary }]}>
                  Duration: {fmtDuration(item.duration_seconds)}
                </Text>
              </View>
            ) : null}
            <View style={st.expandRow}>
              <Ionicons
                name={item.call_type === "video" ? "videocam-outline" : "call-outline"}
                size={14}
                color={colors.textMuted}
              />
              <Text style={[st.expandText, { color: colors.textSecondary }]}>
                {item.call_type === "video" ? "Video call" : "Voice call"} · {meta.label}
              </Text>
            </View>

            <View style={[st.expandActions, { borderTopColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)" }]}>
              <TouchableOpacity
                style={[st.expandBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => onNavigateToProfile(item.other_id)}
                activeOpacity={0.8}
              >
                <Ionicons name="person-outline" size={14} color={colors.text} />
                <Text style={[st.expandBtnText, { color: colors.text }]}>Profile</Text>
              </TouchableOpacity>

              {item.chat_id && (
                <TouchableOpacity
                  style={[st.expandBtn, { backgroundColor: accent + "15", borderColor: accent + "30" }]}
                  onPress={() => onNavigateToChat(item.chat_id!)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="chatbubble-outline" size={14} color={accent} />
                  <Text style={[st.expandBtnText, { color: accent }]}>Message</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[st.expandBtn, { backgroundColor: "#FF3B3012", borderColor: "#FF3B3025" }]}
                onPress={() => onDelete(item.id)}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={14} color="#FF3B30" />
                <Text style={[st.expandBtnText, { color: "#FF3B30" }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    </Swipeable>
  );
}

/* ─── Stat Card ──────────────────────────────────────────────────────────────── */

function StatPill({ card }: { card: StatCard }) {
  return (
    <View style={[st.statPill, { borderColor: card.color + "25", backgroundColor: card.color + "10" }]}>
      <View style={[st.statPillIcon, { backgroundColor: card.color + "20" }]}>
        <Ionicons name={card.icon as any} size={14} color={card.color} />
      </View>
      <View>
        <Text style={[st.statPillValue, { color: card.color }]}>{card.value}</Text>
        <Text style={st.statPillLabel}>{card.label}</Text>
      </View>
    </View>
  );
}

/* ─── Main Screen ────────────────────────────────────────────────────────────── */

export default function CallHistoryScreen() {
  const { user } = useAuth();
  const { colors, accent, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [calls, setCalls]           = useState<CallEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState<FilterTab>("all");
  const [search, setSearch]         = useState("");
  const [callingId, setCallingId]   = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<TextInput>(null);

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

  /* ── Call back ── */
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

  /* ── Delete ── */
  function deleteEntry(id: string) {
    showAlert("Remove Entry", "Remove this call from your history?", [
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

  function clearAll() {
    showAlert("Clear All History", "This will remove all calls from your history permanently.", [
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
      result = result.filter(
        (c) => c.other_name.toLowerCase().includes(q) || c.other_handle.toLowerCase().includes(q)
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
    { label: "Total",     value: String(calls.length),  icon: "call",         color: accent },
    { label: "Talk Time", value: totalDuration > 0 ? fmtTotalDuration(totalDuration) : "—", icon: "time-outline", color: "#34C759" },
    { label: "Missed",    value: String(missedCount),   icon: "call-outline", color: missedCount > 0 ? "#FF3B30" : colors.textMuted },
    { label: "Top",       value: mostCalled ? mostCalled.name.split(" ")[0] : "—", icon: "person-outline", color: "#007AFF" },
  ];

  const FILTER_TABS: Array<{ key: FilterTab; label: string; badge?: number }> = [
    { key: "all",      label: "All" },
    { key: "missed",   label: "Missed",   badge: missedCount > 0 ? missedCount : undefined },
    { key: "incoming", label: "Incoming" },
    { key: "outgoing", label: "Outgoing" },
  ];

  const headerBg = isDark ? colors.background : "#F2F2F7";
  const headerTop = insets.top;

  return (
    <View style={[st.root, { backgroundColor: isDark ? colors.background : "#F2F2F7" }]}>

      {/* ── Gradient Header ── */}
      <LinearGradient
        colors={isDark
          ? [colors.surface, colors.background]
          : ["#FFFFFF", "#F2F2F7"]
        }
        style={[st.header, { paddingTop: headerTop + 8 }]}
      >
        <View style={st.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={st.headerIcon} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>

          {showSearch ? (
            <View style={[st.searchBox, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)", flex: 1 }]}>
              <Ionicons name="search-outline" size={15} color={colors.textMuted} />
              <TextInput
                ref={searchRef}
                style={[st.searchInput, { color: colors.text }]}
                placeholder="Search by name or handle…"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                autoFocus
                returnKeyType="search"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={15} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <Text style={[st.headerTitle, { color: colors.text }]}>Recents</Text>
              {calls.length > 0 && (
                <Text style={[st.headerSub, { color: colors.textMuted }]}>
                  {calls.length} call{calls.length !== 1 ? "s" : ""}
                  {missedCount > 0 ? ` · ${missedCount} missed` : ""}
                </Text>
              )}
            </View>
          )}

          <View style={{ flexDirection: "row", gap: 4 }}>
            <TouchableOpacity
              style={[st.headerIcon, showSearch && { backgroundColor: accent + "20" }]}
              onPress={() => { setShowSearch((v) => !v); setSearch(""); }}
              hitSlop={8}
            >
              <Ionicons
                name={showSearch ? "close" : "search-outline"}
                size={19}
                color={showSearch ? accent : colors.text}
              />
            </TouchableOpacity>
            {calls.length > 0 && !showSearch && (
              <TouchableOpacity style={st.headerIcon} onPress={clearAll} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color="#FF3B30" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Stats pills */}
        {!showSearch && !loading && calls.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.statsScroll}
          >
            {stats.map((s) => <StatPill key={s.label} card={s} />)}
          </ScrollView>
        )}

        {/* Filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.tabScroll}
        >
          {FILTER_TABS.map((t) => {
            const active = filter === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[
                  st.pill,
                  active
                    ? { backgroundColor: accent, borderColor: accent }
                    : { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", borderColor: "transparent" },
                ]}
                onPress={() => setFilter(t.key)}
                activeOpacity={0.75}
              >
                <Text style={[st.pillText, { color: active ? "#fff" : colors.textSecondary }]}>
                  {t.label}
                </Text>
                {t.badge ? (
                  <View style={st.pillBadge}>
                    <Text style={st.pillBadgeText}>{t.badge > 99 ? "99+" : t.badge}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </LinearGradient>

      {/* ── Content ── */}
      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={accent} size="large" />
          <Text style={[st.loadingText, { color: colors.textMuted }]}>Loading your calls…</Text>
        </View>
      ) : groups.length === 0 ? (
        <View style={st.center}>
          <View style={[st.emptyCircle, { backgroundColor: isDark ? colors.surface : "#fff" }]}>
            <Ionicons
              name={filter === "missed" ? "call" : filter === "incoming" ? "arrow-down-outline" : filter === "outgoing" ? "arrow-up-outline" : "call-outline"}
              size={38}
              color={filter === "missed" ? "#FF3B30" : accent}
            />
          </View>
          <Text style={[st.emptyTitle, { color: colors.text }]}>
            {search.trim() ? "No results"
              : filter === "missed" ? "No missed calls"
              : filter === "incoming" ? "No incoming calls"
              : filter === "outgoing" ? "No outgoing calls"
              : "No call history yet"}
          </Text>
          <Text style={[st.emptySub, { color: colors.textMuted }]}>
            {search.trim()
              ? `Nothing matches "${search}"`
              : filter === "missed" ? "You're all caught up!"
              : "Your calls will appear here once you start making them."}
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
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: group }) => (
            <View style={{ marginTop: 20 }}>
              {/* Section header */}
              <View style={st.sectionHeader}>
                <Text style={[st.sectionLabel, { color: colors.textMuted }]}>
                  {group.label.toUpperCase()}
                </Text>
                <View style={[st.sectionLine, { backgroundColor: colors.border }]} />
                <View style={[st.sectionBadge, { backgroundColor: colors.border }]}>
                  <Text style={[st.sectionCount, { color: colors.textMuted }]}>
                    {group.data.length}
                  </Text>
                </View>
              </View>

              {/* Rows */}
              <View style={[st.groupCard, { backgroundColor: isDark ? colors.surface : "#fff", borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]}>
                {group.data.map((call, idx) => (
                  <React.Fragment key={call.id}>
                    <CallRow
                      item={call}
                      accent={accent}
                      colors={colors}
                      isDark={isDark}
                      callingId={callingId}
                      onCallBack={callBack}
                      onDelete={deleteEntry}
                      onNavigateToProfile={(id) => router.push({ pathname: "/contact/[id]", params: { id } })}
                      onNavigateToChat={(id) => router.push({ pathname: "/chat/[id]", params: { id } })}
                    />
                    {idx < group.data.length - 1 && (
                      <View style={[st.divider, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)", marginLeft: 80 }]} />
                    )}
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────────────── */

const st = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },

  /* Header */
  header: {
    paddingBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    gap: 4,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginHorizontal: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },

  /* Stats */
  statsScroll: { paddingHorizontal: 14, paddingBottom: 8, gap: 8 },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  statPillIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statPillValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statPillLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#8E8E93" },

  /* Filter pills */
  tabScroll: { paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  pillBadge: {
    backgroundColor: "#FF3B30",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  pillBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },

  /* Section headers */
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 6,
    gap: 8,
  },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth },
  sectionBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  sectionCount: { fontSize: 11, fontFamily: "Inter_500Medium" },

  /* Group card */
  groupCard: {
    marginHorizontal: 14,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },

  /* Call row */
  rowCard: { overflow: "hidden" },
  missedStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },

  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  avatarWrap: { position: "relative" },
  callTypeBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  rowName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowTime: { fontSize: 12, fontFamily: "Inter_400Regular" },

  /* Call buttons */
  callBtnRow: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  callBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  callBtnLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  callBtnDivider: { width: StyleSheet.hairlineWidth },

  /* Expand panel */
  expandPanel: { borderTopWidth: StyleSheet.hairlineWidth },
  expandInner: { padding: 14, gap: 8 },
  expandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  expandText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  expandActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexWrap: "wrap",
  },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  expandBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  /* Swipe delete */
  swipeDelete: {
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    width: 80,
    gap: 4,
  },
  swipeDeleteText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },

  divider: { height: StyleSheet.hairlineWidth },

  /* Empty state */
  emptyCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyTitle: { fontSize: 19, fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: -0.3 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
