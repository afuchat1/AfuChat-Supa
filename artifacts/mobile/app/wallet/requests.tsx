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
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { hasPIN, isBiometricEnabled, verifyPIN } from "@/lib/appLock";

let LocalAuthentication: typeof import("expo-local-authentication") | null = null;
if (Platform.OS !== "web") {
  try { LocalAuthentication = require("expo-local-authentication"); } catch {}
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

function PINVerifyModal({ visible, onVerified, onCancel, colors }: {
  visible: boolean; onVerified: () => void; onCancel: () => void; colors: any;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => { if (!visible) { setPin(""); setError(false); } }, [visible]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      verifyPIN(pin).then((ok) => {
        if (ok) { onVerified(); setPin(""); }
        else {
          setError(true); setShake(true);
          setTimeout(() => { setShake(false); setPin(""); setError(false); }, 600);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      });
    }
  }, [pin, onVerified]);

  function pressKey(k: string) {
    if (k === "⌫") setPin((p) => p.slice(0, -1));
    else if (k === "") {}
    else if (pin.length < PIN_LENGTH) setPin((p) => p + k);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={pin_s.overlay}>
        <View style={[pin_s.sheet, { backgroundColor: colors.surface }]}>
          <View style={[pin_s.lockWrap, { backgroundColor: Colors.brand + "15" }]}>
            <Ionicons name="lock-closed" size={28} color={Colors.brand} />
          </View>
          <Text style={[pin_s.title, { color: colors.text }]}>Security Verification</Text>
          <Text style={[pin_s.sub, { color: colors.textMuted }]}>Enter your PIN to confirm this transaction</Text>
          <View style={pin_s.dotsRow}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View key={i} style={[
                pin_s.dot,
                {
                  backgroundColor: i < pin.length ? (error ? "#FF3B30" : Colors.brand) : colors.inputBg,
                  borderColor: i < pin.length ? (error ? "#FF3B30" : Colors.brand) : colors.border,
                  transform: shake ? [{ translateX: (i % 2 === 0 ? -5 : 5) }] : [],
                },
              ]} />
            ))}
          </View>
          {error && <Text style={pin_s.errorText}>Incorrect PIN. Try again.</Text>}
          <View style={pin_s.keypad}>
            {PIN_KEYS.map((k, i) => (
              <TouchableOpacity
                key={i}
                style={[pin_s.key, { backgroundColor: k === "" || k === "⌫" ? "transparent" : colors.backgroundSecondary }]}
                onPress={() => pressKey(k)} disabled={k === ""} activeOpacity={0.7}
              >
                <Text style={[pin_s.keyText, { color: k === "⌫" ? colors.textSecondary : colors.text }]}>
                  {k}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={pin_s.cancelBtn} onPress={onCancel}>
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
      ? supabase.from("transaction_requests")
          .select("*, requester:profiles!transaction_requests_requester_id_fkey(handle, display_name, avatar_url, is_verified)")
          .eq("owner_id", user.id).order("created_at", { ascending: false }).limit(50)
      : supabase.from("transaction_requests")
          .select("*, owner:profiles!transaction_requests_owner_id_fkey(handle, display_name, avatar_url, is_verified)")
          .eq("requester_id", user.id).order("created_at", { ascending: false }).limit(50);
    try {
      const { data, error } = await query;
      if (error) console.warn("Failed to load requests:", error.message);
      setRequests((data as TransactionRequest[]) || []);
    } catch (_) {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, tab]);

  useEffect(() => { setLoading(true); loadRequests(); }, [loadRequests]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`txreq-realtime:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transaction_requests", filter: `owner_id=eq.${user.id}` }, () => loadRequests())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "transaction_requests", filter: `requester_id=eq.${user.id}` }, (payload: any) => {
        loadRequests();
        if (payload.new?.status && payload.new.status !== "pending") setSentUpdated(true);
      })
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
          const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Verify to confirm transaction", cancelLabel: "Use PIN", disableDeviceFallback: false });
          if (result.success) return true;
        }
      } catch {}
    }
    const pinSet = await hasPIN();
    if (pinSet) {
      return new Promise((resolve) => {
        setShowPINModal(true);
        (pendingAcceptRef as any)._pinResolve = resolve;
      });
    }
    return true;
  }

  function onPINVerified() { setShowPINModal(false); const resolve = (pendingAcceptRef as any)._pinResolve; if (resolve) { resolve(true); (pendingAcceptRef as any)._pinResolve = null; } }
  function onPINCancel() { setShowPINModal(false); const resolve = (pendingAcceptRef as any)._pinResolve; if (resolve) { resolve(false); (pendingAcceptRef as any)._pinResolve = null; } }

  async function executeAccept(req: TransactionRequest) {
    setProcessingId(req.id);
    const { error: acoinErr } = await supabase.rpc("deduct_acoin", { p_user_id: user!.id, p_amount: req.amount });
    if (acoinErr) { showAlert("Error", "Could not deduct ACoin — balance may have changed."); setProcessingId(null); return; }
    const { error: creditErr } = await supabase.rpc("credit_acoin", { p_user_id: req.requester_id, p_amount: req.amount });
    if (creditErr) { await supabase.rpc("credit_acoin", { p_user_id: user!.id, p_amount: req.amount }); showAlert("Error", "Could not credit requester. Your ACoin has been refunded."); setProcessingId(null); return; }
    await supabase.from("acoin_transactions").insert([
      { user_id: user!.id, amount: -req.amount, transaction_type: "acoin_transfer_sent", metadata: { to_handle: req.requester?.handle, request_id: req.id } },
      { user_id: req.requester_id, amount: req.amount, transaction_type: "acoin_transfer_received", metadata: { from_handle: profile!.handle, request_id: req.id } },
    ]);
    await supabase.from("transaction_requests").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", req.id).eq("status", "pending");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refreshProfile();
    loadRequests();
    setProcessingId(null);
  }

  async function handleAccept(req: TransactionRequest) {
    if (!user || !profile) return;
    const balance = profile.acoin || 0;
    if (balance < req.amount) { showAlert("Insufficient ACoin", `You need ${req.amount} ACoin but only have ${balance}.`); return; }
    pendingAcceptRef.current = req;
    const verified = await verifyIdentity();
    if (!verified) return;
    await executeAccept(req);
  }

  async function handleDecline(req: TransactionRequest) {
    showAlert("Decline Request", `Decline the ${req.amount} ACoin request from @${req.requester?.handle || "user"}?`,
      [{ text: "Cancel", style: "cancel" }, {
        text: "Decline", style: "destructive",
        onPress: async () => {
          setProcessingId(req.id);
          await supabase.from("transaction_requests").update({ status: "declined", responded_at: new Date().toISOString() }).eq("id", req.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          loadRequests(); setProcessingId(null);
        },
      }]);
  }

  async function handleCancel(req: TransactionRequest) {
    setProcessingId(req.id);
    await supabase.from("transaction_requests").update({ status: "cancelled" }).eq("id", req.id);
    loadRequests(); setProcessingId(null);
  }

  const statusLabel = (s: string) => ({ accepted: "Completed", declined: "Declined", cancelled: "Cancelled", expired: "Expired" }[s] || s);
  const statusColor = (s: string) => ({ pending: "#FF9500", accepted: "#34C759", declined: "#FF3B30", cancelled: "#8E8E93", expired: "#8E8E93" }[s] || "#8E8E93");
  const statusIcon = (s: string): React.ComponentProps<typeof Ionicons>["name"] => ({ accepted: "checkmark-circle" as const, declined: "close-circle" as const, cancelled: "remove-circle" as const, expired: "time" as const }[s] || "ellipse" as const);

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  function Avatar({ person }: { person: any }) {
    if (person?.avatar_url) {
      return <Image source={{ uri: person.avatar_url }} style={styles.avatar} />;
    }
    return (
      <View style={[styles.avatar, { backgroundColor: Colors.brand + "20", alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ fontSize: 15, color: Colors.brand, fontFamily: "Inter_700Bold" }}>
          {(person?.display_name || "?")[0].toUpperCase()}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <PINVerifyModal visible={showPINModal} onVerified={onPINVerified} onCancel={onPINCancel} colors={colors} />

      {/* Header */}
      <LinearGradient colors={["#0C2A2E", "#061518"]} style={[styles.gradHeader, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.gradTitle}>Payment Requests</Text>
          {pendingCount > 0 && (
            <Text style={styles.gradSub}>{pendingCount} pending {pendingCount === 1 ? "request" : "requests"}</Text>
          )}
        </View>
      </LinearGradient>

      {/* Tab switcher */}
      <View style={[styles.tabRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {([["incoming", "Incoming", pendingCount] as const, ["outgoing", "Sent", 0] as const]).map(([key, label, badge]) => {
          const active = tab === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tab, active && { borderBottomColor: Colors.brand }]}
              onPress={() => { setTab(key); if (key === "outgoing") setSentUpdated(false); }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.tabText, { color: active ? Colors.brand : colors.textMuted, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" }]}>
                  {label}
                </Text>
                {badge > 0 && tab !== key && (
                  <View style={[styles.tabBadge, { backgroundColor: Colors.brand }]}>
                    <Text style={styles.tabBadgeText}>{badge > 9 ? "9+" : badge}</Text>
                  </View>
                )}
                {key === "outgoing" && sentUpdated && tab !== key && (
                  <View style={[styles.tabBadge, { backgroundColor: "#FF9500", width: 8, minWidth: 8, padding: 0 }]} />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadRequests(); }} tintColor={Colors.brand} />
          }
          renderItem={({ item }) => {
            const person = tab === "incoming" ? item.requester : item.owner;
            const isPending = item.status === "pending";
            const isAccepted = item.status === "accepted";
            const isProcessing = processingId === item.id;
            const sColor = statusColor(item.status);

            return (
              <View style={[styles.reqCard, { backgroundColor: colors.surface }, isAccepted && { borderLeftWidth: 3, borderLeftColor: "#34C759" }]}>
                {/* Card header */}
                <View style={styles.reqTop}>
                  <Avatar person={person} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={[styles.reqName, { color: colors.text }]} numberOfLines={1}>{person?.display_name || "Unknown"}</Text>
                      {person?.is_verified && <Ionicons name="checkmark-circle" size={14} color={Colors.brand} />}
                    </View>
                    <Text style={[styles.reqHandle, { color: colors.textMuted }]}>@{person?.handle || "?"} · {timeAgo(item.created_at)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.reqAmount, { color: colors.text }]}>{item.amount.toLocaleString()}</Text>
                    <Text style={[styles.reqCurrency, { color: Colors.gold }]}>ACoin</Text>
                  </View>
                </View>

                {/* Message */}
                {item.message && (
                  <View style={[styles.msgBox, { backgroundColor: colors.inputBg }]}>
                    <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} />
                    <Text style={[styles.msgText, { color: colors.textSecondary }]} numberOfLines={2}>"{item.message}"</Text>
                  </View>
                )}

                {/* Actions */}
                {tab === "incoming" && isPending && !isProcessing && (
                  <View style={styles.actions}>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#FF3B3012", borderColor: "#FF3B3030" }]} onPress={() => handleDecline(item)} activeOpacity={0.8}>
                      <Ionicons name="close" size={16} color="#FF3B30" />
                      <Text style={[styles.actionBtnText, { color: "#FF3B30" }]}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.brand, flex: 1.5 }]} onPress={() => handleAccept(item)} activeOpacity={0.85}>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={[styles.actionBtnText, { color: "#fff" }]}>Accept · {item.amount} ACoin</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {tab === "outgoing" && isPending && !isProcessing && (
                  <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => handleCancel(item)} activeOpacity={0.8}>
                    <Ionicons name="close-circle-outline" size={15} color={colors.textMuted} />
                    <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel Request</Text>
                  </TouchableOpacity>
                )}

                {isProcessing && (
                  <View style={styles.processingRow}>
                    <ActivityIndicator size="small" color={Colors.brand} />
                    <Text style={[styles.processingText, { color: colors.textMuted }]}>Processing…</Text>
                  </View>
                )}

                {!isPending && !isProcessing && (
                  <View style={[styles.statusRow, { backgroundColor: sColor + "12" }]}>
                    <Ionicons name={statusIcon(item.status)} size={15} color={sColor} />
                    <Text style={[styles.statusText, { color: sColor }]}>{statusLabel(item.status)}</Text>
                    {item.responded_at && (
                      <Text style={[styles.statusTime, { color: colors.textMuted }]}>{timeAgo(item.responded_at)}</Text>
                    )}
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name="receipt-outline" size={40} color={colors.textMuted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {tab === "incoming" ? "No incoming requests" : "No sent requests"}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                {tab === "incoming"
                  ? "When someone requests ACoin from you, it'll appear here."
                  : "Requests you send to others will appear here."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  gradHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 18, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  gradTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  gradSub: { fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "Inter_400Regular", marginTop: 2 },

  tabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: "center", paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 14 },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  tabBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },

  avatar: { width: 46, height: 46, borderRadius: 23, flexShrink: 0 },
  reqCard: { borderRadius: 18, padding: 16, gap: 12, ...Platform.select({ web: { boxShadow: "0 1px 6px rgba(0,0,0,0.04)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 } }) },
  reqTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  reqName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  reqHandle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  reqAmount: { fontSize: 20, fontFamily: "Inter_700Bold" },
  reqCurrency: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  msgBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 10 },
  msgText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, fontStyle: "italic" },

  actions: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: "transparent" },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },

  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignSelf: "flex-end", paddingHorizontal: 14 },
  cancelBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  processingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10 },
  processingText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  statusText: { fontSize: 13, fontFamily: "Inter_700Bold", flex: 1 },
  statusTime: { fontSize: 11, fontFamily: "Inter_400Regular" },

  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});

// ─── PIN modal styles ──────────────────────────────────────────────────────────

const pin_s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "flex-end" },
  sheet: { width: "100%", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 40, alignItems: "center" },
  lockWrap: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 6 },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 28 },
  dotsRow: { flexDirection: "row", gap: 14, marginBottom: 8 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
  errorText: { fontSize: 13, color: "#FF3B30", fontFamily: "Inter_500Medium", marginBottom: 8 },
  keypad: { flexDirection: "row", flexWrap: "wrap", width: 280, gap: 12, marginTop: 20, marginBottom: 16 },
  key: { width: 80, height: 60, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  keyText: { fontSize: 24, fontFamily: "Inter_400Regular" },
  cancelBtn: { marginTop: 8 },
});
