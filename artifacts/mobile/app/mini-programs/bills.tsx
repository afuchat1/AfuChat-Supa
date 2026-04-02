import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { showAlert } from "@/lib/alert";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";
import { calculateFee, processServiceTransaction } from "@/lib/serviceTransactions";

const BILL_TYPES = [
  { id: "electricity", name: "Electricity", icon: "⚡", color: "#FFD700" },
  { id: "water", name: "Water", icon: "💧", color: "#2196F3" },
  { id: "tv", name: "TV/Cable", icon: "📺", color: "#9C27B0" },
  { id: "internet", name: "Internet", icon: "🌐", color: "#4CAF50" },
  { id: "waste", name: "Waste", icon: "🗑️", color: "#795548" },
  { id: "insurance", name: "Insurance", icon: "🛡️", color: "#FF5722" },
];

export default function BillsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [billType, setBillType] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const numAmount = parseInt(amount) || 0;
  const fee = numAmount > 0 ? calculateFee("bill_payment", numAmount) : null;
  const selectedBill = BILL_TYPES.find((b) => b.id === billType);

  const handlePay = async () => {
    if (!user || !billType || !accountNumber || numAmount <= 0) {
      showAlert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);
    const result = await processServiceTransaction(user.id, "bill_payment", numAmount, {
      bill_type: billType,
      bill_name: selectedBill?.name,
      account_number: accountNumber,
      bill_amount: numAmount,
    });
    setLoading(false);

    if (result.success) {
      Haptics.notificationAsync("success");
      showAlert("Success", `${selectedBill?.name} bill of ${numAmount} ACoins paid successfully`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } else {
      Haptics.notificationAsync("error");
      showAlert("Failed", result.error || "Payment failed");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Pay Bills</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.label, { color: colors.text }]}>Bill Type</Text>
        <View style={styles.billGrid}>
          {BILL_TYPES.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={[styles.billCard, {
                backgroundColor: billType === b.id ? b.color + "20" : colors.surface,
                borderColor: billType === b.id ? b.color : colors.border,
              }]}
              onPress={() => { setBillType(b.id); Haptics.selectionAsync(); }}
            >
              <Text style={styles.billIcon}>{b.icon}</Text>
              <Text style={[styles.billName, { color: billType === b.id ? b.color : colors.text }]}>{b.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Account / Meter Number</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="document-text-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={accountNumber}
            onChangeText={setAccountNumber}
            placeholder="Enter account number"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Amount (ACoins)</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.inputPrefix}>🪙</Text>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={amount}
            onChangeText={setAmount}
            placeholder="Enter bill amount"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
          />
        </View>

        {fee && (
          <View style={[styles.feeCard, { backgroundColor: colors.surface }]}>
            <View style={styles.feeRow}>
              <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>{selectedBill?.name} Bill</Text>
              <Text style={[styles.feeValue, { color: colors.text }]}>{fee.subtotal} ACoins</Text>
            </View>
            <View style={styles.feeRow}>
              <TouchableOpacity
                style={styles.feeLink}
                onPress={() => router.push({
                  pathname: "/mini-programs/fee-details" as any,
                  params: { service: "bill_payment", amount: fee.subtotal.toString(), fee: fee.feeAmount.toString(), total: fee.total.toString() },
                })}
              >
                <Text style={[styles.feeLinkText, { color: colors.accent }]}>Fee ({fee.feePercent}%)</Text>
                <Ionicons name="information-circle-outline" size={14} color={colors.accent} />
              </TouchableOpacity>
              <Text style={[styles.feeValue, { color: "#FF9800" }]}>+{fee.feeAmount} ACoins</Text>
            </View>
            <View style={[styles.feeDivider, { backgroundColor: colors.border }]} />
            <View style={styles.feeRow}>
              <Text style={[styles.feeTotalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[styles.feeTotalValue, { color: colors.accent }]}>{fee.total} ACoins</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.payBtn, { backgroundColor: colors.accent, opacity: (!billType || !accountNumber || numAmount <= 0 || loading) ? 0.5 : 1 }]}
          onPress={handlePay}
          disabled={!billType || !accountNumber || numAmount <= 0 || loading}
        >
          <Text style={styles.payBtnText}>{loading ? "Processing..." : "Pay Bill"}</Text>
        </TouchableOpacity>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { padding: 16, gap: 12 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  billGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  billCard: { width: "31%", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1.5, gap: 6 },
  billIcon: { fontSize: 28 },
  billName: { fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  inputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, gap: 8, borderWidth: 1 },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium", paddingVertical: 14 },
  inputPrefix: { fontSize: 18 },
  feeCard: { borderRadius: 14, padding: 16, gap: 10 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  feeLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  feeValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  feeLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  feeLinkText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  feeDivider: { height: StyleSheet.hairlineWidth },
  feeTotalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  feeTotalValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  payBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  payBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
