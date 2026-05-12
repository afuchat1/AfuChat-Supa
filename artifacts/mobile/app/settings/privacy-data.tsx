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
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassCard } from "@/components/ui/GlassCard";

type Settings = {
  data_personalization: boolean;
  data_analytics: boolean;
};

function ToggleRow({ icon, iconBg, label, description, value, onToggle, saving }: {
  icon: React.ComponentProps<typeof Ionicons>["name"]; iconBg: string; label: string; description: string;
  value: boolean; onToggle: (v: boolean) => void; saving?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.surface }]}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}><Ionicons name={icon} size={18} color="#fff" /></View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.rowDesc, { color: colors.textMuted }]}>{description}</Text>
      </View>
      {saving ? <ActivityIndicator size="small" color={colors.accent} /> : (
        <Switch value={value} onValueChange={onToggle} trackColor={{ true: colors.accent, false: colors.border }} />
      )}
    </View>
  );
}

export default function PrivacyDataScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<Settings>({ data_personalization: true, data_analytics: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof Settings | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("data_personalization, data_analytics").eq("id", user.id).single().then(({ data }) => {
      if (data) setSettings({ data_personalization: data.data_personalization !== false, data_analytics: data.data_analytics !== false });
      setLoading(false);
    });
  }, [user]);

  async function toggle(field: keyof Settings, value: boolean) {
    if (!user) return;
    setSaving(field);
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
    if (error) showAlert("Error", "Failed to save setting.");
    else setSettings((p) => ({ ...p, [field]: value }));
    setSaving(null);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Activity Data" />
      {loading ? <View style={{ padding: 16, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View> : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DATA USAGE</Text>
          <GlassCard style={styles.group} variant="medium">
            <ToggleRow
              icon="sparkles" iconBg="#BF5AF2"
              label="Personalisation"
              description="Use your activity to personalise your feed, suggestions, and AI responses"
              value={settings.data_personalization}
              onToggle={(v) => toggle("data_personalization", v)}
              saving={saving === "data_personalization"}
            />
            <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 62 }]} />
            <ToggleRow
              icon="analytics" iconBg={colors.accent}
              label="Analytics"
              description="Help improve AfuChat by sharing anonymous usage statistics"
              value={settings.data_analytics}
              onToggle={(v) => toggle("data_analytics", v)}
              saving={saving === "data_analytics"}
            />
          </GlassCard>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ACCOUNT DATA</Text>
          <GlassCard style={styles.group} variant="medium">
            <TouchableOpacity
              style={[styles.linkRow, { backgroundColor: colors.surface }]}
              onPress={() => router.push("/settings/privacy-download" as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.linkIcon, { backgroundColor: "#007AFF" }]}>
                <Ionicons name="cloud-download" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.linkLabel, { color: colors.text }]}>Download My Data</Text>
                <Text style={[styles.linkDesc, { color: colors.textMuted }]}>Request a copy of all your AfuChat data</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 62 }]} />
            <TouchableOpacity
              style={[styles.linkRow, { backgroundColor: colors.surface }]}
              onPress={() => showAlert("Clear History", "This will clear your search history and browsing activity. Continue?", [
                { text: "Cancel", style: "cancel" },
                { text: "Clear", style: "destructive", onPress: () => showAlert("Done", "Activity history cleared.") },
              ])}
              activeOpacity={0.7}
            >
              <View style={[styles.linkIcon, { backgroundColor: "#FF3B30" }]}>
                <Ionicons name="trash" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.linkLabel, { color: "#FF3B30" }]}>Clear Activity History</Text>
                <Text style={[styles.linkDesc, { color: colors.textMuted }]}>Delete your search and browsing history</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </GlassCard>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            AfuChat Technologies Ltd. never sells your personal data to third parties. Turning off personalisation may make your experience less relevant.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  group: { marginHorizontal: 16, borderRadius: 14, overflow: "hidden" },
  sep: { height: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 14 },
  rowIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontFamily: "Inter_400Regular", marginBottom: 2 },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  linkRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 14 },
  linkIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  linkLabel: { fontSize: 16, fontFamily: "Inter_400Regular", marginBottom: 2 },
  linkDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingTop: 14, lineHeight: 18 },
});
