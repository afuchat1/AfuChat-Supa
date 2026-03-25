import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";

const TIP_PRESETS = [10, 15, 18, 20, 25];

export default function TipCalculatorScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [billAmount, setBillAmount] = useState("");
  const [tipPercent, setTipPercent] = useState(15);
  const [splitCount, setSplitCount] = useState(1);

  const bill = parseFloat(billAmount) || 0;
  const tipAmount = useMemo(() => bill * (tipPercent / 100), [bill, tipPercent]);
  const total = bill + tipAmount;
  const perPerson = splitCount > 0 ? total / splitCount : total;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Tip Calculator</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Bill Amount</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[styles.currency, { color: Colors.brand }]}>$</Text>
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={billAmount}
              onChangeText={setBillAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Tip Percentage</Text>
          <View style={styles.presetRow}>
            {TIP_PRESETS.map((pct) => (
              <TouchableOpacity
                key={pct}
                style={[styles.presetBtn, { backgroundColor: tipPercent === pct ? Colors.brand : colors.inputBg }]}
                onPress={() => { setTipPercent(pct); Haptics.selectionAsync(); }}
              >
                <Text style={[styles.presetText, { color: tipPercent === pct ? "#fff" : colors.text }]}>{pct}%</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Split Between</Text>
          <View style={styles.splitRow}>
            <TouchableOpacity
              style={[styles.splitBtn, { backgroundColor: colors.inputBg }]}
              onPress={() => { if (splitCount > 1) { setSplitCount((s) => s - 1); Haptics.selectionAsync(); } }}
            >
              <Ionicons name="remove" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.splitCount, { color: colors.text }]}>{splitCount}</Text>
            <TouchableOpacity
              style={[styles.splitBtn, { backgroundColor: colors.inputBg }]}
              onPress={() => { setSplitCount((s) => s + 1); Haptics.selectionAsync(); }}
            >
              <Ionicons name="add" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.resultCard, { backgroundColor: Colors.brand }]}>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Tip</Text>
            <Text style={styles.resultValue}>${tipAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Total</Text>
            <Text style={styles.resultValue}>${total.toFixed(2)}</Text>
          </View>
          {splitCount > 1 && (
            <View style={[styles.resultRow, styles.perPersonRow]}>
              <Text style={styles.perPersonLabel}>Per Person</Text>
              <Text style={styles.perPersonValue}>${perPerson.toFixed(2)}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { padding: 16, gap: 16 },
  card: { borderRadius: 14, padding: 16, gap: 12 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, borderWidth: 1 },
  currency: { fontSize: 24, fontFamily: "Inter_700Bold", marginRight: 8 },
  input: { flex: 1, fontSize: 28, fontFamily: "Inter_600SemiBold", paddingVertical: 12 },
  presetRow: { flexDirection: "row", gap: 8 },
  presetBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  presetText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  splitRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 },
  splitBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  splitCount: { fontSize: 32, fontFamily: "Inter_700Bold", minWidth: 40, textAlign: "center" },
  resultCard: { borderRadius: 20, padding: 20, gap: 12 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  resultLabel: { fontSize: 16, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.7)" },
  resultValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  perPersonRow: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)", paddingTop: 12 },
  perPersonLabel: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#fff" },
  perPersonValue: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#fff" },
});
