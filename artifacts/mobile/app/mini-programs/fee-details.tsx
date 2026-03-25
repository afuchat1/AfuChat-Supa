import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { SERVICE_FEES, SERVICE_LABELS, SERVICE_ICONS, type ServiceType } from "@/lib/serviceTransactions";

export default function FeeDetailsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ service: string; amount: string; fee: string; total: string }>();

  const serviceType = (params.service || "airtime") as ServiceType;
  const amount = parseInt(params.amount || "0");
  const fee = parseInt(params.fee || "0");
  const total = parseInt(params.total || "0");
  const feePercent = SERVICE_FEES[serviceType] || 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Fee Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.serviceCard, { backgroundColor: colors.surface }]}>
          <Text style={styles.serviceIcon}>{SERVICE_ICONS[serviceType]}</Text>
          <Text style={[styles.serviceName, { color: colors.text }]}>{SERVICE_LABELS[serviceType]}</Text>
        </View>

        <View style={[styles.breakdownCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.breakdownTitle, { color: colors.text }]}>Fee Breakdown</Text>

          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Service Amount</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{amount} ACoins</Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Service Fee ({feePercent}%)</Text>
            <Text style={[styles.rowValue, { color: "#FF9800" }]}>+{fee} ACoins</Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.row}>
            <Text style={[styles.totalLabel, { color: colors.text }]}>Total Charged</Text>
            <Text style={[styles.totalValue, { color: Colors.brand }]}>{total} ACoins</Text>
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "30" }]}>
          <Ionicons name="information-circle" size={20} color={Colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: Colors.brand }]}>About Service Fees</Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              A {feePercent}% fee is applied to all {SERVICE_LABELS[serviceType].toLowerCase()} transactions. 
              Fees cover payment processing and service delivery. All transactions are securely recorded.
            </Text>
          </View>
        </View>

        <View style={[styles.allFeesCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.allFeesTitle, { color: colors.text }]}>All Service Fees</Text>
          {(Object.keys(SERVICE_FEES) as ServiceType[]).map((key) => (
            <View key={key} style={styles.feeRow}>
              <Text style={{ fontSize: 18 }}>{SERVICE_ICONS[key]}</Text>
              <Text style={[styles.feeName, { color: colors.text }]}>{SERVICE_LABELS[key]}</Text>
              <Text style={[styles.feePercent, { color: colors.textMuted }]}>{SERVICE_FEES[key]}%</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { padding: 16, gap: 16 },
  serviceCard: { borderRadius: 16, padding: 20, alignItems: "center", gap: 8 },
  serviceIcon: { fontSize: 48 },
  serviceName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  breakdownCard: { borderRadius: 16, padding: 20, gap: 14 },
  breakdownTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  rowValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  divider: { height: StyleSheet.hairlineWidth },
  totalLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  totalValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  infoCard: { flexDirection: "row", gap: 10, borderRadius: 14, padding: 14, borderWidth: 1 },
  infoTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  infoText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 2 },
  allFeesCard: { borderRadius: 16, padding: 16, gap: 12 },
  allFeesTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  feeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  feeName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  feePercent: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
