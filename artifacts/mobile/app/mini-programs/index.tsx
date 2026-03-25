import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

const CARD_W = (Dimensions.get("window").width - 48) / 2;

type AppInfo = {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  color: string;
  route: string;
  rating: number;
  featured?: boolean;
};

const APPS: AppInfo[] = [
  { id: "calculator", title: "Calculator", description: "Advanced calculator with history", icon: "🧮", category: "Utilities", color: "#FF6B6B", route: "/mini-programs/calculator", rating: 4.8, featured: true },
  { id: "stopwatch", title: "Stopwatch", description: "Precision timer & lap counter", icon: "⏱️", category: "Utilities", color: "#2196F3", route: "/mini-programs/stopwatch", rating: 4.7, featured: true },
  { id: "pomodoro", title: "Pomodoro", description: "Focus timer for productivity", icon: "🍅", category: "Productivity", color: "#F44336", route: "/mini-programs/pomodoro", rating: 4.9, featured: true },
  { id: "bmi", title: "BMI Calculator", description: "Body mass index tracker", icon: "💪", category: "Health", color: "#4CAF50", route: "/mini-programs/bmi", rating: 4.5 },
  { id: "notes", title: "Quick Notes", description: "Lightweight note-taking", icon: "📝", category: "Productivity", color: "#FF9800", route: "/mini-programs/notes", rating: 4.6 },
  { id: "tip-calculator", title: "Tip Calculator", description: "Split bills easily", icon: "💰", category: "Utilities", color: "#4ECDC4", route: "/mini-programs/tip-calculator", rating: 4.4 },
  { id: "unit-converter", title: "Unit Converter", description: "Convert measurements", icon: "📏", category: "Utilities", color: "#45B7D1", route: "/mini-programs/unit-converter", rating: 4.3 },
  { id: "habit-tracker", title: "Habit Tracker", description: "Build daily habits", icon: "✅", category: "Productivity", color: "#96CEB4", route: "/mini-programs/habit-tracker", rating: 4.7 },
  { id: "color-picker", title: "Color Picker", description: "Find perfect colors", icon: "🎨", category: "Design", color: "#DDA0DD", route: "/mini-programs/color-picker", rating: 4.2 },
];

const CATEGORIES = ["All", "Utilities", "Productivity", "Health", "Design"];

export default function MiniProgramsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const filtered = APPS.filter((app) => {
    if (search && !app.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (category !== "All" && app.category !== category) return false;
    return true;
  });

  const featured = APPS.filter((a) => a.featured);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>App Store</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.searchBar, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search apps..."
            placeholderTextColor={colors.textMuted}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.catPill, { backgroundColor: category === cat ? Colors.brand : colors.surface }]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.catText, { color: category === cat ? "#fff" : colors.textSecondary }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {category === "All" && !search && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Featured</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
              {featured.map((app) => (
                <TouchableOpacity
                  key={app.id}
                  style={[styles.featuredCard, { backgroundColor: app.color }]}
                  activeOpacity={0.8}
                  onPress={() => router.push(app.route as any)}
                >
                  <Text style={styles.featuredIcon}>{app.icon}</Text>
                  <View>
                    <Text style={styles.featuredTitle}>{app.title}</Text>
                    <Text style={styles.featuredDesc}>{app.description}</Text>
                  </View>
                  <View style={styles.featuredBtnRow}>
                    <View style={styles.ratingBadge}>
                      <Ionicons name="star" size={10} color="#FFD60A" />
                      <Text style={styles.ratingText}>{app.rating}</Text>
                    </View>
                    <View style={styles.getBtn}>
                      <Text style={styles.getBtnText}>Open</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {category === "All" ? "All Apps" : category}
        </Text>

        {filtered.map((app) => (
          <TouchableOpacity
            key={app.id}
            style={[styles.appRow, { backgroundColor: colors.surface }]}
            activeOpacity={0.7}
            onPress={() => router.push(app.route as any)}
          >
            <View style={[styles.appIcon, { backgroundColor: app.color + "20" }]}>
              <Text style={styles.appIconText}>{app.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.appTitle, { color: colors.text }]}>{app.title}</Text>
              <Text style={[styles.appDesc, { color: colors.textSecondary }]} numberOfLines={1}>{app.description}</Text>
              <View style={styles.appMeta}>
                <Ionicons name="star" size={10} color="#FFD60A" />
                <Text style={[styles.appRating, { color: colors.textMuted }]}>{app.rating}</Text>
                <Text style={[styles.appCat, { color: colors.textMuted }]}>• {app.category}</Text>
              </View>
            </View>
            <View style={[styles.openBtn, { backgroundColor: Colors.brand + "20" }]}>
              <Text style={[styles.openBtnText, { color: Colors.brand }]}>Open</Text>
            </View>
          </TouchableOpacity>
        ))}

        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No apps found</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  content: { paddingHorizontal: 16, gap: 12, paddingTop: 12 },
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 12 },
  catRow: { gap: 8 },
  catPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  catText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 8 },
  featuredRow: { gap: 12 },
  featuredCard: { width: 180, borderRadius: 18, padding: 16, gap: 10 },
  featuredIcon: { fontSize: 36 },
  featuredTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  featuredDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)", marginTop: 2 },
  featuredBtnRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  ratingBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.2)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  ratingText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },
  getBtn: { backgroundColor: "rgba(255,255,255,0.25)", paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12 },
  getBtnText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  appRow: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14, gap: 12 },
  appIcon: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  appIconText: { fontSize: 24 },
  appTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  appDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  appMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  appRating: { fontSize: 11, fontFamily: "Inter_500Medium" },
  appCat: { fontSize: 11, fontFamily: "Inter_400Regular" },
  openBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14 },
  openBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
