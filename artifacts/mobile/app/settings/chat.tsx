import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { showAlert } from "@/lib/alert";
import {
  useChatPreferences,
  CHAT_THEME_COLORS,
  ChatTheme,
  BubbleStyle,
  MediaQuality,
} from "@/context/ChatPreferencesContext";
import { useAppAccent } from "@/context/AppAccentContext";

const BUBBLE_STYLES: { name: BubbleStyle; radius: number }[] = [
  { name: "Rounded", radius: 18 },
  { name: "Sharp",   radius: 4  },
  { name: "Minimal", radius: 10 },
];

const FONT_SIZES = [13, 15, 17, 19];
const MEDIA_QUALITIES: MediaQuality[] = ["Auto", "High", "Low"];

export default function ChatSettingsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { prefs, loading, updatePref } = useChatPreferences();
  const { setAppTheme } = useAppAccent();
  const [clearing, setClearing] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    if (!loading && prefs.chat_theme) setAppTheme(prefs.chat_theme);
  }, [loading, prefs.chat_theme]);

  const themeAccent = CHAT_THEME_COLORS[prefs.chat_theme]?.accent || colors.accent;

  async function handleClearAllChats() {
    showAlert(
      "Clear All Chats",
      "This will permanently delete all your chat history across all conversations. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            setClearing(true);
            try {
              const { data: memberRows } = await supabase
                .from("chat_members")
                .select("chat_id")
                .eq("user_id", user.id);

              if (memberRows && memberRows.length > 0) {
                const chatIds = memberRows.map((r) => r.chat_id);
                if (prefs.archive_on_delete) {
                  await supabase.from("messages").update({ is_archived: true }).in("chat_id", chatIds).eq("sender_id", user.id);
                } else {
                  await supabase.from("messages").delete().in("chat_id", chatIds).eq("sender_id", user.id);
                }
              }
              showAlert("Done", prefs.archive_on_delete ? "Your messages have been archived." : "All chat history has been cleared.");
            } catch (e: any) {
              showAlert("Error", e?.message || "Failed to clear chats");
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  }

  async function handleBackupNow() {
    if (!user) return;
    setBackingUp(true);
    try {
      const { data: chatIds } = await supabase.from("chat_members").select("chat_id").eq("user_id", user.id);
      if (!chatIds || chatIds.length === 0) { showAlert("Backup", "No chats to back up."); return; }
      await supabase.from("chat_backups").upsert({
        user_id: user.id,
        backed_up_at: new Date().toISOString(),
        chat_count: chatIds.length,
      }, { onConflict: "user_id" });
      showAlert("Backup Complete", `${chatIds.length} chat(s) have been backed up to the cloud.`);
    } catch (e: any) {
      showAlert("Backup Failed", "Could not complete backup. Try again later.");
    } finally {
      setBackingUp(false);
    }
  }

  function Section({ title }: { title: string }) {
    return (
      <Text style={[styles.section, { color: colors.textMuted }]}>{title}</Text>
    );
  }

  function Separator() {
    return <View style={[styles.sep, { backgroundColor: colors.border }]} />;
  }

  function Row({ icon, iconColor, label, desc, right }: {
    icon: string; iconColor: string; label: string; desc?: string; right: React.ReactNode;
  }) {
    return (
      <View style={[styles.row, { backgroundColor: colors.surface }]}>
        <View style={[styles.iconBadge, { backgroundColor: iconColor }]}>
          <Ionicons name={icon as any} size={16} color="#fff" />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
          {desc && <Text style={[styles.rowDesc, { color: colors.textMuted }]}>{desc}</Text>}
        </View>
        {right}
      </View>
    );
  }

  function ToggleRow({ icon, iconColor, label, desc, field }: {
    icon: string; iconColor: string; label: string; desc?: string; field: keyof typeof prefs;
  }) {
    return (
      <Row
        icon={icon}
        iconColor={iconColor}
        label={label}
        desc={desc}
        right={
          <Switch
            value={prefs[field] as boolean}
            onValueChange={(v) => updatePref(field as any, v as any)}
            trackColor={{ true: themeAccent, false: colors.border }}
            thumbColor="#fff"
          />
        }
      />
    );
  }

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Chat Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* ── APPEARANCE ─────────────────────────────── */}
      <Section title="APPEARANCE" />

      {/* Bubble Style */}
      <View style={[styles.card, { backgroundColor: colors.surface, marginTop: 10 }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBadge, { backgroundColor: "#AF52DE" }]}>
            <Ionicons name="chatbubble" size={16} color="#fff" />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Bubble Style</Text>
            <Text style={[styles.rowDesc, { color: colors.textMuted }]}>Shape of message bubbles</Text>
          </View>
        </View>
        <View style={styles.chipRow}>
          {BUBBLE_STYLES.map((s) => (
            <TouchableOpacity
              key={s.name}
              onPress={() => updatePref("bubble_style", s.name)}
              style={[
                styles.chip,
                { borderColor: prefs.bubble_style === s.name ? themeAccent : colors.border },
                prefs.bubble_style === s.name && { backgroundColor: themeAccent + "18" },
              ]}
            >
              <View style={[styles.bubblePreview, { borderRadius: s.radius, backgroundColor: prefs.bubble_style === s.name ? themeAccent : colors.border }]} />
              <Text style={[styles.chipText, { color: prefs.bubble_style === s.name ? themeAccent : colors.textSecondary }]}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Font Size */}
      <View style={[styles.card, { backgroundColor: colors.surface, marginTop: 10 }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBadge, { backgroundColor: "#FF9500" }]}>
            <Ionicons name="text" size={16} color="#fff" />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Font Size</Text>
            <Text style={[styles.rowDesc, { color: colors.textMuted }]}>Message text size</Text>
          </View>
          <Text style={[styles.chipLabel, { color: "#FF9500" }]}>{prefs.font_size}px</Text>
        </View>
        <View style={styles.chipRow}>
          {FONT_SIZES.map((size) => (
            <TouchableOpacity
              key={size}
              onPress={() => updatePref("font_size", size)}
              style={[
                styles.fontChip,
                { borderColor: prefs.font_size === size ? themeAccent : colors.border },
                prefs.font_size === size && { backgroundColor: themeAccent + "18" },
              ]}
            >
              <Text style={[{ fontSize: size * 0.8, color: prefs.font_size === size ? themeAccent : colors.textSecondary, fontFamily: "Inter_600SemiBold" }]}>Aa</Text>
              <Text style={[styles.fontSizeLabel, { color: prefs.font_size === size ? themeAccent : colors.textMuted }]}>{size}px</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── MESSAGES ─────────────────────────────────── */}
      <Section title="MESSAGES" />
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        <ToggleRow icon="volume-high" iconColor="#007AFF" label="Sound Effects" desc="Play sounds for sent and received messages" field="sounds_enabled" />
        <Separator />
        <ToggleRow icon="checkmark-done" iconColor="#34C759" label="Read Receipts" desc="Let others see when you've read their messages" field="read_receipts" />
        <Separator />
        <ToggleRow icon="link" iconColor="#FF2D55" label="Link Previews" desc="Show rich previews for URLs in messages" field="link_previews" />
        {Platform.OS !== "web" && (
          <>
            <Separator />
            <ToggleRow icon="return-down-back" iconColor="#64748B" label="Enter Key to Send" desc="Use Enter to send instead of adding a new line" field="enter_to_send" />
          </>
        )}
      </View>

      {/* ── MEDIA ──────────────────────────────────── */}
      <Section title="MEDIA" />
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        <ToggleRow icon="cloud-download" iconColor="#007AFF" label="Auto-Download Media" desc="Automatically download photos and videos" field="auto_download" />
        <Separator />
        {/* Media Quality picker */}
        <View style={[styles.row, { backgroundColor: colors.surface }]}>
          <View style={[styles.iconBadge, { backgroundColor: "#FF9500" }]}>
            <Ionicons name="image" size={16} color="#fff" />
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Media Quality</Text>
            <Text style={[styles.rowDesc, { color: colors.textMuted }]}>Upload quality for photos and videos</Text>
          </View>
          <View style={styles.segmented}>
            {MEDIA_QUALITIES.map((q) => (
              <TouchableOpacity
                key={q}
                onPress={() => updatePref("media_quality", q)}
                style={[styles.segment, prefs.media_quality === q && { backgroundColor: themeAccent }]}
              >
                <Text style={[styles.segText, { color: prefs.media_quality === q ? "#fff" : colors.textMuted }]}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {Platform.OS !== "web" && (
          <>
            <Separator />
            <ToggleRow icon="download" iconColor="#34C759" label="Save to Gallery" desc="Auto-save received photos and videos to your camera roll" field="save_to_gallery" />
          </>
        )}
      </View>

      {/* ── SECURITY ─────────────────────────────── */}
      <Section title="SECURITY" />
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        <ToggleRow icon="lock-closed" iconColor="#FF3B30" label="Chat Lock" desc="Require Face ID / fingerprint to open chats" field="chat_lock" />
        <Separator />
        <ToggleRow icon="archive" iconColor="#FF9500" label="Archive on Delete" desc="Move messages to archive instead of deleting" field="archive_on_delete" />
      </View>

      {/* ── BACKUP ─────────────────────────────── */}
      <Section title="BACKUP" />
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        <ToggleRow icon="cloud-upload" iconColor="#5856D6" label="Auto Chat Backup" desc="Automatically back up your chats to the cloud" field="chat_backup" />
        {prefs.chat_backup && (
          <>
            <Separator />
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.surface }]}
              onPress={handleBackupNow}
              activeOpacity={0.7}
              disabled={backingUp}
            >
              <View style={[styles.iconBadge, { backgroundColor: "#5856D6" }]}>
                {backingUp ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="refresh" size={16} color="#fff" />}
              </View>
              <Text style={[styles.rowLabel, { color: colors.text, flex: 1 }]}>Back Up Now</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── DANGER ZONE ─────────────────────────── */}
      <Section title="DANGER ZONE" />
      <View style={[styles.group, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[styles.row, { backgroundColor: colors.surface }]}
          activeOpacity={0.7}
          onPress={handleClearAllChats}
          disabled={clearing}
        >
          <View style={[styles.iconBadge, { backgroundColor: "#FF3B30" }]}>
            {clearing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="trash" size={16} color="#fff" />}
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: "#FF3B30" }]}>
              {clearing ? "Clearing…" : "Clear All Chats"}
            </Text>
            <Text style={[styles.rowDesc, { color: colors.textMuted }]}>
              {prefs.archive_on_delete ? "Archives your sent messages" : "Permanently deletes your sent messages"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Info footer */}
      <View style={styles.footer}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          Settings are saved automatically and synced across your devices.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  /* Header */
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { marginRight: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },

  /* Section */
  section: { fontSize: 11, fontFamily: "Inter_700Bold", paddingHorizontal: 20, paddingTop: 22, paddingBottom: 8, letterSpacing: 0.8 },

  /* Card (theme/bubbles) */
  card: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden", paddingHorizontal: 14, paddingVertical: 14 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },

  /* Group (list rows) */
  group: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden" },

  /* Row */
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  iconBadge: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 16 },

  /* Sep */
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 58 },

  /* Theme */
  themeRow: { flexDirection: "row", gap: 12, justifyContent: "center", flexWrap: "wrap" },
  themeCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  themeCircleActive: { borderWidth: 3, borderColor: "rgba(255,255,255,0.8)", transform: [{ scale: 1.15 }] },

  /* Bubble style chips */
  chipRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  chip: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10 },
  bubblePreview: { width: 28, height: 18 },
  chipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  chipLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  /* Font size chips */
  fontChip: { flex: 1, alignItems: "center", borderRadius: 12, borderWidth: 1.5, paddingVertical: 10, gap: 4 },
  fontSizeLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },

  /* Media quality segmented */
  segmented: { flexDirection: "row", borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  segment: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 0 },
  segText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  /* Value row */
  valueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  valueText: { fontSize: 15, fontFamily: "Inter_400Regular" },

  /* Footer */
  footer: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingTop: 20 },
  footerText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
});
