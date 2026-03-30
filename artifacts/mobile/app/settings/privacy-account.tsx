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

function ToggleRow({ icon, iconBg, label, description, value, onToggle }: { icon: React.ComponentProps<typeof Ionicons>["name"]; iconBg: string; label: string; description: string; value: boolean; onToggle: (v: boolean) => void; }) {
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
      <Switch value={value} onValueChange={onToggle} trackColor={{ true: Colors.brand, false: colors.border }} />
    </View>
  );
}

export default function PrivacyAccountScreen() {
  const { colors } = useTheme();
  const { user, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [isPrivate, setIsPrivate] = useState(false);
  const [showOnline, setShowOnline] = useState(true);
  const [showLastSeen, setShowLastSeen] = useState(true);
  const [showBio, setShowBio] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("is_private, show_online_status").eq("id", user.id).single().then(({ data }) => {
      if (data) {
        setIsPrivate(data.is_private || false);
        setShowOnline(data.show_online_status !== false);
      }
    });
  }, [user]);

  async function update(field: string, value: boolean) {
    if (!user) return;
    await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
    refreshProfile();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Account Privacy</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PROFILE</Text>
        <View style={styles.group}>
          <ToggleRow
            icon="lock-closed"
            iconBg="#007AFF"
            label="Private Account"
            description="Only approved followers can see your posts and stories"
            value={isPrivate}
            onToggle={(v) => { setIsPrivate(v); update("is_private", v); }}
          />
          <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 60 }]} />
          <ToggleRow
            icon="eye"
            iconBg="#34C759"
            label="Show Online Status"
            description="Let others see when you were last active"
            value={showOnline}
            onToggle={(v) => { setShowOnline(v); update("show_online_status", v); }}
          />
          <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 60 }]} />
          <ToggleRow
            icon="time"
            iconBg="#FF9500"
            label="Show Last Seen"
            description="Display when you were last online to contacts"
            value={showLastSeen}
            onToggle={setShowLastSeen}
          />
          <View style={[styles.sep, { backgroundColor: colors.border, marginLeft: 60 }]} />
          <ToggleRow
            icon="person-circle"
            iconBg="#5856D6"
            label="Public Bio"
            description="Show your bio to everyone, not just followers"
            value={showBio}
            onToggle={setShowBio}
          />
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          When your account is private, only people you approve can follow you and see your content.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  group: { marginHorizontal: 16, borderRadius: 14, overflow: "hidden" },
  sep: { height: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 14 },
  rowIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontFamily: "Inter_400Regular", marginBottom: 2 },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular" },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingTop: 12, lineHeight: 18 },
});
