import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";

const BRAND = "#00BCD4";
const GOLD = "#D4A853";

type Transaction = {
  id: string;
  type: string;
  amount: number;
  created_at: string;
  label: string;
  icon: string;
  color: string;
  currency: string;
};

type WalletData = {
  acoin: number;
};

function formatAmount(amount: number) {
  const abs = Math.abs(amount);
  return `${amount >= 0 ? "+" : "-"}${abs.toLocaleString()} ACoin`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function QuickAction({ icon, label, onPress, colors }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void; colors: any }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.quickIcon, { backgroundColor: colors.accent + "18" }]}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <Text style={[styles.quickLabel, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TxRow({ tx, colors }: { tx: Transaction; colors: any }) {
  const isPositive = tx.amount > 0;
  return (
    <View style={[styles.txRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.txIcon, { backgroundColor: tx.color + "18" }]}>
        <Ionicons name={tx.icon as any} size={18} color={tx.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.txLabel, { color: colors.text }]} numberOfLines={1}>{tx.label}</Text>
        <Text style={[styles.txDate, { color: colors.textMuted }]}>{formatDate(tx.created_at)}</Text>
      </View>
      <Text style={[styles.txAmount, { color: isPositive ? "#34C759" : colors.text }]}>
        {formatAmount(tx.amount)}
      </Text>
    </View>
  );
}

const TX_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  topup:          { label: "Top Up",              icon: "add-circle",       color: "#34C759" },
  transfer_sent:  { label: "Transfer Sent",       icon: "arrow-up-circle",  color: "#FF3B30" },
  transfer_received: { label: "Transfer Received",icon: "arrow-down-circle",color: "#34C759" },
  conversion:     { label: "ACoin Conversion",    icon: "swap-horizontal",  color: GOLD },
  subscription:   { label: "Subscription",        icon: "star",             color: "#AF52DE" },
  shop_purchase:  { label: "Shop Purchase",       icon: "bag",              color: "#FF9500" },
  gift_sent:      { label: "Gift Sent",           icon: "gift",             color: "#AF52DE" },
  gift_received:  { label: "Gift Received",       icon: "gift",             color: "#AF52DE" },
  status_good_purchase: { label: "Status Good",   icon: "sparkles" as any,  color: GOLD },
};

function mapTx(raw: any): Transaction {
  const cfg = TX_CONFIG[raw.transaction_type] || { label: raw.transaction_type || "Transaction", icon: "cash-outline", color: "#8E8E93" };
  return {
    id: raw.id,
    type: raw.transaction_type,
    amount: raw.amount,
    created_at: raw.created_at,
    label: cfg.label,
    icon: cfg.icon,
    color: cfg.color,
    currency: "acoin",
  };
}

export function DesktopWalletSection() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    const [profileRes, txRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("acoin")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("acoin_transactions")
        .select("id, transaction_type, amount, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    if (profileRes.data) {
      setWallet({ acoin: profileRes.data.acoin ?? 0 });
    }
    setTransactions((txRes.data || []).map(mapTx));
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: isDark ? "#0f0f12" : "#f8f9fc" }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ACoin balance card */}
      <View style={[styles.balanceCard, { backgroundColor: isDark ? "#161619" : "#ffffff", borderColor: colors.border }]}>
        <View style={styles.balanceCardInner}>
          <View style={[styles.balanceIconWrap, { backgroundColor: GOLD + "18" }]}>
            <Ionicons name="star" size={28} color={GOLD} />
          </View>
          <View>
            <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>ACoin Balance</Text>
            <Text style={[styles.balanceAmount, { color: GOLD }]}>
              {(wallet?.acoin || 0).toLocaleString()} 🪙
            </Text>
            <Text style={[styles.balanceSub, { color: colors.textMuted }]}>AfuChat Coins</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.topUpBtn, { backgroundColor: GOLD }]}
          onPress={() => router.push("/wallet/topup" as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.topUpBtnText}>Buy ACoin</Text>
        </TouchableOpacity>
      </View>

      {/* Quick actions */}
      <View style={[styles.section, { backgroundColor: isDark ? "#161619" : "#ffffff", borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
        <View style={styles.quickGrid}>
          <QuickAction icon="add-circle-outline" label="Top Up" onPress={() => router.push("/wallet/topup" as any)} colors={colors} />
          <QuickAction icon="arrow-forward-circle-outline" label="Transfer" onPress={() => router.push("/wallet" as any)} colors={colors} />
          <QuickAction icon="swap-horizontal-outline" label="Convert" onPress={() => router.push("/prestige" as any)} colors={colors} />
          <QuickAction icon="time-outline" label="Requests" onPress={() => router.push("/wallet/requests" as any)} colors={colors} />
          <QuickAction icon="storefront-outline" label="Shop" onPress={() => router.push("/store" as any)} colors={colors} />
          <QuickAction icon="gift-outline" label="Gifts" onPress={() => router.push("/gifts" as any)} colors={colors} />
        </View>
      </View>

      {/* Transaction history */}
      <View style={[styles.section, { backgroundColor: isDark ? "#161619" : "#ffffff", borderColor: colors.border }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Transaction History</Text>
          <TouchableOpacity onPress={() => router.push("/wallet" as any)}>
            <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
          </TouchableOpacity>
        </View>
        {transactions.length === 0 ? (
          <View style={styles.emptyTx}>
            <Ionicons name="receipt-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyTxText, { color: colors.textMuted }]}>No transactions yet</Text>
          </View>
        ) : (
          transactions.map((tx) => (
            <TxRow key={tx.id} tx={tx} colors={colors} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { maxWidth: 860, alignSelf: "center", width: "100%" as any, padding: 28, gap: 20 },
  balanceCard: {
    borderRadius: 18,
    padding: 22,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  balanceCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  balanceIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  balanceLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  balanceAmount: { fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginTop: 4 },
  balanceSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  topUpBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  topUpBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  section: {
    borderRadius: 18,
    padding: 22,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 0,
  },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 16, letterSpacing: -0.2 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  seeAll: { fontSize: 13, fontFamily: "Inter_500Medium" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  quickAction: {
    width: "30%" as any,
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  quickIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center" },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  txLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  txDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  txAmount: { fontSize: 14, fontFamily: "Inter_600SemiBold", flexShrink: 0 },
  emptyTx: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyTxText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
