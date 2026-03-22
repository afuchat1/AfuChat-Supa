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

type ChatPrefs = {
  chat_theme: string;
  bubble_style: string;
  font_size: number;
  sounds_enabled: boolean;
  auto_download: boolean;
  read_receipts: boolean;
  chat_lock: boolean;
};

const defaults: ChatPrefs = { chat_theme: "teal", bubble_style: "rounded", font_size: 16, sounds_enabled: true, auto_download: true, read_receipts: true, chat_lock: false };

export default function ChatSettingsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<ChatPrefs>(defaults);

  useEffect(() => {
    if (!user) return;
    supabase.from("chat_preferences").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) setPrefs({ ...defaults, ...data });
    });
  }, [user]);

  async function toggle(key: keyof ChatPrefs) {
    const val = !(prefs[key] as boolean);
    setPrefs((p) => ({ ...p, [key]: val }));
    if (!user) return;
    await supabase.from("chat_preferences").upsert({ user_id: user.id, [key]: val }, { onConflict: "user_id" });
  }

  function BoolRow({ label, field, desc }: { label: string; field: keyof ChatPrefs; desc?: string }) {
    return (
      <View style={[styles.row, { backgroundColor: colors.surface }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
          {desc && <Text style={[styles.rowDesc, { color: colors.textMuted }]}>{desc}</Text>}
        </View>
        <Switch value={prefs[field] as boolean} onValueChange={() => toggle(field)} trackColor={{ true: Colors.brand, false: colors.border }} />
      </View>
    );
  }

  function ValueRow({ label, value }: { label: string; value: string }) {
    return (
      <View style={[styles.row, { backgroundColor: colors.surface }]}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <View style={styles.valueRow}>
          <Text style={[styles.valueText, { color: colors.textSecondary }]}>{value}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.backgroundSecondary }]} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Chat Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={[styles.section, { color: colors.textSecondary }]}>Appearance</Text>
      <ValueRow label="Theme" value={prefs.chat_theme} />
      <ValueRow label="Bubble Style" value={prefs.bubble_style} />
      <ValueRow label="Font Size" value={`${prefs.font_size}px`} />

      <Text style={[styles.section, { color: colors.textSecondary }]}>Messages</Text>
      <BoolRow label="Sound Effects" field="sounds_enabled" />
      <BoolRow label="Auto-Download Media" field="auto_download" desc="Automatically download photos and videos" />
      <BoolRow label="Read Receipts" field="read_receipts" desc="Let others see when you've read messages" />

      <Text style={[styles.section, { color: colors.textSecondary }]}>Security</Text>
      <BoolRow label="Chat Lock" field="chat_lock" desc="Require authentication to open chats" />
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
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  valueText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
