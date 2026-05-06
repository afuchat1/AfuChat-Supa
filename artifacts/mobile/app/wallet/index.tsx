import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { WalletSkeleton } from "@/components/ui/Skeleton";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { cacheWallet, getCachedWallet, isOnline } from "@/lib/offlineStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type Transaction = {
  id: string;
  type: string;
  amount: number;
  created_at: string;
  label: string;
  icon: string;
  color: string;
  currency: string;
  metadata?: Record<string, any>;
  fee?: number;
  nexaSpent?: number;
  counterparty?: string;
  message?: string;
  status?: string;
};

type CurrencySettings = {
  nexa_to_acoin_rate: number;
  conversion_fee_percent: number;
  p2p_fee_percent: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
    " at " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

function formatTimeShort(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupByDate(txs: Transaction[]): { title: string; data: Transaction[] }[] {
  const groups: Record<string, Transaction[]> = {};
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const tx of txs) {
    const d = new Date(tx.created_at);
    let key: string;
    if (d.toDateString() === today.toDateString()) key = "Today";
    else if (d.toDateString() === yesterday.toDateString()) key = "Yesterday";
    else key = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

// ─── Transaction Detail Modal ─────────────────────────────────────────────────

function DetailRow({ label, value, valueColor, colors }: {
  label: string; value: string; valueColor?: string; colors: any;
}) {
  return (
    <View style={detailStyles.row}>
      <Text style={[detailStyles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[detailStyles.rowValue, { color: valueColor || colors.text }]}>{value}</Text>
    </View>
  );
}

function TransactionDetailModal({ tx, visible, onClose, colors }: {
  tx: Transaction | null; visible: boolean; onClose: () => void; colors: any;
}) {
  if (!tx) return null;
  const isPositive = tx.amount > 0;
  const absAmount = Math.abs(tx.amount);
  const currencyLabel = tx.currency === "nexa" ? "Nexa" : tx.currency === "gift" ? "" : "ACoin";
  const amountDisplay =
    tx.type === "gift_received"
      ? "Received"
      : `${isPositive ? "+" : "-"}${absAmount.toLocaleString()} ${currencyLabel}`;
  const amountColor =
    tx.type === "gift_received" ? "#AF52DE" : isPositive ? "#34C759" : "#FF3B30";
  const refId = tx.id.length > 12 ? tx.id.substring(0, 12).toUpperCase() : tx.id.toUpperCase();

  return (
    <SwipeableBottomSheet visible={visible} onClose={onClose} backgroundColor={colors.surface} maxHeight="90%">
      <View style={detailStyles.header}>
        <Text style={[detailStyles.title, { color: colors.text }]}>Transaction Details</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
        <View style={[detailStyles.amountCard, { backgroundColor: tx.color + "12" }]}>
          <View style={[detailStyles.amountIcon, { backgroundColor: tx.color + "22" }]}>
            <Ionicons name={tx.icon as any} size={28} color={tx.color} />
          </View>
          <Text style={[detailStyles.amountText, { color: amountColor }]}>{amountDisplay}</Text>
          <Text style={[detailStyles.typeText, { color: colors.textMuted }]}>{tx.label}</Text>
        </View>

        <View style={[detailStyles.section, { backgroundColor: colors.inputBg }]}>
          <DetailRow label="Date & Time" value={formatDateTime(tx.created_at)} colors={colors} />
          <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
          <DetailRow label="Type" value={tx.label} colors={colors} />
          <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
          <DetailRow label="Currency" value={currencyLabel || "Gift"} colors={colors} />
          {tx.status && (
            <>
              <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
              <DetailRow
                label="Status"
                value={
                  tx.status === "completed" ? "Completed"
                  : tx.status === "pending" ? "Pending"
                  : tx.status === "failed" ? "Failed"
                  : tx.status
                }
                valueColor={
                  tx.status === "failed" ? "#FF3B30"
                  : tx.status === "pending" ? "#FF9500"
                  : "#34C759"
                }
                colors={colors}
              />
            </>
          )}
          {tx.counterparty && (
            <>
              <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
              <DetailRow
                label={isPositive || tx.type === "gift_received" || tx.type === "nexa_received" ? "From" : "To"}
                value={tx.counterparty}
                valueColor={Colors.brand}
                colors={colors}
              />
            </>
          )}
          {tx.message && (
            <>
              <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
              <DetailRow label="Note" value={tx.message} colors={colors} />
            </>
          )}
          {tx.nexaSpent != null && tx.nexaSpent > 0 && (
            <>
              <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
              <DetailRow label="Nexa Spent" value={`${tx.nexaSpent.toLocaleString()} Nexa`} colors={colors} />
            </>
          )}
          {tx.fee != null && tx.fee > 0 && (
            <>
              <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
              <DetailRow label="Fee" value={`${tx.fee} ACoin`} colors={colors} />
            </>
          )}
          {tx.metadata?.rate && (
            <>
              <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
              <DetailRow label="Rate" value={`${tx.metadata.rate} Nexa = 1 ACoin`} colors={colors} />
            </>
          )}
          {tx.metadata?.plan_name && (
            <>
              <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
              <DetailRow label="Plan" value={tx.metadata.plan_name} colors={colors} />
            </>
          )}
        </View>

        <View style={[detailStyles.section, { backgroundColor: colors.inputBg, marginTop: 10 }]}>
          <DetailRow label="Reference ID" value={refId} colors={colors} />
        </View>
      </ScrollView>
    </SwipeableBottomSheet>
  );
}

// ─── Transfer / Convert Sheets ────────────────────────────────────────────────

function SendNexaSheet({
  visible, onClose, colors, profile, onSuccess,
}: {
  visible: boolean; onClose: () => void; colors: any; profile: any; onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [handle, setHandle] = useState("");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!handle.trim() || !amount.trim() || !user) return;
    const amt = parseInt(amount);
    if (isNaN(amt) || amt <= 0) { showAlert("Invalid", "Enter a valid amount."); return; }
    if (amt > (profile?.xp || 0)) { showAlert("Insufficient Nexa", "You don't have enough Nexa."); return; }
    setSending(true);
    const { data: recipient } = await supabase.from("profiles").select("id, display_name").eq("handle", handle.trim().toLowerCase()).single();
    if (!recipient) { showAlert("Not found", "User not found."); setSending(false); return; }
    if (recipient.id === user.id) { showAlert("Error", "Cannot send to yourself."); setSending(false); return; }
    const { data: deducted, error: deductErr } = await supabase.from("profiles").update({ xp: (profile?.xp || 0) - amt }).eq("id", user.id).gte("xp", amt).select("id").maybeSingle();
    if (deductErr || !deducted) { showAlert("Error", "Could not deduct Nexa — balance may have changed."); setSending(false); return; }
    const { error: creditErr } = await supabase.rpc("award_xp", { p_user_id: recipient.id, p_action_type: "nexa_transfer_received", p_xp_amount: amt, p_metadata: { from_user_id: user.id } });
    if (creditErr) {
      await supabase.from("profiles").update({ xp: (profile?.xp || 0) }).eq("id", user.id);
      showAlert("Error", "Could not credit recipient. Your Nexa has been refunded.");
      setSending(false);
      return;
    }
    await supabase.from("xp_transfers").insert({ sender_id: user.id, receiver_id: recipient.id, amount: amt, message: msg.trim() || null });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Sent!", `${amt} Nexa sent to ${recipient.display_name}`);
    setHandle(""); setAmount(""); setMsg("");
    onClose(); onSuccess();
    setSending(false);
  }

  return (
    <SwipeableBottomSheet visible={visible} onClose={onClose} backgroundColor={colors.surface} maxHeight="80%">
      <Text style={[sheetStyles.title, { color: colors.text }]}>Send Nexa</Text>
      <Text style={[sheetStyles.balance, { color: colors.textMuted }]}>
        Balance: <Text style={{ color: colors.text, fontFamily: "Inter_700Bold" }}>{(profile?.xp || 0).toLocaleString()} Nexa</Text>
      </Text>
      <Text style={[sheetStyles.label, { color: colors.textMuted }]}>RECIPIENT</Text>
      <View style={[sheetStyles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Text style={{ color: colors.textMuted, fontSize: 16, marginRight: 4 }}>@</Text>
        <TextInput
          style={[sheetStyles.input, { color: colors.text }]}
          placeholder="username"
          placeholderTextColor={colors.textMuted}
          value={handle}
          onChangeText={setHandle}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <Text style={[sheetStyles.label, { color: colors.textMuted, marginTop: 16 }]}>AMOUNT</Text>
      <View style={[sheetStyles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Ionicons name="flash" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={[sheetStyles.input, { color: colors.text }]}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
        />
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>Nexa</Text>
      </View>
      <Text style={[sheetStyles.label, { color: colors.textMuted, marginTop: 16 }]}>NOTE (OPTIONAL)</Text>
      <View style={[sheetStyles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <TextInput
          style={[sheetStyles.input, { color: colors.text }]}
          placeholder="Add a message…"
          placeholderTextColor={colors.textMuted}
          value={msg}
          onChangeText={setMsg}
          maxLength={120}
        />
      </View>
      <TouchableOpacity
        style={[sheetStyles.btn, { backgroundColor: Colors.brand, opacity: sending ? 0.7 : 1, marginTop: 24 }]}
        onPress={send}
        disabled={sending}
      >
        {sending ? <ActivityIndicator color="#fff" /> : <Text style={sheetStyles.btnText}>Send Nexa</Text>}
      </TouchableOpacity>
    </SwipeableBottomSheet>
  );
}

function ConvertSheet({
  visible, onClose, colors, profile, currencySettings, onSuccess,
}: {
  visible: boolean; onClose: () => void; colors: any; profile: any; currencySettings: CurrencySettings | null; onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [converting, setConverting] = useState(false);

  const preview = (() => {
    if (!amount.trim() || !currencySettings) return null;
    const n = parseInt(amount);
    if (isNaN(n) || n <= 0) return null;
    const raw = n / currencySettings.nexa_to_acoin_rate;
    const fee = Math.ceil(raw * (currencySettings.conversion_fee_percent / 100));
    return { acoin: Math.max(0, Math.floor(raw - fee)), fee };
  })();

  async function convert() {
    if (!amount.trim() || !user || !currencySettings || !profile || !preview) return;
    const nexaAmt = parseInt(amount);
    if (isNaN(nexaAmt) || nexaAmt <= 0) { showAlert("Invalid", "Enter a valid Nexa amount."); return; }
    if (nexaAmt > (profile.xp || 0)) { showAlert("Insufficient Nexa", `You only have ${profile.xp} Nexa.`); return; }
    if (preview.acoin <= 0) { showAlert("Too Low", "Amount too small after fee."); return; }

    showAlert(
      "Confirm Conversion",
      `Convert ${nexaAmt} Nexa → ${preview.acoin} ACoin?\n\nRate: ${currencySettings.nexa_to_acoin_rate} Nexa = 1 ACoin\nFee: ${currencySettings.conversion_fee_percent}% (${preview.fee} ACoin)`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Convert",
          onPress: async () => {
            setConverting(true);
            const { error } = await supabase.from("profiles").update({
              xp: (profile.xp || 0) - nexaAmt,
              acoin: (profile.acoin || 0) + preview.acoin,
            }).eq("id", profile.id);
            if (error) { showAlert("Error", error.message); setConverting(false); return; }
            await supabase.from("acoin_transactions").insert({
              user_id: profile.id,
              amount: preview.acoin,
              transaction_type: "conversion",
              nexa_spent: nexaAmt,
              fee_charged: preview.fee,
              metadata: { rate: currencySettings.nexa_to_acoin_rate, fee_percent: currencySettings.conversion_fee_percent },
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setAmount("");
            onClose(); onSuccess();
            setConverting(false);
          },
        },
      ]
    );
  }

  return (
    <SwipeableBottomSheet visible={visible} onClose={onClose} backgroundColor={colors.surface} maxHeight="75%">
      <Text style={[sheetStyles.title, { color: colors.text }]}>Convert Nexa → ACoin</Text>
      <Text style={[sheetStyles.balance, { color: colors.textMuted }]}>
        Balance:{" "}
        <Text style={{ color: colors.text, fontFamily: "Inter_700Bold" }}>{(profile?.xp || 0).toLocaleString()} Nexa</Text>
      </Text>
      {currencySettings && (
        <Text style={[sheetStyles.rateRow, { color: colors.textMuted }]}>
          Rate: {currencySettings.nexa_to_acoin_rate} Nexa = 1 ACoin · Fee: {currencySettings.conversion_fee_percent}%
        </Text>
      )}
      <Text style={[sheetStyles.label, { color: colors.textMuted, marginTop: 16 }]}>NEXA AMOUNT</Text>
      <View style={[sheetStyles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Ionicons name="flash" size={18} color="#FF9500" style={{ marginRight: 8 }} />
        <TextInput
          style={[sheetStyles.input, { color: colors.text }]}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
        />
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>Nexa</Text>
      </View>
      {preview && (
        <View style={[sheetStyles.previewBox, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "30" }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>You receive</Text>
            <Text style={{ color: "#34C759", fontSize: 15, fontFamily: "Inter_700Bold" }}>+{preview.acoin} ACoin</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Fee</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{preview.fee} ACoin</Text>
          </View>
        </View>
      )}
      <TouchableOpacity
        style={[sheetStyles.btn, { backgroundColor: Colors.brand, opacity: converting ? 0.7 : 1, marginTop: 24 }]}
        onPress={convert}
        disabled={converting || !preview}
      >
        {converting ? <ActivityIndicator color="#fff" /> : <Text style={sheetStyles.btnText}>Convert</Text>}
      </TouchableOpacity>
    </SwipeableBottomSheet>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WalletScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [currencySettings, setCurrencySettings] = useState<CurrencySettings | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "nexa" | "acoin" | "gifts">("all");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    if (!isOnline()) {
      const cached = await getCachedWallet();
      if (cached) { setTransactions(cached.transactions); setLoading(false); setRefreshing(false); }
      return;
    }

    const [
      { data: xpSent }, { data: xpReceived }, { data: acoinTx },
      { data: settings }, { data: giftsSent }, { data: giftsReceived },
    ] = await Promise.all([
      supabase.from("xp_transfers").select("id, amount, created_at, status, message, receiver_id, profiles!xp_transfers_receiver_id_fkey(handle, display_name)").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("xp_transfers").select("id, amount, created_at, status, message, sender_id, profiles!xp_transfers_sender_id_fkey(handle, display_name)").eq("receiver_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("acoin_transactions").select("id, amount, transaction_type, nexa_spent, fee_charged, created_at, metadata").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("currency_settings").select("nexa_to_acoin_rate, conversion_fee_percent, p2p_fee_percent").limit(1).single(),
      supabase.from("gift_transactions").select("id, gift_id, receiver_id, xp_cost, message, created_at, gifts(name, emoji), profiles!gift_transactions_receiver_id_fkey(handle, display_name)").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("gift_transactions").select("id, gift_id, sender_id, xp_cost, message, created_at, gifts(name, emoji), profiles!gift_transactions_sender_id_fkey(handle, display_name)").eq("receiver_id", user.id).order("created_at", { ascending: false }).limit(30),
    ]);

    if (settings) setCurrencySettings(settings as CurrencySettings);

    const all: Transaction[] = [];

    (xpSent || []).forEach((t: any) => {
      const p = t.profiles;
      all.push({ id: t.id, type: "nexa_sent", amount: -t.amount, created_at: t.created_at, label: "Nexa Sent", icon: "arrow-up-circle", color: "#FF3B30", currency: "nexa", counterparty: p ? `@${p.handle}` : undefined, message: t.message || undefined, status: t.status || "completed" });
    });
    (xpReceived || []).forEach((t: any) => {
      const p = t.profiles;
      all.push({ id: t.id, type: "nexa_received", amount: t.amount, created_at: t.created_at, label: "Nexa Received", icon: "arrow-down-circle", color: Colors.brand, currency: "nexa", counterparty: p ? `@${p.handle}` : undefined, message: t.message || undefined, status: t.status || "completed" });
    });

    const acoinLabelMap: Record<string, { label: string; icon: string }> = {
      conversion: { label: "Nexa → ACoin", icon: "swap-horizontal" },
      subscription: { label: "Premium Subscription", icon: "diamond" },
      subscription_cancelled: { label: "Subscription Cancelled", icon: "close-circle" },
      gift_conversion: { label: "Gift Converted", icon: "gift" },
      marketplace_purchase: { label: "Marketplace Purchase", icon: "cart" },
      marketplace_sale: { label: "Marketplace Sale", icon: "storefront" },
      topup: { label: "ACoin Top-Up", icon: "card" },
      acoin_transfer_sent: { label: "ACoin Sent", icon: "arrow-up-circle" },
      acoin_transfer_received: { label: "ACoin Received", icon: "arrow-down-circle" },
    };

    (acoinTx || []).forEach((t: any) => {
      const mapped = acoinLabelMap[t.transaction_type];
      const giftName = t.metadata?.gift_name;
      let label = mapped?.label || t.transaction_type.replace(/_/g, " ");
      if (giftName && ["gift_conversion", "marketplace_purchase", "marketplace_sale"].includes(t.transaction_type)) {
        label += ` · ${giftName}`;
      }
      const icon = mapped?.icon || (t.amount > 0 ? "arrow-down-circle" : "arrow-up-circle");
      let counterparty: string | undefined;
      if (t.transaction_type === "acoin_transfer_sent" && t.metadata?.to_handle) counterparty = `@${t.metadata.to_handle}`;
      if (t.transaction_type === "acoin_transfer_received" && t.metadata?.from_handle) counterparty = `@${t.metadata.from_handle}`;
      all.push({ id: t.id, type: t.transaction_type, amount: t.amount, created_at: t.created_at, label, icon, color: t.amount > 0 ? "#34C759" : "#FF9500", currency: "acoin", fee: t.fee_charged || undefined, nexaSpent: t.nexa_spent || undefined, metadata: t.metadata || undefined, counterparty, message: t.metadata?.message || undefined, status: "completed" });
    });

    (giftsSent || []).forEach((t: any) => {
      const p = t.profiles;
      all.push({ id: "gs_" + t.id, type: "gift_sent", amount: -(t.xp_cost || 0), created_at: t.created_at, label: `Sent ${t.gifts?.emoji || "🎁"} ${t.gifts?.name || "Gift"}`, icon: "gift", color: "#FF3B30", currency: "nexa", counterparty: p ? `@${p.handle}` : undefined, message: t.message || undefined, status: "completed" });
    });
    (giftsReceived || []).forEach((t: any) => {
      const p = t.profiles;
      all.push({ id: "gr_" + t.id, type: "gift_received", amount: 0, created_at: t.created_at, label: `Received ${t.gifts?.emoji || "🎁"} ${t.gifts?.name || "Gift"}`, icon: "gift", color: "#AF52DE", currency: "gift", counterparty: p ? `@${p.handle}` : undefined, message: t.message || undefined, status: "completed" });
    });

    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setTransactions(all);
    cacheWallet({ acoin: profile?.acoin ?? 0, transactions: all });
    setLoading(false);
    setRefreshing(false);
  }, [user, profile]);

  const loadPendingCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase.from("transaction_requests").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("status", "pending");
    setPendingRequestCount(count || 0);
  }, [user]);

  useEffect(() => { loadData(); loadPendingCount(); }, [loadData, loadPendingCount]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`wallet-realtime:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "acoin_transactions", filter: `user_id=eq.${user.id}` }, () => { loadData(); refreshProfile(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "xp_transfers", filter: `receiver_id=eq.${user.id}` }, () => { loadData(); refreshProfile(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "transaction_requests", filter: `owner_id=eq.${user.id}` }, () => loadPendingCount())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadData, loadPendingCount, refreshProfile]);

  const filteredTx = activeTab === "all"
    ? transactions
    : activeTab === "gifts"
    ? transactions.filter((t) => ["gift_sent", "gift_received", "gift_conversion", "marketplace_purchase", "marketplace_sale"].includes(t.type))
    : transactions.filter((t) => t.currency === activeTab);

  const groups = groupByDate(filteredTx);

  const acoin = profile?.acoin || 0;
  const nexa = profile?.xp || 0;

  // Flatten grouped list for FlatList
  const flatList: ({ type: "header"; title: string } | { type: "tx"; tx: Transaction })[] = [];
  for (const group of groups) {
    flatList.push({ type: "header", title: group.title });
    for (const tx of group.data) flatList.push({ type: "tx", tx });
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <OfflineBanner />

      {/* Modals */}
      <SendNexaSheet
        visible={showTransfer}
        onClose={() => setShowTransfer(false)}
        colors={colors}
        profile={profile}
        onSuccess={() => { refreshProfile(); loadData(); }}
      />
      <ConvertSheet
        visible={showConvert}
        onClose={() => setShowConvert(false)}
        colors={colors}
        profile={profile}
        currencySettings={currencySettings}
        onSuccess={() => { refreshProfile(); loadData(); }}
      />
      <TransactionDetailModal tx={selectedTx} visible={!!selectedTx} onClose={() => setSelectedTx(null)} colors={colors} />

      <FlatList
        data={flatList}
        keyExtractor={(item, i) => item.type === "header" ? `h-${item.title}` : `tx-${item.tx.id}-${i}`}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor={Colors.brand}
          />
        }
        ListHeaderComponent={() => (
          <>
            {/* ── Header ── */}
            <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Wallet</Text>
              <TouchableOpacity onPress={() => router.push("/wallet/scan")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="scan-outline" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* ── Balance Hero ── */}
            <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
              <View style={styles.balancePair}>
                {/* ACoin */}
                <View style={[styles.balanceBlock, { backgroundColor: Colors.brand + "0E", borderColor: Colors.brand + "25" }]}>
                  <View style={[styles.balanceIconWrap, { backgroundColor: Colors.brand + "20" }]}>
                    <Ionicons name="diamond" size={18} color={Colors.brand} />
                  </View>
                  <Text style={[styles.balanceBig, { color: colors.text }]}>{acoin.toLocaleString()}</Text>
                  <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>ACoin</Text>
                </View>

                <View style={[styles.dividerVert, { backgroundColor: colors.border }]} />

                {/* Nexa */}
                <View style={[styles.balanceBlock, { backgroundColor: "#FF950008", borderColor: "#FF950025" }]}>
                  <View style={[styles.balanceIconWrap, { backgroundColor: "#FF950022" }]}>
                    <Ionicons name="flash" size={18} color="#FF9500" />
                  </View>
                  <Text style={[styles.balanceBig, { color: colors.text }]}>{nexa.toLocaleString()}</Text>
                  <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>Nexa</Text>
                </View>
              </View>

              {/* Quick actions */}
              <View style={styles.actionsRow}>
                <QuickAction icon="add-circle" label="Buy ACoin" color={Colors.brand} onPress={() => router.push("/wallet/topup")} />
                <QuickAction icon="paper-plane" label="Send" color="#007AFF" onPress={() => setShowTransfer(true)} />
                <QuickAction icon="swap-horizontal" label="Convert" color="#FF9500" onPress={() => setShowConvert(true)} />
                <QuickAction icon="scan" label="Scan QR" color="#34C759" onPress={() => router.push("/wallet/scan")} />
                <QuickAction
                  icon="receipt-outline"
                  label="Requests"
                  color="#AF52DE"
                  onPress={() => router.push("/wallet/requests")}
                  badge={pendingRequestCount}
                />
              </View>
            </View>

            {/* ── Tab Filters ── */}
            <View style={[styles.tabsRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              {(["all", "acoin", "nexa", "gifts"] as const).map((tab) => {
                const active = activeTab === tab;
                const labels = { all: "All", acoin: "ACoin", nexa: "Nexa", gifts: "Gifts" };
                return (
                  <TouchableOpacity key={tab} style={styles.tabBtn} onPress={() => setActiveTab(tab)}>
                    <Text style={[styles.tabText, {
                      color: active ? Colors.brand : colors.textMuted,
                      fontFamily: active ? "Inter_700Bold" : "Inter_400Regular",
                    }]}>
                      {labels[tab]}
                    </Text>
                    {active && <View style={[styles.tabUnderline, { backgroundColor: Colors.brand }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionHeaderText, { color: colors.textMuted }]}>{item.title}</Text>
              </View>
            );
          }
          const tx = item.tx;
          const isPos = tx.amount > 0;
          const absAmt = Math.abs(tx.amount);
          const currLabel = tx.currency === "nexa" ? "Nexa" : tx.currency === "gift" ? "" : "ACoin";
          const amtStr = tx.type === "gift_received"
            ? "Gift"
            : `${isPos ? "+" : "-"}${absAmt.toLocaleString()}${currLabel ? ` ${currLabel}` : ""}`;
          const amtColor = tx.type === "gift_received" ? "#AF52DE" : isPos ? "#34C759" : "#FF3B30";

          return (
            <TouchableOpacity
              activeOpacity={0.65}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedTx(tx); }}
              style={[styles.txRow, { backgroundColor: colors.surface }]}
            >
              <View style={[styles.txIconWrap, { backgroundColor: tx.color + "16" }]}>
                <Ionicons name={tx.icon as any} size={20} color={tx.color} />
              </View>
              <View style={styles.txCenter}>
                <Text style={[styles.txLabel, { color: colors.text }]} numberOfLines={1}>{tx.label}</Text>
                {tx.counterparty && (
                  <Text style={[styles.txSub, { color: colors.textMuted }]} numberOfLines={1}>{tx.counterparty}</Text>
                )}
                <Text style={[styles.txTime, { color: colors.textMuted }]}>{formatTimeShort(tx.created_at)}</Text>
              </View>
              <Text style={[styles.txAmount, { color: amtColor }]}>{amtStr}</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={{ padding: 16 }}><WalletSkeleton /></View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No transactions yet</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                Buy ACoin or send Nexa to get started
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: Colors.brand }]}
                onPress={() => router.push("/wallet/topup")}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.emptyBtnText}>Buy ACoin</Text>
              </TouchableOpacity>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      />
    </View>
  );
}

function QuickAction({ icon, label, color, onPress, badge }: {
  icon: string; label: string; color: string; onPress: () => void; badge?: number;
}) {
  return (
    <TouchableOpacity style={styles.qaBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.qaIcon, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon as any} size={22} color={color} />
        {badge != null && badge > 0 && (
          <View style={styles.qaBadge}>
            <Text style={styles.qaBadgeText}>{badge > 9 ? "9+" : badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.qaLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },

  heroCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  balancePair: { flexDirection: "row", gap: 12, marginBottom: 20 },
  balanceBlock: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  balanceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  balanceBig: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  balanceLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  dividerVert: { width: StyleSheet.hairlineWidth },

  actionsRow: { flexDirection: "row", justifyContent: "space-between" },
  qaBtn: { alignItems: "center", flex: 1 },
  qaIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    position: "relative",
  },
  qaLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#8E8E93", textAlign: "center" },
  qaBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  qaBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },

  tabsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabText: { fontSize: 14 },
  tabUnderline: { height: 2, width: "60%", borderRadius: 1, marginTop: 4 },

  sectionHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
  sectionHeaderText: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, textTransform: "uppercase" },

  txRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 2,
    borderRadius: 14,
    gap: 12,
  },
  txIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  txCenter: { flex: 1 },
  txLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
  txSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 1 },
  txTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  txAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },

  empty: { alignItems: "center", paddingTop: 64, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 16, marginBottom: 8 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
});

const sheetStyles = StyleSheet.create({
  title: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  balance: { fontSize: 13, marginBottom: 20 },
  rateRow: { fontSize: 12, marginBottom: 4 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 8 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  previewBox: { borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1 },
  btn: { borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});

const detailStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  amountCard: { borderRadius: 16, padding: 20, alignItems: "center", marginBottom: 16 },
  amountIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  amountText: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  typeText: { fontSize: 13, marginTop: 4 },
  section: { borderRadius: 14, overflow: "hidden" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13 },
  rowLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  rowValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", maxWidth: "60%", textAlign: "right" },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
});
