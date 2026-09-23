import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { AFUCLOUD_API_URL } from "@/lib/env";
import { showAlert } from "@/lib/alert";
import * as Haptics from "@/lib/haptics";
import * as Clipboard from "expo-clipboard";
import QRCode from "@/components/ui/QRCode";
import Colors from "@/constants/colors";
import AfuServicesApp from "@/modules/afuservices";
import { safeRouter } from "@/lib/navUtils";

type AppView = "home" | "history" | "topup" | "send" | "receive" | "exchange" | "requests" | "services";
type TxFilter = "all" | "acoin" | "nexa" | "gifts";

type Tx = {
  id: string;
  type: string;
  label: string;
  icon: string;
  color: string;
  amount: number;
  currency: "acoin" | "nexa" | "gift";
  created_at: string;
  counterparty?: string;
  status?: string;
};

type PayRequest = {
  id: string;
  requester_id: string;
  target_id: string;
  currency: "nexa" | "acoin";
  amount: number;
  note: string | null;
  status: string;
  created_at: string;
  requester: { handle: string; display_name: string } | null;
  target: { handle: string; display_name: string } | null;
};

const PACKAGES = [
  { amount: 100,   priceUsd: 1.0,   label: "Starter", icon: "flash-outline"  as const },
  { amount: 500,   priceUsd: 5.0,   label: "Basic",   icon: "flash"          as const },
  { amount: 2000,  priceUsd: 20.0,  label: "Popular", icon: "diamond"        as const, popular: true },
  { amount: 5000,  priceUsd: 50.0,  label: "Value",   icon: "diamond-outline" as const },
  { amount: 20000, priceUsd: 200.0, label: "Pro",     icon: "star"           as const },
];

// ── FX helpers (same table as premium.tsx) ────────────────────────────────────
type FxEntry = { code: string; symbol: string; rate: number };
const FX: Record<string, FxEntry> = {
  UG: { code: "UGX", symbol: "USh", rate: 3700 },
  KE: { code: "KES", symbol: "KSh", rate: 130 },
  TZ: { code: "TZS", symbol: "TSh", rate: 2600 },
  NG: { code: "NGN", symbol: "₦",   rate: 1550 },
  GH: { code: "GHS", symbol: "GH₵", rate: 15.5 },
  ZA: { code: "ZAR", symbol: "R",   rate: 18.5 },
  GB: { code: "GBP", symbol: "£",   rate: 0.79 },
  DE: { code: "EUR", symbol: "€",   rate: 0.92 },
  FR: { code: "EUR", symbol: "€",   rate: 0.92 },
  IT: { code: "EUR", symbol: "€",   rate: 0.92 },
  ES: { code: "EUR", symbol: "€",   rate: 0.92 },
  NL: { code: "EUR", symbol: "€",   rate: 0.92 },
  IN: { code: "INR", symbol: "₹",   rate: 83 },
  BR: { code: "BRL", symbol: "R$",  rate: 5.0 },
  CA: { code: "CAD", symbol: "CA$", rate: 1.36 },
  AU: { code: "AUD", symbol: "A$",  rate: 1.52 },
  JP: { code: "JPY", symbol: "¥",   rate: 154 },
  CN: { code: "CNY", symbol: "¥",   rate: 7.2 },
  RW: { code: "RWF", symbol: "Fr",  rate: 1330 },
  ET: { code: "ETB", symbol: "Br",  rate: 56 },
  SN: { code: "XOF", symbol: "Fr",  rate: 600 },
  ZM: { code: "ZMW", symbol: "K",   rate: 27 },
  MX: { code: "MXN", symbol: "MX$", rate: 17 },
  PK: { code: "PKR", symbol: "₨",   rate: 278 },
  EG: { code: "EGP", symbol: "£",   rate: 48 },
};
function localLine(usd: number, country?: string | null): string | null {
  if (!country) return null;
  const fx = FX[country.toUpperCase()];
  if (!fx) return null;
  const local = usd * fx.rate;
  let s: string;
  if (local >= 1_000_000) s = `${(local / 1_000_000).toFixed(1)}M`;
  else if (local >= 10_000) s = `${Math.round(local / 1000)}K`;
  else if (local >= 1_000) s = local.toLocaleString(undefined, { maximumFractionDigits: 0 });
  else s = local.toLocaleString(undefined, { maximumFractionDigits: fx.rate < 5 ? 2 : 0 });
  return `≈ ${fx.symbol} ${s}`;
}
// ─────────────────────────────────────────────────────────────────────────────

