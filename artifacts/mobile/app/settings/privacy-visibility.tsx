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
  hide_followers_list: boolean;
  hide_following_list: boolean;
  hide_posts_non_followers: boolean;
  hide_from_search: boolean;
  location_sharing_enabled: boolean;
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

export default function PrivacyVisibilityScreen() {
  const { colors } = useTheme();
  const { user, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<Settings>({
    hide_followers_list: false,
    hide_following_list: false,
    hide_posts_non_followers: false,
    hide_from_search: false,
    location_sharing_enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof Settings | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("hide_followers_list, hide_following_list, hide_posts_non_followers, hide_from_search, location_sharing_enabled")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setSettings({
            hide_followers_list: data.hide_followers_list ?? false,
            hide_following_list: data.hide_following_list ?? false,
            hide_posts_non_followers: data.hide_posts_non_followers ?? false,
            hide_from_search: data.hide_from_search ?? false,
            location_sharing_enabled: data.location_sharing_enabled !== false,
          });
        }
        setLoading(false);
      });
  }, [user]);

  async function toggle(field: keyof Settings, value: boolean) {
    if (!user) return;
    setSaving(field);
    patchLocalSetting(user.id, field as any, value).catch(() => {});
    const update: Record<string, any> = { [field]: value };
    if (field === "location_sharing_enabled" && !value) {
      update.latitude = null;
      update.longitude = null;
      update.location_updated_at = null;
    }
    const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
    if (error) {
      showAlert("Error", "Failed to save setting.");
    } else {
      setSettings((prev) => ({ ...prev, [field]: value }));
      await refreshProfile();
    }
    setSaving(null);
  }

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Visibility" />
      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t("privacy.connections")}</Text>
          <GlassCard style={s.group} variant="medium">
            <ToggleRow
              icon="people"
              iconColor="#5856D6"
              label="Hide Followers List"
              description="Others cannot see who follows you"
              value={settings.hide_followers_list}
              onToggle={(v) => toggle("hide_followers_list", v)}
              saving={saving === "hide_followers_list"}
            />
            <View style={[s.sep, { backgroundColor: colors.border }]} />
            <ToggleRow
              icon="person-add"
              iconColor="#007AFF"
              label="Hide Following List"
              description="Others cannot see who you follow"
              value={settings.hide_following_list}
              onToggle={(v) => toggle("hide_following_list", v)}
              saving={saving === "hide_following_list"}
            />
          </GlassCard>

          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t("privacy.discoverability")}</Text>
          <GlassCard style={s.group} variant="medium">
            <ToggleRow
              icon="eye-off"
              iconColor="#FF9500"
              label="privacy.limit_post_visibility"
              description="privacy.limit_post_visibility_description"
              value={settings.hide_posts_non_followers}
              onToggle={(v) => toggle("hide_posts_non_followers", v)}
              saving={saving === "hide_posts_non_followers"}
            />
            <View style={[s.sep, { backgroundColor: colors.border }]} />
            <ToggleRow
              icon="search"
              iconColor="#FF3B30"
              label="privacy.hide_from_search"
              description="privacy.hide_from_search_description"
              value={settings.hide_from_search}
              onToggle={(v) => toggle("hide_from_search", v)}
              saving={saving === "hide_from_search"}
            />
          </GlassCard>

          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t("privacy.location")}</Text>
          <GlassCard style={s.group} variant="medium">
            <ToggleRow
              icon="navigate"
              iconColor="#34C759"
              label="privacy.share_location"
              description="privacy.share_location_description"
              value={settings.location_sharing_enabled}
              onToggle={(v) => toggle("location_sharing_enabled", v)}
              saving={saving === "location_sharing_enabled"}
            />
          </GlassCard>

          <Text style={[s.hint, { color: colors.textMuted }]}>
            {t("privacy.location_note")}
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
