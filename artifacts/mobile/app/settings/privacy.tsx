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

export default function PrivacySettingsScreen() {
  const { colors } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [isPrivate, setIsPrivate] = useState(profile?.is_private || false);
  const [showOnline, setShowOnline] = useState(profile?.show_online_status !== false);
  const [hideFollowers, setHideFollowers] = useState(false);
  const [hideFollowing, setHideFollowing] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("is_private, show_online_status, hide_followers_list, hide_following_list").eq("id", user.id).single().then(({ data }) => {
      if (data) {
        setIsPrivate(data.is_private || false);
        setShowOnline(data.show_online_status !== false);
        setHideFollowers(data.hide_followers_list || false);
        setHideFollowing(data.hide_following_list || false);
      }
    });
  }, [user]);

  async function update(field: string, value: boolean) {
    if (!user) return;
    await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
    refreshProfile();
  }

  function SettingRow({ label, value, onToggle, description }: { label: string; value: boolean; onToggle: (v: boolean) => void; description?: string }) {
    return (
      <View style={[styles.settingRow, { backgroundColor: colors.surface }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
          {description && <Text style={[styles.settingDesc, { color: colors.textMuted }]}>{description}</Text>}
        </View>
        <Switch value={value} onValueChange={onToggle} trackColor={{ true: Colors.brand, false: colors.border }} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.backgroundSecondary }]} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Privacy</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Account</Text>
      <SettingRow label="Private Account" value={isPrivate} onToggle={(v) => { setIsPrivate(v); update("is_private", v); }} description="Only approved followers can see your posts" />
      <SettingRow label="Show Online Status" value={showOnline} onToggle={(v) => { setShowOnline(v); update("show_online_status", v); }} description="Let others see when you're active" />

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Visibility</Text>
      <SettingRow label="Hide Followers List" value={hideFollowers} onToggle={(v) => { setHideFollowers(v); update("hide_followers_list", v); }} />
      <SettingRow label="Hide Following List" value={hideFollowing} onToggle={(v) => { setHideFollowing(v); update("hide_following_list", v); }} />

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Security</Text>
      <TouchableOpacity style={[styles.linkRow, { backgroundColor: colors.surface }]} onPress={() => router.push("/settings/blocked")}>
        <Ionicons name="ban-outline" size={20} color="#FF3B30" />
        <Text style={[styles.linkLabel, { color: colors.text }]}>Blocked Users</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  settingRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  settingLabel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  settingDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  linkRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  linkLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
});
