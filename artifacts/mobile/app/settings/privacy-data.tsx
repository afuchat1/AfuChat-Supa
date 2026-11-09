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
  data_personalization: boolean;
  data_analytics: boolean;
};

function ToggleRow({ icon, iconColor, label, description, value, onToggle, saving }: {
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
        <Switch value={value} onValueChange={onToggle} trackColor={{ true: accent, false: colors.border }} thumbColor="#fff" />
      )}
    </View>
  );
}

export default function PrivacyDataScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
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
    patchLocalSetting(user.id, field as any, value).catch(() => {});
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
    if (error) showAlert("Error", "Failed to save setting.");
    else setSettings((p) => ({ ...p, [field]: value }));
    setSaving(null);
  }

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Activity Data" />
      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t("privacy.data_usage")}</Text>
          <GlassCard style={s.group} variant="medium">
            <ToggleRow
              icon="lock-closed-outline"
              iconColor="#AF52DE"
              label="Personalisation"
              description="Use your activity to personalise your feed, suggestions, and AI responses"
              value={settings.data_personalization}
              onToggle={(v) => toggle("data_personalization", v)}
              saving={saving === "data_personalization"}
            />
            <View style={[s.sep, { backgroundColor: colors.border }]} />
            <ToggleRow
              icon="analytics"
              iconColor="#007AFF"
              label="Analytics"
              description="Help improve AfuChat by sharing anonymous usage statistics"
              value={settings.data_analytics}
              onToggle={(v) => toggle("data_analytics", v)}
              saving={saving === "data_analytics"}
            />
          </GlassCard>

          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t("ACCOUNT DATA")}</Text>
          <GlassCard style={s.group} variant="medium">
            <TouchableOpacity
              style={[s.row, { backgroundColor: colors.surface }]}
              onPress={() => showAlert(t("Clear History"), t("This will clear your search history and browsing activity. Continue?"), [
                { text: t("Cancel"), style: "cancel" },
                { text: t("Clear"), style: "destructive", onPress: () => showAlert(t("Done"), t("Activity history cleared.")) },
              ])}
              activeOpacity={0.7}
            >
              <View style={s.rowIcon}>
                <Ionicons name="trash-outline" size={22} color="#FF3B30" />
              </View>
              <View style={s.rowText}>
                <Text style={[s.rowLabel, { color: "#FF3B30" }]}>{t("Clear Activity History")}</Text>
                <Text style={[s.rowDesc, { color: colors.textMuted }]}>{t("Delete your search and browsing history")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </GlassCard>

          <Text style={[s.hint, { color: colors.textMuted }]}>
            {t("AfuChat Technologies Ltd. never sells your personal data to third parties. Turning off personalisation may make your experience less relevant.")}
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
