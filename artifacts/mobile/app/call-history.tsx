import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
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

type DateGroup = { label: string; data: CallEntry[] };

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7)  return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: days > 365 ? "numeric" : undefined });
}

function groupByDate(calls: CallEntry[]): DateGroup[] {
  const now = new Date();
  const todayStr     = now.toDateString();
  const yesterdayStr = new Date(now.getTime() - 86400000).toDateString();
  const weekAgo      = now.getTime() - 7 * 86400000;

  const buckets: Record<string, CallEntry[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Earlier: [],
  };

  for (const c of calls) {
    const d = new Date(c.started_at);
    const ds = d.toDateString();
    if (ds === todayStr) buckets["Today"].push(c);
    else if (ds === yesterdayStr) buckets["Yesterday"].push(c);
    else if (d.getTime() >= weekAgo) buckets["This week"].push(c);
    else buckets["Earlier"].push(c);
  }

  return Object.entries(buckets)
    .filter(([, data]) => data.length > 0)
    .map(([label, data]) => ({ label, data }));
}

function statusMeta(entry: CallEntry): { color: string; label: string; icon: string } {
  const { status, direction, call_type } = entry;
  if (status === "missed")   return { color: "#FF3B30", label: "Missed",   icon: call_type === "video" ? "videocam" : "call" };
  if (status === "declined") return { color: "#FF9500", label: "Declined", icon: call_type === "video" ? "videocam" : "call" };
  if (status === "busy")     return { color: "#FF9500", label: "Busy",     icon: call_type === "video" ? "videocam" : "call" };
  if (status === "ended" && direction === "outgoing") return { color: "#34C759", label: "Outgoing", icon: call_type === "video" ? "videocam-outline" : "call-outline" };
  if (status === "ended" && direction === "incoming") return { color: "#34C759", label: "Incoming", icon: call_type === "video" ? "videocam-outline" : "call-outline" };
  return { color: "#8E8E93", label: "Cancelled", icon: "call-outline" };
}

/* ─── Main screen ─────────────────────────────────────────────────────────── */

type FilterTab = "all" | "missed";

