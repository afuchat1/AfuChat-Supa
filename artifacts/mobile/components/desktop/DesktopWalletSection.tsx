import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  DesktopButton,
  DesktopEmptyState,
  DesktopLoadingState,
  DesktopPageHeader,
  DesktopPanel,
  DesktopSectionShell,
  DesktopStatCard,
  useDesktopTheme,
  useHover,
} from "./ui";

const GOLD = "#D4A853";

type Transaction = {
  id: string;
  type: string;
  amount: number;
  created_at: string;
  label: string;
  icon: string;
  color: string;
};

type WalletData = { acoin: number };

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

const TX_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  topup:                { label: "Top Up",              icon: "add-circle",       color: "#34C759" },
  transfer_sent:        { label: "Transfer Sent",       icon: "arrow-up-circle",  color: "#FF3B30" },
  transfer_received:    { label: "Transfer Received",   icon: "arrow-down-circle", color: "#34C759" },
  conversion:           { label: "ACoin Conversion",    icon: "swap-horizontal",  color: GOLD },
  subscription:         { label: "Subscription",        icon: "star",             color: "#AF52DE" },
  shop_purchase:        { label: "Shop Purchase",       icon: "bag",              color: "#FF9500" },
  gift_sent:            { label: "Gift Sent",           icon: "gift",             color: "#AF52DE" },
  gift_received:        { label: "Gift Received",       icon: "gift",             color: "#AF52DE" },
  status_good_purchase: { label: "Status Good",         icon: "sparkles",         color: GOLD },
};

