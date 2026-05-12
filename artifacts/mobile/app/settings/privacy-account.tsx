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
  is_private: boolean;
  show_online_status: boolean;
  show_last_seen: boolean;
  show_bio_publicly: boolean;
};

function ToggleRow({
  icon,
  iconBg,
  label,
  description,
  value,
  onToggle,
  saving,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  label: string;
  description: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  saving?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.surface }]}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.rowDesc, { color: colors.textMuted }]}>{description}</Text>
      </View>
      {saving ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      )}
    </View>
  );
}

export default function PrivacyAccountScreen() {
  const { colors } = useTheme();
  const { user, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState<Settings>({
    is_private: false,
    show_online_status: true,
    show_last_seen: true,
    show_bio_publicly: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof Settings | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("is_private, show_online_status, show_last_seen, show_bio_publicly")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (data) {
          setSettings({
            is_private: data.is_private ?? false,
            show_online_status: data.show_online_status !== false,
            show_last_seen: data.show_last_seen !== false,
            show_bio_publicly: data.show_bio_publicly !== false,
          });
        }
        setLoading(false);
      });
  }, [user]);

  async function toggle(field: keyof Settings, value: boolean) {
    if (!user) return;
    setSaving(field);
    const { error } = await supabase
      .from("profiles")
      .update({ [field]: value })
      .eq("id", user.id);
    if (error) {
      showAlert("Error", "Failed to save setting. Please try again.");
    } else {
      setSettings((prev) => ({ ...prev, [field]: value }));
      await refreshProfile();
    }
    setSaving(null);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Account Privacy" />

      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PROFILE</Text>
          <GlassCard style={styles.group} variant="medium">
            <ToggleRow
              icon="lock-closed"
              iconBg="#007AFF"
              label="Private Account"
              description="Only approved followers can see your posts and stories"
              value={settings.is_private}
              onToggle={(v) => toggle("is_private", v)}
              saving={saving === "is_private"}
            />
            <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 62 }]} />
            <ToggleRow
              icon="person-circle"
              iconBg="#5856D6"
              label="Public Bio"
              description="Show your bio to everyone, not just followers"
              value={settings.show_bio_publicly}
              onToggle={(v) => toggle("show_bio_publicly", v)}
              saving={saving === "show_bio_publicly"}
            />
          </GlassCard>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ACTIVITY</Text>
          <GlassCard style={styles.group} variant="medium">
            <ToggleRow
              icon="radio-button-on"
              iconBg="#34C759"
              label="Show Online Status"
              description="Let others see when you are currently active"
              value={settings.show_online_status}
              onToggle={(v) => toggle("show_online_status", v)}
              saving={saving === "show_online_status"}
            />
            <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 62 }]} />
            <ToggleRow
              icon="time"
              iconBg="#FF9500"
              label="Show Last Seen"
              description="Display when you were last active to your contacts"
              value={settings.show_last_seen}
              onToggle={(v) => toggle("show_last_seen", v)}
              saving={saving === "show_last_seen"}
            />
          </GlassCard>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            When your account is private, only people you approve can follow you and see your content. Changes take effect immediately.
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
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingTop: 14, lineHeight: 18 },
});
