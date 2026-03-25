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

const PROVIDERS = [
  { id: "mtn", name: "MTN", color: "#FFCC00" },
  { id: "airtel", name: "Airtel", color: "#FF0000" },
  { id: "glo", name: "Glo", color: "#00A651" },
  { id: "9mobile", name: "9mobile", color: "#006B53" },
];

const BUNDLES = [
  { id: "1gb", data: "1GB", validity: "30 days", price: 200 },
  { id: "2gb", data: "2GB", validity: "30 days", price: 350 },
  { id: "5gb", data: "5GB", validity: "30 days", price: 750 },
  { id: "10gb", data: "10GB", validity: "30 days", price: 1400 },
  { id: "20gb", data: "20GB", validity: "30 days", price: 2500 },
  { id: "50gb", data: "50GB", validity: "30 days", price: 5000 },
];

export default function DataBundlesScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [provider, setProvider] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedBundle, setSelectedBundle] = useState("");
  const [loading, setLoading] = useState(false);

  const bundle = BUNDLES.find((b) => b.id === selectedBundle);
  const fee = bundle ? calculateFee("data_bundle", bundle.price) : null;

  const handlePurchase = async () => {
    if (!user || !provider || !phone || !bundle) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);
    const result = await processServiceTransaction(user.id, "data_bundle", bundle.price, {
      provider,
      phone_number: phone,
      data_amount: bundle.data,
      validity: bundle.validity,
      bundle_id: bundle.id,
    });
    setLoading(false);

    if (result.success) {
      Haptics.notificationAsync("success");
      Alert.alert("Success", `${bundle.data} data bundle activated for ${phone}`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } else {
      Haptics.notificationAsync("error");
      Alert.alert("Failed", result.error || "Transaction failed");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Data Bundles</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
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

        <Text style={[styles.label, { color: colors.text }]}>Select Bundle</Text>
        <View style={styles.bundleGrid}>
          {BUNDLES.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={[styles.bundleCard, {
                backgroundColor: selectedBundle === b.id ? Colors.brand + "15" : colors.surface,
                borderColor: selectedBundle === b.id ? Colors.brand : colors.border,
              }]}
              onPress={() => { setSelectedBundle(b.id); Haptics.selectionAsync(); }}
            >
              <Text style={[styles.bundleData, { color: selectedBundle === b.id ? Colors.brand : colors.text }]}>{b.data}</Text>
              <Text style={[styles.bundleValidity, { color: colors.textMuted }]}>{b.validity}</Text>
              <Text style={[styles.bundlePrice, { color: selectedBundle === b.id ? Colors.brand : colors.text }]}>{b.price} 🪙</Text>
            </TouchableOpacity>
          ))}
        </View>

        {fee && (
          <View style={[styles.feeCard, { backgroundColor: colors.surface }]}>
            <View style={styles.feeRow}>
              <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>{bundle?.data} Data Bundle</Text>
              <Text style={[styles.feeValue, { color: colors.text }]}>{fee.subtotal} ACoins</Text>
            </View>
            <View style={styles.feeRow}>
              <TouchableOpacity
                style={styles.feeLink}
                onPress={() => router.push({
                  pathname: "/mini-programs/fee-details" as any,
                  params: { service: "data_bundle", amount: fee.subtotal.toString(), fee: fee.feeAmount.toString(), total: fee.total.toString() },
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
          style={[styles.buyBtn, { backgroundColor: Colors.brand, opacity: (!provider || !phone || !bundle || loading) ? 0.5 : 1 }]}
          onPress={handlePurchase}
          disabled={!provider || !phone || !bundle || loading}
        >
          <Text style={styles.buyBtnText}>{loading ? "Processing..." : "Buy Data Bundle"}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  providerCard: { flex: 1, alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1.5 },
  providerName: { fontSize: 12, fontFamily: "Inter_700Bold" },
  inputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, gap: 8, borderWidth: 1 },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium", paddingVertical: 14 },
  bundleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bundleCard: { width: "48%", borderRadius: 14, padding: 14, borderWidth: 1.5, alignItems: "center", gap: 4 },
  bundleData: { fontSize: 22, fontFamily: "Inter_700Bold" },
  bundleValidity: { fontSize: 11, fontFamily: "Inter_400Regular" },
  bundlePrice: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 4 },
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
