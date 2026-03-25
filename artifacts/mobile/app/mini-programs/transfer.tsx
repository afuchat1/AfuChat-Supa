import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";
import { calculateFee, processServiceTransaction } from "@/lib/serviceTransactions";

export default function TransferScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const numAmount = parseInt(amount) || 0;
  const fee = numAmount > 0 ? calculateFee("money_transfer", numAmount) : null;

  const handleTransfer = async () => {
    if (!user || !recipient || numAmount <= 0) {
      Alert.alert("Error", "Please enter recipient and amount");
      return;
    }

    setLoading(true);
    const result = await processServiceTransaction(user.id, "money_transfer", numAmount, {
      recipient_identifier: recipient,
      transfer_amount: numAmount,
      note: note || undefined,
    });
    setLoading(false);

    if (result.success) {
      Haptics.notificationAsync("success");
      Alert.alert("Transfer Sent!", `${numAmount} ACoins sent to ${recipient}`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } else {
      Haptics.notificationAsync("error");
      Alert.alert("Failed", result.error || "Transfer failed");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Send Money</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.iconWrap}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.brand + "15" }]}>
            <Text style={styles.iconEmoji}>💸</Text>
          </View>
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Recipient Username or Phone</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="person-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={recipient}
            onChangeText={setRecipient}
            placeholder="@username or phone number"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Amount (ACoins)</Text>
        <View style={[styles.amountWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.amountPrefix}>🪙</Text>
          <TextInput
            style={[styles.amountInput, { color: colors.text }]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
          />
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Note (Optional)</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={note}
            onChangeText={setNote}
            placeholder="What's this for?"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {fee && (
          <View style={[styles.feeCard, { backgroundColor: colors.surface }]}>
            <View style={styles.feeRow}>
              <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>Transfer Amount</Text>
              <Text style={[styles.feeValue, { color: colors.text }]}>{fee.subtotal} ACoins</Text>
            </View>
            <View style={styles.feeRow}>
              <TouchableOpacity
                style={styles.feeLink}
                onPress={() => router.push({
                  pathname: "/mini-programs/fee-details" as any,
                  params: { service: "money_transfer", amount: fee.subtotal.toString(), fee: fee.feeAmount.toString(), total: fee.total.toString() },
                })}
              >
                <Text style={[styles.feeLinkText, { color: Colors.brand }]}>Transfer Fee ({fee.feePercent}%)</Text>
                <Ionicons name="information-circle-outline" size={14} color={Colors.brand} />
              </TouchableOpacity>
              <Text style={[styles.feeValue, { color: "#FF9800" }]}>+{fee.feeAmount} ACoins</Text>
            </View>
            <View style={[styles.feeDivider, { backgroundColor: colors.border }]} />
            <View style={styles.feeRow}>
              <Text style={[styles.feeTotalLabel, { color: colors.text }]}>Total Charged</Text>
              <Text style={[styles.feeTotalValue, { color: Colors.brand }]}>{fee.total} ACoins</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: Colors.brand, opacity: (!recipient || numAmount <= 0 || loading) ? 0.5 : 1 }]}
          onPress={handleTransfer}
          disabled={!recipient || numAmount <= 0 || loading}
        >
          <Ionicons name="send" size={18} color="#fff" />
          <Text style={styles.sendBtnText}>{loading ? "Sending..." : "Send Money"}</Text>
        </TouchableOpacity>

        <View style={[styles.noteCard, { backgroundColor: "#FFF3E0", borderColor: "#FFB74D" }]}>
          <Ionicons name="shield-checkmark" size={18} color="#F57C00" />
          <Text style={styles.noteText}>
            All transfers are secured and recorded. A {fee?.feePercent || 1.5}% fee is charged per transaction.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { padding: 16, gap: 12 },
  iconWrap: { alignItems: "center", paddingVertical: 8 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  iconEmoji: { fontSize: 36 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  inputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, gap: 8, borderWidth: 1 },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium", paddingVertical: 14 },
  amountWrap: { flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 20, borderWidth: 1, justifyContent: "center" },
  amountPrefix: { fontSize: 28 },
  amountInput: { fontSize: 40, fontFamily: "Inter_700Bold", paddingVertical: 16, textAlign: "center", minWidth: 100 },
  feeCard: { borderRadius: 14, padding: 16, gap: 10 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  feeLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  feeValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  feeLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  feeLinkText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  feeDivider: { height: StyleSheet.hairlineWidth },
  feeTotalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  feeTotalValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16, marginTop: 8 },
  sendBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  noteCard: { flexDirection: "row", gap: 8, borderRadius: 12, padding: 12, borderWidth: 1, alignItems: "flex-start" },
  noteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#795548", lineHeight: 18 },
});
