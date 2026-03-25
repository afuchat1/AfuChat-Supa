import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import * as Haptics from "@/lib/haptics";
import * as Clipboard from "expo-clipboard";
import { showAlert } from "@/lib/alert";

const PALETTES = [
  { name: "Warm Sunset", colors: ["#FF6B6B", "#FFA07A", "#FFD700", "#FF8C42", "#FF4500"] },
  { name: "Ocean Breeze", colors: ["#00CED1", "#20B2AA", "#48D1CC", "#40E0D0", "#7FFFD4"] },
  { name: "Forest", colors: ["#228B22", "#2E8B57", "#3CB371", "#66CDAA", "#8FBC8F"] },
  { name: "Berry", colors: ["#8B008B", "#9932CC", "#BA55D3", "#DA70D6", "#EE82EE"] },
  { name: "Pastel", colors: ["#FFB3BA", "#BAFFC9", "#BAE1FF", "#FFFFBA", "#E8BAFF"] },
  { name: "Neon", colors: ["#FF00FF", "#00FF00", "#00FFFF", "#FF0000", "#FFFF00"] },
  { name: "Earth", colors: ["#8B4513", "#A0522D", "#CD853F", "#DEB887", "#F5DEB3"] },
  { name: "Monochrome", colors: ["#000000", "#333333", "#666666", "#999999", "#CCCCCC"] },
];

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function hexToHsl(hex: string): string {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function randomColor(): string {
  return "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
}

export default function ColorPickerScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState("#00897B");
  const [savedColors, setSavedColors] = useState<string[]>([]);

  const copyColor = useCallback(async (color: string, format: string) => {
    Haptics.selectionAsync();
    await Clipboard.setStringAsync(color);
    showAlert("Copied!", `${format} copied to clipboard`);
  }, []);

  const selectColor = (color: string) => {
    Haptics.selectionAsync();
    setSelected(color);
  };

  const saveColor = () => {
    if (!savedColors.includes(selected)) {
      Haptics.notificationAsync("success");
      setSavedColors([...savedColors, selected]);
    }
  };

  const generateRandom = () => {
    Haptics.selectionAsync();
    setSelected(randomColor());
  };

  const textColor = parseInt(selected.slice(1), 16) > 0xffffff / 2 ? "#000" : "#fff";

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Color Picker</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.previewCard, { backgroundColor: selected }]}>
          <Text style={[styles.previewHex, { color: textColor }]}>{selected.toUpperCase()}</Text>
          <View style={styles.previewActions}>
            <TouchableOpacity style={[styles.previewBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]} onPress={saveColor}>
              <Ionicons name="heart-outline" size={18} color={textColor} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.previewBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]} onPress={generateRandom}>
              <Ionicons name="shuffle" size={18} color={textColor} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.infoRow} onPress={() => copyColor(selected.toUpperCase(), "HEX")}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>HEX</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{selected.toUpperCase()}</Text>
            <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.infoRow} onPress={() => copyColor(hexToRgb(selected), "RGB")}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>RGB</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{hexToRgb(selected)}</Text>
            <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.infoRow} onPress={() => copyColor(hexToHsl(selected), "HSL")}>
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>HSL</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{hexToHsl(selected)}</Text>
            <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {savedColors.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Saved Colors</Text>
            <View style={styles.savedGrid}>
              {savedColors.map((c) => (
                <TouchableOpacity key={c} style={[styles.savedSwatch, { backgroundColor: c }]} onPress={() => selectColor(c)} />
              ))}
            </View>
          </View>
        )}

        {PALETTES.map((palette) => (
          <View key={palette.name} style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{palette.name}</Text>
            <View style={styles.paletteRow}>
              {palette.colors.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.paletteSwatch, { backgroundColor: c, borderWidth: c === selected ? 3 : 0, borderColor: "#fff" }]}
                  onPress={() => selectColor(c)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { padding: 16, gap: 12 },
  previewCard: { height: 140, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 12 },
  previewHex: { fontSize: 28, fontFamily: "Inter_700Bold" },
  previewActions: { flexDirection: "row", gap: 12 },
  previewBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  infoCard: { borderRadius: 14, padding: 14, gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  infoLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", width: 36 },
  infoValue: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  section: { borderRadius: 14, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  paletteRow: { flexDirection: "row", gap: 8 },
  paletteSwatch: { flex: 1, height: 44, borderRadius: 10 },
  savedGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  savedSwatch: { width: 40, height: 40, borderRadius: 10 },
});
