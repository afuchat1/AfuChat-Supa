import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { patchLocalSetting } from "@/lib/storage/localSettings";
import { useLanguage } from "@/context/LanguageContext";

type Settings = {
  is_private: boolean;
  show_online_status: boolean;
  show_last_seen: boolean;
  show_bio_publicly: boolean;
};

function ToggleRow({
  icon,
  iconColor,
  label,
  description,
  value,
  onToggle,
  saving,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  label: string;
  description: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  saving?: boolean;
}) {
  const { colors, accent } = useTheme();
  const { t } = useLanguage();
  return (
    <View style={[s.row, { backgroundColor: colors.surface }]}>
      <View style={s.rowIcon}>
        <Ionicons name={icon} size={22} color={colors.text} />
      </View>
      <View style={s.rowText}>
        <Text style={[s.rowLabel, { color: colors.text }]}>{t(label)}</Text>
        <Text style={[s.rowDesc, { color: colors.textMuted }]}>{t(description)}</Text>
      </View>
      {saving ? (
        <ActivityIndicator size="small" color={accent} />
      ) : (
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ true: accent, false: colors.border }}
          thumbColor="#fff"
        />
      )}
    </View>
  );
}

export default function PrivacyAccountScreen() {
  const { colors } = useTheme();
  const { user, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

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
      .then(({ data }) => {
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
    patchLocalSetting(user.id, field as any, value).catch(() => {});
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
    if (error) {
      showAlert("Error", "Failed to save setting. Please try again.");
    } else {
      setSettings((prev) => ({ ...prev, [field]: value }));
      await refreshProfile();
    }
    setSaving(null);
  }

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Account Privacy" />

      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t("PROFILE")}</Text>
          <GlassCard style={s.group} variant="medium">
            <ToggleRow
              icon="lock-closed"
              iconColor="#FF3B30"
              label="Private Account"
              description="Only approved followers can see your posts and stories"
              value={settings.is_private}
              onToggle={(v) => toggle("is_private", v)}
              saving={saving === "is_private"}
            />
            <View style={[s.sep, { backgroundColor: colors.border }]} />
            <ToggleRow
              icon="person-circle"
              iconColor="#007AFF"
              label="Public Bio"
              description="Show your bio to everyone, not just followers"
              value={settings.show_bio_publicly}
              onToggle={(v) => toggle("show_bio_publicly", v)}
              saving={saving === "show_bio_publicly"}
            />
          </GlassCard>

          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t("ACTIVITY")}</Text>
          <GlassCard style={s.group} variant="medium">
            <ToggleRow
              icon="radio-button-on"
              iconColor="#34C759"
              label="Show Online Status"
              description="Let others see when you are currently active"
              value={settings.show_online_status}
              onToggle={(v) => toggle("show_online_status", v)}
              saving={saving === "show_online_status"}
            />
            <View style={[s.sep, { backgroundColor: colors.border }]} />
            <ToggleRow
              icon="time"
              iconColor="#FF9500"
              label="Show Last Seen"
              description="Display when you were last active to your contacts"
              value={settings.show_last_seen}
              onToggle={(v) => toggle("show_last_seen", v)}
              saving={saving === "show_last_seen"}
            />
          </GlassCard>

          <Text style={[s.hint, { color: colors.textMuted }]}>
            {t("privacy.account_note")}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  group: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden" },
  sep: { height: 0.5, marginLeft: 62 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 14 },
  rowIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 2 },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingTop: 16, lineHeight: 18 },
});
