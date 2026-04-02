import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
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
import { hasPIN, isBiometricEnabled, verifyPIN } from "@/lib/appLock";

let LocalAuthentication: typeof import("expo-local-authentication") | null = null;
if (Platform.OS !== "web") {
  try {
    LocalAuthentication = require("expo-local-authentication");
  } catch {}
}

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

const PIN_LENGTH = 4;
const PIN_KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

function PINVerifyModal({
  visible,
  onVerified,
  onCancel,
  colors,
}: {
  visible: boolean;
  onVerified: () => void;
  onCancel: () => void;
  colors: any;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!visible) { setPin(""); setError(false); }
  }, [visible]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      verifyPIN(pin).then((ok) => {
        if (ok) {
          onVerified();
          setPin("");
        } else {
          setError(true);
          setShake(true);
          setTimeout(() => { setShake(false); setPin(""); setError(false); }, 600);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      });
    }
  }, [pin, onVerified]);

  function pressKey(k: string) {
    if (k === "⌫") {
      setPin((p) => p.slice(0, -1));
    } else if (k === "") {
      // empty spacer
    } else if (pin.length < PIN_LENGTH) {
      setPin((p) => p + k);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={pinStyles.overlay}>
        <View style={[pinStyles.sheet, { backgroundColor: colors.surface }]}>
          <View style={pinStyles.lockIcon}>
            <Ionicons name="lock-closed" size={28} color={colors.accent} />
          </View>
          <Text style={[pinStyles.title, { color: colors.text }]}>Security Verification</Text>
          <Text style={[pinStyles.sub, { color: colors.textMuted }]}>Enter your PIN to confirm this transaction</Text>

          <View style={pinStyles.dotsRow}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  pinStyles.dot,
                  {
                    backgroundColor: i < pin.length
                      ? (error ? "#FF3B30" : colors.accent)
                      : colors.inputBg,
                    borderColor: i < pin.length
                      ? (error ? "#FF3B30" : colors.accent)
                      : colors.border,
                    transform: shake ? [{ translateX: (i % 2 === 0 ? -4 : 4) }] : [],
                  },
                ]}
              />
            ))}
          </View>

          {error && (
            <Text style={pinStyles.errorText}>Incorrect PIN. Try again.</Text>
          )}

          <View style={pinStyles.keypad}>
            {PIN_KEYS.map((k, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  pinStyles.key,
                  { backgroundColor: k === "" ? "transparent" : colors.backgroundSecondary },
                  k === "⌫" && { backgroundColor: "transparent" },
                ]}
                onPress={() => pressKey(k)}
                disabled={k === ""}
                activeOpacity={0.7}
              >
                <Text style={[
                  pinStyles.keyText,
                  { color: k === "⌫" ? colors.textSecondary : colors.text },
                  k === "" && { color: "transparent" },
                ]}>
                  {k}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={pinStyles.cancelBtn} onPress={onCancel}>
            <Text style={{ color: "#FF3B30", fontSize: 15, fontFamily: "Inter_600SemiBold" }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
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
  const [sentUpdated, setSentUpdated] = useState(false);
  const [showPINModal, setShowPINModal] = useState(false);
  const pendingAcceptRef = useRef<TransactionRequest | null>(null);

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
        { event: "UPDATE", schema: "public", table: "transaction_requests", filter: `requester_id=eq.${user.id}` },
        (payload: any) => {
          loadRequests();
          if (payload.new?.status && payload.new.status !== "pending") {
            setSentUpdated(true);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, loadRequests]);

  async function verifyIdentity(): Promise<boolean> {
    if (Platform.OS === "web") return true;

    const bioEnabled = await isBiometricEnabled();
    if (bioEnabled && LocalAuthentication) {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (hasHardware && enrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: "Verify to confirm transaction",
            cancelLabel: "Use PIN",
            disableDeviceFallback: false,
          });
          if (result.success) return true;
        }
      } catch {}
    }

    const pinSet = await hasPIN();
    if (pinSet) {
      return new Promise((resolve) => {
        pendingAcceptRef.current = pendingAcceptRef.current;
        setShowPINModal(true);
        (pendingAcceptRef as any)._pinResolve = resolve;
      });
    }

    return true;
  }

  function onPINVerified() {
    setShowPINModal(false);
    const resolve = (pendingAcceptRef as any)._pinResolve;
    if (resolve) { resolve(true); (pendingAcceptRef as any)._pinResolve = null; }
  }

  function onPINCancel() {
    setShowPINModal(false);
    const resolve = (pendingAcceptRef as any)._pinResolve;
    if (resolve) { resolve(false); (pendingAcceptRef as any)._pinResolve = null; }
  }

  async function executeAccept(req: TransactionRequest) {
    setProcessingId(req.id);

    const { error: acoinErr } = await supabase.rpc("deduct_acoin", {
      p_user_id: user!.id,
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
      await supabase.rpc("credit_acoin", { p_user_id: user!.id, p_amount: req.amount });
      showAlert("Error", "Could not credit requester. Your ACoin has been refunded.");
      setProcessingId(null);
      return;
    }

    const { error: logErr } = await supabase.from("acoin_transactions").insert([
      {
        user_id: user!.id,
        amount: -req.amount,
        transaction_type: "acoin_transfer_sent",
        metadata: { to_handle: req.requester?.handle, request_id: req.id },
      },
      {
        user_id: req.requester_id,
        amount: req.amount,
        transaction_type: "acoin_transfer_received",
        metadata: { from_handle: profile!.handle, request_id: req.id },
      },
    ]);
    if (logErr) console.warn("ACoin transfer succeeded but log failed:", logErr.message);

    const { error: statusErr } = await supabase
      .from("transaction_requests")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", req.id)
      .eq("status", "pending");

    if (statusErr) {
      showAlert("Warning", "Payment sent but request status could not be updated.");
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refreshProfile();
    loadRequests();
    setProcessingId(null);
  }

  async function handleAccept(req: TransactionRequest) {
    if (!user || !profile) return;

    const balance = profile.acoin || 0;
    if (balance < req.amount) {
      showAlert("Insufficient ACoin", `You need ${req.amount} ACoin but only have ${balance}.`);
      return;
    }

    pendingAcceptRef.current = req;
    const verified = await verifyIdentity();
    if (!verified) return;

    await executeAccept(req);
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
              .update({ status: "declined", responded_at: new Date().toISOString() })
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

  const statusLabel = (s: string) => {
    switch (s) {
      case "accepted": return "Completed";
      case "declined": return "Declined";
      case "cancelled": return "Cancelled";
      case "expired": return "Expired";
      default: return s;
    }
  };

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

  const statusIcon = (s: string): React.ComponentProps<typeof Ionicons>["name"] => {
    switch (s) {
      case "accepted": return "checkmark-circle";
      case "declined": return "close-circle";
      case "cancelled": return "remove-circle";
      case "expired": return "time";
      default: return "ellipse";
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <PINVerifyModal
        visible={showPINModal}
        onVerified={onPINVerified}
        onCancel={onPINCancel}
        colors={colors}
      />

      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Payment Requests</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === "incoming" && { backgroundColor: colors.accent }]}
          onPress={() => setTab("incoming")}
        >
          <Text style={[styles.tabText, tab === "incoming" && { color: "#fff" }]}>
            Incoming{pendingCount > 0 && tab === "incoming" ? ` (${pendingCount})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "outgoing" && { backgroundColor: colors.accent }]}
          onPress={() => { setTab("outgoing"); setSentUpdated(false); }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.tabText, tab === "outgoing" && { color: "#fff" }]}>Sent</Text>
            {sentUpdated && tab !== "outgoing" && (
              <View style={styles.sentDot} />
            )}
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const person = tab === "incoming" ? item.requester : item.owner;
            const isPending = item.status === "pending";
            const isAccepted = item.status === "accepted";
            const isProcessing = processingId === item.id;

            return (
              <View style={[
                styles.reqCard,
                { backgroundColor: colors.surface },
                isAccepted && { borderLeftWidth: 3, borderLeftColor: "#34C759" },
              ]}>
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
                      {person?.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.accent} />}
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
                      style={[styles.reqActionBtn, { backgroundColor: colors.accent }]}
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
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>Processing…</Text>
                  </View>
                )}

                {!isPending && !isProcessing && (
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: statusColor(item.status) + "18" },
                    isAccepted && styles.completedBadge,
                  ]}>
                    <Ionicons
                      name={statusIcon(item.status)}
                      size={14}
                      color={statusColor(item.status)}
                    />
                    <Text style={{
                      color: statusColor(item.status),
                      fontSize: 13,
                      fontFamily: "Inter_700Bold",
                    }}>
                      {statusLabel(item.status)}
                    </Text>
                    {isAccepted && item.responded_at && (
                      <Text style={{ color: colors.textMuted, fontSize: 11, marginLeft: "auto" as any }}>
                        {timeAgo(item.responded_at)}
                      </Text>
                    )}
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
              tintColor={colors.accent}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
    backgroundColor: "rgba(142,142,147,0.12)",
  },
  tabText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#8E8E93",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
  },
  reqCard: {
    borderRadius: 16,
    padding: 14,
    gap: 10,
    overflow: "hidden",
  },
  reqHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reqAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  reqName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  reqMsgBox: {
    borderRadius: 10,
    padding: 10,
  },
  reqActions: {
    flexDirection: "row",
    gap: 8,
  },
  reqActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  completedBadge: {
    borderWidth: 1,
    borderColor: "#34C75920",
  },
  sentDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
  },
});

const pinStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  lockIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.brand + "18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  sub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 24,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 8,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginTop: 16,
    width: "100%",
    maxWidth: 280,
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: {
    fontSize: 24,
    fontFamily: "Inter_500Medium",
  },
  cancelBtn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
});
