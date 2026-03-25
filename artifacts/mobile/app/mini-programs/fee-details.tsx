import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { SERVICE_FEES, SERVICE_LABELS, type ServiceType } from "@/lib/serviceTransactions";

const FEE_ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  airtime: "phone-portrait-outline",
  data_bundle: "cellular-outline",
  bill_payment: "flash-outline",
  hotel_booking: "bed-outline",
  event_ticket: "ticket-outline",
  money_transfer: "swap-horizontal",
};

const FEE_COLOR_MAP: Record<string, string> = {
  airtime: "#007AFF",
  data_bundle: "#5856D6",
  bill_payment: "#4CD964",
  hotel_booking: "#FF3B30",
  event_ticket: "#AF52DE",
  money_transfer: "#00C2CB",
};

export default function FeeDetailsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ service: string; amount: string; fee: string; total: string }>();

  const serviceType = (params.service || "") as ServiceType;
  const amount = parseInt(params.amount || "0");
  const fee = parseInt(params.fee || "0");
  const total = parseInt(params.total || "0");
  const feePercent = SERVICE_FEES[serviceType] || 0;
  const hasTransaction = amount > 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Fee Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        {hasTransaction && (
          <>
            <View style={[styles.serviceCard, { backgroundColor: colors.surface }]}>
              <View style={[styles.serviceIconWrap, { backgroundColor: (FEE_COLOR_MAP[serviceType] || Colors.brand) + "15" }]}>
                <Ionicons name={FEE_ICON_MAP[serviceType] || "receipt-outline"} size={32} color={FEE_COLOR_MAP[serviceType] || Colors.brand} />
              </View>
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
          </>
        )}

        {!hasTransaction && (
          <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.heroIcon, { backgroundColor: Colors.brand + "15" }]}>
              <Ionicons name="receipt-outline" size={36} color={Colors.brand} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.text }]}>Service Fee Schedule</Text>
            <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
              Transparent fees on every transaction. No hidden charges.
            </Text>
          </View>
        )}

        <View style={[styles.allFeesCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.allFeesTitle, { color: colors.text }]}>All Service Fees</Text>
          {(Object.keys(SERVICE_FEES) as ServiceType[]).map((key, i, arr) => (
            <View key={key}>
              <View style={styles.feeRow}>
                <View style={[styles.feeIconWrap, { backgroundColor: (FEE_COLOR_MAP[key] || "#999") + "15" }]}>
                  <Ionicons name={FEE_ICON_MAP[key] || "receipt-outline"} size={20} color={FEE_COLOR_MAP[key] || "#999"} />
                </View>
                <Text style={[styles.feeName, { color: colors.text }]}>{SERVICE_LABELS[key]}</Text>
                <View style={[styles.feeBadge, { backgroundColor: (FEE_COLOR_MAP[key] || "#999") + "15" }]}>
                  <Text style={[styles.feePercentText, { color: FEE_COLOR_MAP[key] || "#999" }]}>{SERVICE_FEES[key]}%</Text>
                </View>
              </View>
              {i < arr.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border, marginLeft: 52 }]} />}
            </View>
          ))}
        </View>

        <View style={[styles.infoCard, { backgroundColor: Colors.brand + "08", borderColor: Colors.brand + "20" }]}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: Colors.brand }]}>Secure & Transparent</Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              All transactions are securely processed and recorded. Fees cover payment processing and service delivery costs.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  content: { padding: 16, gap: 14 },
  serviceCard: { borderRadius: 16, padding: 24, alignItems: "center", gap: 10 },
  serviceIconWrap: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  serviceName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  heroCard: { borderRadius: 16, padding: 28, alignItems: "center", gap: 10 },
  heroIcon: { width: 68, height: 68, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
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
  allFeesCard: { borderRadius: 16, padding: 16, gap: 0 },
  allFeesTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 12 },
  feeRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  feeIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  feeName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  feeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  feePercentText: { fontSize: 13, fontFamily: "Inter_700Bold" },
});
