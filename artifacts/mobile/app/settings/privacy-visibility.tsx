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
  hide_followers_list: boolean;
  hide_following_list: boolean;
  hide_posts_non_followers: boolean;
  hide_from_search: boolean;
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

export default function PrivacyVisibilityScreen() {
  const { colors } = useTheme();
  const { user, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<Settings>({ hide_followers_list: false, hide_following_list: false, hide_posts_non_followers: false, hide_from_search: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof Settings | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("hide_followers_list, hide_following_list, hide_posts_non_followers, hide_from_search").eq("id", user.id).single()
      .then(({ data }) => {
        if (data) setSettings({ hide_followers_list: data.hide_followers_list ?? false, hide_following_list: data.hide_following_list ?? false, hide_posts_non_followers: data.hide_posts_non_followers ?? false, hide_from_search: data.hide_from_search ?? false });
        setLoading(false);
      });
  }, [user]);

  async function toggle(field: keyof Settings, value: boolean) {
    if (!user) return;
    setSaving(field);
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
    if (error) showAlert("Error", "Failed to save setting.");
    else { setSettings((prev) => ({ ...prev, [field]: value })); await refreshProfile(); }
    setSaving(null);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Visibility" />
      {loading ? <View style={{ padding: 16, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View> : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CONNECTIONS</Text>
          <GlassCard style={styles.group} variant="medium">
            <ToggleRow icon="people" iconBg="#007AFF" label="Hide Followers List" description="Others cannot see who follows you" value={settings.hide_followers_list} onToggle={(v) => toggle("hide_followers_list", v)} saving={saving === "hide_followers_list"} />
            <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 62 }]} />
            <ToggleRow icon="person-add" iconBg="#5856D6" label="Hide Following List" description="Others cannot see who you follow" value={settings.hide_following_list} onToggle={(v) => toggle("hide_following_list", v)} saving={saving === "hide_following_list"} />
          </GlassCard>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DISCOVERABILITY</Text>
          <GlassCard style={styles.group} variant="medium">
            <ToggleRow icon="document-text" iconBg="#FF9500" label="Limit Post Visibility" description="Only followers can see your posts in Discover" value={settings.hide_posts_non_followers} onToggle={(v) => toggle("hide_posts_non_followers", v)} saving={saving === "hide_posts_non_followers"} />
            <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 62 }]} />
            <ToggleRow icon="search" iconBg="#FF3B30" label="Hide From Search" description="Your profile won't appear in search results" value={settings.hide_from_search} onToggle={(v) => toggle("hide_from_search", v)} saving={saving === "hide_from_search"} />
          </GlassCard>
          <Text style={[styles.hint, { color: colors.textMuted }]}>Hiding your lists does not affect who can follow or message you. All changes are applied instantly.</Text>
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
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingTop: 14, lineHeight: 18 },
});
