import React, { useCallback, useEffect, useState } from "react";
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
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

type TransactionRequest = {
  id: string;
  requester_id: string;
  owner_id: string;
  currency: "nexa" | "acoin";
  amount: number;
  message: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
  requester: { handle: string; display_name: string; avatar_url: string | null; is_verified: boolean } | null;
  owner: { handle: string; display_name: string; avatar_url: string | null; is_verified: boolean } | null;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function RequestsScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [requests, setRequests] = useState<TransactionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!user) return;

    const query = tab === "incoming"
      ? supabase
          .from("transaction_requests")
          .select("*, requester:profiles!transaction_requests_requester_id_fkey(handle, display_name, avatar_url, is_verified)")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50)
      : supabase
          .from("transaction_requests")
          .select("*, owner:profiles!transaction_requests_owner_id_fkey(handle, display_name, avatar_url, is_verified)")
          .eq("requester_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

    const { data, error } = await query;
    if (error) {
      console.warn("Failed to load requests:", error.message);
    }
    setRequests((data as TransactionRequest[]) || []);
    setLoading(false);
    setRefreshing(false);
  }, [user, tab]);

  useEffect(() => {
    setLoading(true);
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`txreq-realtime:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transaction_requests", filter: `owner_id=eq.${user.id}` },
        () => loadRequests()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transaction_requests", filter: `requester_id=eq.${user.id}` },
        () => loadRequests()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, loadRequests]);

  async function handleAccept(req: TransactionRequest) {
    if (!user || !profile) return;

    const balance = profile.acoin || 0;
    if (balance < req.amount) {
      showAlert("Insufficient ACoin", `You need ${req.amount} ACoin but only have ${balance}.`);
      return;
    }

    showAlert(
      "Accept Request",
      `Send ${req.amount} ACoin to @${req.requester?.handle || "user"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept & Send",
          onPress: async () => {
            setProcessingId(req.id);

            const { error: acoinErr } = await supabase.rpc("deduct_acoin", {
              p_user_id: user.id,
              p_amount: req.amount,
            });

            if (acoinErr) {
              showAlert("Error", "Could not deduct ACoin — balance may have changed.");
              setProcessingId(null);
              return;
            }

            const { error: creditErr } = await supabase.rpc("credit_acoin", {
              p_user_id: req.requester_id,
              p_amount: req.amount,
            });

            if (creditErr) {
              await supabase.rpc("credit_acoin", { p_user_id: user.id, p_amount: req.amount });
              showAlert("Error", "Could not credit requester. Your ACoin has been refunded.");
              setProcessingId(null);
              return;
            }

            const { error: logErr } = await supabase.from("acoin_transactions").insert([
              {
                user_id: user.id,
                amount: -req.amount,
                transaction_type: "acoin_transfer_sent",
                metadata: { to_handle: req.requester?.handle, request_id: req.id },
              },
              {
                user_id: req.requester_id,
                amount: req.amount,
                transaction_type: "acoin_transfer_received",
                metadata: { from_handle: profile.handle, request_id: req.id },
              },
            ]);
            if (logErr) console.warn("ACoin transfer succeeded but log failed:", logErr.message);

            const { error: statusErr } = await supabase
              .from("transaction_requests")
              .update({ status: "accepted" })
              .eq("id", req.id)
              .eq("status", "pending");

            if (statusErr) {
              showAlert("Warning", "Payment sent but request status could not be updated.");
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showAlert("Sent!", `${req.amount} ACoin sent to @${req.requester?.handle}`);
            refreshProfile();
            loadRequests();
            setProcessingId(null);
          },
        },
      ]
    );
  }

  async function handleDecline(req: TransactionRequest) {
    showAlert(
      "Decline Request",
      `Decline the ${req.amount} ACoin request from @${req.requester?.handle || "user"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            setProcessingId(req.id);
            await supabase
              .from("transaction_requests")
              .update({ status: "declined" })
              .eq("id", req.id);

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            loadRequests();
            setProcessingId(null);
          },
        },
      ]
    );
  }

  async function handleCancel(req: TransactionRequest) {
    setProcessingId(req.id);
    await supabase
      .from("transaction_requests")
      .update({ status: "cancelled" })
      .eq("id", req.id);
    loadRequests();
    setProcessingId(null);
  }

  const statusColor = (s: string) => {
    switch (s) {
      case "pending": return "#FF9500";
      case "accepted": return "#34C759";
      case "declined": return "#FF3B30";
      case "cancelled": return "#8E8E93";
      case "expired": return "#8E8E93";
      default: return "#8E8E93";
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Payment Requests</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === "incoming" && { backgroundColor: Colors.brand }]}
          onPress={() => setTab("incoming")}
        >
          <Text style={[styles.tabText, tab === "incoming" && { color: "#fff" }]}>
            Incoming{pendingCount > 0 && tab === "incoming" ? ` (${pendingCount})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "outgoing" && { backgroundColor: Colors.brand }]}
          onPress={() => setTab("outgoing")}
        >
          <Text style={[styles.tabText, tab === "outgoing" && { color: "#fff" }]}>Sent</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const person = tab === "incoming" ? item.requester : item.owner;
            const isPending = item.status === "pending";
            const isProcessing = processingId === item.id;

            return (
              <View style={[styles.reqCard, { backgroundColor: colors.surface }]}>
                <View style={styles.reqHeader}>
                  {person?.avatar_url ? (
                    <Image source={{ uri: person.avatar_url }} style={styles.reqAvatar} />
                  ) : (
                    <View style={[styles.reqAvatar, { backgroundColor: colors.inputBg, justifyContent: "center", alignItems: "center" }]}>
                      <Text style={{ fontSize: 14, color: colors.text }}>{(person?.display_name || "?")[0].toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={[styles.reqName, { color: colors.text }]} numberOfLines={1}>
                        {person?.display_name || "Unknown"}
                      </Text>
                      {person?.is_verified && <Ionicons name="checkmark-circle" size={14} color={Colors.brand} />}
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      @{person?.handle || "?"} · {timeAgo(item.created_at)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="diamond" size={14} color={Colors.gold} />
                      <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.text }}>{item.amount}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: Colors.gold }}>ACoin</Text>
                  </View>
                </View>

                {item.message && (
                  <View style={[styles.reqMsgBox, { backgroundColor: colors.inputBg }]}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>"{item.message}"</Text>
                  </View>
                )}

                {tab === "incoming" && isPending && !isProcessing && (
                  <View style={styles.reqActions}>
                    <TouchableOpacity
                      style={[styles.reqActionBtn, { backgroundColor: "rgba(255,59,48,0.1)" }]}
                      onPress={() => handleDecline(item)}
                    >
                      <Ionicons name="close" size={18} color="#FF3B30" />
                      <Text style={{ color: "#FF3B30", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.reqActionBtn, { backgroundColor: Colors.brand }]}
                      onPress={() => handleAccept(item)}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {tab === "outgoing" && isPending && !isProcessing && (
                  <TouchableOpacity
                    style={[styles.reqActionBtn, { backgroundColor: "rgba(142,142,147,0.1)", alignSelf: "flex-end" }]}
                    onPress={() => handleCancel(item)}
                  >
                    <Ionicons name="close-circle-outline" size={16} color="#8E8E93" />
                    <Text style={{ color: "#8E8E93", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Cancel</Text>
                  </TouchableOpacity>
                )}

                {isProcessing && (
                  <View style={{ paddingVertical: 8, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={Colors.brand} />
                  </View>
                )}

                {!isPending && (
                  <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + "15" }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
                    <Text style={{ color: statusColor(item.status), fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" }}>
                      {item.status}
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90, gap: 10, paddingTop: 8 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadRequests(); }}
              tintColor={Colors.brand}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 12, fontFamily: "Inter_400Regular" }}>
                {tab === "incoming" ? "No incoming requests" : "No sent requests"}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  tabRow: { flexDirection: "row", marginHorizontal: 16, marginTop: 12, marginBottom: 4, gap: 8 },
  tab: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: "transparent" },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#888" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 60 },
  reqCard: { borderRadius: 16, padding: 16, gap: 12 },
  reqHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  reqAvatar: { width: 42, height: 42, borderRadius: 21 },
  reqName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  reqMsgBox: { borderRadius: 10, padding: 10 },
  reqActions: { flexDirection: "row", gap: 10 },
  reqActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
});
