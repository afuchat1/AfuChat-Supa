import React, { useEffect, useState } from "react";
import {
  Platform,
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
import { showAlert } from "@/lib/alert";

type ChatPrefs = {
  chat_theme: string;
  bubble_style: string;
  font_size: number;
  sounds_enabled: boolean;
  auto_download: boolean;
  read_receipts: boolean;
  chat_lock: boolean;
  enter_to_send: boolean;
  media_quality: string;
  save_to_gallery: boolean;
  link_previews: boolean;
  typing_indicators: boolean;
  archive_on_delete: boolean;
  chat_backup: boolean;
};

const defaults: ChatPrefs = {
  chat_theme: "Teal",
  bubble_style: "Rounded",
  font_size: 16,
  sounds_enabled: true,
  auto_download: true,
  read_receipts: true,
  chat_lock: false,
  enter_to_send: false,
  media_quality: "Auto",
  save_to_gallery: false,
  link_previews: true,
  typing_indicators: true,
  archive_on_delete: false,
  chat_backup: false,
};

const THEMES = ["Teal", "Blue", "Purple", "Rose", "Amber", "Emerald"];
const BUBBLE_STYLES = ["Rounded", "Sharp", "Minimal"];
const FONT_SIZES = [14, 16, 18, 20];
const MEDIA_QUALITIES = ["Auto", "High", "Low"];

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

  async function saveField(key: string, val: any) {
    if (!user) return;
    await supabase.from("chat_preferences").upsert({ user_id: user.id, [key]: val }, { onConflict: "user_id" });
  }

  async function toggle(key: keyof ChatPrefs) {
    const val = !(prefs[key] as boolean);
    setPrefs((p) => ({ ...p, [key]: val }));
    saveField(key, val);
  }

  function cyclePicker(key: keyof ChatPrefs, options: string[]) {
    const current = prefs[key] as string;
    const idx = options.indexOf(current);
    const next = options[(idx + 1) % options.length];
    setPrefs((p) => ({ ...p, [key]: next }));
    saveField(key, next);
  }

  function cycleFontSize() {
    const idx = FONT_SIZES.indexOf(prefs.font_size);
    const next = FONT_SIZES[(idx + 1) % FONT_SIZES.length];
    setPrefs((p) => ({ ...p, font_size: next }));
    saveField("font_size", next);
  }

  function BoolRow({ label, field, desc, icon, iconColor }: { label: string; field: keyof ChatPrefs; desc?: string; icon: string; iconColor: string }) {
    return (
      <View style={[styles.row, { backgroundColor: colors.surface }]}>
        <View style={[styles.rowIcon, { backgroundColor: iconColor }]}>
          <Ionicons name={icon as any} size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
          {desc && <Text style={[styles.rowDesc, { color: colors.textMuted }]}>{desc}</Text>}
        </View>
        <Switch value={prefs[field] as boolean} onValueChange={() => toggle(field)} trackColor={{ true: Colors.brand, false: colors.border }} />
      </View>
    );
  }

  function ValueRow({ label, value, icon, iconColor, onPress }: { label: string; value: string; icon: string; iconColor: string; onPress: () => void }) {
    return (
      <TouchableOpacity style={[styles.row, { backgroundColor: colors.surface }]} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.rowIcon, { backgroundColor: iconColor }]}>
          <Ionicons name={icon as any} size={18} color="#fff" />
        </View>
        <Text style={[styles.rowLabel, { color: colors.text, flex: 1 }]}>{label}</Text>
        <View style={styles.valueRow}>
          <Text style={[styles.valueText, { color: colors.textSecondary }]}>{value}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
    );
  }

  function SectionHeader({ title }: { title: string }) {
    return <Text style={[styles.section, { color: colors.textSecondary }]}>{title}</Text>;
  }

  function Separator() {
    return <View style={[styles.separator, { backgroundColor: colors.border }]} />;
  }

  return (
    <ScrollView style={[styles.root, { backgroundColor: colors.backgroundSecondary }]} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Chat Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <SectionHeader title="APPEARANCE" />
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        <ValueRow label="Chat Theme" value={prefs.chat_theme} icon="color-palette" iconColor={Colors.brand} onPress={() => cyclePicker("chat_theme", THEMES)} />
        <Separator />
        <ValueRow label="Bubble Style" value={prefs.bubble_style} icon="chatbubble" iconColor="#AF52DE" onPress={() => cyclePicker("bubble_style", BUBBLE_STYLES)} />
        <Separator />
        <ValueRow label="Font Size" value={`${prefs.font_size}px`} icon="text" iconColor="#FF9500" onPress={cycleFontSize} />
      </View>

      <SectionHeader title="MESSAGES" />
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        <BoolRow label="Sound Effects" field="sounds_enabled" icon="volume-high" iconColor="#007AFF" desc="Play sounds for sent and received messages" />
        <Separator />
        <BoolRow label="Read Receipts" field="read_receipts" icon="checkmark-done" iconColor="#34C759" desc="Let others see when you've read their messages" />
        <Separator />
        <BoolRow label="Typing Indicators" field="typing_indicators" icon="ellipsis-horizontal" iconColor="#5856D6" desc="Show when you're typing a message" />
        <Separator />
        <BoolRow label="Link Previews" field="link_previews" icon="link" iconColor="#FF2D55" desc="Show previews for URLs in messages" />
        {Platform.OS !== "web" && (
          <>
            <Separator />
            <BoolRow label="Enter Key to Send" field="enter_to_send" icon="return-down-back" iconColor="#64748B" desc="Send messages with the Enter key instead of new line" />
          </>
        )}
      </View>

      <SectionHeader title="MEDIA" />
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        <BoolRow label="Auto-Download Media" field="auto_download" icon="cloud-download" iconColor="#007AFF" desc="Automatically download photos and videos" />
        <Separator />
        <ValueRow label="Media Quality" value={prefs.media_quality} icon="image" iconColor="#FF9500" onPress={() => cyclePicker("media_quality", MEDIA_QUALITIES)} />
        {Platform.OS !== "web" && (
          <>
            <Separator />
            <BoolRow label="Save to Gallery" field="save_to_gallery" icon="download" iconColor="#34C759" desc="Automatically save received media to your gallery" />
          </>
        )}
      </View>

      <SectionHeader title="SECURITY" />
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        <BoolRow label="Chat Lock" field="chat_lock" icon="lock-closed" iconColor="#FF3B30" desc="Require authentication to open chats" />
        <Separator />
        <BoolRow label="Archive on Delete" field="archive_on_delete" icon="archive" iconColor="#FF9500" desc="Archive messages instead of permanently deleting" />
      </View>

      <SectionHeader title="BACKUP" />
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        <BoolRow label="Chat Backup" field="chat_backup" icon="cloud-upload" iconColor="#5856D6" desc="Automatically back up chats to the cloud" />
      </View>

      <SectionHeader title="DANGER ZONE" />
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.7}
          onPress={() => {
            showAlert("Clear All Chats", "This will delete all your chat history. This action cannot be undone.", [
              { text: "Cancel", style: "cancel" },
              { text: "Clear All", style: "destructive", onPress: () => {} },
            ]);
          }}
        >
          <View style={[styles.rowIcon, { backgroundColor: "#FF3B30" }]}>
            <Ionicons name="trash" size={18} color="#fff" />
          </View>
          <Text style={[styles.rowLabel, { color: "#FF3B30", flex: 1 }]}>Clear All Chats</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  section: { fontSize: 12, fontFamily: "Inter_600SemiBold", paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8, letterSpacing: 0.5 },
  group: { borderRadius: 14, marginHorizontal: 16, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  rowIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 16 },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  valueText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
});
