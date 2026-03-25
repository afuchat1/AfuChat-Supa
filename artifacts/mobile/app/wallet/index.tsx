import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
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
import { WalletSkeleton } from "@/components/ui/Skeleton";

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

type CurrencySettings = {
  nexa_to_acoin_rate: number;
  conversion_fee_percent: number;
  p2p_fee_percent: number;
};

export default function WalletScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
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

  const loadData = useCallback(async () => {
    if (!user) return;
    const [{ data: xpSent }, { data: xpReceived }, { data: acoinTx }, { data: settings }, { data: giftsSent }, { data: giftsReceived }] = await Promise.all([
      supabase.from("xp_transfers").select("id, amount, created_at, status, receiver_id").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("xp_transfers").select("id, amount, created_at, status, sender_id").eq("receiver_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("acoin_transactions").select("id, amount, transaction_type, nexa_spent, fee_charged, created_at, metadata").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("currency_settings").select("nexa_to_acoin_rate, conversion_fee_percent, p2p_fee_percent").limit(1).single(),
      supabase.from("gift_transactions").select("id, gift_id, receiver_id, xp_cost, created_at, gifts(name, emoji)").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("gift_transactions").select("id, gift_id, sender_id, xp_cost, created_at, gifts(name, emoji)").eq("receiver_id", user.id).order("created_at", { ascending: false }).limit(30),
    ]);

    if (settings) setCurrencySettings(settings as CurrencySettings);

    const all: Transaction[] = [];
    (xpSent || []).forEach((t: any) => all.push({ id: t.id, type: "nexa_sent", amount: -t.amount, created_at: t.created_at, label: "Nexa Sent", icon: "arrow-up-circle", color: "#FF3B30", currency: "nexa" }));
    (xpReceived || []).forEach((t: any) => all.push({ id: t.id, type: "nexa_received", amount: t.amount, created_at: t.created_at, label: "Nexa Received", icon: "arrow-down-circle", color: Colors.brand, currency: "nexa" }));

    const acoinLabelMap: Record<string, { label: string; icon: string }> = {
      conversion: { label: "Nexa → ACoin", icon: "swap-horizontal" },
      subscription: { label: "Premium Subscription", icon: "diamond" },
      gift_conversion: { label: "Gift Converted", icon: "gift" },
      marketplace_purchase: { label: "Marketplace Purchase", icon: "cart" },
      marketplace_sale: { label: "Marketplace Sale", icon: "storefront" },
      topup: { label: "ACoin Top-Up", icon: "card" },
    };

    (acoinTx || []).forEach((t: any) => {
      const mapped = acoinLabelMap[t.transaction_type];
      const giftName = t.metadata?.gift_name;
      let label = mapped?.label || t.transaction_type.replace(/_/g, " ");
      if (giftName && (t.transaction_type === "gift_conversion" || t.transaction_type === "marketplace_purchase" || t.transaction_type === "marketplace_sale")) {
        label += ` · ${giftName}`;
      }
      const icon = mapped?.icon || (t.amount > 0 ? "arrow-down-circle" : "arrow-up-circle");
      all.push({ id: t.id, type: t.transaction_type, amount: t.amount, created_at: t.created_at, label, icon, color: t.amount > 0 ? "#34C759" : "#FF9500", currency: "acoin" });
    });

    (giftsSent || []).forEach((t: any) => {
      const giftName = t.gifts?.name || "Gift";
      const giftEmoji = t.gifts?.emoji || "🎁";
      all.push({ id: "gs_" + t.id, type: "gift_sent", amount: -(t.xp_cost || 0), created_at: t.created_at, label: `Sent ${giftEmoji} ${giftName}`, icon: "gift", color: "#FF3B30", currency: "nexa" });
    });

    (giftsReceived || []).forEach((t: any) => {
      const giftName = t.gifts?.name || "Gift";
      const giftEmoji = t.gifts?.emoji || "🎁";
      all.push({ id: "gr_" + t.id, type: "gift_received", amount: 0, created_at: t.created_at, label: `Received ${giftEmoji} ${giftName}`, icon: "gift", color: "#AF52DE", currency: "gift" });
    });

    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setTransactions(all);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

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

    const { error } = await supabase.from("xp_transfers").insert({ sender_id: user.id, receiver_id: recipient.id, amount: amt, message: transferMsg.trim() || null });
    if (error) { showAlert("Error", error.message); } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Sent!", `${amt} Nexa sent to ${recipient.display_name}`);
      setShowTransfer(false);
      setTransferHandle("");
      setTransferAmount("");
      setTransferMsg("");
      refreshProfile();
      loadData();
    }
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
      `Convert ${nexaAmt} Nexa → ${netAcoin} ACoin?\n\nRate: ${currencySettings.nexa_to_acoin_rate} Nexa = 1 ACoin\nFee: ${currencySettings.conversion_fee_percent}% (${fee} ACoin)`,
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
            showAlert("Converted!", `${nexaAmt} Nexa → ${netAcoin} ACoin`);
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

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Wallet</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.balanceCard, { backgroundColor: Colors.brand }]}>
        <View style={styles.balanceRow}>
          <View style={styles.balanceItem}>
            <Ionicons name="flash" size={24} color="rgba(255,255,255,0.9)" />
            <Text style={styles.balanceValue}>{profile?.xp || 0}</Text>
            <Text style={styles.balanceLabel}>Nexa</Text>
          </View>
          <View style={[styles.balanceDivider]} />
          <View style={styles.balanceItem}>
            <Ionicons name="diamond" size={24} color="rgba(255,255,255,0.9)" />
            <Text style={styles.balanceValue}>{profile?.acoin || 0}</Text>
            <Text style={styles.balanceLabel}>ACoin</Text>
          </View>
        </View>
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "rgba(212,168,83,0.15)" }]} onPress={() => router.push("/wallet/topup")}>
            <Ionicons name="diamond" size={16} color={Colors.gold} />
            <Text style={[styles.actionBtnText, { color: Colors.gold }]}>Buy ACoin</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowTransfer(true)}>
            <Ionicons name="send" size={16} color={Colors.brand} />
            <Text style={styles.actionBtnText}>Send</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowConvert(true)}>
            <Ionicons name="swap-horizontal" size={16} color={Colors.brand} />
            <Text style={styles.actionBtnText}>Convert</Text>
          </TouchableOpacity>
        </View>
      </View>

      {currencySettings && (
        <View style={[styles.rateCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.rateText, { color: colors.textMuted }]}>
            Rate: {currencySettings.nexa_to_acoin_rate} Nexa = 1 ACoin · Fee: {currencySettings.conversion_fee_percent}%
          </Text>
        </View>
      )}

      <View style={styles.tabRow}>
        {(["all", "nexa", "acoin", "gifts"] as const).map((tab) => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && { backgroundColor: Colors.brand }]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && { color: "#fff" }]}>
              {tab === "all" ? "All" : tab === "nexa" ? "Nexa" : tab === "acoin" ? "ACoin" : "Gifts"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <WalletSkeleton /> : (
        <FlatList
          data={filteredTx}
          keyExtractor={(item) => item.id + item.type}
          renderItem={({ item }) => (
            <View style={[styles.txRow, { backgroundColor: colors.surface }]}>
              <View style={[styles.txIcon, { backgroundColor: item.color + "20" }]}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.txLabel, { color: colors.text }]}>{item.label}</Text>
                <Text style={[styles.txTime, { color: colors.textMuted }]}>{new Date(item.created_at).toLocaleDateString()}</Text>
              </View>
              <View style={styles.txRight}>
                {item.type === "gift_received" ? (
                  <Text style={[styles.txAmount, { color: "#AF52DE" }]}>🎁</Text>
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
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.brand} />}
          ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textMuted }]}>No transactions yet</Text>}
        />
      )}

      <Modal visible={showTransfer} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={styles.dragHandle} />
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
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showConvert} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={styles.dragHandle} />
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Convert Nexa → ACoin</Text>
                <TouchableOpacity onPress={() => setShowConvert(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
              </View>
              <Text style={[styles.modalSub, { color: colors.textMuted }]}>
                Balance: {profile?.xp || 0} Nexa · Rate: {currencySettings?.nexa_to_acoin_rate || 100} Nexa = 1 ACoin
              </Text>
              <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Nexa amount to convert" placeholderTextColor={colors.textMuted} value={convertAmount} onChangeText={setConvertAmount} keyboardType="numeric" />
              {previewAcoin && (
                <View style={[styles.previewBox, { backgroundColor: colors.inputBg }]}>
                  <View style={styles.previewRow}>
                    <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>You'll receive</Text>
                    <Text style={[styles.previewValue, { color: Colors.brand }]}>{previewAcoin.acoin} ACoin</Text>
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#ccc", alignSelf: "center", marginBottom: 4 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  modalInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  previewBox: { borderRadius: 12, padding: 14, gap: 6 },
  previewRow: { flexDirection: "row", justifyContent: "space-between" },
  previewLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  previewValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sendBtn: { backgroundColor: Colors.brand, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  sendBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
