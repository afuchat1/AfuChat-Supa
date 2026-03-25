import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";

type Category = { name: string; icon: string; units: { label: string; toBase: number }[] };

const CATEGORIES: Category[] = [
  {
    name: "Length", icon: "📏",
    units: [
      { label: "Meters", toBase: 1 },
      { label: "Kilometers", toBase: 1000 },
      { label: "Miles", toBase: 1609.344 },
      { label: "Feet", toBase: 0.3048 },
      { label: "Inches", toBase: 0.0254 },
      { label: "Centimeters", toBase: 0.01 },
    ],
  },
  {
    name: "Weight", icon: "⚖️",
    units: [
      { label: "Kilograms", toBase: 1 },
      { label: "Grams", toBase: 0.001 },
      { label: "Pounds", toBase: 0.453592 },
      { label: "Ounces", toBase: 0.0283495 },
      { label: "Tons", toBase: 1000 },
    ],
  },
  {
    name: "Temperature", icon: "🌡️",
    units: [
      { label: "Celsius", toBase: 1 },
      { label: "Fahrenheit", toBase: 1 },
      { label: "Kelvin", toBase: 1 },
    ],
  },
  {
    name: "Volume", icon: "🧪",
    units: [
      { label: "Liters", toBase: 1 },
      { label: "Milliliters", toBase: 0.001 },
      { label: "Gallons", toBase: 3.78541 },
      { label: "Cups", toBase: 0.236588 },
      { label: "Fluid Oz", toBase: 0.0295735 },
    ],
  },
];

function convertTemp(value: number, from: string, to: string): number {
  let celsius: number;
  if (from === "Celsius") celsius = value;
  else if (from === "Fahrenheit") celsius = (value - 32) * 5 / 9;
  else celsius = value - 273.15;

  if (to === "Celsius") return celsius;
  if (to === "Fahrenheit") return celsius * 9 / 5 + 32;
  return celsius + 273.15;
}

export default function UnitConverterScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [catIdx, setCatIdx] = useState(0);
  const [fromIdx, setFromIdx] = useState(0);
  const [toIdx, setToIdx] = useState(1);
  const [value, setValue] = useState("1");

  const cat = CATEGORIES[catIdx];
  const inputVal = parseFloat(value) || 0;

  const result = useMemo(() => {
    if (cat.name === "Temperature") {
      return convertTemp(inputVal, cat.units[fromIdx].label, cat.units[toIdx].label);
    }
    const base = inputVal * cat.units[fromIdx].toBase;
    return base / cat.units[toIdx].toBase;
  }, [inputVal, catIdx, fromIdx, toIdx]);

  const swap = () => {
    Haptics.selectionAsync();
    const temp = fromIdx;
    setFromIdx(toIdx);
    setToIdx(temp);
  };

  const selectCategory = (idx: number) => {
    setCatIdx(idx);
    setFromIdx(0);
    setToIdx(1);
    Haptics.selectionAsync();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Unit Converter</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {CATEGORIES.map((c, i) => (
            <TouchableOpacity
              key={c.name}
              style={[styles.catChip, { backgroundColor: i === catIdx ? Colors.brand : colors.surface }]}
              onPress={() => selectCategory(i)}
            >
              <Text style={styles.catIcon}>{c.icon}</Text>
              <Text style={[styles.catLabel, { color: i === catIdx ? "#fff" : colors.text }]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={[styles.converterCard, { backgroundColor: colors.surface }]}>
          <View style={styles.unitSection}>
            <Text style={[styles.unitLabel, { color: colors.textMuted }]}>From</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitPills}>
              {cat.units.map((u, i) => (
                <TouchableOpacity
                  key={u.label}
                  style={[styles.unitPill, { backgroundColor: i === fromIdx ? Colors.brand + "20" : colors.inputBg }]}
                  onPress={() => { setFromIdx(i); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.unitPillText, { color: i === fromIdx ? Colors.brand : colors.textSecondary }]}>{u.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={[styles.valueInput, { color: colors.text, backgroundColor: colors.inputBg }]}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <TouchableOpacity style={[styles.swapBtn, { backgroundColor: Colors.brand }]} onPress={swap}>
            <Ionicons name="swap-vertical" size={20} color="#fff" />
          </TouchableOpacity>

          <View style={styles.unitSection}>
            <Text style={[styles.unitLabel, { color: colors.textMuted }]}>To</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitPills}>
              {cat.units.map((u, i) => (
                <TouchableOpacity
                  key={u.label}
                  style={[styles.unitPill, { backgroundColor: i === toIdx ? Colors.brand + "20" : colors.inputBg }]}
                  onPress={() => { setToIdx(i); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.unitPillText, { color: i === toIdx ? Colors.brand : colors.textSecondary }]}>{u.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={[styles.resultBox, { backgroundColor: Colors.brand + "10" }]}>
              <Text style={[styles.resultText, { color: Colors.brand }]}>
                {result % 1 === 0 ? result.toString() : result.toFixed(4)}
              </Text>
            </View>
          </View>
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
  catRow: { gap: 8 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  catIcon: { fontSize: 16 },
  catLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  converterCard: { borderRadius: 16, padding: 16, gap: 12 },
  unitSection: { gap: 8 },
  unitLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" },
  unitPills: { gap: 6 },
  unitPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  unitPillText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  valueInput: { fontSize: 28, fontFamily: "Inter_600SemiBold", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, textAlign: "center" },
  swapBtn: { alignSelf: "center", width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  resultBox: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, alignItems: "center" },
  resultText: { fontSize: 28, fontFamily: "Inter_700Bold" },
});
