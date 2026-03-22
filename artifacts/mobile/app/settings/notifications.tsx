import React, { useEffect, useState } from "react";
import {
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
import Colors from "@/constants/colors";

type Prefs = {
  push_enabled: boolean;
  push_messages: boolean;
  push_likes: boolean;
  push_follows: boolean;
  push_gifts: boolean;
  push_mentions: boolean;
  push_replies: boolean;
  quiet_hours_enabled: boolean;
};

const defaults: Prefs = { push_enabled: true, push_messages: true, push_likes: true, push_follows: true, push_gifts: true, push_mentions: true, push_replies: true, quiet_hours_enabled: false };

export default function NotificationSettingsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<Prefs>(defaults);

  useEffect(() => {
    if (!user) return;
    supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) setPrefs({ ...defaults, ...data });
    });
  }, [user]);

  async function toggle(key: keyof Prefs) {
    const val = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: val }));
    if (!user) return;
    await supabase.from("notification_preferences").upsert({ user_id: user.id, [key]: val }, { onConflict: "user_id" });
  }

  function Row({ label, field }: { label: string; field: keyof Prefs }) {
    return (
      <View style={[styles.row, { backgroundColor: colors.surface }]}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <Switch value={prefs[field]} onValueChange={() => toggle(field)} trackColor={{ true: Colors.brand, false: colors.border }} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.backgroundSecondary }]} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={[styles.section, { color: colors.textSecondary }]}>Push Notifications</Text>
      <Row label="Enable Push Notifications" field="push_enabled" />
      <Row label="Messages" field="push_messages" />
      <Row label="Likes" field="push_likes" />
      <Row label="New Followers" field="push_follows" />
      <Row label="Gifts" field="push_gifts" />
      <Row label="Mentions" field="push_mentions" />
      <Row label="Replies" field="push_replies" />

      <Text style={[styles.section, { color: colors.textSecondary }]}>Quiet Hours</Text>
      <Row label="Enable Quiet Hours" field="quiet_hours_enabled" />
      {prefs.quiet_hours_enabled && (
        <Text style={[styles.quietNote, { color: colors.textMuted }]}>Notifications silenced 10 PM - 8 AM</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  section: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  quietNote: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 13, fontFamily: "Inter_400Regular" },
});
