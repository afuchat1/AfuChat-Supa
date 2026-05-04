import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
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

type PrivacyLevel = "everyone" | "followers" | "nobody";

type Settings = {
  reactions_privacy: PrivacyLevel;
  allow_tagging: PrivacyLevel;
};

function RadioGroup({
  label,
  description,
  icon,
  iconBg,
  value,
  onChange,
  saving,
}: {
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  value: PrivacyLevel;
  onChange: (v: PrivacyLevel) => void;
  saving: boolean;
}) {
  const { colors } = useTheme();
  const opts: { v: PrivacyLevel; l: string }[] = [{ v: "everyone", l: "Everyone" }, { v: "followers", l: "Followers" }, { v: "nobody", l: "Nobody" }];
  return (
    <View style={[styles.groupCard, { backgroundColor: colors.surface }]}>
      <View style={styles.groupHeader}>
        <View style={[styles.groupIcon, { backgroundColor: iconBg }]}><Ionicons name={icon} size={18} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.groupLabel, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.groupDesc, { color: colors.textMuted }]}>{description}</Text>
        </View>
        {saving && <ActivityIndicator size="small" color={colors.accent} />}
      </View>
      <View style={[styles.optRow, { borderTopColor: colors.border }]}>
        {opts.map((o) => (
          <TouchableOpacity key={o.v} style={styles.optItem} onPress={() => onChange(o.v)} activeOpacity={0.7}>
            <View style={[styles.radio, { borderColor: value === o.v ? colors.accent : colors.border }]}>
              {value === o.v && <View style={[styles.radioDot, { backgroundColor: colors.accent }]} />}
            </View>
            <Text style={[styles.optLabel, { color: value === o.v ? colors.accent : colors.textSecondary }]}>{o.l}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
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
      if (data) setSettings({ reactions_privacy: (data.reactions_privacy as PrivacyLevel) ?? "everyone", allow_tagging: (data.allow_tagging as PrivacyLevel) ?? "everyone" });
      setLoading(false);
    });
  }, [user]);

  async function update(field: keyof Settings, value: PrivacyLevel) {
    if (!user) return;
    setSaving(field);
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
    if (error) showAlert("Error", "Failed to save setting.");
    else setSettings((p) => ({ ...p, [field]: value }));
    setSaving(null);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Reactions & Tags</Text>
        <View style={{ width: 24 }} />
      </View>
      {loading ? <View style={{ padding: 16, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View> : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>INTERACTIONS</Text>
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <RadioGroup
              icon="heart" iconBg="#FF2D55"
              label="Reactions & Comments"
              description="Who can react to and comment on your posts"
              value={settings.reactions_privacy}
              onChange={(v) => update("reactions_privacy", v)}
              saving={saving === "reactions_privacy"}
            />
            <RadioGroup
              icon="pricetag" iconBg="#FF9500"
              label="Tagging"
              description="Who can tag you in their posts or stories"
              value={settings.allow_tagging}
              onChange={(v) => update("allow_tagging", v)}
              saving={saving === "allow_tagging"}
            />
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>Changes apply to new interactions only. Existing comments and tags remain.</Text>
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
  groupCard: { borderRadius: 14, overflow: "hidden" },
  groupHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  groupIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  groupLabel: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 2 },
  groupDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  optRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 14 },
  optItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingTop: 14, lineHeight: 18 },
});
