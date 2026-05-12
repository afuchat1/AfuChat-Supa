import React, { useEffect, useState } from "react";
import {
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
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassCard } from "@/components/ui/GlassCard";

type PrivacyLevel = "everyone" | "followers" | "nobody";

type Settings = {
  message_privacy: PrivacyLevel;
};

const OPTIONS: { value: PrivacyLevel; label: string; description: string; icon: React.ComponentProps<typeof Ionicons>["name"]; iconBg: string }[] = [
  { value: "everyone", label: "Everyone", description: "Anyone on AfuChat can message you", icon: "globe", iconBg: "#34C759" },
  { value: "followers", label: "Followers Only", description: "Only people you follow back can message you", icon: "people", iconBg: "#007AFF" },
  { value: "nobody", label: "Nobody", description: "Turn off all direct messages from new people", icon: "ban", iconBg: "#FF3B30" },
];

export default function PrivacyMessagesScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<Settings>({ message_privacy: "everyone" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("message_privacy").eq("id", user.id).single().then(({ data }) => {
      if (data?.message_privacy) setSettings({ message_privacy: data.message_privacy as PrivacyLevel });
      setLoading(false);
    });
  }, [user]);

  async function select(value: PrivacyLevel) {
    if (!user || saving) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ message_privacy: value }).eq("id", user.id);
    if (error) showAlert("Error", "Failed to save setting.");
    else setSettings({ message_privacy: value });
    setSaving(false);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Messages & Calls" />
      {loading ? <View style={{ padding: 16, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View> : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>WHO CAN MESSAGE YOU</Text>
          <GlassCard style={styles.group} variant="medium">
            {OPTIONS.map((opt, i) => {
              const selected = settings.message_privacy === opt.value;
              return (
                <View key={opt.value}>
                  {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 62 }]} />}
                  <TouchableOpacity
                    style={[styles.optRow, { backgroundColor: colors.surface }]}
                    onPress={() => select(opt.value)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.optIcon, { backgroundColor: opt.iconBg }]}>
                      <Ionicons name={opt.icon} size={18} color="#fff" />
                    </View>
                    <View style={styles.optText}>
                      <Text style={[styles.optLabel, { color: colors.text }]}>{opt.label}</Text>
                      <Text style={[styles.optDesc, { color: colors.textMuted }]}>{opt.description}</Text>
                    </View>
                    <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.border }]}>
                      {selected && <View style={[styles.radioDot, { backgroundColor: colors.accent }]} />}
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </GlassCard>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            This setting controls who can start new conversations with you. Existing chats are not affected.
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
  optRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 14 },
  optIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  optText: { flex: 1 },
  optLabel: { fontSize: 16, fontFamily: "Inter_400Regular", marginBottom: 2 },
  optDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingTop: 14, lineHeight: 18 },
});
