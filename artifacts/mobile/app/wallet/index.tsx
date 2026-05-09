/**
 * AfuChat Wallet — Dashboard (Rebuilt)
 *
 * Transaction sources:
 *  • xp_transfers         — Nexa sent / received
 *  • acoin_transactions   — ACoin: topup, conversion, subscription, marketplace, game, etc.
 *  • gift_transactions    — gifts sent / received
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
import { LinearGradient } from "expo-linear-gradient";
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

// ─── Types ─────────────────────────────────────────────────────────────────────

type Transaction = {
  id: string;
  type: string;
  amount: number;
  created_at: string;
  label: string;
  icon: string;
  color: string;
  currency: "nexa" | "acoin" | "gift";
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

type TabKey = "all" | "acoin" | "nexa" | "gifts";
type BalanceCurrency = "acoin" | "nexa";

// ─── Date helpers ──────────────────────────────────────────────────────────────

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

// ─── Transaction Detail Modal ──────────────────────────────────────────────────

function DetailRow({ label, value, valueColor, bold, colors, last }: {
  label: string; value: string; valueColor?: string; bold?: boolean; colors: any; last?: boolean;
}) {
  return (
    <>
      <View style={det.row}>
        <Text style={[det.rowLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[det.rowValue, { color: valueColor || colors.text }, bold ? { fontFamily: "Inter_700Bold" } : {}]} numberOfLines={3}>
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

function TransactionDetailModal({ tx, visible, onClose, colors, insets }: {
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
    tx.type === "gift_received" ? "Received"
    : tx.currency === "points" ? `+${absAmount.toLocaleString()} XP`
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
    <Modal visible={visible} animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={onClose} statusBarTranslucent>
      <View style={[det.root, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[det.handle, { backgroundColor: colors.border }]} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          <View style={[det.hero, { backgroundColor: tx.color + "0E" }]}>
            <View style={[det.heroIcon, { backgroundColor: tx.color + "22" }]}>
              <Ionicons name={tx.icon as any} size={30} color={tx.color} />
            </View>
            <Text style={[det.heroAmount, { color: amountColor }]}>{amountStr}</Text>
            <Text style={[det.heroType, { color: colors.textMuted }]}>{tx.label}</Text>
            {tx.status && <StatusBadge status={tx.status} colors={colors} />}
          </View>
          <View style={[det.card, { backgroundColor: colors.surface, marginHorizontal: 20, marginTop: 20 }]}>
            <DetailRow label="Date" value={formatDate(d)} colors={colors} />
            <DetailRow label="Time" value={formatTime(d)} colors={colors} />
            <DetailRow label="Type" value={tx.label} colors={colors} />
            {currencyLabel && <DetailRow label="Currency" value={currencyLabel} colors={colors} />}
            {tx.counterparty && <DetailRow label={directionLabel} value={tx.counterparty} valueColor={Colors.brand} colors={colors} />}
            {tx.message && <DetailRow label="Note" value={tx.message} colors={colors} />}
            {(tx.nexaSpent ?? 0) > 0 && <DetailRow label="Nexa Used" value={`${tx.nexaSpent!.toLocaleString()} Nexa`} colors={colors} />}
            {(tx.fee ?? 0) > 0 && <DetailRow label="Fee" value={`${tx.fee} ACoin`} colors={colors} />}
            {tx.metadata?.rate && <DetailRow label="Exchange Rate" value={`${tx.metadata.rate} Nexa = 1 ACoin`} colors={colors} />}
            {tx.metadata?.plan_name && <DetailRow label="Plan" value={tx.metadata.plan_name} colors={colors} />}
            {tx.metadata?.activity_type && <DetailRow label="Activity" value={(tx.metadata.activity_type as string).replace(/_/g, " ")} colors={colors} />}
            <DetailRow label="Amount" value={amountStr} valueColor={amountColor} bold colors={colors} last />
          </View>
          <View style={[det.card, { backgroundColor: colors.surface, marginHorizontal: 20, marginTop: 12 }]}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={[det.refLabel, { color: colors.textMuted }]}>Reference ID</Text>
              <View style={det.refRow}>
                <Text style={[det.refValue, { color: colors.text }]}>{refId}</Text>
                <TouchableOpacity style={[det.copyBtn, { backgroundColor: Colors.brand + "15" }]} onPress={copyRef} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="copy-outline" size={14} color={Colors.brand} />
                  <Text style={[det.copyBtnText, { color: Colors.brand }]}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <TouchableOpacity style={[det.doneBtn, { backgroundColor: Colors.brand, marginHorizontal: 20, marginTop: 20 }]} onPress={onClose} activeOpacity={0.85}>
            <Text style={det.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Send Nexa Sheet ───────────────────────────────────────────────────────────

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
      <View style={sh.sheetHandle} />
      <Text style={[sh.title, { color: colors.text }]}>Send Nexa</Text>
      <View style={[sh.balancePill, { backgroundColor: "#FF950010", borderColor: "#FF950030" }]}>
        <Ionicons name="flash" size={14} color="#FF9500" />
        <Text style={[sh.balancePillText, { color: "#FF9500" }]}>
          Balance: {(profile?.xp || 0).toLocaleString()} Nexa
        </Text>
      </View>
      <Text style={[sh.label, { color: colors.textMuted }]}>RECIPIENT</Text>
      <View style={[sh.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Text style={{ color: colors.textMuted, fontSize: 16, marginRight: 4 }}>@</Text>
        <TextInput style={[sh.input, { color: colors.text }]} placeholder="username" placeholderTextColor={colors.textMuted} value={handle} onChangeText={setHandle} autoCapitalize="none" autoCorrect={false} />
      </View>
      <Text style={[sh.label, { color: colors.textMuted, marginTop: 16 }]}>AMOUNT</Text>
      <View style={[sh.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Ionicons name="flash" size={18} color="#FF9500" style={{ marginRight: 8 }} />
        <TextInput style={[sh.input, { color: colors.text }]} placeholder="0" placeholderTextColor={colors.textMuted} value={amount} onChangeText={setAmount} keyboardType="number-pad" />
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>Nexa</Text>
      </View>
      <Text style={[sh.label, { color: colors.textMuted, marginTop: 16 }]}>NOTE (OPTIONAL)</Text>
      <View style={[sh.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <TextInput style={[sh.input, { color: colors.text }]} placeholder="Add a message…" placeholderTextColor={colors.textMuted} value={msg} onChangeText={setMsg} maxLength={120} />
      </View>
      <TouchableOpacity style={[sh.btn, { backgroundColor: "#FF9500", opacity: sending ? 0.7 : 1, marginTop: 24 }]} onPress={send} disabled={sending} activeOpacity={0.85}>
        {sending ? <ActivityIndicator color="#fff" /> : (
          <><Ionicons name="paper-plane" size={18} color="#fff" /><Text style={sh.btnText}>Send Nexa</Text></>
        )}
      </TouchableOpacity>
    </SwipeableBottomSheet>
  );
}

// ─── Convert Sheet ─────────────────────────────────────────────────────────────

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
              user_id: profile.id, amount: preview.acoin, transaction_type: "conversion",
              nexa_spent: nexaAmt, fee_charged: preview.fee,
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
      <View style={sh.sheetHandle} />
      <Text style={[sh.title, { color: colors.text }]}>Convert Nexa → ACoin</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
        <View style={[sh.balancePill, { flex: 1, backgroundColor: "#FF950010", borderColor: "#FF950030" }]}>
          <Ionicons name="flash" size={13} color="#FF9500" />
          <Text style={[sh.balancePillText, { color: "#FF9500", fontSize: 12 }]}>{(profile?.xp || 0).toLocaleString()} Nexa</Text>
        </View>
        {currencySettings && (
          <View style={[sh.balancePill, { flex: 1, backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Ionicons name="swap-horizontal" size={13} color={colors.textMuted} />
            <Text style={[sh.balancePillText, { color: colors.textMuted, fontSize: 12 }]}>
              {currencySettings.nexa_to_acoin_rate}:1 · {currencySettings.conversion_fee_percent}% fee
            </Text>
          </View>
        )}
      </View>
      <Text style={[sh.label, { color: colors.textMuted }]}>NEXA AMOUNT</Text>
      <View style={[sh.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Ionicons name="flash" size={18} color="#FF9500" style={{ marginRight: 8 }} />
        <TextInput style={[sh.input, { color: colors.text }]} placeholder="0" placeholderTextColor={colors.textMuted} value={amount} onChangeText={setAmount} keyboardType="number-pad" />
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>Nexa</Text>
      </View>
      {preview && (
        <View style={[sh.previewBox, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "30" }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: "Inter_500Medium" }}>You receive</Text>
            <Text style={{ color: "#34C759", fontSize: 18, fontFamily: "Inter_700Bold" }}>+{preview.acoin} ACoin</Text>
          </View>
          <View style={[sh.previewDivider, { backgroundColor: Colors.brand + "20" }]} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Conversion fee</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: "Inter_500Medium" }}>{preview.fee} ACoin</Text>
          </View>
        </View>
      )}
      <TouchableOpacity
        style={[sh.btn, { backgroundColor: Colors.brand, opacity: (converting || !preview) ? 0.6 : 1, marginTop: 24 }]}
        onPress={convert} disabled={converting || !preview} activeOpacity={0.85}>
        {converting ? <ActivityIndicator color="#fff" /> : (
          <><Ionicons name="swap-horizontal" size={18} color="#fff" /><Text style={sh.btnText}>Convert</Text></>
        )}
      </TouchableOpacity>
    </SwipeableBottomSheet>
  );
}

// ─── Main Wallet Screen ────────────────────────────────────────────────────────

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
  const [balanceCurrency, setBalanceCurrency] = useState<BalanceCurrency>("acoin");

  const loadData = useCallback(async () => {
    if (!user) return;
    if (!isOnline()) {
      const cached = await getCachedWallet();
      if (cached) { setTransactions(cached.transactions); setLoading(false); setRefreshing(false); }
      return;
    }

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
        .eq("sender_id", user.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("xp_transfers")
        .select("id, amount, created_at, status, message, sender_id, profiles!xp_transfers_sender_id_fkey(handle, display_name)")
        .eq("receiver_id", user.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("acoin_transactions")
        .select("id, amount, transaction_type, nexa_spent, fee_charged, created_at, metadata")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("currency_settings")
        .select("nexa_to_acoin_rate, conversion_fee_percent, p2p_fee_percent").limit(1).single(),
      supabase.from("gift_transactions")
        .select("id, gift_id, receiver_id, xp_cost, message, created_at, gifts(name, emoji), profiles!gift_transactions_receiver_id_fkey(handle, display_name)")
        .eq("sender_id", user.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("gift_transactions")
        .select("id, gift_id, sender_id, xp_cost, message, created_at, gifts(name, emoji), profiles!gift_transactions_sender_id_fkey(handle, display_name)")
        .eq("receiver_id", user.id).order("created_at", { ascending: false }).limit(100),
    ]);

    if (settings) setCurrencySettings(settings as CurrencySettings);

    const all: Transaction[] = [];

    (xpSent || []).forEach((t: any) => {
      const p = t.profiles;
      all.push({
        id: t.id, type: "nexa_sent", amount: -t.amount, created_at: t.created_at,
        label: "Nexa Sent", icon: "arrow-up-circle", color: "#FF3B30", currency: "nexa",
        counterparty: p ? `@${p.handle}` : undefined, message: t.message || undefined, status: t.status || "completed",
      });
    });

    (xpReceived || []).forEach((t: any) => {
      const p = t.profiles;
      all.push({
        id: t.id, type: "nexa_received", amount: t.amount, created_at: t.created_at,
        label: "Nexa Received", icon: "arrow-down-circle", color: Colors.brand, currency: "nexa",
        counterparty: p ? `@${p.handle}` : undefined, message: t.message || undefined, status: t.status || "completed",
      });
    });

    const acoinLabelMap: Record<string, { label: string; icon: string }> = {
      conversion:              { label: "Nexa → ACoin",          icon: "swap-horizontal"   },
      subscription:            { label: "Premium Subscription",   icon: "diamond"           },
      subscription_cancelled:  { label: "Subscription Cancelled", icon: "close-circle"      },
      gift_conversion:         { label: "Gift Converted",         icon: "gift"              },
      marketplace_purchase:    { label: "Marketplace Purchase",   icon: "cart"              },
      marketplace_sale:        { label: "Marketplace Sale",       icon: "storefront"        },
      topup:                   { label: "ACoin Top-Up",           icon: "card"              },
      acoin_transfer_sent:     { label: "ACoin Sent",             icon: "arrow-up-circle"   },
      acoin_transfer_received: { label: "ACoin Received",         icon: "arrow-down-circle" },
      game_purchase:           { label: "Game Purchase",          icon: "game-controller"   },
      game_reward:             { label: "Game Reward",            icon: "trophy"            },
      prestige_upgrade:        { label: "Prestige Upgrade",       icon: "star"              },
      red_envelope_sent:       { label: "Red Envelope Sent",      icon: "gift"              },
      red_envelope_claimed:    { label: "Red Envelope Received",  icon: "gift"              },
      request_payment:         { label: "Payment Request",        icon: "receipt"           },
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

    (giftsSent || []).forEach((t: any) => {
      const p = t.profiles;
      all.push({
        id: "gs_" + t.id, type: "gift_sent", amount: -(t.xp_cost || 0), created_at: t.created_at,
        label: `Sent ${t.gifts?.emoji || "🎁"} ${t.gifts?.name || "Gift"}`,
        icon: "gift", color: "#FF3B30", currency: "nexa",
        counterparty: p ? `@${p.handle}` : undefined, message: t.message || undefined, status: "completed",
      });
    });

    (giftsReceived || []).forEach((t: any) => {
      const p = t.profiles;
      all.push({
        id: "gr_" + t.id, type: "gift_received", amount: 0, created_at: t.created_at,
        label: `Received ${t.gifts?.emoji || "🎁"} ${t.gifts?.name || "Gift"}`,
        icon: "gift", color: "#AF52DE", currency: "gift",
        counterparty: p ? `@${p.handle}` : undefined, message: t.message || undefined, status: "completed",
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
      .from("transaction_requests").select("id", { count: "exact", head: true })
      .eq("owner_id", user.id).eq("status", "pending");
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

  // ── Filtering ───────────────────────────────────────────────────────────────

  const filteredTx = activeTab === "all" ? transactions
    : activeTab === "gifts" ? transactions.filter((t) => ["gift_sent", "gift_received", "gift_conversion", "marketplace_purchase", "marketplace_sale"].includes(t.type))
    : transactions.filter((t) => t.currency === activeTab);

  const groups = groupByDate(filteredTx);
  const flatList: ({ type: "header"; title: string } | { type: "tx"; tx: Transaction })[] = [];
  for (const group of groups) {
    flatList.push({ type: "header", title: group.title });
    for (const tx of group.data) flatList.push({ type: "tx", tx });
  }

  const acoin = profile?.acoin || 0;
  const nexa = profile?.xp || 0;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "acoin", label: "ACoin" },
    { key: "nexa", label: "Nexa" },
    { key: "gifts", label: "Gifts" },
  ];

  // Hero card config
  const balanceConfig = {
    acoin: { label: "ACoin", value: acoin, icon: "diamond" as const, color: Colors.brand, gradient: ["#003D44", "#001A1F"] as [string, string] },
    nexa:  { label: "Nexa",  value: nexa,  icon: "flash"   as const, color: "#FF9500",    gradient: ["#3D1F00", "#1F0E00"] as [string, string] },
  };
  const bc = balanceConfig[balanceCurrency];

  // Quick actions
  const actions = [
    { icon: "add-circle" as const, label: "Buy", color: Colors.brand, onPress: () => router.push("/wallet/topup") },
    { icon: "paper-plane" as const, label: "Send", color: "#FF9500", onPress: () => setShowTransfer(true) },
    { icon: "swap-horizontal" as const, label: "Convert", color: "#7B61FF", onPress: () => setShowConvert(true) },
    { icon: "scan" as const, label: "Scan", color: "#34C759", onPress: () => router.push("/wallet/scan") },
    { icon: "receipt-outline" as const, label: "Requests", color: "#AF52DE", onPress: () => router.push("/wallet/requests"), badge: pendingRequestCount },
    { icon: "gift" as const, label: "Vault", color: "#FF2D55", onPress: () => router.push("/wallet/gift-vault") },
  ];

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <StatusBar barStyle="light-content" />
      <OfflineBanner />

      <SendNexaSheet visible={showTransfer} onClose={() => setShowTransfer(false)} colors={colors} profile={profile} onSuccess={() => { refreshProfile(); loadData(); }} />
      <ConvertSheet visible={showConvert} onClose={() => setShowConvert(false)} colors={colors} profile={profile} currencySettings={currencySettings} onSuccess={() => { refreshProfile(); loadData(); }} />
      <TransactionDetailModal tx={selectedTx} visible={!!selectedTx} onClose={() => setSelectedTx(null)} colors={colors} insets={insets} />

      <FlatList
        data={flatList}
        keyExtractor={(item, i) => item.type === "header" ? `h-${item.title}` : `tx-${item.tx.id}-${i}`}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#fff" />
        }
        ListHeaderComponent={() => (
          <>
            {/* ── Hero gradient card ── */}
            <LinearGradient colors={["#0C2A2E", "#061518"]} style={[s.heroGradient, { paddingTop: insets.top + 12 }]}>
              {/* Top bar */}
              <View style={s.heroTopBar}>
                <View>
                  <Text style={s.heroGreeting}>AfuChat Wallet</Text>
                </View>
                <TouchableOpacity onPress={() => router.push("/wallet/scan")} style={s.heroScanBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="scan-outline" size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Currency tabs */}
              <View style={s.currencyTabs}>
                {(["acoin", "nexa"] as BalanceCurrency[]).map((c) => {
                  const conf = balanceConfig[c];
                  const active = balanceCurrency === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[s.currencyTab, active && { backgroundColor: conf.color + "30", borderColor: conf.color + "70" }]}
                      onPress={() => { setBalanceCurrency(c); Haptics.selectionAsync(); }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={conf.icon} size={12} color={active ? conf.color : "rgba(255,255,255,0.45)"} />
                      <Text style={[s.currencyTabText, { color: active ? conf.color : "rgba(255,255,255,0.45)" }]}>
                        {conf.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Big balance */}
              <View style={s.heroBigBalance}>
                <Text style={[s.heroBigNumber, { color: bc.color }]}>
                  {bc.value.toLocaleString()}
                </Text>
                <Text style={s.heroBigLabel}>{bc.label}</Text>
              </View>

              {/* Mini balances for others */}
              <View style={s.heroMiniRow}>
                {balanceCurrency !== "acoin" && (
                  <View style={[s.heroMiniPill, { borderColor: Colors.brand + "40" }]}>
                    <Ionicons name="diamond" size={11} color={Colors.brand} />
                    <Text style={[s.heroMiniText, { color: Colors.brand }]}>{acoin.toLocaleString()} ACoin</Text>
                  </View>
                )}
                {balanceCurrency !== "nexa" && (
                  <View style={[s.heroMiniPill, { borderColor: "#FF950040" }]}>
                    <Ionicons name="flash" size={11} color="#FF9500" />
                    <Text style={[s.heroMiniText, { color: "#FF9500" }]}>{nexa.toLocaleString()} Nexa</Text>
                  </View>
                )}
              </View>

              {/* Quick actions */}
              <View style={s.actionsRow}>
                {actions.map((a) => (
                  <TouchableOpacity key={a.label} style={s.actionBtn} onPress={a.onPress} activeOpacity={0.7}>
                    <View style={[s.actionIconWrap, { backgroundColor: a.color + "20", borderColor: a.color + "40" }]}>
                      <Ionicons name={a.icon} size={22} color={a.color} />
                      {(a.badge ?? 0) > 0 && (
                        <View style={s.actionBadge}>
                          <Text style={s.actionBadgeText}>{a.badge! > 9 ? "9+" : a.badge}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.actionLabel}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </LinearGradient>

            {/* ── Filter tabs ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
              {tabs.map(({ key, label }) => {
                const active = activeTab === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[s.tabBtn, { backgroundColor: active ? Colors.brand : colors.surface, borderColor: active ? Colors.brand : colors.border }]}
                    onPress={() => setActiveTab(key)} activeOpacity={0.75}
                  >
                    <Text style={[s.tabText, { color: active ? "#fff" : colors.textMuted, fontFamily: active ? "Inter_700Bold" : "Inter_500Medium" }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Section heading */}
            <View style={s.sectionBar}>
              <Text style={[s.sectionBarText, { color: colors.text }]}>Transactions</Text>
              {transactions.length > 0 && (
                <Text style={[s.sectionBarCount, { color: colors.textMuted }]}>{filteredTx.length}</Text>
              )}
            </View>
          </>
        )}
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={s.dateHeader}>
                <View style={[s.dateHeaderLine, { backgroundColor: colors.border }]} />
                <Text style={[s.dateHeaderText, { color: colors.textMuted, backgroundColor: colors.backgroundSecondary }]}>
                  {item.title}
                </Text>
                <View style={[s.dateHeaderLine, { backgroundColor: colors.border }]} />
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
            tx.type === "gift_received" ? "Gift"
            : tx.currency === "points" ? `+${absAmt.toLocaleString()} XP`
            : `${isPos ? "+" : "-"}${absAmt.toLocaleString()}${currLabel ? ` ${currLabel}` : ""}`;
          const amtColor =
            tx.type === "gift_received" ? "#AF52DE"
            : tx.currency === "points" ? "#FF9500"
            : isPos ? "#34C759" : "#FF3B30";
          const showStatusDot = tx.status && tx.status !== "completed";
          const statusDotColor = tx.status === "failed" ? "#FF3B30" : "#FF9500";

          return (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedTx(tx); }}
              style={({ pressed }) => [s.txRow, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[s.txIconWrap, { backgroundColor: tx.color + "18" }]}>
                <Ionicons name={tx.icon as any} size={20} color={tx.color} />
              </View>
              <View style={s.txCenter}>
                <Text style={[s.txLabel, { color: colors.text }]} numberOfLines={1}>{tx.label}</Text>
                {tx.counterparty && (
                  <Text style={[s.txCounterparty, { color: Colors.brand }]} numberOfLines={1}>{tx.counterparty}</Text>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[s.txTime, { color: colors.textMuted }]}>{formatTimeShort(tx.created_at)}</Text>
                  {showStatusDot && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: statusDotColor }} />
                      <Text style={{ fontSize: 10, color: statusDotColor, fontFamily: "Inter_600SemiBold" }}>{tx.status}</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={{ alignItems: "flex-end", gap: 3 }}>
                <Text style={[s.txAmount, { color: amtColor }]}>{amtStr}</Text>
                <Ionicons name="chevron-forward" size={13} color={colors.border} />
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View style={{ padding: 16 }}><WalletSkeleton /></View>
          ) : (
            <View style={s.empty}>
              <View style={[s.emptyIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name="receipt-outline" size={38} color={colors.textMuted} />
              </View>
              <Text style={[s.emptyTitle, { color: colors.text }]}>No transactions yet</Text>
              <Text style={[s.emptySub, { color: colors.textMuted }]}>
                {activeTab === "points"
                  ? "Earn XP by posting, sending messages and daily login"
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

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // Hero gradient
  heroGradient: { paddingHorizontal: 20, paddingBottom: 28 },
  heroTopBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  heroGreeting: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  heroScanBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center",
  },

  // Currency tabs
  currencyTabs: { flexDirection: "row", gap: 8, marginBottom: 28 },
  currencyTab: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  currencyTabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Big balance
  heroBigBalance: { alignItems: "center", marginBottom: 16 },
  heroBigNumber: { fontSize: 52, fontFamily: "Inter_700Bold", letterSpacing: -1.5 },
  heroBigLabel: { fontSize: 14, color: "rgba(255,255,255,0.55)", fontFamily: "Inter_500Medium", marginTop: 2 },

  // Mini pills
  heroMiniRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginBottom: 28 },
  heroMiniPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  heroMiniText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Actions row
  actionsRow: { flexDirection: "row", justifyContent: "space-between" },
  actionBtn: { alignItems: "center", flex: 1 },
  actionIconWrap: {
    width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center",
    marginBottom: 6, borderWidth: 1, position: "relative",
  },
  actionBadge: {
    position: "absolute", top: -5, right: -5,
    backgroundColor: "#FF3B30", borderRadius: 10, minWidth: 18, height: 18,
    paddingHorizontal: 4, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "#061518",
  },
  actionBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" },
  actionLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.6)", textAlign: "center" },

  // Filter tabs
  tabsRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  tabText: { fontSize: 14 },

  // Section heading
  sectionBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 8 },
  sectionBarText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  sectionBarCount: { fontSize: 13, fontFamily: "Inter_500Medium" },

  // Date headers
  dateHeader: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginVertical: 12, gap: 8 },
  dateHeaderLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateHeaderText: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, paddingHorizontal: 4 },

  // Transaction rows
  txRow: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginBottom: 2,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, gap: 12,
  },
  txIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  txCenter: { flex: 1, gap: 2 },
  txLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  txCounterparty: { fontSize: 12, fontFamily: "Inter_500Medium" },
  txTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  txAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },

  // Empty
  empty: { alignItems: "center", paddingTop: 56, paddingHorizontal: 32 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 8, textAlign: "center" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 24 },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
});

// ─── Sheet styles ──────────────────────────────────────────────────────────────

const sh = StyleSheet.create({
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#D1D1D6", alignSelf: "center", marginBottom: 20 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 14 },
  balancePill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginBottom: 20 },
  balancePillText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 8 },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1 },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  previewBox: { borderRadius: 14, padding: 16, marginTop: 14, borderWidth: 1 },
  previewDivider: { height: StyleSheet.hairlineWidth },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 16 },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});

// ─── Detail modal styles ───────────────────────────────────────────────────────

const det = StyleSheet.create({
  root: { flex: 1 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  hero: { alignItems: "center", paddingVertical: 32, paddingHorizontal: 24, marginHorizontal: 20, marginTop: 20, borderRadius: 20 },
  heroIcon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  heroAmount: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 6 },
  heroType: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 12 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 16, overflow: "hidden" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  rowLabel: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  rowValue: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "right", flex: 1.5 },
  sep: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  refLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 6 },
  refRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  refValue: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  copyBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  doneBtn: { borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  doneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
