import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

type ProgramInfo = {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  route: string;
};

const PROGRAMS: ProgramInfo[] = [
  { id: "calculator", title: "Calculator", description: "Quick calculations", icon: "🧮", color: "#FF6B6B", route: "/mini-programs/calculator" },
  { id: "tip-calculator", title: "Tip Calculator", description: "Split bills easily", icon: "💰", color: "#4ECDC4", route: "/mini-programs/tip-calculator" },
  { id: "unit-converter", title: "Unit Converter", description: "Convert measurements", icon: "📏", color: "#45B7D1", route: "/mini-programs/unit-converter" },
  { id: "habit-tracker", title: "Habit Tracker", description: "Build daily habits", icon: "✅", color: "#96CEB4", route: "/mini-programs/habit-tracker" },
  { id: "color-picker", title: "Color Picker", description: "Find perfect colors", icon: "🎨", color: "#DDA0DD", route: "/mini-programs/color-picker" },
];

export default function MiniProgramsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Mini Programs</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.banner, { backgroundColor: "#6C5CE7" }]}>
          <Text style={styles.bannerIcon}>⚡</Text>
          <Text style={styles.bannerTitle}>Quick Tools</Text>
          <Text style={styles.bannerSub}>Handy utilities right in your chat app</Text>
        </View>

        <View style={styles.list}>
          {PROGRAMS.map((prog) => (
            <TouchableOpacity
              key={prog.id}
              style={[styles.programRow, { backgroundColor: colors.surface }]}
              activeOpacity={0.7}
              onPress={() => router.push(prog.route as any)}
            >
              <View style={[styles.iconCircle, { backgroundColor: prog.color + "20" }]}>
                <Text style={styles.iconEmoji}>{prog.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.progTitle, { color: colors.text }]}>{prog.title}</Text>
                <Text style={[styles.progDesc, { color: colors.textSecondary }]}>{prog.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
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
  content: { padding: 16, gap: 16 },
  banner: { borderRadius: 20, padding: 24, alignItems: "center", gap: 8 },
  bannerIcon: { fontSize: 40 },
  bannerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
  bannerSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", textAlign: "center" },
  list: { gap: 8 },
  programRow: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 14, gap: 14 },
  iconCircle: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  iconEmoji: { fontSize: 24 },
  progTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  progDesc: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
});