function mapTx(raw: any): Transaction {
  const cfg = TX_CONFIG[raw.transaction_type] || {
    label: raw.transaction_type || "Transaction",
    icon: "cash-outline",
    color: "#8E8E93",
  };
  return {
    id: raw.id,
    type: raw.transaction_type,
    amount: raw.amount,
    created_at: raw.created_at,
    label: cfg.label,
    icon: cfg.icon,
    color: cfg.color,
  };
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  const t = useDesktopTheme();
  const [hovered, hp] = useHover();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.quickAction,
        {
          backgroundColor: hovered ? t.rowHover : t.panelBgRaised,
          borderColor: hovered ? t.borderStrong : t.border,
        },
      ]}
      {...(hp as any)}
    >
      <View style={[styles.quickIcon, { backgroundColor: t.accent + "1A" }]}>
        <Ionicons name={icon} size={18} color={t.accent} />
      </View>
      <Text style={[styles.quickLabel, { color: t.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TxRow({ tx }: { tx: Transaction }) {
  const t = useDesktopTheme();
  const [hovered, hp] = useHover();
  const isPositive = tx.amount > 0;
  return (
    <View
      style={[
        styles.txRow,
        { borderBottomColor: t.border, backgroundColor: hovered ? t.rowHover : "transparent" },
      ]}
      {...(hp as any)}
    >
      <View style={[styles.txIcon, { backgroundColor: tx.color + "1A" }]}>
        <Ionicons name={tx.icon as any} size={16} color={tx.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.txLabel, { color: t.text }]} numberOfLines={1}>{tx.label}</Text>
        <Text style={[styles.txDate, { color: t.textMuted }]}>{formatDate(tx.created_at)}</Text>
      </View>
      <Text
        style={[
          styles.txAmount,
          { color: isPositive ? "#22C55E" : t.text },
        ]}
      >
        {formatAmount(tx.amount)}
      </Text>
    </View>
  );
}

export function DesktopWalletSection() {
  const t = useDesktopTheme();
  const { user } = useAuth();

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    const [profileRes, txRes] = await Promise.all([
      supabase.from("profiles").select("acoin").eq("id", user.id).maybeSingle(),
      supabase
        .from("acoin_transactions")
        .select("id, transaction_type, amount, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    if (profileRes.data) setWallet({ acoin: profileRes.data.acoin ?? 0 });
    setTransactions((txRes.data || []).map(mapTx));
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Derived analytics
  const stats = useMemo(() => {
    const inflow = transactions.filter((tx) => tx.amount > 0).reduce((s, x) => s + x.amount, 0);
    const outflow = transactions.filter((tx) => tx.amount < 0).reduce((s, x) => s + Math.abs(x.amount), 0);
    return { inflow, outflow, count: transactions.length };
  }, [transactions]);

  if (loading) {
    return (
      <DesktopSectionShell>
        <DesktopLoadingState label="Loading your wallet" />
      </DesktopSectionShell>
    );
  }

  return (
    <DesktopSectionShell scroll>
      <View style={{ width: "100%", maxWidth: 1040, alignSelf: "center", gap: 16 }}>
        {/* Hero balance */}
        <DesktopPanel style={{ overflow: "hidden" }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 18,
              padding: 22,
              backgroundColor: t.panelBg,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: GOLD + "20",
              }}
            >
              <Ionicons name="star" size={28} color={GOLD} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: t.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                ACoin Balance
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 34,
                  color: GOLD,
                  letterSpacing: -0.8,
                  marginTop: 4,
                }}
              >
                {(wallet?.acoin || 0).toLocaleString()}
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 12.5,
                  color: t.textMuted,
                  marginTop: 2,
                }}
              >
                AfuChat Coins · 1 ACoin ≈ $0.01 USD
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <DesktopButton
                label="Send"
                icon="arrow-forward-outline"
                variant="secondary"
                onPress={() => router.push("/wallet" as any)}
              />
              <DesktopButton
                label="Buy ACoin"
                icon="add"
                onPress={() => router.push("/wallet/topup" as any)}
              />
            </View>
          </View>
        </DesktopPanel>

        {/* Stat cards */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <DesktopStatCard
            label="Received"
            value={stats.inflow.toLocaleString()}
            icon="trending-up"
            color="#22C55E"
          />
          <DesktopStatCard
            label="Spent"
            value={stats.outflow.toLocaleString()}
            icon="trending-down"
            color="#FF3B30"
          />
          <DesktopStatCard
            label="Transactions"
            value={stats.count.toLocaleString()}
            icon="list-outline"
          />
        </View>

        {/* Quick actions */}
        <DesktopPanel>
          <DesktopPageHeader title="Quick actions" icon="flash-outline" compact />
          <View style={styles.quickGrid}>
            <QuickAction icon="add-circle-outline" label="Top up" onPress={() => router.push("/wallet/topup" as any)} />
            <QuickAction icon="arrow-forward-circle-outline" label="Transfer" onPress={() => router.push("/wallet" as any)} />
            <QuickAction icon="swap-horizontal-outline" label="Convert" onPress={() => router.push("/prestige" as any)} />
            <QuickAction icon="time-outline" label="Requests" onPress={() => router.push("/wallet/requests" as any)} />
            <QuickAction icon="storefront-outline" label="Marketplace" onPress={() => router.push("/store" as any)} />
            <QuickAction icon="gift-outline" label="Gifts" onPress={() => router.push("/gifts" as any)} />
          </View>
        </DesktopPanel>

        {/* Transactions */}
        <DesktopPanel>
          <DesktopPageHeader
            title="Recent activity"
            icon="receipt-outline"
            compact
            right={
              transactions.length > 0 ? (
                <DesktopButton
                  label="See all"
                  variant="ghost"
                  size="sm"
                  iconRight="arrow-forward"
                  onPress={() => router.push("/wallet" as any)}
                />
              ) : null
            }
          />
          {transactions.length === 0 ? (
            <DesktopEmptyState
              icon="receipt-outline"
              title="No transactions yet"
              subtitle="Once you start using your ACoin, your activity will show up here."
              action={{ label: "Buy ACoin", icon: "add", onPress: () => router.push("/wallet/topup" as any) }}
            />
          ) : (
            <View>
              {transactions.map((tx) => (
                <TxRow key={tx.id} tx={tx} />
              ))}
            </View>
          )}
        </DesktopPanel>
      </View>
    </DesktopSectionShell>
  );
}

const styles = StyleSheet.create({
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 14 },
  quickAction: {
    flexBasis: "31%" as any,
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  quickIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 12.5, fontFamily: "Inter_600SemiBold", textAlign: "center" },

  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  txLabel: { fontSize: 13.5, fontFamily: "Inter_500Medium" },
  txDate: { fontSize: 11.5, fontFamily: "Inter_400Regular", marginTop: 2 },
  txAmount: { fontSize: 13.5, fontFamily: "Inter_600SemiBold", flexShrink: 0 },
});
