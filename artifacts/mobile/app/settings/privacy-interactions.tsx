import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
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
import { registerUiTexts } from "@/lib/i18n";

type PrivacyLevel = "everyone" | "followers" | "nobody";

type Settings = {
  reactions_privacy: PrivacyLevel;
  allow_tagging: PrivacyLevel;
};

const OPTS: { v: PrivacyLevel; l: string }[] = [
  { v: "everyone",  l: "Everyone"  },
  { v: "followers", l: "Followers" },
  { v: "nobody",    l: "Nobody"    },
];
registerUiTexts(OPTS.map((option) => option.l));

function RadioGroup({
  label,
  description,
  icon,
  iconColor,
  value,
  onChange,
  saving,
}: {
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  value: PrivacyLevel;
  onChange: (v: PrivacyLevel) => void;
  saving: boolean;
}) {
  const { colors, accent } = useTheme();
  const { t } = useLanguage();
  return (
    <GlassCard style={s.groupCard} variant="medium">
      <View style={[s.groupHeader, { backgroundColor: colors.surface }]}>
        <View style={s.groupIcon}>
          <Ionicons name={icon} size={22} color={colors.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.groupLabel, { color: colors.text }]}>{label}</Text>
          <Text style={[s.groupDesc, { color: colors.textMuted }]}>{description}</Text>
        </View>
        {saving && <ActivityIndicator size="small" color={accent} />}
      </View>

      <View style={[s.optStrip, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        {OPTS.map((o) => {
          const active = value === o.v;
          return (
            <TouchableOpacity
              key={o.v}
              style={[s.optItem, active && { backgroundColor: accent + "12" }]}
              onPress={() => onChange(o.v)}
              activeOpacity={0.7}
            >
              <View style={[s.radio, { borderColor: active ? accent : colors.border }]}>
                {active && <View style={[s.radioDot, { backgroundColor: accent }]} />}
              </View>
              <Text style={[s.optLabel, { color: active ? accent : colors.textSecondary }]}>{t(o.l)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </GlassCard>
  );
}

export default function PrivacyInteractionsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<Settings>({ reactions_privacy: "everyone", allow_tagging: "everyone" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof Settings | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("reactions_privacy, allow_tagging").eq("id", user.id).single().then(({ data }) => {
      if (data) setSettings({
        reactions_privacy: (data.reactions_privacy as PrivacyLevel) ?? "everyone",
        allow_tagging: (data.allow_tagging as PrivacyLevel) ?? "everyone",
      });
      setLoading(false);
    });
  }, [user]);

  async function update(field: keyof Settings, value: PrivacyLevel) {
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
      <GlassHeader title="Reactions & Tags" />
      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

          <Text style={[s.sectionTitle, { color: colors.textMuted }]}>INTERACTIONS</Text>
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <RadioGroup
              icon="heart"
              iconColor="#FF2D55"
              label="Reactions & Comments"
              description="Who can react to and comment on your posts"
              value={settings.reactions_privacy}
              onChange={(v) => update("reactions_privacy", v)}
              saving={saving === "reactions_privacy"}
            />
            <RadioGroup
              icon="pricetag"
              iconColor="#FF9500"
              label="Tagging"
              description="Who can tag you in their posts or stories"
              value={settings.allow_tagging}
              onChange={(v) => update("allow_tagging", v)}
              saving={saving === "allow_tagging"}
            />
          </View>

          <Text style={[s.hint, { color: colors.textMuted }]}>
            Changes apply to new interactions only. Existing comments and tags remain.
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
  groupCard: { borderRadius: 16, overflow: "hidden" },
  groupHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  groupIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  groupLabel: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 2 },
  groupDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  optStrip: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 8 },
  optItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6, borderRadius: 8 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingTop: 16, lineHeight: 18 },
});
