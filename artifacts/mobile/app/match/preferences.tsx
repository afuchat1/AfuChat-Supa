import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

type Prefs = {
  show_in_match: boolean;
  interested_in: "men" | "women" | "everyone";
  min_age: number;
  max_age: number;
};

const INTERESTED_OPTIONS: { v: Prefs["interested_in"]; l: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { v: "women", l: "Women", icon: "female" },
  { v: "men", l: "Men", icon: "male" },
  { v: "everyone", l: "Everyone", icon: "people" },
];

const AGE_OPTIONS = [18, 21, 25, 30, 35, 40, 50, 60, 70, 80];

export default function MatchPreferencesScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<Prefs>({ show_in_match: true, interested_in: "everyone", min_age: 18, max_age: 50 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("match_preferences").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) setPrefs({ show_in_match: data.show_in_match, interested_in: data.interested_in, min_age: data.min_age, max_age: data.max_age });
      setLoading(false);
    });
  }, [user]);

  async function save(update: Partial<Prefs>) {
    if (!user) return;
    setSaving(true);
    const newPrefs = { ...prefs, ...update };
    setPrefs(newPrefs);
    const { error } = await supabase.from("match_preferences").upsert(
      { user_id: user.id, ...newPrefs, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    if (error) showAlert("Error", "Failed to save preference.");
    setSaving(false);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Match Preferences</Text>
        {saving ? <ActivityIndicator size="small" color={colors.accent} /> : <View style={{ width: 24 }} />}
      </View>

      {loading ? <View style={{ padding: 16, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View> : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          {/* Discovery toggle */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DISCOVERY</Text>
          <View style={styles.group}>
            <View style={[styles.row, { backgroundColor: colors.surface }]}>
              <View style={[styles.rowIcon, { backgroundColor: "#FF2D55" }]}>
                <Ionicons name="heart" size={18} color="#fff" />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Show Me in AfuMatch</Text>
                <Text style={[styles.rowDesc, { color: colors.textMuted }]}>Allow others to see your profile while swiping</Text>
              </View>
              <Switch
                value={prefs.show_in_match}
                onValueChange={(v) => save({ show_in_match: v })}
                trackColor={{ true: "#FF2D55", false: colors.border }}
              />
            </View>
          </View>

          {/* Interested in */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>INTERESTED IN</Text>
          <View style={styles.group}>
            {INTERESTED_OPTIONS.map((opt, i) => (
              <View key={opt.v}>
                {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 62 }]} />}
                <TouchableOpacity
                  style={[styles.row, { backgroundColor: colors.surface }]}
                  onPress={() => save({ interested_in: opt.v })}
                  activeOpacity={0.7}
                >
                  <View style={[styles.rowIcon, { backgroundColor: prefs.interested_in === opt.v ? "#FF2D55" : colors.backgroundSecondary }]}>
                    <Ionicons name={opt.icon} size={18} color={prefs.interested_in === opt.v ? "#fff" : colors.textMuted} />
                  </View>
                  <Text style={[styles.rowLabel, { color: colors.text, flex: 1 }]}>{opt.l}</Text>
                  {prefs.interested_in === opt.v && <Ionicons name="checkmark-circle" size={22} color="#FF2D55" />}
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Age range */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>AGE RANGE</Text>
          <View style={[styles.ageCard, { backgroundColor: colors.surface }]}>
            <View style={styles.ageHeader}>
              <Text style={[styles.ageLabel, { color: colors.text }]}>Minimum Age</Text>
              <Text style={[styles.ageValue, { color: "#FF2D55" }]}>{prefs.min_age}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ageScroll}>
              {AGE_OPTIONS.filter((a) => a <= prefs.max_age).map((age) => (
                <TouchableOpacity
                  key={age}
                  style={[styles.ageChip, { backgroundColor: prefs.min_age === age ? "#FF2D55" : colors.backgroundSecondary }]}
                  onPress={() => save({ min_age: age })}
                >
                  <Text style={[styles.ageChipText, { color: prefs.min_age === age ? "#fff" : colors.textSecondary }]}>{age}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={[styles.ageDivider, { backgroundColor: colors.border }]} />
            <View style={styles.ageHeader}>
              <Text style={[styles.ageLabel, { color: colors.text }]}>Maximum Age</Text>
              <Text style={[styles.ageValue, { color: "#FF2D55" }]}>{prefs.max_age}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ageScroll}>
              {AGE_OPTIONS.filter((a) => a >= prefs.min_age).map((age) => (
                <TouchableOpacity
                  key={age}
                  style={[styles.ageChip, { backgroundColor: prefs.max_age === age ? "#FF2D55" : colors.backgroundSecondary }]}
                  onPress={() => save({ max_age: age })}
                >
                  <Text style={[styles.ageChipText, { color: prefs.max_age === age ? "#fff" : colors.textSecondary }]}>{age}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            These preferences only affect who appears in your AfuMatch discovery queue. You can always message anyone who matches with you.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  group: { marginHorizontal: 16, borderRadius: 14, overflow: "hidden" },
  sep: { height: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 14 },
  rowIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontFamily: "Inter_400Regular", marginBottom: 2 },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  ageCard: { marginHorizontal: 16, borderRadius: 14, padding: 16, gap: 10 },
  ageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ageLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  ageValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  ageScroll: { gap: 8, paddingVertical: 4 },
  ageChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  ageChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  ageDivider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingTop: 14, lineHeight: 18 },
});
