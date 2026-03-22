import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

type Transaction = {
  id: string;
  type: string;
  amount: number;
  created_at: string;
  label: string;
  icon: string;
  color: string;
};

export default function WalletScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferHandle, setTransferHandle] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferMsg, setTransferMsg] = useState("");
  const [sending, setSending] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const [{ data: xpSent }, { data: xpReceived }, { data: acoinTx }] = await Promise.all([
      supabase.from("xp_transfers").select("id, amount, created_at, status").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("xp_transfers").select("id, amount, created_at, status").eq("receiver_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("acoin_transactions").select("id, amount, transaction_type, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);

    const all: Transaction[] = [];
    (xpSent || []).forEach((t: any) => all.push({ id: t.id, type: "xp_sent", amount: -t.amount, created_at: t.created_at, label: "XP Sent", icon: "arrow-up-circle", color: "#FF3B30" }));
    (xpReceived || []).forEach((t: any) => all.push({ id: t.id, type: "xp_received", amount: t.amount, created_at: t.created_at, label: "XP Received", icon: "arrow-down-circle", color: Colors.brand }));
    (acoinTx || []).forEach((t: any) => all.push({ id: t.id, type: t.transaction_type, amount: t.amount, created_at: t.created_at, label: t.transaction_type.replace(/_/g, " "), icon: "diamond", color: "#FF9500" }));

    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setTransactions(all);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function sendXp() {
    if (!transferHandle.trim() || !transferAmount.trim() || !user) return;
    const amt = parseInt(transferAmount);
    if (isNaN(amt) || amt <= 0) { Alert.alert("Invalid", "Enter a valid amount."); return; }
    if (amt > (profile?.xp || 0)) { Alert.alert("Insufficient XP", "You don't have enough XP."); return; }
    setSending(true);

    const { data: recipient } = await supabase.from("profiles").select("id, display_name").eq("handle", transferHandle.trim().toLowerCase()).single();
    if (!recipient) { Alert.alert("Not found", "User not found."); setSending(false); return; }

    const { error } = await supabase.from("xp_transfers").insert({ sender_id: user.id, receiver_id: recipient.id, amount: amt, message: transferMsg.trim() || null });
    if (error) { Alert.alert("Error", error.message); } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Sent!", `${amt} XP sent to ${recipient.display_name}`);
      setShowTransfer(false);
      setTransferHandle("");
      setTransferAmount("");
      setTransferMsg("");
      refreshProfile();
      loadHistory();
    }
    setSending(false);
  }

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
            <Text style={styles.balanceLabel}>XP</Text>
          </View>
          <View style={[styles.balanceDivider]} />
          <View style={styles.balanceItem}>
            <Ionicons name="diamond" size={24} color="rgba(255,255,255,0.9)" />
            <Text style={styles.balanceValue}>{profile?.acoin || 0}</Text>
            <Text style={styles.balanceLabel}>ACoin</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.transferBtn} onPress={() => setShowTransfer(true)}>
          <Ionicons name="swap-horizontal" size={18} color={Colors.brand} />
          <Text style={styles.transferBtnText}>Transfer XP</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Transaction History</Text>

      {loading ? <ActivityIndicator color={Colors.brand} style={{ marginTop: 20 }} /> : (
        <FlatList
          data={transactions}
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
              <Text style={[styles.txAmount, { color: item.amount > 0 ? Colors.brand : "#FF3B30" }]}>
                {item.amount > 0 ? "+" : ""}{item.amount}
              </Text>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadHistory(); }} tintColor={Colors.brand} />}
          ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textMuted }]}>No transactions yet</Text>}
        />
      )}

      <Modal visible={showTransfer} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Transfer XP</Text>
              <TouchableOpacity onPress={() => setShowTransfer(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Recipient handle" placeholderTextColor={colors.textMuted} value={transferHandle} onChangeText={setTransferHandle} autoCapitalize="none" />
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Amount" placeholderTextColor={colors.textMuted} value={transferAmount} onChangeText={setTransferAmount} keyboardType="numeric" />
            <TextInput style={[styles.modalInput, { color: colors.text, backgroundColor: colors.inputBg }]} placeholder="Message (optional)" placeholderTextColor={colors.textMuted} value={transferMsg} onChangeText={setTransferMsg} />
            <TouchableOpacity style={[styles.sendXpBtn, sending && { opacity: 0.6 }]} onPress={sendXp} disabled={sending}>
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendXpBtnText}>Send XP</Text>}
            </TouchableOpacity>
          </View>
        </View>
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
  transferBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fff", borderRadius: 24, paddingVertical: 10 },
  transferBtnText: { color: Colors.brand, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, paddingVertical: 8 },
  txRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  txLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  txTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  txAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyText: { textAlign: "center", marginTop: 40, fontSize: 15, fontFamily: "Inter_400Regular" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 14 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  modalInput: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular" },
  sendXpBtn: { backgroundColor: Colors.brand, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  sendXpBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