function getEdgeFnBase() {
  return `${AFUCLOUD_API_URL.replace(/\/+$/, "")}/v1/payments`;
}
async function getToken(): Promise<string> {
  // Always refresh to avoid sending an expired token to Edge Functions
  const { data: refreshed } = await supabase.auth.refreshSession();
  if (refreshed.session?.access_token) return refreshed.session.access_token;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? "";
}
function fmtAmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SubHeader({ title, onBack, colors }: { title: string; onBack: () => void; colors: any }) {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  return (
    <View style={[s.subHeader, { borderBottomColor: colors.border, paddingTop: topInset + 8 }]}>
      <TouchableOpacity onPress={onBack} hitSlop={12} style={s.backBtn}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </TouchableOpacity>
      <Text style={[s.subHeaderTitle, { color: colors.text }]}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

function WalletHeader({ colors, insets, onBack }: { colors: any; insets: { top: number }; onBack: () => void }) {
  const topInset = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  return (
    <View style={[s.walletHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: topInset }]}>
      <View style={s.walletHeaderRow}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={12}
          style={s.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={[s.walletBackGlyph, { color: colors.text }]}>‹</Text>
        </TouchableOpacity>
        <View style={s.walletHeaderTitleWrap}>
          <Text style={[s.walletHeaderTitle, { color: colors.text }]}>Wallet</Text>
           <Text style={[s.walletHeaderSubtitle, { color: colors.textMuted }]}>Money and services in one place</Text>
        </View>
        <View style={s.backBtn} />
      </View>
    </View>
  );
}

export default function AfuPayApp({
  initialRecipientId,
  paymentReference,
  initialView,
}: {
  initialRecipientId?: string;
  paymentReference?: string;
  initialView?: AppView;
}) {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<AppView>(() => initialRecipientId ? "send" : initialView ?? "home");
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [txFilter, setTxFilter] = useState<TxFilter>("all");
  const [currSettings, setCurrSettings] = useState<{ nexa_to_acoin_rate: number; conversion_fee_percent: number } | null>(null);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  useEffect(() => {
    if (initialRecipientId) setView("send");
    else if (initialView) setView(initialView);
  }, [initialRecipientId, initialView]);

  const acoin = profile?.acoin ?? 0;
  const nexa = profile?.xp ?? 0;
  const handleHomeBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else safeRouter.replace("/apps" as any);
  }, []);

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    setTxLoading(true);
    try {
      const [
        { data: xpSent },
        { data: xpReceived },
        { data: acoinTx },
        { data: settings },
      ] = await Promise.all([
        supabase.from("xp_transfers").select("id,amount,created_at,status,receiver_id,profiles!xp_transfers_receiver_id_fkey(handle)").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(40),
        supabase.from("xp_transfers").select("id,amount,created_at,status,sender_id,profiles!xp_transfers_sender_id_fkey(handle)").eq("receiver_id", user.id).order("created_at", { ascending: false }).limit(40),
        supabase.from("acoin_transactions").select("id,amount,transaction_type,created_at,metadata").eq("user_id", user.id).order("created_at", { ascending: false }).limit(60),
        supabase.from("currency_settings").select("nexa_to_acoin_rate,conversion_fee_percent").limit(1).single(),
      ]);
      if (settings) setCurrSettings(settings as any);
      const all: Tx[] = [];
      const acoinLabels: Record<string, { label: string; icon: string }> = {
        conversion: { label: "Nexa → ACoin", icon: "swap-horizontal" },
        subscription: { label: "Premium Subscription", icon: "diamond" },
        topup: { label: "ACoin Top-Up", icon: "card" },
        acoin_transfer_sent: { label: "ACoin Sent", icon: "arrow-up-circle" },
        acoin_transfer_received: { label: "ACoin Received", icon: "arrow-down-circle" },
        marketplace_purchase: { label: "Marketplace Purchase", icon: "cart" },
        marketplace_sale: { label: "Marketplace Sale", icon: "storefront" },
        game_purchase: { label: "Game Purchase", icon: "game-controller" },
        game_reward: { label: "Game Reward", icon: "trophy" },
        red_envelope_sent: { label: "Red Envelope Sent", icon: "gift" },
        red_envelope_claimed: { label: "Red Envelope Received", icon: "gift" },
        request_payment: { label: "Payment Request", icon: "receipt" },
      };
      (xpSent || []).forEach((t: any) => {
        const p = t.profiles;
        all.push({ id: t.id, type: "nexa_sent", label: "Nexa Sent", icon: "arrow-up-circle", color: "#FF3B30", amount: -t.amount, currency: "nexa", created_at: t.created_at, counterparty: p ? `@${p.handle}` : undefined, status: t.status || "completed" });
      });
      (xpReceived || []).forEach((t: any) => {
        const p = t.profiles;
        all.push({ id: t.id, type: "nexa_received", label: "Nexa Received", icon: "arrow-down-circle", color: Colors.brand, amount: t.amount, currency: "nexa", created_at: t.created_at, counterparty: p ? `@${p.handle}` : undefined, status: t.status || "completed" });
      });
      (acoinTx || []).forEach((t: any) => {
        const m = acoinLabels[t.transaction_type];
        all.push({ id: t.id, type: t.transaction_type, label: m?.label || t.transaction_type.replace(/_/g, " "), icon: m?.icon || (t.amount > 0 ? "arrow-down-circle" : "arrow-up-circle"), color: t.amount > 0 ? "#34C759" : "#FF9500", amount: t.amount, currency: "acoin", created_at: t.created_at, status: "completed" });
      });
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTransactions(all);
    } catch (_) {}
    setTxLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  // Fetch pending money-request count for badge
  const loadPendingCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from("money_requests")
      .select("id", { count: "exact", head: true })
      .eq("target_id", user.id)
      .eq("status", "pending");
    setPendingRequestCount(count ?? 0);
  }, [user]);

  useEffect(() => { loadPendingCount(); }, [loadPendingCount]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`afupay:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "acoin_transactions", filter: `user_id=eq.${user.id}` }, () => { loadTransactions(); refreshProfile?.(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "xp_transfers", filter: `receiver_id=eq.${user.id}` }, () => { loadTransactions(); refreshProfile?.(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "money_requests", filter: `target_id=eq.${user.id}` }, () => loadPendingCount())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadTransactions, loadPendingCount]);

  const filteredTx = txFilter === "all" ? transactions
    : txFilter === "gifts" ? transactions.filter(t => ["gift_sent", "gift_received", "red_envelope_sent", "red_envelope_claimed"].includes(t.type))
    : transactions.filter(t => t.currency === txFilter);

  if (view === "history") return <HistoryView colors={colors} insets={insets} txs={filteredTx} loading={txLoading} filter={txFilter} setFilter={setTxFilter} refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTransactions(); }} onBack={() => setView("home")} />;
  if (view === "topup") return <TopUpView colors={colors} insets={insets} profile={profile} onBack={() => setView("home")} onSuccess={() => { loadTransactions(); refreshProfile?.(); }} />;
  if (view === "send") return <SendView initialRecipientId={initialRecipientId} paymentReference={paymentReference} colors={colors} insets={insets} user={user} profile={profile} onBack={() => setView("home")} onSuccess={() => { loadTransactions(); refreshProfile?.(); setView("home"); }} />;
  if (view === "receive") return <ReceiveView colors={colors} insets={insets} profile={profile} onBack={() => setView("home")} />;
  if (view === "exchange") return <ExchangeView colors={colors} insets={insets} user={user} profile={profile} currSettings={currSettings} onBack={() => setView("home")} onSuccess={() => { loadTransactions(); refreshProfile?.(); setView("home"); }} />;
  if (view === "requests") return <RequestsView colors={colors} insets={insets} user={user} onBack={() => setView("home")} />;
  if (view === "services") return <AfuServicesApp embedded onBack={() => setView("home")} />;

  const recentTx = transactions.slice(0, 6);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <WalletHeader colors={colors} insets={insets} onBack={handleHomeBack} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 96 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTransactions(); refreshProfile?.(); }} />}>
        <LinearGradient colors={["#0A2E1F", "#062218"]} style={s.heroCard}>
          <View style={s.heroRow}>
            <View>
              <Text style={s.heroLabel}>ACoin Balance</Text>
              <Text style={s.heroAmount}>{fmtAmt(acoin)} <Text style={s.heroCurrency}>AC</Text></Text>
            </View>
            <View style={s.heroRight}>
              <Text style={[s.heroLabel, { textAlign: "right" }]}>Nexa (XP)</Text>
              <Text style={[s.heroAmount, { color: "#FF9500", fontSize: 22 }]}>{fmtAmt(nexa)}</Text>
            </View>
          </View>
          <View style={[s.heroDivider, { backgroundColor: "rgba(255,255,255,0.12)" }]} />
          <Text style={s.heroSub}>AfuPay · Secure · Fast · Global</Text>
        </LinearGradient>

        <View style={s.actionsRow}>
          {[
            { icon: "add-circle" as const, label: "Buy", color: "#34C759", view: "topup" as AppView },
            { icon: "paper-plane" as const, label: "Send", color: "#FF9500", view: "send" as AppView },
            { icon: "qr-code" as const, label: "Receive", color: Colors.brand, view: "receive" as AppView },
            { icon: "swap-horizontal" as const, label: "Convert", color: "#7B61FF", view: "exchange" as AppView },
            { icon: "receipt-outline" as const, label: "Requests", color: "#AF52DE", view: "requests" as AppView },
            { icon: "time-outline" as const, label: "History", color: "#FF6B35", view: "history" as AppView },
          ].map((a) => {
            const badge = a.label === "Requests" && pendingRequestCount > 0 ? pendingRequestCount : 0;
            return (
              <TouchableOpacity key={a.label} style={s.actionItem} onPress={() => { Haptics.selectionAsync(); setView(a.view); }} activeOpacity={0.75}>
                <View style={{ position: "relative" }}>
                  <View style={[s.actionIcon, { backgroundColor: a.color + "18" }]}>
                    <Ionicons name={a.icon} size={22} color={a.color} />
                  </View>
                  {badge > 0 && (
                    <View style={{ position: "absolute", top: -4, right: -4, backgroundColor: "#FF3B30", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
                      <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" }}>{badge > 99 ? "99+" : badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={[s.actionLabel, { color: colors.textSecondary }]}>{a.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {txLoading && transactions.length === 0 ? (
          <ActivityIndicator color={Colors.brand} style={{ marginTop: 32 }} />
        ) : recentTx.length > 0 ? (
          <View style={s.section}>
            <View style={s.sectionRow}>
              <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>RECENT ACTIVITY</Text>
              <TouchableOpacity onPress={() => setView("history")}>
                <Text style={[s.seeAll, { color: Colors.brand }]}>See all</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.txCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {recentTx.map((tx, i) => (
                <View key={tx.id}>
                  {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                  <View style={s.txRow}>
                    <View style={[s.txIcon, { backgroundColor: tx.color + "18" }]}>
                      <Ionicons name={tx.icon as any} size={16} color={tx.color} />
                    </View>
                    <View style={s.txInfo}>
                      <Text style={[s.txLabel, { color: colors.text }]} numberOfLines={1}>{tx.label}</Text>
                      <Text style={[s.txSub, { color: colors.textMuted }]}>{tx.counterparty ? `${tx.counterparty} · ` : ""}{timeAgo(tx.created_at)}</Text>
                    </View>
                    <Text style={[s.txAmt, { color: tx.amount > 0 ? "#34C759" : "#FF3B30" }]}>
                      {tx.amount > 0 ? "+" : ""}{fmtAmt(Math.abs(tx.amount))} {tx.currency === "acoin" ? "AC" : tx.currency === "nexa" ? "NX" : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={s.emptyWrap}>
            <Ionicons name="wallet-outline" size={48} color={colors.textMuted} />
            <Text style={[s.emptyText, { color: colors.textMuted }]}>No transactions yet</Text>
            <TouchableOpacity style={[s.emptyBtn, { backgroundColor: Colors.brand }]} onPress={() => setView("topup")}>
              <Text style={s.emptyBtnText}>Buy ACoin to get started</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function HistoryView({ colors, insets, txs, loading, filter, setFilter, refreshing, onRefresh, onBack }: any) {
  const filters: { key: TxFilter; label: string }[] = [{ key: "all", label: "All" }, { key: "acoin", label: "ACoin" }, { key: "nexa", label: "Nexa" }, { key: "gifts", label: "Gifts" }];
  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <SubHeader title="Transaction History" onBack={onBack} colors={colors} />
      <View style={s.filterRow}>
        {filters.map(f => (
          <TouchableOpacity key={f.key} style={[s.filterBtn, { backgroundColor: filter === f.key ? Colors.brand : colors.inputBg, borderColor: filter === f.key ? Colors.brand : colors.border }]} onPress={() => setFilter(f.key)}>
            <Text style={[s.filterText, { color: filter === f.key ? "#fff" : colors.textSecondary }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {loading ? <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} /> :
          txs.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="receipt-outline" size={40} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textMuted }]}>No transactions</Text>
            </View>
          ) : (
            <View style={[s.txCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {txs.map((tx: Tx, i: number) => (
                <View key={tx.id}>
                  {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                  <View style={s.txRow}>
                    <View style={[s.txIcon, { backgroundColor: tx.color + "18" }]}>
                      <Ionicons name={tx.icon as any} size={16} color={tx.color} />
                    </View>
                    <View style={s.txInfo}>
                      <Text style={[s.txLabel, { color: colors.text }]} numberOfLines={1}>{tx.label}</Text>
                      <Text style={[s.txSub, { color: colors.textMuted }]}>{tx.counterparty ? `${tx.counterparty} · ` : ""}{timeAgo(tx.created_at)}</Text>
                    </View>
                    <Text style={[s.txAmt, { color: tx.amount > 0 ? "#34C759" : "#FF3B30" }]}>
                      {tx.amount > 0 ? "+" : ""}{fmtAmt(Math.abs(tx.amount))} {tx.currency === "acoin" ? "AC" : tx.currency === "nexa" ? "NX" : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
      </ScrollView>
    </View>
  );
}

function PaymentWebViewModal({ url, colors, insets, onClose, onComplete }: {
  url: string; colors: any; insets: any; onClose: () => void; onComplete: () => void;
}) {
  const [webLoading, setWebLoading] = useState(true);

  function handleNavChange(nav: any) {
    const u: string = nav.url || "";
    if (u.includes("payment-complete") || u.includes("payment_complete") || u.includes("paymentcomplete")) {
      onComplete();
    }
  }

  function shouldStart(req: any) {
    const u: string = req.url || "";
    if (u.includes("payment-complete") || u.includes("payment_complete") || u.includes("paymentcomplete")) {
      onComplete();
      return false;
    }
    return true;
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 12,
          borderBottomColor: colors.border, backgroundColor: colors.background,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="lock-closed" size={13} color="#34C759" />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: colors.text }}>Secure Checkout</Text>
            <View style={{ backgroundColor: "#34C75920", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "#34C759" }}>Pesapal</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={{ padding: 6 }}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        {webLoading && (
          <View style={{ height: 3, backgroundColor: Colors.brand + "30" }}>
            <View style={{ width: "60%", height: 3, backgroundColor: Colors.brand }} />
          </View>
        )}
        <WebView
          source={{ uri: url }}
          style={{ flex: 1, backgroundColor: colors.background }}
          onLoadStart={() => setWebLoading(true)}
          onLoadEnd={() => setWebLoading(false)}
          onNavigationStateChange={handleNavChange}
          onShouldStartLoadWithRequest={shouldStart}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
              <ActivityIndicator size="large" color={Colors.brand} />
              <Text style={{ marginTop: 12, color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 14 }}>Loading secure payment…</Text>
            </View>
          )}
        />
        <View style={{ height: insets.bottom, backgroundColor: colors.background }} />
      </View>
    </Modal>
  );
}

function TopUpView({ colors, insets, profile, onBack, onSuccess }: any) {
  const [selectedPack, setSelectedPack] = useState<number | null>(2);
  const [customAmt, setCustomAmt] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  async function checkout() {
    const acoinAmt = selectedPack !== null ? PACKAGES[selectedPack].amount : (parseInt(customAmt || "0") || 0);
    if (acoinAmt < 50) { showAlert("Too Low", "Minimum purchase is 50 ACoin."); return; }
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getEdgeFnBase()}/pesapal-initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ acoin_amount: acoinAmt, currency: "USD" }),
      });
      const data = await res.json();
      if (data.redirect_url) {
        setCheckoutUrl(data.redirect_url);
      } else {
        showAlert("Error", data.error || "Could not initiate payment.");
      }
    } catch {
      showAlert("Error", "Network error. Please try again.");
    }
    setLoading(false);
  }

  const acoinAmt = selectedPack !== null ? PACKAGES[selectedPack].amount : (parseInt(customAmt || "0") || 0);
  const price = (acoinAmt * 0.01).toFixed(2);

  const country = profile?.country ?? null;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <SubHeader title="Buy ACoin" onBack={onBack} colors={colors} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>

        {/* ── Balance pill ── */}
        <View style={[s.balancePill2, { backgroundColor: "#0A2E1F", borderColor: Colors.brand + "40", marginBottom: 20 }]}>
          <Ionicons name="diamond" size={14} color={Colors.brand} />
          <Text style={[s.balancePill2Text, { color: Colors.brand }]}>Balance: {fmtAmt(profile?.acoin || 0)} ACoin</Text>
        </View>

        {/* ── Package list ── */}
        <Text style={[s.sectionTitle, { color: colors.textSecondary, marginBottom: 10 }]}>CHOOSE A PACKAGE</Text>
        <View style={{ gap: 8 }}>
          {PACKAGES.map((pkg, i) => {
            const isSelected = selectedPack === i;
            const lc = localLine(pkg.priceUsd, country);
            return (
              <TouchableOpacity
                key={i}
                activeOpacity={0.82}
                onPress={() => { setSelectedPack(i); setCustomAmt(""); Haptics.selectionAsync(); }}
                style={[s.packRow, {
                  backgroundColor: isSelected ? Colors.brand + "12" : colors.surface,
                  borderColor: isSelected ? Colors.brand : colors.border,
                }]}
              >
                {/* Icon + label */}
                <View style={[s.packIconWrap, { backgroundColor: isSelected ? Colors.brand + "20" : colors.inputBg }]}>
                  <Ionicons name={pkg.icon} size={20} color={Colors.brand} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[s.packRowLabel, { color: colors.text }]}>{pkg.label}</Text>
                    {pkg.popular && (
                      <View style={[s.popularChip, { backgroundColor: Colors.brand }]}>
                        <Text style={s.popularChipText}>POPULAR</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.packRowAmt, { color: Colors.brand }]}>{fmtAmt(pkg.amount)} ACoin</Text>
                </View>
                {/* Price column */}
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.packRowUsd, { color: isSelected ? Colors.brand : colors.text }]}>${pkg.priceUsd % 1 === 0 ? pkg.priceUsd.toFixed(0) : pkg.priceUsd.toFixed(2)}</Text>
                  {!!lc && <Text style={[s.packRowLocal, { color: colors.textMuted }]}>{lc}</Text>}
                </View>
                {/* Check */}
                <View style={{ width: 24, alignItems: "center", marginLeft: 10 }}>
                  {isSelected
                    ? <Ionicons name="checkmark-circle" size={22} color={Colors.brand} />
                    : <View style={[s.packCircle, { borderColor: colors.border }]} />
                  }
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Custom amount ── */}
        <Text style={[s.sectionTitle, { color: colors.textSecondary, marginTop: 20, marginBottom: 8 }]}>OR ENTER CUSTOM AMOUNT</Text>
        <View style={[s.inputRow, { backgroundColor: colors.inputBg, borderColor: selectedPack === null && acoinAmt >= 50 ? Colors.brand : colors.border, borderWidth: selectedPack === null && acoinAmt >= 50 ? 1.5 : 1 }]}>
          <Ionicons name="diamond" size={16} color={Colors.brand} style={{ marginRight: 8 }} />
          <TextInput
            style={[s.input, { color: colors.text, flex: 1 }]}
            placeholder="e.g. 300"
            placeholderTextColor={colors.textMuted}
            value={customAmt}
            onChangeText={t => { setCustomAmt(t); setSelectedPack(null); }}
            keyboardType="number-pad"
          />
          <Text style={{ color: colors.textMuted, fontFamily: "Inter_500Medium", fontSize: 13 }}>ACoin</Text>
        </View>

        {/* ── Preview for custom amount ── */}
        {selectedPack === null && acoinAmt >= 50 && (
          <View style={[s.previewBox, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "30", marginTop: 10 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>{fmtAmt(acoinAmt)} ACoin</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 }}>${price}</Text>
                {!!localLine(parseFloat(price), country) && (
                  <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular" }}>{localLine(parseFloat(price), country)}</Text>
                )}
              </View>
            </View>
            <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 6, fontFamily: "Inter_400Regular" }}>Mobile money · Card · Bank · Powered by Pesapal</Text>
          </View>
        )}

        {/* ── CTA ── */}
        <TouchableOpacity
          style={[s.primaryBtn, { backgroundColor: Colors.brand, opacity: (loading || acoinAmt < 50) ? 0.5 : 1, marginTop: 20 }]}
          onPress={checkout}
          disabled={loading || acoinAmt < 50}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="lock-closed" size={16} color="#fff" />
                <Text style={s.primaryBtnText}>
                  Pay {acoinAmt >= 50 ? `$${price} · ${fmtAmt(acoinAmt)} AC` : "Select a package"}
                </Text>
              </>
          }
        </TouchableOpacity>
        <Text style={{ textAlign: "center", color: colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 8 }}>
          1 AC = $0.01 · Secure checkout via Pesapal
        </Text>

      </ScrollView>
      {!!checkoutUrl && (
        <PaymentWebViewModal
          url={checkoutUrl}
          colors={colors}
          insets={insets}
          onClose={() => setCheckoutUrl(null)}
          onComplete={() => {
            setCheckoutUrl(null);
            onSuccess?.();
            showAlert("Payment Submitted", "Your payment is being processed. Your ACoin balance will update shortly.");
          }}
        />
      )}
    </View>
  );
}

function SendView({ initialRecipientId, paymentReference, colors, insets, user, profile, onBack, onSuccess }: any) {
  const [currency, setCurrency] = useState<"acoin" | "nexa">("acoin");
  const [handle, setHandle] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!initialRecipientId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("handle")
        .eq("id", initialRecipientId)
        .maybeSingle();
      if (!cancelled && data?.handle) setHandle(data.handle);
    })();
    return () => { cancelled = true; };
  }, [initialRecipientId]);

  async function send() {
    if ((!initialRecipientId && !handle.trim()) || !amount.trim() || !user) return;
    const amt = parseInt(amount);
    if (isNaN(amt) || amt <= 0) { showAlert("Invalid", "Enter a valid amount."); return; }
    const balance = currency === "acoin" ? (profile?.acoin || 0) : (profile?.xp || 0);
    if (amt > balance) { showAlert("Insufficient", `Not enough ${currency === "acoin" ? "ACoin" : "Nexa"}.`); return; }
    setSending(true);
    const { data: recipient } = initialRecipientId
      ? await supabase.from("profiles").select("id,display_name,handle").eq("id", initialRecipientId).maybeSingle()
      : await supabase.from("profiles").select("id,display_name,handle").eq("handle", handle.trim().toLowerCase()).maybeSingle();
    if (!recipient) { showAlert("Not Found", "User not found."); setSending(false); return; }
    if (recipient.id === user.id) { showAlert("Error", "Cannot send to yourself."); setSending(false); return; }
    if (currency === "nexa") {
      const { data: ok, error } = await supabase.from("profiles").update({ xp: (profile?.xp || 0) - amt }).eq("id", user.id).gte("xp", amt).select("id").maybeSingle();
      if (error || !ok) { showAlert("Error", "Could not deduct Nexa."); setSending(false); return; }
      const { data: creditResult, error: ce } = await supabase.rpc("award_xp", { p_user_id: recipient.id, p_action_type: "nexa_transfer_received", p_xp_amount: amt, p_metadata: { from_user_id: user.id } });
      if (ce || !(creditResult as any)?.success) {
        try {
          await supabase.rpc("award_xp", { p_user_id: user.id, p_action_type: "nexa_transfer_rollback", p_xp_amount: amt, p_metadata: { recipient_id: recipient.id } });
        } catch {}
        showAlert("Error", "Could not credit recipient. Your Nexa was restored."); setSending(false); return;
      }
      const { error: transferErr } = await supabase.from("xp_transfers").insert({ sender_id: user.id, receiver_id: recipient.id, amount: amt, message: note.trim() || null });
      if (transferErr) {
        await Promise.all([
          supabase.rpc("award_xp", { p_user_id: user.id, p_action_type: "nexa_transfer_rollback", p_xp_amount: amt, p_metadata: { recipient_id: recipient.id } }),
          supabase.rpc("award_xp", { p_user_id: recipient.id, p_action_type: "nexa_transfer_reversal", p_xp_amount: -amt, p_metadata: { sender_id: user.id } }),
        ]).catch(() => {});
        showAlert("Error", "The transfer could not be recorded. Your Nexa was restored."); setSending(false); return;
      }
    } else {
      const { error: deductErr } = await supabase.rpc("deduct_acoin", { p_user_id: user.id, p_amount: amt }).maybeSingle();
      if (deductErr) { showAlert("Error", "Could not deduct ACoin."); setSending(false); return; }
      const { error: creditErr } = await supabase.rpc("credit_acoin", { p_user_id: recipient.id, p_amount: amt });
      if (creditErr) {
        await supabase.rpc("credit_acoin", { p_user_id: user.id, p_amount: amt }).then(null, () => {});
        showAlert("Error", "Could not credit recipient. Your balance has been restored."); setSending(false); return;
      }
      await Promise.all([
        supabase.from("acoin_transactions").insert({ user_id: user.id, amount: -amt, transaction_type: "acoin_transfer_sent", metadata: { to_handle: handle.trim().toLowerCase(), message: note.trim() || null } }),
        supabase.from("acoin_transactions").insert({ user_id: recipient.id, amount: amt, transaction_type: "acoin_transfer_received", metadata: { from_handle: profile?.handle, message: note.trim() || null } }),
      ]).catch(() => {});
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Sent!", `${fmtAmt(amt)} ${currency === "acoin" ? "ACoin" : "Nexa"} sent to ${recipient.display_name}`);
    onSuccess();
    setSending(false);
  }

  const balance = currency === "acoin" ? (profile?.acoin || 0) : (profile?.xp || 0);
  const currColor = currency === "acoin" ? "#34C759" : "#FF9500";
  const currIcon = currency === "acoin" ? "diamond" as const : "flash" as const;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <SubHeader title="Send" onBack={onBack} colors={colors} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        <View style={s.currToggle}>
          {(["acoin", "nexa"] as const).map(c => (
            <TouchableOpacity key={c} style={[s.currToggleBtn, { flex: 1, backgroundColor: currency === c ? (c === "acoin" ? "#34C759" : "#FF9500") : colors.inputBg, borderColor: currency === c ? (c === "acoin" ? "#34C759" : "#FF9500") : colors.border }]} onPress={() => setCurrency(c)}>
              <Ionicons name={c === "acoin" ? "diamond" : "flash"} size={14} color={currency === c ? "#fff" : colors.textMuted} />
              <Text style={[s.currToggleText, { color: currency === c ? "#fff" : colors.textMuted }]}>{c === "acoin" ? "ACoin" : "Nexa"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={[s.balancePill2, { backgroundColor: currColor + "18", borderColor: currColor + "40", margin: 16, marginTop: 12 }]}>
          <Ionicons name={currIcon} size={13} color={currColor} />
          <Text style={[s.balancePill2Text, { color: currColor }]}>Balance: {fmtAmt(balance)} {currency === "acoin" ? "ACoin" : "Nexa"}</Text>
        </View>
        <Text style={[s.fieldLabel, { color: colors.textMuted }]}>RECIPIENT</Text>
        <View style={[s.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border, marginBottom: 16 }]}>
          <Text style={{ color: colors.textMuted, fontSize: 16, marginRight: 4 }}>@</Text>
          <TextInput style={[s.input, { color: colors.text, flex: 1 }]} placeholder="username" placeholderTextColor={colors.textMuted} value={handle} onChangeText={setHandle} editable={!initialRecipientId} autoCapitalize="none" autoCorrect={false} />
        </View>
        {paymentReference ? (
          <View style={[s.paymentReference, { backgroundColor: Colors.brand + "12", borderColor: Colors.brand + "35" }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.brand} />
            <Text style={[s.paymentReferenceText, { color: colors.text }]} numberOfLines={1}>
              {paymentReference}
            </Text>
          </View>
        ) : null}
        <Text style={[s.fieldLabel, { color: colors.textMuted }]}>AMOUNT</Text>
        <View style={[s.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border, marginBottom: 16 }]}>
          <Ionicons name={currIcon} size={18} color={currColor} style={{ marginRight: 8 }} />
          <TextInput style={[s.input, { color: colors.text, flex: 1 }]} placeholder="0" placeholderTextColor={colors.textMuted} value={amount} onChangeText={setAmount} keyboardType="number-pad" />
          <Text style={{ color: colors.textMuted, fontFamily: "Inter_500Medium" }}>{currency === "acoin" ? "ACoin" : "Nexa"}</Text>
        </View>
        <Text style={[s.fieldLabel, { color: colors.textMuted }]}>NOTE (OPTIONAL)</Text>
        <View style={[s.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border, marginBottom: 24 }]}>
          <TextInput style={[s.input, { color: colors.text, flex: 1 }]} placeholder="Add a message…" placeholderTextColor={colors.textMuted} value={note} onChangeText={setNote} maxLength={120} />
        </View>
        <TouchableOpacity style={[s.primaryBtn, { backgroundColor: currColor, opacity: sending ? 0.7 : 1 }]} onPress={send} disabled={sending} activeOpacity={0.85}>
          {sending ? <ActivityIndicator color="#fff" /> : <><Ionicons name="paper-plane" size={18} color="#fff" /><Text style={s.primaryBtnText}>Send {currency === "acoin" ? "ACoin" : "Nexa"}</Text></>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function ReceiveView({ colors, insets, profile, onBack }: any) {
  const handle = profile?.handle || "you";
  const afuId = useMemo(() => {
    if (!profile?.id) return "00000000";
    const hex = profile.id.replace(/-/g, "");
    return String(parseInt(hex.slice(0, 8), 16) % 100000000).padStart(8, "0");
  }, [profile?.id]);
  const qrValue = `https://afuchat.com/id/${afuId}`;
  const afuPayId = `afupay:${handle}`;

  async function copyId() {
    await Clipboard.setStringAsync(afuPayId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Copied", "AfuPay ID copied to clipboard.");
  }

  async function shareId() {
    try {
      await Share.share({ message: `Send me ACoin or Nexa on AfuChat: ${afuPayId}` });
    } catch {}
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <SubHeader title="Receive" onBack={onBack} colors={colors} />
      <ScrollView contentContainerStyle={{ alignItems: "center", padding: 24, paddingBottom: insets.bottom + 32 }}>
        <Text style={[s.receiveNote, { color: colors.textSecondary }]}>
          Show this QR code or share your AfuPay ID to receive ACoin or Nexa
        </Text>

        {/* Real QR Code */}
        <View style={[s.qrBox, { backgroundColor: "#fff", borderColor: colors.border }]}>
          <QRCode
            value={qrValue}
            size={160}
            color="#111"
            backgroundColor="#fff"
          />
        </View>

        {/* AFU ID label */}
        <View style={[s.afuIdRow, { backgroundColor: Colors.brand + "12", borderColor: Colors.brand + "30" }]}>
          <Ionicons name="diamond" size={14} color={Colors.brand} />
          <Text style={[s.afuIdText, { color: Colors.brand }]}>AFU ID: {afuId}</Text>
        </View>

        {/* AfuPay ID card with copy */}
        <TouchableOpacity
          style={[s.idCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={copyId}
          activeOpacity={0.7}
        >
          <Text style={[s.idLabel, { color: colors.textMuted }]}>AFUPAY ID (TAP TO COPY)</Text>
          <Text style={[s.idValue, { color: colors.text }]}>{afuPayId}</Text>
        </TouchableOpacity>

        {/* Share button */}
        <TouchableOpacity
          style={[s.shareBtn, { backgroundColor: Colors.brand }]}
          onPress={shareId}
          activeOpacity={0.85}
        >
          <Ionicons name="share-social" size={18} color="#fff" />
          <Text style={s.shareBtnText}>Share AfuPay ID</Text>
        </TouchableOpacity>

        <Text style={[s.receiveHint, { color: colors.textMuted }]}>
          Anyone can scan this QR or use @{handle} / {afuPayId} to send you money.
        </Text>
      </ScrollView>
    </View>
  );
}

function ExchangeView({ colors, insets, user, profile, currSettings, onBack, onSuccess }: any) {
  const [amount, setAmount] = useState("");
  const [converting, setConverting] = useState(false);
  const rate = currSettings?.nexa_to_acoin_rate || 100;
  const feePercent = currSettings?.conversion_fee_percent || 5;
  const nexaAmt = parseInt(amount || "0") || 0;
  const rawAcoin = nexaAmt / rate;
  const fee = Math.ceil(rawAcoin * (feePercent / 100));
  const acoinOut = Math.max(0, Math.floor(rawAcoin - fee));
  const canConvert = nexaAmt > 0 && acoinOut > 0 && nexaAmt <= (profile?.xp || 0);

  async function convert() {
    if (!canConvert || !user || !profile) return;
    setConverting(true);
    const { error } = await supabase.from("profiles").update({ xp: (profile.xp || 0) - nexaAmt, acoin: (profile.acoin || 0) + acoinOut }).eq("id", profile.id);
    if (error) { showAlert("Error", error.message); setConverting(false); return; }
    await supabase.from("acoin_transactions").insert({ user_id: profile.id, amount: acoinOut, transaction_type: "conversion", nexa_spent: nexaAmt, fee_charged: fee, metadata: { rate, fee_percent: feePercent } });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Converted!", `${fmtAmt(nexaAmt)} Nexa → ${fmtAmt(acoinOut)} ACoin`);
    onSuccess();
    setConverting(false);
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <SubHeader title="Convert Nexa → ACoin" onBack={onBack} colors={colors} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
          <View style={[s.balancePill2, { flex: 1, backgroundColor: "#FF950018", borderColor: "#FF950030" }]}>
            <Ionicons name="flash" size={13} color="#FF9500" />
            <Text style={[s.balancePill2Text, { color: "#FF9500" }]}>{fmtAmt(profile?.xp || 0)} Nexa</Text>
          </View>
          <View style={[s.balancePill2, { flex: 1, backgroundColor: "#34C75918", borderColor: "#34C75930" }]}>
            <Ionicons name="diamond" size={13} color="#34C759" />
            <Text style={[s.balancePill2Text, { color: "#34C759" }]}>{fmtAmt(profile?.acoin || 0)} AC</Text>
          </View>
        </View>
        <View style={[s.rateBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.rateText, { color: colors.textMuted }]}>{rate} Nexa = 1 ACoin · {feePercent}% conversion fee</Text>
        </View>
        <Text style={[s.fieldLabel, { color: colors.textMuted, marginTop: 20 }]}>NEXA AMOUNT</Text>
        <View style={[s.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border, marginBottom: 16 }]}>
          <Ionicons name="flash" size={18} color="#FF9500" style={{ marginRight: 8 }} />
          <TextInput style={[s.input, { color: colors.text, flex: 1 }]} placeholder="0" placeholderTextColor={colors.textMuted} value={amount} onChangeText={setAmount} keyboardType="number-pad" />
          <Text style={{ color: colors.textMuted, fontFamily: "Inter_500Medium" }}>Nexa</Text>
        </View>
        {nexaAmt > 0 && (
          <View style={[s.previewBox, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "30" }]}>
            <View style={s.previewRow}>
              <Text style={{ color: colors.textMuted, fontFamily: "Inter_500Medium" }}>You receive</Text>
              <Text style={{ color: "#34C759", fontFamily: "Inter_700Bold", fontSize: 18 }}>+{fmtAmt(acoinOut)} ACoin</Text>
            </View>
            <View style={[s.sep, { backgroundColor: Colors.brand + "20", marginVertical: 10 }]} />
            <View style={s.previewRow}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Fee ({feePercent}%)</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{fmtAmt(fee)} ACoin</Text>
            </View>
          </View>
        )}
        <TouchableOpacity style={[s.primaryBtn, { backgroundColor: Colors.brand, opacity: (!canConvert || converting) ? 0.6 : 1, marginTop: 20 }]} onPress={convert} disabled={!canConvert || converting} activeOpacity={0.85}>
          {converting ? <ActivityIndicator color="#fff" /> : <><Ionicons name="swap-horizontal" size={18} color="#fff" /><Text style={s.primaryBtnText}>Convert to ACoin</Text></>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function RequestsView({ colors, insets, user, onBack }: any) {
  const [requests, setRequests] = useState<PayRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("money_requests")
      .select("id,requester_id,target_id,currency,amount,note,status,created_at")
      .or(`target_id.eq.${user.id},requester_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error || !data) {
      setRequests([]);
      setLoading(false);
      return;
    }

    const profileIds = Array.from(new Set(
      data.flatMap((request: any) => [request.requester_id, request.target_id]),
    ));
    const { data: profiles } = profileIds.length > 0
      ? await supabase.from("profiles").select("id,handle,display_name").in("id", profileIds)
      : { data: [] };
    const profileMap = new Map(
      (profiles || []).map((p: any) => [
        p.id,
        { handle: p.handle, display_name: p.display_name },
      ]),
    );

    setRequests(data.map((request: any) => ({
      ...request,
      requester: profileMap.get(request.requester_id) || null,
      target: profileMap.get(request.target_id) || null,
    })) as PayRequest[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const shown = requests.filter(r => tab === "incoming" ? r.target_id === user?.id : r.requester_id === user?.id);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <SubHeader title="Payment Requests" onBack={onBack} colors={colors} />
      <View style={[s.currToggle, { padding: 16, paddingBottom: 8 }]}>
        {(["incoming", "outgoing"] as const).map(t => (
          <TouchableOpacity key={t} style={[s.currToggleBtn, { flex: 1, backgroundColor: tab === t ? Colors.brand : colors.inputBg, borderColor: tab === t ? Colors.brand : colors.border }]} onPress={() => setTab(t)}>
            <Text style={[s.currToggleText, { color: tab === t ? "#fff" : colors.textMuted }]}>{t === "incoming" ? "Incoming" : "Outgoing"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        {loading ? <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} /> :
          shown.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="receipt-outline" size={40} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textMuted }]}>No {tab} requests</Text>
            </View>
          ) : shown.map(r => (
            <View key={r.id} style={[s.requestCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[s.txLabel, { color: colors.text }]}>
                  {tab === "incoming" ? "From" : "To"} @{(tab === "incoming" ? r.requester : r.target)?.handle || "unknown"}
                </Text>
                <View style={[s.statusBadge, { backgroundColor: r.status === "pending" ? "#FF950018" : r.status === "completed" ? "#34C75918" : "#FF3B3018" }]}>
                  <Text style={[s.statusText, { color: r.status === "pending" ? "#FF9500" : r.status === "completed" ? "#34C759" : "#FF3B30" }]}>{r.status}</Text>
                </View>
              </View>
              <Text style={[s.txAmt, { color: Colors.brand, marginTop: 4 }]}>{fmtAmt(r.amount)} {r.currency === "acoin" ? "ACoin" : "Nexa"}</Text>
              {r.note && <Text style={[s.txSub, { color: colors.textMuted, marginTop: 4 }]}>{r.note}</Text>}
              <Text style={[s.txSub, { color: colors.textMuted, marginTop: 4 }]}>{timeAgo(r.created_at)}</Text>
            </View>
          ))}
      </ScrollView>
    </View>
  );
}

const W = Dimensions.get("window").width;
const s = StyleSheet.create({
  root: { flex: 1 },
  walletHeader: { borderBottomWidth: 0.5 },
  walletHeaderRow: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  walletHeaderTitleWrap: { alignItems: "center" },
  walletHeaderTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  walletHeaderSubtitle: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 1 },
  walletBackGlyph: { fontSize: 34, lineHeight: 34, fontFamily: "Inter_400Regular", marginTop: -2 },
  heroCard: { margin: 16, borderRadius: 20, padding: 20 },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heroLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 4 },
  heroAmount: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold" },
  heroCurrency: { fontSize: 16, fontFamily: "Inter_500Medium" },
  heroRight: { alignItems: "flex-end" },
  heroDivider: { height: 1, marginVertical: 14 },
  heroSub: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "Inter_400Regular" },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, gap: 8, justifyContent: "space-around", marginBottom: 8 },
  actionItem: { alignItems: "center", gap: 5, width: (W - 32) / 3, marginBottom: 4, paddingVertical: 4 },
  actionIcon: { width: 50, height: 50, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  seeAll: { fontSize: 13, fontFamily: "Inter_500Medium" },
  txCard: { borderRadius: 16, borderWidth: 0.5, overflow: "hidden" },
  txRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  txIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1 },
  txLabel: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 2 },
  txSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  txAmt: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sep: { height: 0.5, marginLeft: 62 },
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 4 },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  subHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 12 },
  subHeaderTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  balancePill2: { flexDirection: "row", alignItems: "center", gap: 6, padding: 12, borderRadius: 12, borderWidth: 1 },
  balancePill2Text: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 8 },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  paymentReference: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
  paymentReferenceText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  input: { fontSize: 15, fontFamily: "Inter_400Regular" },
  packRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 13 },
  packIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  packRowLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  packRowAmt: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  packRowUsd: { fontSize: 16, fontFamily: "Inter_700Bold" },
  packRowLocal: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  packCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },
  popularChip: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  popularChipText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" },
  previewBox: { borderRadius: 12, borderWidth: 1, padding: 14 },
  previewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  currToggle: { flexDirection: "row", gap: 10 },
  currToggleBtn: { alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  currToggleText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rateBox: { borderRadius: 12, borderWidth: 1, padding: 12, alignItems: "center" },
  rateText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  receiveNote: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 24 },
  qrBox: { width: 200, height: 200, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  afuIdRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginBottom: 16 },
  afuIdText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  idCard: { width: "100%", borderRadius: 14, borderWidth: 1, padding: 16, alignItems: "center", marginBottom: 12 },
  idLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 4 },
  idValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%", justifyContent: "center", borderRadius: 14, paddingVertical: 13, marginBottom: 16 },
  shareBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  receiveHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  requestCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
});
