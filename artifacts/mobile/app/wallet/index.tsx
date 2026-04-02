import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { useIsDesktop } from "@/hooks/useIsDesktop";

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

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) + " at " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function DetailRow({ label, value, valueColor, colors }: { label: string; value: string; valueColor?: string; colors: any }) {
  return (
    <View style={detailStyles.row}>
      <Text style={[detailStyles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[detailStyles.rowValue, { color: valueColor || colors.text }]}>{value}</Text>
    </View>
  );
}

function TransactionDetailModal({ tx, visible, onClose, colors }: { tx: Transaction | null; visible: boolean; onClose: () => void; colors: any }) {
  if (!tx) return null;

  const isPositive = tx.amount > 0;
  const absAmount = Math.abs(tx.amount);
  const currencyLabel = tx.currency === "nexa" ? "Nexa" : tx.currency === "gift" ? "" : "ACoin";
  const amountDisplay = tx.type === "gift_received" ? "Received" : `${isPositive ? "+" : "-"}${absAmount} ${currencyLabel}`;
  const amountColor = tx.type === "gift_received" ? "#AF52DE" : isPositive ? "#34C759" : "#FF3B30";
  const refId = tx.id.length > 12 ? tx.id.substring(0, 12).toUpperCase() : tx.id.toUpperCase();

  return (
    <SwipeableBottomSheet visible={visible} onClose={onClose} backgroundColor={colors.surface} maxHeight="90%">
      <View style={detailStyles.header}>
        <Text style={[detailStyles.title, { color: colors.text }]}>Transaction Details</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[detailStyles.amountCard, { backgroundColor: tx.color + "15" }]}>
          <View style={[detailStyles.amountIcon, { backgroundColor: tx.color + "25" }]}>
            <Ionicons name={tx.icon as any} size={28} color={tx.color} />
          </View>
          <Text style={[detailStyles.amountText, { color: amountColor }]}>{amountDisplay}</Text>
          <Text style={[detailStyles.typeText, { color: colors.textSecondary }]}>{tx.label}</Text>
        </View>

        <View style={[detailStyles.section, { backgroundColor: colors.inputBg }]}>
          <DetailRow label="Date" value={formatDateTime(tx.created_at)} colors={colors} />
          <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
          <DetailRow label="Type" value={tx.label} colors={colors} />
          <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
          <DetailRow label="Currency" value={currencyLabel || "Gift"} colors={colors} />
          {tx.status && (
            <>
              <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
              <DetailRow label="Status" value={tx.status === "completed" || !tx.status ? "Completed" : tx.status === "pending" ? "Pending" : tx.status === "failed" ? "Failed" : tx.status} valueColor={tx.status === "failed" ? "#FF3B30" : tx.status === "pending" ? "#FF9500" : "#34C759"} colors={colors} />
            </>
          )}
          {tx.counterparty && (
            <>
              <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
              <DetailRow label={isPositive || tx.type === "gift_received" || tx.type === "nexa_received" ? "From" : "To"} value={tx.counterparty} valueColor={colors.accent} colors={colors} />
            </>
          )}
          {tx.message && (
            <>
              <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
              <DetailRow label="Message" value={tx.message} colors={colors} />
            </>
          )}
          {tx.nexaSpent != null && tx.nexaSpent > 0 && (
            <>
              <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
              <DetailRow label="Nexa Spent" value={`${tx.nexaSpent} Nexa`} colors={colors} />
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
          {tx.metadata?.duration_days && (
            <>
              <View style={[detailStyles.divider, { backgroundColor: colors.border }]} />
              <DetailRow label="Duration" value={`${tx.metadata.duration_days} days`} colors={colors} />
            </>
          )}
        </View>

        <View style={[detailStyles.section, { backgroundColor: colors.inputBg, marginTop: 12 }]}>
          <DetailRow label="Reference" value={refId} colors={colors} />
        </View>
      </ScrollView>
    </SwipeableBottomSheet>
  );
}

export default function WalletScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [transferHandle, setTransferHandle] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferMsg, setTransferMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [convertAmount, setConvertAmount] = useState("");
  const [converting, setConverting] = useState(false);
  const [currencySettings, setCurrencySettings] = useState<CurrencySettings | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "nexa" | "acoin" | "gifts">("all");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;
    const [{ data: xpSent }, { data: xpReceived }, { data: acoinTx }, { data: settings }, { data: giftsSent }, { data: giftsReceived }] = await Promise.all([
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
      const recipientProfile = t.profiles;
      const counterparty = recipientProfile ? `@${recipientProfile.handle}` : undefined;
      all.push({ id: t.id, type: "nexa_sent", amount: -t.amount, created_at: t.created_at, label: "Nexa Sent", icon: "arrow-up-circle", color: "#FF3B30", currency: "nexa", counterparty, message: t.message || undefined, status: t.status || "completed" });
    });

    (xpReceived || []).forEach((t: any) => {
      const senderProfile = t.profiles;
      const counterparty = senderProfile ? `@${senderProfile.handle}` : undefined;
      all.push({ id: t.id, type: "nexa_received", amount: t.amount, created_at: t.created_at, label: "Nexa Received", icon: "arrow-down-circle", color: colors.accent, currency: "nexa", counterparty, message: t.message || undefined, status: t.status || "completed" });
    });

    const acoinLabelMap: Record<string, { label: string; icon: string }> = {
      conversion: { label: "Nexa \u2192 ACoin", icon: "swap-horizontal" },
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
      if (giftName && (t.transaction_type === "gift_conversion" || t.transaction_type === "marketplace_purchase" || t.transaction_type === "marketplace_sale")) {
        label += ` \u00b7 ${giftName}`;
      }
      const icon = mapped?.icon || (t.amount > 0 ? "arrow-down-circle" : "arrow-up-circle");
      let counterparty: string | undefined;
      if (t.transaction_type === "acoin_transfer_sent" && t.metadata?.to_handle) counterparty = `@${t.metadata.to_handle}`;
      if (t.transaction_type === "acoin_transfer_received" && t.metadata?.from_handle) counterparty = `@${t.metadata.from_handle}`;
      all.push({
        id: t.id, type: t.transaction_type, amount: t.amount, created_at: t.created_at, label, icon,
        color: t.amount > 0 ? "#34C759" : "#FF9500", currency: "acoin",
        fee: t.fee_charged || undefined, nexaSpent: t.nexa_spent || undefined,
        metadata: t.metadata || undefined, counterparty,
        message: t.metadata?.message || undefined,
        status: "completed",
      });
    });

    (giftsSent || []).forEach((t: any) => {
      const giftName = t.gifts?.name || "Gift";
      const giftEmoji = t.gifts?.emoji || "\ud83c\udf81";
      const recipientProfile = t.profiles;
      const counterparty = recipientProfile ? `@${recipientProfile.handle}` : undefined;
      all.push({ id: "gs_" + t.id, type: "gift_sent", amount: -(t.xp_cost || 0), created_at: t.created_at, label: `Sent ${giftEmoji} ${giftName}`, icon: "gift", color: "#FF3B30", currency: "nexa", counterparty, message: t.message || undefined, status: "completed" });
    });

    (giftsReceived || []).forEach((t: any) => {
      const giftName = t.gifts?.name || "Gift";
      const giftEmoji = t.gifts?.emoji || "\ud83c\udf81";
      const senderProfile = t.profiles;
      const counterparty = senderProfile ? `@${senderProfile.handle}` : undefined;
      all.push({ id: "gr_" + t.id, type: "gift_received", amount: 0, created_at: t.created_at, label: `Received ${giftEmoji} ${giftName}`, icon: "gift", color: "#AF52DE", currency: "gift", counterparty, message: t.message || undefined, status: "completed" });
    });

    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setTransactions(all);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

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

  const filteredTx = activeTab === "all" ? transactions : activeTab === "gifts"
    ? transactions.filter((t) => t.type === "gift_sent" || t.type === "gift_received" || t.type === "gift_conversion" || t.type === "marketplace_purchase" || t.type === "marketplace_sale")
    : transactions.filter((t) => t.currency === activeTab);

  async function sendNexa() {
    if (!transferHandle.trim() || !transferAmount.trim() || !user) return;
    const amt = parseInt(transferAmount);
    if (isNaN(amt) || amt <= 0) { showAlert("Invalid", "Enter a valid amount."); return; }
    if (amt > (profile?.xp || 0)) { showAlert("Insufficient Nexa", "You don't have enough Nexa."); return; }
    setSending(true);

    const { data: recipient } = await supabase.from("profiles").select("id, display_name").eq("handle", transferHandle.trim().toLowerCase()).single();
    if (!recipient) { showAlert("Not found", "User not found."); setSending(false); return; }
    if (recipient.id === user.id) { showAlert("Error", "Cannot send to yourself."); setSending(false); return; }

    const { data: deducted, error: deductErr } = await supabase.from("profiles").update({ xp: (profile?.xp || 0) - amt }).eq("id", user.id).gte("xp", amt).select("id").maybeSingle();
    if (deductErr || !deducted) { showAlert("Error", "Could not deduct Nexa \u2014 balance may have changed."); setSending(false); return; }

    const { error: creditErr } = await supabase.rpc("award_xp", { p_user_id: recipient.id, p_action_type: "nexa_transfer_received", p_xp_amount: amt, p_metadata: { from_user_id: user.id } });
    if (creditErr) {
      await supabase.from("profiles").update({ xp: (profile?.xp || 0) }).eq("id", user.id);
      showAlert("Error", "Could not credit recipient. Your Nexa has been refunded.");
      setSending(false);
      return;
    }

    const { error } = await supabase.from("xp_transfers").insert({ sender_id: user.id, receiver_id: recipient.id, amount: amt, message: transferMsg.trim() || null });
    if (error) console.warn("Nexa transfer succeeded but transfer log failed:", error.message);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Sent!", `${amt} Nexa sent to ${recipient.display_name}`);
    setShowTransfer(false);
    setTransferHandle("");
    setTransferAmount("");
    setTransferMsg("");
    refreshProfile();
    loadData();
    setSending(false);
  }

  async function convertNexaToAcoin() {
    if (!convertAmount.trim() || !user || !currencySettings || !profile) return;
    const nexaAmt = parseInt(convertAmount);
    if (isNaN(nexaAmt) || nexaAmt <= 0) { showAlert("Invalid", "Enter a valid Nexa amount."); return; }
    if (nexaAmt > (profile.xp || 0)) { showAlert("Insufficient Nexa", `You only have ${profile.xp} Nexa.`); return; }

    const rawAcoin = nexaAmt / currencySettings.nexa_to_acoin_rate;
    const fee = Math.ceil(rawAcoin * (currencySettings.conversion_fee_percent / 100));
    const netAcoin = Math.floor(rawAcoin - fee);

    if (netAcoin <= 0) { showAlert("Too Low", "Amount too small after fee. Try a larger amount."); return; }

    showAlert(
      "Confirm Conversion",
      `Convert ${nexaAmt} Nexa \u2192 ${netAcoin} ACoin?\n\nRate: ${currencySettings.nexa_to_acoin_rate} Nexa = 1 ACoin\nFee: ${currencySettings.conversion_fee_percent}% (${fee} ACoin)`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Convert",
          onPress: async () => {
            setConverting(true);

            const { error: deductErr } = await supabase.from("profiles").update({
              xp: (profile.xp || 0) - nexaAmt,
              acoin: (profile.acoin || 0) + netAcoin,
            }).eq("id", profile.id);

            if (deductErr) {
              showAlert("Error", deductErr.message);
              setConverting(false);
              return;
            }

            await supabase.from("acoin_transactions").insert({
              user_id: profile.id,
              amount: netAcoin,
              transaction_type: "conversion",
              nexa_spent: nexaAmt,
              fee_charged: fee,
              metadata: { rate: currencySettings.nexa_to_acoin_rate, fee_percent: currencySettings.conversion_fee_percent },
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showAlert("Converted!", `${nexaAmt} Nexa \u2192 ${netAcoin} ACoin`);
            setShowConvert(false);
            setConvertAmount("");
            refreshProfile();
            loadData();
            setConverting(false);
          },
        },
      ]
    );
  }

  const previewAcoin = (() => {
    if (!convertAmount.trim() || !currencySettings) return null;
    const n = parseInt(convertAmount);
    if (isNaN(n) || n <= 0) return null;
    const raw = n / currencySettings.nexa_to_acoin_rate;
    const fee = Math.ceil(raw * (currencySettings.conversion_fee_percent / 100));
    return { acoin: Math.floor(raw - fee), fee };
  })();

  const BalanceCard = (
    <View style={[styles.balanceCard, { backgroundColor: colors.accent, margin: isDesktop ? 0 : 16, borderRadius: isDesktop ? 0 : 20 }]}>
      <View style={styles.balanceRow}>
        <View style={styles.balanceItem}>
          <Ionicons name="flash" size={isDesktop ? 32 : 24} color="rgba(255,255,255,0.9)" />
          <Text style={[styles.balanceValue, isDesktop && { fontSize: 36 }]}>{profile?.xp || 0}</Text>
          <Text style={styles.balanceLabel}>Nexa</Text>
        </View>
        <View style={styles.balanceDivider} />
        <View style={styles.balanceItem}>
          <Ionicons name="diamond" size={isDesktop ? 32 : 24} color="rgba(255,255,255,0.9)" />
          <Text style={[styles.balanceValue, isDesktop && { fontSize: 36 }]}>{profile?.acoin || 0}</Text>
          <Text style={styles.balanceLabel}>ACoin</Text>
        </View>
      </View>
      <View style={styles.btnRow}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "rgba(212,168,83,0.15)" }]} onPress={() => router.push("/wallet/topup")}>
          <Ionicons name="diamond" size={16} color={Colors.gold} />
          <Text style={[styles.actionBtnText, { color: Colors.gold }]}>Buy ACoin</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowTransfer(true)}>
          <Ionicons name="send" size={16} color={colors.accent} />
          <Text style={styles.actionBtnText}>Send</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowConvert(true)}>
          <Ionicons name="swap-horizontal" size={16} color={colors.accent} />
          <Text style={styles.actionBtnText}>Convert</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.btnRow}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "rgba(255,255,255,0.22)" }]} onPress={() => router.push("/wallet/scan")}>
          <Ionicons name="scan" size={16} color="#fff" />
          <Text style={[styles.actionBtnText, { color: "#fff" }]}>Scan QR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "rgba(255,255,255,0.22)" }]} onPress={() => router.push("/wallet/requests")}>
          <Ionicons name="receipt-outline" size={16} color="#fff" />
          <Text style={[styles.actionBtnText, { color: "#fff" }]}>Requests</Text>
          {pendingRequestCount > 0 && (
            <View style={styles.requestBadge}>
              <Text style={styles.requestBadgeText}>{pendingRequestCount > 9 ? "9+" : pendingRequestCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const TabFilters = (
    <View style={[styles.tabRow, isDesktop && { marginHorizontal: 16, marginTop: 16 }]}>
      {(["all", "nexa", "acoin", "gifts"] as const).map((tab) => (
        <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && { backgroundColor: colors.accent }]} onPress={() => setActiveTab(tab)}>
          <Text style={[styles.tabText, activeTab === tab && { color: "#fff" }]}>
            {tab === "all" ? "All" : tab === "nexa" ? "Nexa" : tab === "acoin" ? "ACoin" : "Gifts"}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const TxList = (
    loading ? <WalletSkeleton /> : (
      <FlatList
        data={filteredTx}
        keyExtractor={(item) => item.id + item.type}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedTx(item); }}
            style={[styles.txRow, { backgroundColor: colors.surface }]}
          >
            <View style={[styles.txIcon, { backgroundColor: item.color + "20" }]}>
              <Ionicons name={item.icon as any} size={20} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.txLabel, { color: colors.text }]} numberOfLines={1}>{item.label}</Text>
              {item.counterparty ? (
                <Text style={[styles.txTime, { color: colors.textMuted }]}>{item.counterparty} {"\u00b7"} {new Date(item.created_at).toLocaleDateString()}</Text>
              ) : (
                <Text style={[styles.txTime, { color: colors.textMuted }]}>{new Date(item.created_at).toLocaleDateString()}</Text>
              )}
            </View>
            <View style={styles.txRight}>
              {item.type === "gift_received" ? (
                <Text style={[styles.txAmount, { color: "#AF52DE" }]}>{"\ud83c\udf81"}</Text>
              ) : (
                <>
                  <Text style={[styles.txAmount, { color: item.amount > 0 ? "#34C759" : "#FF3B30" }]}>
                    {item.amount > 0 ? "+" : ""}{item.amount}
                  </Text>
                  <Text style={[styles.txCurrency, { color: colors.textMuted }]}>
                    {item.currency === "nexa" ? "Nexa" : item.currency === "gift" ? "" : "ACoin"}
                  </Text>
                </>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={colors.accent} />}
        ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textMuted }]}>No transactions yet</Text>}
      />
    )
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Header */}
      <View style={[
        styles.header,
        {
          paddingTop: isDesktop ? 20 : insets.top + 8,
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          alignItems: "center",
        },
      ]}>
        {!isDesktop && (
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: isDesktop ? 20 : 17 }]}>
          {isDesktop ? "💰 My Wallet" : "Wallet"}
        </Text>
        {isDesktop ? (
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.accent + "15", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 }}
            onPress={() => router.push("/wallet/topup")}
          >
            <Ionicons name="add" size={16} color={colors.accent} />
            <Text style={{ color: colors.accent, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Top Up</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      {isDesktop ? (
        /* ── Desktop: two-column dashboard layout ── */
        <View style={{ flex: 1, flexDirection: "row" }}>
          {/* Left panel: balance + actions */}
          <ScrollView
            style={[dwStyles.leftPanel, { borderRightColor: colors.border }]}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {BalanceCard}

            {currencySettings && (
              <View style={[styles.rateCard, { backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 12 }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.rateText, { color: colors.textMuted }]}>
                  {currencySettings.nexa_to_acoin_rate} Nexa = 1 ACoin · Fee {currencySettings.conversion_fee_percent}%
                </Text>
              </View>
            )}

            {/* Desktop stat cards */}
            <View style={dwStyles.statGrid}>
              <View style={[dwStyles.statCard, { backgroundColor: colors.surface }]}>
                <Ionicons name="trending-up" size={20} color="#34C759" />
                <Text style={[dwStyles.statValue, { color: colors.text }]}>
                  {transactions.filter((t) => t.amount > 0).reduce((s, t) => s + Math.abs(t.amount), 0)}
                </Text>
                <Text style={[dwStyles.statLabel, { color: colors.textMuted }]}>Total Received</Text>
              </View>
              <View style={[dwStyles.statCard, { backgroundColor: colors.surface }]}>
                <Ionicons name="trending-down" size={20} color="#FF3B30" />
                <Text style={[dwStyles.statValue, { color: colors.text }]}>
                  {transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)}
                </Text>
                <Text style={[dwStyles.statLabel, { color: colors.textMuted }]}>Total Sent</Text>
              </View>
              <View style={[dwStyles.statCard, { backgroundColor: colors.surface }]}>
                <Ionicons name="receipt-outline" size={20} color={colors.accent} />
                <Text style={[dwStyles.statValue, { color: colors.text }]}>{transactions.length}</Text>
                <Text style={[dwStyles.statLabel, { color: colors.textMuted }]}>Transactions</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[dwStyles.requestsBtn, { backgroundColor: colors.accent }]}
              onPress={() => router.push("/wallet/requests")}
            >
              <Ionicons name="receipt-outline" size={18} color="#fff" />
              <Text style={dwStyles.requestsBtnText}>Payment Requests</Text>
              {pendingRequestCount > 0 && (
                <View style={styles.requestBadge}>
                  <Text style={styles.requestBadgeText}>{pendingRequestCount > 9 ? "9+" : pendingRequestCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </ScrollView>

          {/* Right panel: transaction history */}
          <View style={{ flex: 1 }}>
            <View style={[dwStyles.txHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <Text style={[dwStyles.txHeaderTitle, { color: colors.text }]}>Transaction History</Text>
              {TabFilters}
            </View>
            {TxList}
          </View>
        </View>
      ) : (
        /* ── Mobile: stacked layout ── */
        <>
          {BalanceCard}
          {currencySettings && (
            <View style={[styles.rateCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.rateText, { color: colors.textMuted }]}>
                Rate: {currencySettings.nexa_to_acoin_rate} Nexa = 1 ACoin {"\u00b7"} Fee: {currencySettings.conversion_fee_percent}%
              </Text>
            </View>
          )}
          {TabFilters}
          {TxList}
          {/* Hidden gift vault entry — only visible on ACoin tab at bottom */}
          {activeTab === "acoin" && (
            <Pressable
              style={[styles.vaultEntry, { borderTopColor: colors.border }]}
              onPress={() => router.push("/wallet/gift-vault" as any)}
            >
              <Ionicons name="gift-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.vaultEntryText, { color: colors.textMuted }]}>Gift Vault</Text>
              <Ionicons name="chevron-forward" size={11} color={colors.textMuted} />
            </Pressable>
          )}
        </>
      )}

      <TransactionDetailModal tx={selectedTx} visible={!!selectedTx} onClose={() => setSelectedTx(null)} colors={colors} />

      <SwipeableBottomSheet visible={showTransfer} onClose={() => setShowTransfer(false)} backgroundColor={colors.surface}>
        <KeyboardAvoidingView behavior="padding">
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Send Nexa</Text>
              <TouchableOpacity onPress={() => setShowTransfer(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <Text style={[styles.modalSub, { color: colors.textMuted }]}>Balance: {profile?.xp || 0} Nexa</Text>
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Recipient @handle" placeholderTextColor={colors.textMuted} value={transferHandle} onChangeText={setTransferHandle} autoCapitalize="none" />
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Amount" placeholderTextColor={colors.textMuted} value={transferAmount} onChangeText={setTransferAmount} keyboardType="numeric" />
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Message (optional)" placeholderTextColor={colors.textMuted} value={transferMsg} onChangeText={setTransferMsg} />
            <TouchableOpacity style={[styles.sendBtn, sending && { opacity: 0.6 }]} onPress={sendNexa} disabled={sending}>
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>Send Nexa</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SwipeableBottomSheet>

      <SwipeableBottomSheet visible={showConvert} onClose={() => setShowConvert(false)} backgroundColor={colors.surface}>
        <KeyboardAvoidingView behavior="padding">
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Convert Nexa {"\u2192"} ACoin</Text>
              <TouchableOpacity onPress={() => setShowConvert(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <Text style={[styles.modalSub, { color: colors.textMuted }]}>
              Balance: {profile?.xp || 0} Nexa {"\u00b7"} Rate: {currencySettings?.nexa_to_acoin_rate || 100} Nexa = 1 ACoin
            </Text>
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Nexa amount to convert" placeholderTextColor={colors.textMuted} value={convertAmount} onChangeText={setConvertAmount} keyboardType="numeric" />
            {previewAcoin && (
              <View style={[styles.previewBox, { backgroundColor: colors.inputBg }]}>
                <View style={styles.previewRow}>
                  <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>You'll receive</Text>
                  <Text style={[styles.previewValue, { color: colors.accent }]}>{previewAcoin.acoin} ACoin</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Fee ({currencySettings?.conversion_fee_percent}%)</Text>
                  <Text style={[styles.previewLabel, { color: colors.textMuted }]}>{previewAcoin.fee} ACoin</Text>
                </View>
              </View>
            )}
            <TouchableOpacity style={[styles.sendBtn, { backgroundColor: "#FF9500" }, converting && { opacity: 0.6 }]} onPress={convertNexaToAcoin} disabled={converting}>
              {converting ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>Convert to ACoin</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SwipeableBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  balanceCard: { margin: 16, borderRadius: 20, padding: 24, gap: 16 },
  balanceRow: { flexDirection: "row", justifyContent: "space-around" },
  balanceItem: { alignItems: "center", gap: 6 },
  balanceValue: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
  balanceLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
  balanceDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  btnRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fff", borderRadius: 14, paddingVertical: 10 },
  actionBtnText: { color: Colors.brand, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  requestBadge: { backgroundColor: "#FF3B30", borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  requestBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  rateCard: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 10 },
  rateText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  tabRow: { flexDirection: "row", marginHorizontal: 16, marginBottom: 8, gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: "transparent" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#888" },
  txRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  txLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  txTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  txRight: { alignItems: "flex-end" },
  txAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  txCurrency: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  emptyText: { textAlign: "center", marginTop: 40, fontSize: 15, fontFamily: "Inter_400Regular" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: { padding: 24, gap: 14 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 4 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  modalInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  previewBox: { borderRadius: 12, padding: 14, gap: 6 },
  previewRow: { flexDirection: "row", justifyContent: "space-between" },
  previewLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  vaultEntry: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 20, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  vaultEntryText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  previewValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sendBtn: { backgroundColor: Colors.brand, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  sendBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});

const detailStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  content: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "85%" },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  amountCard: { borderRadius: 16, padding: 24, alignItems: "center", gap: 8, marginBottom: 16 },
  amountIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  amountText: { fontSize: 32, fontFamily: "Inter_700Bold" },
  typeText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  section: { borderRadius: 14, padding: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  rowLabel: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  rowValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", textAlign: "right", flex: 1.5 },
  divider: { height: StyleSheet.hairlineWidth },
});

const dwStyles = StyleSheet.create({
  leftPanel: {
    width: 380,
    borderRightWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  txHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  txHeaderTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  statGrid: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  requestsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  requestsBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
