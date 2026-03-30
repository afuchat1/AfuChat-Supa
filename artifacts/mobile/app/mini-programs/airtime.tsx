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

const PROVIDERS = [
  { id: "mtn", name: "MTN", color: "#FFCC00", icon: "📱" },
  { id: "airtel", name: "Airtel", color: "#FF0000", icon: "📱" },
  { id: "glo", name: "Glo", color: "#00A651", icon: "📱" },
  { id: "9mobile", name: "9mobile", color: "#006B53", icon: "📱" },
];

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000, 2000];

export default function AirtimeScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [provider, setProvider] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const numAmount = parseInt(amount) || 0;
  const fee = numAmount > 0 ? calculateFee("airtime", numAmount) : null;

  const handlePurchase = async () => {
    if (!user || !provider || !phone || numAmount <= 0) {
      showAlert("Error", "Please fill in all fields");
      return;
    }
    if (phone.length < 10) {
      showAlert("Error", "Please enter a valid phone number");
      return;
    }

    setLoading(true);
    const result = await processServiceTransaction(user.id, "airtime", numAmount, {
      provider,
      phone_number: phone,
      airtime_amount: numAmount,
    });
    setLoading(false);

    if (result.success) {
      Haptics.notificationAsync("success");
      showAlert("Success", `${numAmount} ACoins airtime sent to ${phone}`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } else {
      Haptics.notificationAsync("error");
      showAlert("Failed", result.error || "Transaction failed");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Buy Airtime</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.label, { color: colors.text }]}>Select Provider</Text>
        <View style={styles.providerRow}>
          {PROVIDERS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.providerCard, {
                backgroundColor: provider === p.id ? p.color + "20" : colors.surface,
                borderColor: provider === p.id ? p.color : colors.border,
              }]}
              onPress={() => { setProvider(p.id); Haptics.selectionAsync(); }}
            >
              <Text style={styles.providerIcon}>{p.icon}</Text>
              <Text style={[styles.providerName, { color: provider === p.id ? p.color : colors.text }]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Phone Number</Text>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="call-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter phone number"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            maxLength={15}
          />
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Amount (ACoins)</Text>
        <View style={styles.quickRow}>
          {QUICK_AMOUNTS.map((a) => (
            <TouchableOpacity
              key={a}
              style={[styles.quickBtn, {
                backgroundColor: numAmount === a ? Colors.brand : colors.surface,
              }]}
              onPress={() => { setAmount(a.toString()); Haptics.selectionAsync(); }}
            >
              <Text style={[styles.quickText, { color: numAmount === a ? "#fff" : colors.text }]}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.inputPrefix, { color: colors.textMuted }]}>🪙</Text>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={amount}
            onChangeText={setAmount}
            placeholder="Or enter custom amount"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
          />
        </View>

        {fee && (
          <View style={[styles.feeCard, { backgroundColor: colors.surface }]}>
            <View style={styles.feeRow}>
              <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>Airtime</Text>
              <Text style={[styles.feeValue, { color: colors.text }]}>{fee.subtotal} ACoins</Text>
            </View>
            <View style={styles.feeRow}>
              <TouchableOpacity
                style={styles.feeLink}
                onPress={() => router.push({
                  pathname: "/mini-programs/fee-details" as any,
                  params: { service: "airtime", amount: fee.subtotal.toString(), fee: fee.feeAmount.toString(), total: fee.total.toString() },
                })}
              >
                <Text style={[styles.feeLinkText, { color: Colors.brand }]}>Fee ({fee.feePercent}%)</Text>
                <Ionicons name="information-circle-outline" size={14} color={Colors.brand} />
              </TouchableOpacity>
              <Text style={[styles.feeValue, { color: "#FF9800" }]}>+{fee.feeAmount} ACoins</Text>
            </View>
            <View style={[styles.feeDivider, { backgroundColor: colors.border }]} />
            <View style={styles.feeRow}>
              <Text style={[styles.feeTotalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[styles.feeTotalValue, { color: Colors.brand }]}>{fee.total} ACoins</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.buyBtn, { backgroundColor: Colors.brand, opacity: (!provider || !phone || numAmount <= 0 || loading) ? 0.5 : 1 }]}
          onPress={handlePurchase}
          disabled={!provider || !phone || numAmount <= 0 || loading}
        >
          <Text style={styles.buyBtnText}>{loading ? "Processing..." : "Buy Airtime"}</Text>
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
  providerRow: { flexDirection: "row", gap: 8 },
  providerCard: { flex: 1, alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1.5, gap: 4 },
  providerIcon: { fontSize: 20 },
  providerName: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  inputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, gap: 8, borderWidth: 1 },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium", paddingVertical: 14 },
  inputPrefix: { fontSize: 18 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  quickText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  feeCard: { borderRadius: 14, padding: 16, gap: 10 },
  feeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  feeLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  feeValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  feeLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  feeLinkText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  feeDivider: { height: StyleSheet.hairlineWidth },
  feeTotalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  feeTotalValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  buyBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  buyBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
