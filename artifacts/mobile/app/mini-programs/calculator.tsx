import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";

const BUTTONS = [
  ["C", "±", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["0", ".", "⌫", "="],
];

export default function CalculatorScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);

  const handlePress = (btn: string) => {
    Haptics.selectionAsync();
    if (btn >= "0" && btn <= "9") {
      if (fresh) { setDisplay(btn); setFresh(false); }
      else setDisplay((d) => d === "0" ? btn : d + btn);
    } else if (btn === ".") {
      if (!display.includes(".")) setDisplay((d) => d + ".");
      setFresh(false);
    } else if (btn === "C") {
      setDisplay("0"); setPrev(null); setOp(null); setFresh(true);
    } else if (btn === "⌫") {
      setDisplay((d) => d.length > 1 ? d.slice(0, -1) : "0");
    } else if (btn === "±") {
      setDisplay((d) => d.startsWith("-") ? d.slice(1) : "-" + d);
    } else if (btn === "%") {
      setDisplay((d) => String(parseFloat(d) / 100));
    } else if (["+", "−", "×", "÷"].includes(btn)) {
      if (prev !== null && op && !fresh) {
        const result = calc(prev, parseFloat(display), op);
        setDisplay(formatNum(result));
        setPrev(result);
      } else {
        setPrev(parseFloat(display));
      }
      setOp(btn);
      setFresh(true);
    } else if (btn === "=") {
      if (prev !== null && op) {
        const result = calc(prev, parseFloat(display), op);
        setDisplay(formatNum(result));
        setPrev(null);
        setOp(null);
        setFresh(true);
      }
    }
  };

  function calc(a: number, b: number, operator: string): number {
    switch (operator) {
      case "+": return a + b;
      case "−": return a - b;
      case "×": return a * b;
      case "÷": return b !== 0 ? a / b : 0;
      default: return b;
    }
  }

  function formatNum(n: number): string {
    if (!isFinite(n)) return "Error";
    const s = String(n);
    if (s.length > 12) return n.toPrecision(8);
    return s;
  }

  const isOp = (btn: string) => ["+", "−", "×", "÷"].includes(btn);
  const isActiveOp = (btn: string) => op === btn && fresh;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Calculator</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.displayArea}>
        {op && prev !== null && (
          <Text style={[styles.subDisplay, { color: colors.textMuted }]}>{formatNum(prev)} {op}</Text>
        )}
        <Text style={[styles.displayText, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {display}
        </Text>
      </View>

      <View style={[styles.keypad, { paddingBottom: insets.bottom + 12 }]}>
        {BUTTONS.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((btn) => (
              <TouchableOpacity
                key={btn}
                style={[
                  styles.key,
                  isOp(btn) || btn === "=" ? { backgroundColor: isActiveOp(btn) ? "#fff" : Colors.brand } : { backgroundColor: colors.surface },
                  btn === "0" && { flex: 1 },
                ]}
                onPress={() => handlePress(btn)}
                activeOpacity={0.6}
              >
                <Text style={[
                  styles.keyText,
                  isOp(btn) || btn === "=" ? { color: isActiveOp(btn) ? Colors.brand : "#fff" } : { color: colors.text },
                  ["C", "±", "%"].includes(btn) && { color: Colors.brand },
                ]}>
                  {btn}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  displayArea: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 24, paddingBottom: 16 },
  subDisplay: { fontSize: 20, fontFamily: "Inter_400Regular", textAlign: "right" },
  displayText: { fontSize: 56, fontFamily: "Inter_400Regular", textAlign: "right" },
  keypad: { paddingHorizontal: 12, gap: 10 },
  row: { flexDirection: "row", gap: 10 },
  key: { flex: 1, aspectRatio: 1, borderRadius: 99, alignItems: "center", justifyContent: "center", maxHeight: 72 },
  keyText: { fontSize: 26, fontFamily: "Inter_500Medium" },
});
