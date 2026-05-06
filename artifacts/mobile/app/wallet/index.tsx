/**
 * AfuChat Wallet — Dashboard
 *
 * Transaction sources:
 *  • xp_transfers         — Nexa sent / received
 *  • acoin_transactions   — ACoin: topup, conversion, subscription, marketplace, game, etc.
 *  • gift_transactions    — gifts sent / received
 *  • xp_activity_log      — XP earned from activities (posts, daily login, referrals, etc.)
 *
 * Realtime subscriptions on acoin_transactions + xp_transfers.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
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
  currency: "nexa" | "acoin" | "gift" | "points";
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

type TabKey = "all" | "acoin" | "nexa" | "gifts" | "points";

// ─── Date / time helpers ──────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function formatTimeShort(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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
    else key = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }
  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

// ─── Transaction Detail Modal — full-screen native receipt ────────────────────

function DetailRow({
  label, value, valueColor, bold, colors, last,
}: {
  label: string; value: string; valueColor?: string; bold?: boolean;
  colors: any; last?: boolean;
}) {
  return (
    <>
      <View style={det.row}>
        <Text style={[det.rowLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text
          style={[det.rowValue, { color: valueColor || colors.text }, bold ? { fontFamily: "Inter_700Bold" } : {}]}
          numberOfLines={3}
        >
          {value}
        </Text>
      </View>
      {!last && <View style={[det.sep, { backgroundColor: colors.border }]} />}
    </>
  );
}

function StatusBadge({ status, colors }: { status: string; colors: any }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    completed: { label: "Completed", color: "#34C759", bg: "#34C75918" },
    pending:   { label: "Pending",   color: "#FF9500", bg: "#FF950018" },
    failed:    { label: "Failed",    color: "#FF3B30", bg: "#FF3B3018" },
    invalid:   { label: "Invalid",   color: "#FF3B30", bg: "#FF3B3018" },
  };
  const info = map[status] || { label: status, color: colors.textMuted, bg: colors.inputBg };
  return (
    <View style={[det.badge, { backgroundColor: info.bg }]}>
      <View style={[det.badgeDot, { backgroundColor: info.color }]} />
      <Text style={[det.badgeText, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}

function TransactionDetailModal({
  tx, visible, onClose, colors, insets,
}: {
  tx: Transaction | null; visible: boolean; onClose: () => void; colors: any; insets: any;
}) {
  if (!tx) return null;

  const d = new Date(tx.created_at);
  const isPositive = tx.amount > 0;
  const absAmount = Math.abs(tx.amount);
  const currencyLabel =
    tx.currency === "nexa" ? "Nexa"
    : tx.currency === "points" ? "XP Points"
    : tx.currency === "gift" ? "Gift"
    : "ACoin";
  const amountStr =
    tx.type === "gift_received"
      ? "Received"
      : tx.currency === "points"
      ? `+${absAmount.toLocaleString()} XP`
      : `${isPositive ? "+" : "-"}${absAmount.toLocaleString()} ${currencyLabel}`;
  const amountColor =
    tx.type === "gift_received" ? "#AF52DE"
    : tx.currency === "points" ? "#FF9500"
    : isPositive ? "#34C759"
    : "#FF3B30";
  const refId = tx.id.replace(/^[a-z]{2}_/, "").substring(0, 12).toUpperCase();
  const directionLabel = (isPositive || tx.type === "gift_received") ? "From" : "To";

  async function copyRef() {
    await Clipboard.setStringAsync(refId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Copied", "Reference ID copied to clipboard.");
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[det.root, { backgroundColor: colors.backgroundSecondary }]}>
        {/* Drag handle */}
        <View style={[det.handle, { backgroundColor: colors.border }]} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        >
          {/* ── Hero ── */}
          <View style={[det.hero, { backgroundColor: tx.color + "0E" }]}>
            <View style={[det.heroIcon, { backgroundColor: tx.color + "22" }]}>
              <Ionicons name={tx.icon as any} size={30} color={tx.color} />
            </View>
            <Text style={[det.heroAmount, { color: amountColor }]}>{amountStr}</Text>
            <Text style={[det.heroType, { color: colors.textMuted }]}>{tx.label}</Text>
            {tx.status && <StatusBadge status={tx.status} colors={colors} />}
          </View>

          {/* ── Detail card ── */}
          <View style={[det.card, { backgroundColor: colors.surface, marginHorizontal: 20, marginTop: 20 }]}>
            <DetailRow label="Date" value={formatDate(d)} colors={colors} />
            <DetailRow label="Time" value={formatTime(d)} colors={colors} />
            <DetailRow label="Type" value={tx.label} colors={colors} />
            {currencyLabel && (
              <DetailRow label="Currency" value={currencyLabel} colors={colors} />
            )}
            {tx.counterparty && (
              <DetailRow
                label={directionLabel}
                value={tx.counterparty}
                valueColor={Colors.brand}
                colors={colors}
              />
            )}
            {tx.message && (
              <DetailRow label="Note" value={tx.message} colors={colors} />
            )}
            {(tx.nexaSpent ?? 0) > 0 && (
              <DetailRow label="Nexa Used" value={`${tx.nexaSpent!.toLocaleString()} Nexa`} colors={colors} />
            )}
            {(tx.fee ?? 0) > 0 && (
              <DetailRow label="Fee" value={`${tx.fee} ACoin`} colors={colors} />
            )}
            {tx.metadata?.rate && (
              <DetailRow label="Exchange Rate" value={`${tx.metadata.rate} Nexa = 1 ACoin`} colors={colors} />
            )}
            {tx.metadata?.plan_name && (
              <DetailRow label="Plan" value={tx.metadata.plan_name} colors={colors} />
            )}
            {tx.metadata?.activity_type && (
              <DetailRow label="Activity" value={(tx.metadata.activity_type as string).replace(/_/g, " ")} colors={colors} />
            )}
            <DetailRow label="Amount" value={amountStr} valueColor={amountColor} bold colors={colors} last />
          </View>

          {/* ── Reference ID card ── */}
          <View style={[det.card, { backgroundColor: colors.surface, marginHorizontal: 20, marginTop: 12 }]}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={[det.refLabel, { color: colors.textMuted }]}>Reference ID</Text>
              <View style={det.refRow}>
                <Text style={[det.refValue, { color: colors.text }]}>{refId}</Text>
                <TouchableOpacity
                  style={[det.copyBtn, { backgroundColor: Colors.brand + "15" }]}
                  onPress={copyRef}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="copy-outline" size={14} color={Colors.brand} />
                  <Text style={[det.copyBtnText, { color: Colors.brand }]}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── Done button ── */}
          <TouchableOpacity
            style={[det.doneBtn, { backgroundColor: Colors.brand, marginHorizontal: 20, marginTop: 20 }]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={det.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Send Nexa Sheet ──────────────────────────────────────────────────────────

function SendNexaSheet({ visible, onClose, colors, profile, onSuccess }: {
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
    if (deductErr || !deducted) { showAlert("Error", "Could not deduct Nexa."); setSending(false); return; }
    const { error: creditErr } = await supabase.rpc("award_xp", { p_user_id: recipient.id, p_action_type: "nexa_transfer_received", p_xp_amount: amt, p_metadata: { from_user_id: user.id } });
    if (creditErr) {
      await supabase.from("profiles").update({ xp: (profile?.xp || 0) }).eq("id", user.id);
      showAlert("Error", "Could not credit recipient. Your Nexa has been refunded.");
      setSending(false); return;
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
      <Text style={[sh.title, { color: colors.text }]}>Send Nexa</Text>
      <Text style={[sh.balance, { color: colors.textMuted }]}>
        Balance: <Text style={{ color: colors.text, fontFamily: "Inter_700Bold" }}>{(profile?.xp || 0).toLocaleString()} Nexa</Text>
      </Text>
      <Text style={[sh.label, { color: colors.textMuted }]}>RECIPIENT</Text>
      <View style={[sh.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Text style={{ color: colors.textMuted, fontSize: 16, marginRight: 4 }}>@</Text>
        <TextInput style={[sh.input, { color: colors.text }]} placeholder="username" placeholderTextColor={colors.textMuted} value={handle} onChangeText={setHandle} autoCapitalize="none" autoCorrect={false} />
      </View>
      <Text style={[sh.label, { color: colors.textMuted, marginTop: 16 }]}>AMOUNT</Text>
      <View style={[sh.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Ionicons name="flash" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput style={[sh.input, { color: colors.text }]} placeholder="0" placeholderTextColor={colors.textMuted} value={amount} onChangeText={setAmount} keyboardType="number-pad" />
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>Nexa</Text>
      </View>
      <Text style={[sh.label, { color: colors.textMuted, marginTop: 16 }]}>NOTE (OPTIONAL)</Text>
      <View style={[sh.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <TextInput style={[sh.input, { color: colors.text }]} placeholder="Add a message…" placeholderTextColor={colors.textMuted} value={msg} onChangeText={setMsg} maxLength={120} />
      </View>
      <TouchableOpacity style={[sh.btn, { backgroundColor: Colors.brand, opacity: sending ? 0.7 : 1, marginTop: 24 }]} onPress={send} disabled={sending}>
        {sending ? <ActivityIndicator color="#fff" /> : <Text style={sh.btnText}>Send Nexa</Text>}
      </TouchableOpacity>
    </SwipeableBottomSheet>
  );
}

// ─── Convert Sheet ────────────────────────────────────────────────────────────

function ConvertSheet({ visible, onClose, colors, profile, currencySettings, onSuccess }: {
  visible: boolean; onClose: () => void; colors: any; profile: any;
  currencySettings: CurrencySettings | null; onSuccess: () => void;
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
      <Text style={[sh.title, { color: colors.text }]}>Convert Nexa → ACoin</Text>
      <Text style={[sh.balance, { color: colors.textMuted }]}>
        Balance: <Text style={{ color: colors.text, fontFamily: "Inter_700Bold" }}>{(profile?.xp || 0).toLocaleString()} Nexa</Text>
      </Text>
      {currencySettings && (
        <Text style={[sh.rateRow, { color: colors.textMuted }]}>
          Rate: {currencySettings.nexa_to_acoin_rate} Nexa = 1 ACoin · Fee: {currencySettings.conversion_fee_percent}%
        </Text>
      )}
      <Text style={[sh.label, { color: colors.textMuted, marginTop: 16 }]}>NEXA AMOUNT</Text>
      <View style={[sh.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Ionicons name="flash" size={18} color="#FF9500" style={{ marginRight: 8 }} />
        <TextInput style={[sh.input, { color: colors.text }]} placeholder="0" placeholderTextColor={colors.textMuted} value={amount} onChangeText={setAmount} keyboardType="number-pad" />
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>Nexa</Text>
      </View>
      {preview && (
        <View style={[sh.previewBox, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "30" }]}>
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
      <TouchableOpacity style={[sh.btn, { backgroundColor: Colors.brand, opacity: converting ? 0.7 : 1, marginTop: 24 }]} onPress={convert} disabled={converting || !preview}>
        {converting ? <ActivityIndicator color="#fff" /> : <Text style={sh.btnText}>Convert</Text>}
      </TouchableOpacity>
    </SwipeableBottomSheet>
  );
}

// ─── Quick Action ─────────────────────────────────────────────────────────────

function QuickAction({ icon, label, color, onPress, badge }: {
  icon: string; label: string; color: string; onPress: () => void; badge?: number;
}) {
  return (
    <TouchableOpacity style={s.qaBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.qaIcon, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon as any} size={22} color={color} />
        {(badge ?? 0) > 0 && (
          <View style={s.qaBadge}>
            <Text style={s.qaBadgeText}>{badge! > 9 ? "9+" : badge}</Text>
          </View>
        )}
      </View>
      <Text style={s.qaLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Wallet Screen ───────────────────────────────────────────────────────

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
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    if (!isOnline()) {
      const cached = await getCachedWallet();
      if (cached) { setTransactions(cached.transactions); setLoading(false); setRefreshing(false); }
      return;
    }

    // Parallel fetch all transaction sources
    const [
      { data: xpSent },
      { data: xpReceived },
      { data: acoinTx },
      { data: settings },
      { data: giftsSent },
      { data: giftsReceived },
    ] = await Promise.all([
      supabase.from("xp_transfers")
        .select("id, amount, created_at, status, message, receiver_id, profiles!xp_transfers_receiver_id_fkey(handle, display_name)")
        .eq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("xp_transfers")
        .select("id, amount, created_at, status, message, sender_id, profiles!xp_transfers_sender_id_fkey(handle, display_name)")
        .eq("receiver_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("acoin_transactions")
        .select("id, amount, transaction_type, nexa_spent, fee_charged, created_at, metadata")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("currency_settings")
        .select("nexa_to_acoin_rate, conversion_fee_percent, p2p_fee_percent")
        .limit(1)
        .single(),
      supabase.from("gift_transactions")
        .select("id, gift_id, receiver_id, xp_cost, message, created_at, gifts(name, emoji), profiles!gift_transactions_receiver_id_fkey(handle, display_name)")
        .eq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("gift_transactions")
        .select("id, gift_id, sender_id, xp_cost, message, created_at, gifts(name, emoji), profiles!gift_transactions_sender_id_fkey(handle, display_name)")
        .eq("receiver_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (settings) setCurrencySettings(settings as CurrencySettings);

    // XP activity log — try/catch since table may not exist in all environments
    let activityRows: any[] = [];
    try {
      const { data } = await supabase
        .from("xp_activity_log")
        .select("id, activity_type, xp_amount, created_at, metadata")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      activityRows = data || [];
    } catch {}

    const all: Transaction[] = [];

    // Nexa sent
    (xpSent || []).forEach((t: any) => {
      const p = t.profiles;
      all.push({
        id: t.id, type: "nexa_sent", amount: -t.amount, created_at: t.created_at,
        label: "Nexa Sent", icon: "arrow-up-circle", color: "#FF3B30", currency: "nexa",
        counterparty: p ? `@${p.handle}` : undefined, message: t.message || undefined,
        status: t.status || "completed",
      });
    });

    // Nexa received
    (xpReceived || []).forEach((t: any) => {
      const p = t.profiles;
      all.push({
        id: t.id, type: "nexa_received", amount: t.amount, created_at: t.created_at,
        label: "Nexa Received", icon: "arrow-down-circle", color: Colors.brand, currency: "nexa",
        counterparty: p ? `@${p.handle}` : undefined, message: t.message || undefined,
        status: t.status || "completed",
      });
    });

    // ACoin transactions
    const acoinLabelMap: Record<string, { label: string; icon: string }> = {
      conversion:             { label: "Nexa → ACoin",         icon: "swap-horizontal"  },
      subscription:           { label: "Premium Subscription",  icon: "diamond"          },
      subscription_cancelled: { label: "Subscription Cancelled",icon: "close-circle"     },
      gift_conversion:        { label: "Gift Converted",        icon: "gift"             },
      marketplace_purchase:   { label: "Marketplace Purchase",  icon: "cart"             },
      marketplace_sale:       { label: "Marketplace Sale",      icon: "storefront"       },
      topup:                  { label: "ACoin Top-Up",          icon: "card"             },
      acoin_transfer_sent:    { label: "ACoin Sent",            icon: "arrow-up-circle"  },
      acoin_transfer_received:{ label: "ACoin Received",        icon: "arrow-down-circle"},
      game_purchase:          { label: "Game Purchase",         icon: "game-controller"  },
      game_reward:            { label: "Game Reward",           icon: "trophy"           },
      prestige_upgrade:       { label: "Prestige Upgrade",      icon: "star"             },
      red_envelope_sent:      { label: "Red Envelope Sent",     icon: "gift"             },
      red_envelope_claimed:   { label: "Red Envelope Received", icon: "gift"             },
      request_payment:        { label: "Payment Request",       icon: "receipt"          },
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
      all.push({
        id: t.id, type: t.transaction_type, amount: t.amount, created_at: t.created_at,
        label, icon, color: t.amount > 0 ? "#34C759" : "#FF9500", currency: "acoin",
        fee: t.fee_charged || undefined, nexaSpent: t.nexa_spent || undefined,
        metadata: t.metadata || undefined, counterparty,
        message: t.metadata?.message || undefined, status: "completed",
      });
    });

    // Gifts sent
    (giftsSent || []).forEach((t: any) => {
      const p = t.profiles;
      all.push({
        id: "gs_" + t.id, type: "gift_sent", amount: -(t.xp_cost || 0), created_at: t.created_at,
        label: `Sent ${t.gifts?.emoji || "🎁"} ${t.gifts?.name || "Gift"}`,
        icon: "gift", color: "#FF3B30", currency: "nexa",
        counterparty: p ? `@${p.handle}` : undefined, message: t.message || undefined, status: "completed",
      });
    });

    // Gifts received
    (giftsReceived || []).forEach((t: any) => {
      const p = t.profiles;
      all.push({
        id: "gr_" + t.id, type: "gift_received", amount: 0, created_at: t.created_at,
        label: `Received ${t.gifts?.emoji || "🎁"} ${t.gifts?.name || "Gift"}`,
        icon: "gift", color: "#AF52DE", currency: "gift",
        counterparty: p ? `@${p.handle}` : undefined, message: t.message || undefined, status: "completed",
      });
    });

    // XP Activity (points from activities)
    const activityLabelMap: Record<string, { label: string; icon: string }> = {
      profile_completed:    { label: "Profile Completed",     icon: "person-circle"    },
      referral:             { label: "Referral Reward",       icon: "people"           },
      daily_login:          { label: "Daily Login Bonus",     icon: "calendar"         },
      post_created:         { label: "Posted Content",        icon: "create"           },
      post_reply:           { label: "Posted a Reply",        icon: "chatbubble"       },
      post_liked:           { label: "Liked a Post",          icon: "heart"            },
      follow_user:          { label: "Followed Someone",      icon: "person-add"       },
      message_sent:         { label: "Sent a Message",        icon: "paper-plane"      },
      story_created:        { label: "Created a Story",       icon: "camera"           },
      story_viewed:         { label: "Story View Reward",     icon: "eye"              },
      gift_sent:            { label: "Sent a Gift",           icon: "gift"             },
      group_created:        { label: "Created a Group",       icon: "people-circle"    },
      channel_created:      { label: "Created a Channel",     icon: "megaphone"        },
      red_envelope_sent:    { label: "Sent Red Envelope",     icon: "gift"             },
      red_envelope_claimed: { label: "Claimed Red Envelope",  icon: "gift"             },
      nexa_transfer_received:{ label: "Nexa Transfer",        icon: "flash"            },
    };
    activityRows.forEach((t: any) => {
      const mapped = activityLabelMap[t.activity_type];
      all.push({
        id: "xa_" + t.id, type: "xp_activity", amount: t.xp_amount || 0, created_at: t.created_at,
        label: mapped?.label || t.activity_type.replace(/_/g, " "),
        icon: (mapped?.icon || "star") as any,
        color: "#FF9500", currency: "points",
        metadata: { ...(t.metadata || {}), activity_type: t.activity_type },
        status: "completed",
      });
    });

    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setTransactions(all);
    cacheWallet({ acoin: profile?.acoin ?? 0, transactions: all });
    setLoading(false);
    setRefreshing(false);
  }, [user, profile]);

  const loadPendingCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from("transaction_requests")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("status", "pending");
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

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filteredTx = activeTab === "all"
    ? transactions
    : activeTab === "gifts"
    ? transactions.filter((t) => ["gift_sent", "gift_received", "gift_conversion", "marketplace_purchase", "marketplace_sale"].includes(t.type))
    : activeTab === "points"
    ? transactions.filter((t) => t.currency === "points")
    : transactions.filter((t) => t.currency === activeTab);

  const groups = groupByDate(filteredTx);
  const flatList: ({ type: "header"; title: string } | { type: "tx"; tx: Transaction })[] = [];
  for (const group of groups) {
    flatList.push({ type: "header", title: group.title });
    for (const tx of group.data) flatList.push({ type: "tx", tx });
  }

  const acoin = profile?.acoin || 0;
  const nexa = profile?.xp || 0;
  const pointsCount = transactions.filter((t) => t.currency === "points").length;

  // ── Render ────────────────────────────────────────────────────────────────

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "acoin", label: "ACoin" },
    { key: "nexa", label: "Nexa" },
    { key: "gifts", label: "Gifts" },
    ...(pointsCount > 0 ? [{ key: "points" as TabKey, label: "Points" }] : []),
  ];

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <OfflineBanner />

      <SendNexaSheet
        visible={showTransfer}
        onClose={() => setShowTransfer(false)}
        colors={colors} profile={profile}
        onSuccess={() => { refreshProfile(); loadData(); }}
      />
      <ConvertSheet
        visible={showConvert}
        onClose={() => setShowConvert(false)}
        colors={colors} profile={profile}
        currencySettings={currencySettings}
        onSuccess={() => { refreshProfile(); loadData(); }}
      />
      <TransactionDetailModal
        tx={selectedTx}
        visible={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        colors={colors}
        insets={insets}
      />

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
            <View style={[s.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <Text style={[s.headerTitle, { color: colors.text }]}>Wallet</Text>
              <TouchableOpacity onPress={() => router.push("/wallet/scan")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="scan-outline" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* ── Balance Hero ── */}
            <View style={[s.heroCard, { backgroundColor: colors.surface }]}>
              <View style={s.balancePair}>
                <View style={[s.balanceBlock, { backgroundColor: Colors.brand + "0E", borderColor: Colors.brand + "25" }]}>
                  <View style={[s.balanceIconWrap, { backgroundColor: Colors.brand + "20" }]}>
                    <Ionicons name="diamond" size={18} color={Colors.brand} />
                  </View>
                  <Text style={[s.balanceBig, { color: colors.text }]}>{acoin.toLocaleString()}</Text>
                  <Text style={[s.balanceLabel, { color: colors.textMuted }]}>ACoin</Text>
                </View>
                <View style={[s.dividerVert, { backgroundColor: colors.border }]} />
                <View style={[s.balanceBlock, { backgroundColor: "#FF950008", borderColor: "#FF950025" }]}>
                  <View style={[s.balanceIconWrap, { backgroundColor: "#FF950022" }]}>
                    <Ionicons name="flash" size={18} color="#FF9500" />
                  </View>
                  <Text style={[s.balanceBig, { color: colors.text }]}>{nexa.toLocaleString()}</Text>
                  <Text style={[s.balanceLabel, { color: colors.textMuted }]}>Nexa</Text>
                </View>
              </View>

              <View style={s.actionsRow}>
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.tabsRow}
            >
              {tabs.map(({ key, label }) => {
                const active = activeTab === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[s.tabBtn, active ? { backgroundColor: Colors.brand } : { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => setActiveTab(key)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.tabText, { color: active ? "#fff" : colors.textMuted, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={s.sectionHeader}>
                <Text style={[s.sectionHeaderText, { color: colors.textMuted }]}>{item.title}</Text>
              </View>
            );
          }
          const tx = item.tx;
          const isPos = tx.amount > 0;
          const absAmt = Math.abs(tx.amount);
          const currLabel =
            tx.currency === "nexa" ? "Nexa"
            : tx.currency === "points" ? "XP"
            : tx.currency === "gift" ? ""
            : "ACoin";
          const amtStr =
            tx.type === "gift_received"
              ? "Gift"
              : tx.currency === "points"
              ? `+${absAmt.toLocaleString()} XP`
              : `${isPos ? "+" : "-"}${absAmt.toLocaleString()}${currLabel ? ` ${currLabel}` : ""}`;
          const amtColor =
            tx.type === "gift_received" ? "#AF52DE"
            : tx.currency === "points" ? "#FF9500"
            : isPos ? "#34C759"
            : "#FF3B30";

          // Status indicator dot (only for non-completed)
          const showStatusDot = tx.status && tx.status !== "completed";
          const statusDotColor = tx.status === "failed" ? "#FF3B30" : "#FF9500";

          return (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedTx(tx); }}
              style={({ pressed }) => [
                s.txRow,
                { backgroundColor: colors.surface, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <View style={[s.txIconWrap, { backgroundColor: tx.color + "16" }]}>
                <Ionicons name={tx.icon as any} size={20} color={tx.color} />
              </View>
              <View style={s.txCenter}>
                <Text style={[s.txLabel, { color: colors.text }]} numberOfLines={1}>{tx.label}</Text>
                {tx.counterparty && (
                  <Text style={[s.txSub, { color: Colors.brand }]} numberOfLines={1}>{tx.counterparty}</Text>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[s.txTime, { color: colors.textMuted }]}>{formatTimeShort(tx.created_at)}</Text>
                  {showStatusDot && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: statusDotColor }} />
                      <Text style={{ fontSize: 10, color: statusDotColor, fontFamily: "Inter_600SemiBold" }}>
                        {tx.status}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={[s.txAmount, { color: amtColor }]}>{amtStr}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={{ padding: 16 }}><WalletSkeleton /></View>
          ) : (
            <View style={s.empty}>
              <View style={[s.emptyIconWrap, { backgroundColor: colors.surface }]}>
                <Ionicons name="receipt-outline" size={40} color={colors.textMuted} />
              </View>
              <Text style={[s.emptyTitle, { color: colors.text }]}>No transactions yet</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                {activeTab === "points"
                  ? "Earn XP by posting, following people, sending messages and more"
                  : "Buy ACoin or send Nexa to get started"}
              </Text>
              {activeTab !== "points" && (
                <TouchableOpacity style={[s.emptyBtn, { backgroundColor: Colors.brand }]} onPress={() => router.push("/wallet/topup")}>
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={s.emptyBtnText}>Buy ACoin</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },

  heroCard: {
    marginHorizontal: 16, marginTop: 16, borderRadius: 20, padding: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
  },
  balancePair: { flexDirection: "row", gap: 12, marginBottom: 20 },
  balanceBlock: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1 },
  balanceIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  balanceBig: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  balanceLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  dividerVert: { width: StyleSheet.hairlineWidth },

  actionsRow: { flexDirection: "row", justifyContent: "space-between" },
  qaBtn: { alignItems: "center", flex: 1 },
  qaIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 6, position: "relative" },
  qaLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#8E8E93", textAlign: "center" },
  qaBadge: { position: "absolute", top: -4, right: -4, backgroundColor: "#FF3B30", borderRadius: 10, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  qaBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },

  tabsRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  tabText: { fontSize: 14 },

  sectionHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  sectionHeaderText: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, textTransform: "uppercase" },

  txRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14,
    marginHorizontal: 16, marginBottom: 2, borderRadius: 14, gap: 12,
  },
  txIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  txCenter: { flex: 1, gap: 2 },
  txLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  txSub: { fontSize: 12, fontFamily: "Inter_500Medium" },
  txTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  txAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },

  empty: { alignItems: "center", paddingTop: 64, paddingHorizontal: 32 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 8, textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
});

const sh = StyleSheet.create({
  title: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  balance: { fontSize: 13, marginBottom: 20 },
  rateRow: { fontSize: 12, marginBottom: 4 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 8 },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  previewBox: { borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1 },
  btn: { borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});

const det = StyleSheet.create({
  root: { flex: 1 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 8 },

  hero: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 20,
  },
  heroIcon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  heroAmount: { fontSize: 34, fontFamily: "Inter_700Bold", letterSpacing: -1, marginBottom: 6 },
  heroType: { fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 14 },

  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  card: { borderRadius: 16, overflow: "hidden" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  rowValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", maxWidth: "60%", textAlign: "right" },
  sep: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  refLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 8 },
  refRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  refValue: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  copyBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  doneBtn: { borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  doneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
