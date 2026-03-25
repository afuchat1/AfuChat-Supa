import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";

const BMI_CATEGORIES = [
  { label: "Underweight", range: "< 18.5", color: "#2196F3", min: 0, max: 18.5 },
  { label: "Normal", range: "18.5 - 24.9", color: "#4CAF50", min: 18.5, max: 25 },
  { label: "Overweight", range: "25 - 29.9", color: "#FF9800", min: 25, max: 30 },
  { label: "Obese", range: "> 30", color: "#F44336", min: 30, max: 100 },
];

export default function BMIScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");

  const bmi = useMemo(() => {
    const w = parseFloat(weight);
    if (!w || w <= 0) return null;
    if (unit === "metric") {
      const h = parseFloat(height) / 100;
      if (!h || h <= 0) return null;
      return w / (h * h);
    } else {
      const f = parseFloat(feet) || 0;
      const i = parseFloat(inches) || 0;
      const totalInches = f * 12 + i;
      if (totalInches <= 0) return null;
      return (w / (totalInches * totalInches)) * 703;
    }
  }, [weight, height, feet, inches, unit]);

  const category = bmi ? BMI_CATEGORIES.find((c) => bmi >= c.min && bmi < c.max) || BMI_CATEGORIES[3] : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>BMI Calculator</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.unitToggle, { backgroundColor: colors.surface }]}>
          <TouchableOpacity
            style={[styles.unitBtn, { backgroundColor: unit === "metric" ? Colors.brand : "transparent" }]}
            onPress={() => { setUnit("metric"); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.unitText, { color: unit === "metric" ? "#fff" : colors.textSecondary }]}>Metric</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.unitBtn, { backgroundColor: unit === "imperial" ? Colors.brand : "transparent" }]}
            onPress={() => { setUnit("imperial"); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.unitText, { color: unit === "imperial" ? "#fff" : colors.textSecondary }]}>Imperial</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.inputCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Weight ({unit === "metric" ? "kg" : "lbs"})</Text>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg }]}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            placeholder={unit === "metric" ? "70" : "154"}
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={[styles.inputCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Height</Text>
          {unit === "metric" ? (
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg }]}
              value={height}
              onChangeText={setHeight}
              keyboardType="decimal-pad"
              placeholder="170 cm"
              placeholderTextColor={colors.textMuted}
            />
          ) : (
            <View style={styles.imperialRow}>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg }]}
                  value={feet}
                  onChangeText={setFeet}
                  keyboardType="number-pad"
                  placeholder="5 ft"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg }]}
                  value={inches}
                  onChangeText={setInches}
                  keyboardType="number-pad"
                  placeholder="7 in"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>
          )}
        </View>

        {bmi !== null && category && (
          <View style={[styles.resultCard, { backgroundColor: category.color }]}>
            <Text style={styles.resultBmi}>{bmi.toFixed(1)}</Text>
            <Text style={styles.resultLabel}>{category.label}</Text>
            <Text style={styles.resultRange}>BMI Range: {category.range}</Text>
          </View>
        )}

        <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.chartTitle, { color: colors.text }]}>BMI Categories</Text>
          {BMI_CATEGORIES.map((cat) => (
            <View key={cat.label} style={styles.chartRow}>
              <View style={[styles.chartDot, { backgroundColor: cat.color }]} />
              <Text style={[styles.chartLabel, { color: colors.text }]}>{cat.label}</Text>
              <Text style={[styles.chartRange, { color: colors.textMuted }]}>{cat.range}</Text>
            </View>
          ))}
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
  unitToggle: { flexDirection: "row", borderRadius: 12, padding: 4 },
  unitBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  unitText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  inputCard: { borderRadius: 14, padding: 16, gap: 8 },
  inputLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" },
  input: { fontSize: 20, fontFamily: "Inter_600SemiBold", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, textAlign: "center" },
  imperialRow: { flexDirection: "row", gap: 12 },
  resultCard: { borderRadius: 20, padding: 28, alignItems: "center", gap: 6 },
  resultBmi: { fontSize: 56, fontFamily: "Inter_700Bold", color: "#fff" },
  resultLabel: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#fff" },
  resultRange: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)" },
  chartCard: { borderRadius: 14, padding: 16, gap: 10 },
  chartTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  chartRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  chartDot: { width: 12, height: 12, borderRadius: 6 },
  chartLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  chartRange: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