export default function CallHistoryScreen() {
  const { user } = useAuth();
  const { colors, accent, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [calls, setCalls]         = useState<CallEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]       = useState<FilterTab>("all");
  const [callingId, setCallingId] = useState<string | null>(null);

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
      .limit(200);

    if (data) {
      const mapped: CallEntry[] = (data as any[]).map((c) => {
        const isCaller  = c.caller_id === user.id;
        const other     = isCaller ? c.callee : c.caller;
        return {
          id:               c.id,
          call_type:        c.call_type,
          status:           c.status,
          started_at:       c.started_at,
          answered_at:      c.answered_at || null,
          ended_at:         c.ended_at || null,
          duration_seconds: c.duration_seconds || null,
          caller_id:        c.caller_id,
          callee_id:        c.callee_id,
          chat_id:          c.chat_id || null,
          other_id:         isCaller ? c.callee_id : c.caller_id,
          other_name:       other?.display_name || "Unknown",
          other_handle:     other?.handle || "",
          other_avatar:     other?.avatar_url || null,
          other_verified:   !!other?.is_verified,
          direction:        isCaller ? "outgoing" : "incoming",
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
        calleeId:  entry.other_id,
        chatId:    entry.chat_id || undefined,
        callType:  type,
        callerId:  user.id,
      });
      router.push({ pathname: "/call/[id]", params: { id: callId } });
    } catch {
      /* ignore */
    }
    setCallingId(null);
  }

  /* ── Data for display ── */
  const displayed = filter === "missed"
    ? calls.filter((c) => c.status === "missed")
    : calls;

  const groups = groupByDate(displayed);
  const missedCount = calls.filter((c) => c.status === "missed" && c.direction === "incoming").length;

  /* ─── Row ────────────────────────────────────────────────────────────────── */
  function CallRow({ item }: { item: CallEntry }) {
    const meta     = statusMeta(item);
    const isMissed = item.status === "missed";
    const isVideo  = item.call_type === "video";
    const busy     = callingId === item.id;

    return (
      <TouchableOpacity
        style={[st.row, { backgroundColor: colors.surface }]}
        onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.other_id } })}
        activeOpacity={0.75}
      >
        {/* Avatar */}
        <Avatar uri={item.other_avatar} name={item.other_name} size={46} />

        {/* Name + meta */}
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text
              style={[st.rowName, { color: isMissed ? "#FF3B30" : colors.text }]}
              numberOfLines={1}
            >
              {item.other_name}
            </Text>
            {item.other_verified && <VerifiedBadge isVerified size={13} />}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Ionicons
              name={
                item.direction === "outgoing"
                  ? (isVideo ? "videocam-outline" : "call-outline")
                  : isMissed
                    ? (isVideo ? "videocam" : "call")
                    : (isVideo ? "videocam-outline" : "call-outline")
              }
              size={13}
              color={meta.color}
            />
            <Text style={[st.rowMeta, { color: isMissed ? "#FF3B30" : colors.textMuted }]}>
              {item.direction === "outgoing" ? "Outgoing" : meta.label}
              {isVideo ? " · Video" : " · Voice"}
              {item.duration_seconds && item.duration_seconds > 0
                ? ` · ${formatDuration(item.duration_seconds)}`
                : ""}
            </Text>
          </View>
          <Text style={[st.rowTime, { color: colors.textMuted }]}>
            {formatTime(item.started_at)}
          </Text>
        </View>

        {/* Call back button */}
        <TouchableOpacity
          style={[
            st.callBtn,
            { backgroundColor: (isVideo ? "#007AFF" : "#34C759") + "1A" },
          ]}
          onPress={() => callBack(item, item.call_type)}
          disabled={!!callingId}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          {busy
            ? <ActivityIndicator size="small" color={isVideo ? "#007AFF" : "#34C759"} />
            : <Ionicons
                name={isVideo ? "videocam" : "call"}
                size={18}
                color={isVideo ? "#007AFF" : "#34C759"}
              />}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={[st.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={st.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[st.headerTitle, { color: colors.text }]}>Calls</Text>
        </View>
        {/* Spacer to keep title centred */}
        <View style={st.headerBtn} />
      </View>

      {/* ── Filter tabs ── */}
      <View style={[st.tabRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(["all", "missed"] as FilterTab[]).map((t) => {
          const active = filter === t;
          return (
            <TouchableOpacity
              key={t}
              style={[st.tab, active && { borderBottomColor: accent, borderBottomWidth: 2.5 }]}
              onPress={() => setFilter(t)}
              activeOpacity={0.7}
            >
              <Text style={[st.tabText, { color: active ? accent : colors.textMuted }]}>
                {t === "all" ? "All Calls" : "Missed"}
              </Text>
              {t === "missed" && missedCount > 0 && (
                <View style={[st.tabBadge, { backgroundColor: "#FF3B30" }]}>
                  <Text style={st.tabBadgeText}>{missedCount > 99 ? "99+" : missedCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Content ── */}
      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={accent} size="large" />
        </View>
      ) : groups.length === 0 ? (
        <View style={st.center}>
          <Ionicons name="call-outline" size={56} color={colors.textMuted} />
          <Text style={[st.emptyTitle, { color: colors.text }]}>
            {filter === "missed" ? "No missed calls" : "No call history"}
          </Text>
          <Text style={[st.emptySub, { color: colors.textMuted }]}>
            {filter === "missed"
              ? "You're all caught up!"
              : "Your call history will appear here."}
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
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: group }) => (
            <View>
              {/* Section label */}
              <View style={[st.sectionLabel, { backgroundColor: colors.backgroundSecondary }]}>
                <Text style={[st.sectionText, { color: colors.textMuted }]}>{group.label}</Text>
              </View>
              {/* Rows */}
              {group.data.map((call, idx) => (
                <View key={call.id}>
                  <CallRow item={call} />
                  {idx < group.data.length - 1 && (
                    <View style={[st.divider, { backgroundColor: colors.border, marginLeft: 74 }]} />
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

const st = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", fontWeight: "700" },

  tabRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2.5,
    borderBottomColor: "transparent",
  },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabBadge: {
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },

  sectionLabel: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  sectionText: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowTime: { fontSize: 11, fontFamily: "Inter_400Regular" },

  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  divider: { height: StyleSheet.hairlineWidth },

  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
});
