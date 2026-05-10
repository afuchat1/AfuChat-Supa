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
import { GlassHeader } from "@/components/ui/GlassHeader";
import { showAlert } from "@/lib/alert";
import { ListRowSkeleton } from "@/components/ui/Skeleton";

const BRAND = "#FF2D55";

type Prefs = {
  show_in_discovery: boolean;
  show_age: boolean;
  show_distance: boolean;
  is_paused: boolean;
};

function SectionHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>;
}

function ToggleRow({ icon, iconBg, label, description, value, onToggle, saving, danger }: {
  icon: React.ComponentProps<typeof Ionicons>["name"]; iconBg: string; label: string;
  description: string; value: boolean; onToggle: (v: boolean) => void;
  saving?: boolean; danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.surface }]}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={17} color="#fff" />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: danger ? "#FF3B30" : colors.text }]}>{label}</Text>
        <Text style={[styles.rowDesc, { color: colors.textMuted }]}>{description}</Text>
      </View>
      {saving ? <ActivityIndicator size="small" color={BRAND} /> : (
        <Switch value={value} onValueChange={onToggle} trackColor={{ true: danger ? "#FF3B30" : BRAND, false: colors.border }} />
      )}
    </View>
  );
}

function NavRow({ icon, iconBg, label, description, onPress, danger }: {
  icon: React.ComponentProps<typeof Ionicons>["name"]; iconBg: string; label: string;
  description: string; onPress: () => void; danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={[styles.row, { backgroundColor: colors.surface }]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={17} color="#fff" />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: danger ? "#FF3B30" : colors.text }]}>{label}</Text>
        <Text style={[styles.rowDesc, { color: colors.textMuted }]}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function MatchSettingsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<Prefs>({ show_in_discovery: true, show_age: true, show_distance: true, is_paused: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("match_profiles").select("show_in_discovery, show_age, show_distance, is_paused").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) setPrefs({ show_in_discovery: data.show_in_discovery, show_age: data.show_age, show_distance: data.show_distance, is_paused: data.is_paused });
      setLoading(false);
    });
  }, [user]);

  async function toggle(field: keyof Prefs, value: boolean) {
    if (!user) return;
    setSaving(field);
    const { error } = await supabase.from("match_profiles").update({ [field]: value, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (error) showAlert("Error", "Failed to save setting.");
    else setPrefs((p) => ({ ...p, [field]: value }));
    setSaving(null);
  }

  function confirmDeleteProfile() {
    showAlert("Delete Dating Profile", "This will permanently delete your AfuMatch profile, photos, and all matches. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        if (!user) return;
        await supabase.from("match_photos").delete().eq("user_id", user.id);
        await supabase.from("match_profiles").delete().eq("user_id", user.id);
        showAlert("Profile Deleted", "Your AfuMatch profile has been deleted.");
        router.replace("/match" as any);
      }},
    ]);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="AfuMatch Settings" />

      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

          {/* Pause Banner */}
          {prefs.is_paused && (
            <View style={[styles.pauseBanner, { backgroundColor: "#FF950022" }]}>
              <Ionicons name="pause-circle" size={20} color="#FF9500" />
              <Text style={[styles.pauseText, { color: "#FF9500" }]}>Discovery is paused. You won't appear to new people.</Text>
            </View>
          )}

          <SectionHeader title="DISCOVERY" />
          <View style={styles.group}>
            <ToggleRow
              icon="pause-circle" iconBg="#FF9500"
              label="Pause AfuMatch"
              description="Temporarily hide your profile from discovery"
              value={prefs.is_paused}
              onToggle={(v) => toggle("is_paused", v)}
              saving={saving === "is_paused"}
            />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <ToggleRow
              icon="eye" iconBg="#007AFF"
              label="Show in Discovery"
              description="Allow others to see your profile while swiping"
              value={prefs.show_in_discovery}
              onToggle={(v) => toggle("show_in_discovery", v)}
              saving={saving === "show_in_discovery"}
            />
          </View>

          <SectionHeader title="WHAT OTHERS SEE" />
          <View style={styles.group}>
            <ToggleRow
              icon="calendar" iconBg="#5856D6"
              label="Show My Age"
              description="Display your age on your dating profile"
              value={prefs.show_age}
              onToggle={(v) => toggle("show_age", v)}
              saving={saving === "show_age"}
            />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <ToggleRow
              icon="location" iconBg="#34C759"
              label="Show Distance"
              description="Show an approximate distance to your matches"
              value={prefs.show_distance}
              onToggle={(v) => toggle("show_distance", v)}
              saving={saving === "show_distance"}
            />
          </View>

          <SectionHeader title="PROFILE" />
          <View style={styles.group}>
            <NavRow
              icon="create" iconBg={BRAND}
              label="Edit Dating Profile"
              description="Update photos, bio, interests and more"
              onPress={() => router.push("/match/profile" as any)}
            />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <NavRow
              icon="options" iconBg="#AF52DE"
              label="Match Preferences"
              description="Set age range, gender, and who you see"
              onPress={() => router.push("/match/preferences" as any)}
            />
          </View>

          <SectionHeader title="SAFETY & PRIVACY" />
          <View style={styles.group}>
            <NavRow
              icon="shield-checkmark" iconBg="#34C759"
              label="Safety Centre"
              description="Tips for safe dating and how to report"
              onPress={() => showAlert("Safety Centre", "Always meet in public places. Tell a friend where you're going. Trust your instincts — if something feels wrong, leave. Use the report button on any profile you feel unsafe about.")}
            />
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
            <NavRow
              icon="ban" iconBg="#FF9500"
              label="Blocked Profiles"
              description="Manage profiles you've blocked in AfuMatch"
              onPress={() => showAlert("Blocked Profiles", "Blocked profile management coming soon.")}
            />
          </View>

          <SectionHeader title="DANGER ZONE" />
          <View style={styles.group}>
            <NavRow
              icon="trash" iconBg="#FF3B30"
              label="Delete Dating Profile"
              description="Permanently remove all your AfuMatch data"
              onPress={confirmDeleteProfile}
              danger
            />
          </View>

          <View style={[styles.infoCard, { backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 8 }]}>
            <Ionicons name="lock-closed" size={18} color={BRAND} />
            <Text style={[styles.infoText, { color: colors.textMuted }]}>
              Your AfuMatch profile is completely separate from your main AfuChat profile. What you share here is only visible within AfuMatch and to people you match with.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: BRAND, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  group: { marginHorizontal: 16, borderRadius: 14, overflow: "hidden" },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 13 },
  rowIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 2 },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  pauseBanner: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 14 },
  pauseText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 14, padding: 14 },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
