import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";

type MiniProgram = {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  category: string;
  rating: number;
  install_count: number;
};

export default function MiniProgramsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [programs, setPrograms] = useState<MiniProgram[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("mini_programs")
      .select("id, name, description, icon_url, category, rating, install_count")
      .eq("is_published", true)
      .eq("status", "approved")
      .order("install_count", { ascending: false })
      .limit(30);
    if (data) setPrograms(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Mini Programs</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={programs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.row, { backgroundColor: colors.surface }]} activeOpacity={0.7}>
              <View style={[styles.iconWrap, { backgroundColor: colors.inputBg }]}>
                <Text style={styles.iconText}>{item.icon_url ? "🔧" : "📱"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.desc, { color: colors.textSecondary }]} numberOfLines={1}>{item.description || item.category}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="star" size={12} color="#FFD60A" />
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>{item.rating.toFixed(1)}</Text>
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>{item.install_count} installs</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.openBtn}>
                <Text style={styles.openBtnText}>Open</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 90 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="apps-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No mini programs available</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  iconWrap: { width: 52, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 24 },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  desc: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  openBtn: { backgroundColor: Colors.brand, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  openBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
