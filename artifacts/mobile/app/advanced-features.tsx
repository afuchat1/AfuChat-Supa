import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "@/lib/haptics";
import { useTheme } from "@/hooks/useTheme";
import { useAdvancedFeatures, type ActivityStatus } from "@/context/AdvancedFeaturesContext";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { useChatPreferences, CHAT_THEME_COLORS, type ChatTheme } from "@/context/ChatPreferencesContext";
import { useAppAccent } from "@/context/AppAccentContext";
import { useTier, TIER_COLORS, TIER_LABELS, type Tier } from "@/hooks/useTier";
import { ListRowSkeleton } from "@/components/ui/Skeleton";

const THEMES: { name: ChatTheme; hex: string }[] = [
  { name: "Teal",    hex: "#00BCD4" },
  { name: "Blue",    hex: "#007AFF" },
  { name: "Purple",  hex: "#AF52DE" },
  { name: "Rose",    hex: "#FF2D55" },
  { name: "Amber",   hex: "#FF9500" },
  { name: "Emerald", hex: "#34C759" },
];

const STATUS_OPTIONS: { value: ActivityStatus; label: string; color: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { value: "online",    label: "Online",         color: "#34C759", icon: "radio-button-on" },
  { value: "busy",      label: "Busy",           color: "#FF3B30", icon: "ban-outline" },
  { value: "focus",     label: "Focus Mode",     color: "#FF9500", icon: "moon-outline" },
  { value: "last_seen", label: "Last Seen Only", color: "#8E8E93", icon: "eye-outline" },
  { value: "offline",   label: "Appear Offline", color: "#636366", icon: "ellipse-outline" },
];

const EXPORT_FORMATS = ["pdf", "txt", "json"] as const;

function SectionHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>;
}

function Card({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface }]}>{children}</View>;
}

function TierBadge({ tier }: { tier: Tier }) {
  const color = TIER_COLORS[tier];
  return (
    <View style={[styles.tierBadge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
      <Text style={[styles.tierBadgeText, { color }]}>{TIER_LABELS[tier]}</Text>
    </View>
  );
}

function ToggleRow({
  icon, iconBg, label, desc, value, onValueChange, requiredTier, lastInCard,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  requiredTier?: Tier;
  lastInCard?: boolean;
}) {
  const { colors, accent } = useTheme();
  const { hasTier } = useTier();
  const locked = requiredTier ? !hasTier(requiredTier) : false;

  function handlePress() {
    if (locked) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push("/premium");
      return;
    }
    Haptics.selectionAsync();
    onValueChange(!value);
  }

  return (
    <TouchableOpacity
      style={[styles.row, !lastInCard && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, { backgroundColor: locked ? colors.backgroundTertiary : iconBg }]}>
        <Ionicons name={locked ? "lock-closed" : icon} size={17} color={locked ? colors.textMuted : "#fff"} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: locked ? colors.textMuted : colors.text }]}>{label}</Text>
        {desc && <Text style={[styles.rowDesc, { color: colors.textMuted }]} numberOfLines={2}>{desc}</Text>}
      </View>
      {locked && requiredTier ? (
        <TierBadge tier={requiredTier} />
      ) : (
        <Switch
          value={value}
          onValueChange={(v) => { Haptics.selectionAsync(); onValueChange(v); }}
          trackColor={{ true: accent, false: colors.backgroundTertiary }}
          thumbColor="#fff"
          disabled={locked}
        />
      )}
    </TouchableOpacity>
  );
}

function SelectRow({
  icon, iconBg, label, desc, options, value, onSelect, requiredTier, lastInCard,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  label: string;
  desc?: string;
  options: readonly string[];
  value: string;
  onSelect: (v: string) => void;
  requiredTier?: Tier;
  lastInCard?: boolean;
}) {
  const { colors, accent } = useTheme();
  const { hasTier } = useTier();
  const locked = requiredTier ? !hasTier(requiredTier) : false;

  return (
    <View style={[styles.row, { flexDirection: "column", alignItems: "flex-start", gap: 10, paddingBottom: 14 }, !lastInCard && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, width: "100%" }}>
        <View style={[styles.iconWrap, { backgroundColor: locked ? colors.backgroundTertiary : iconBg }]}>
          <Ionicons name={locked ? "lock-closed" : icon} size={17} color={locked ? colors.textMuted : "#fff"} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { color: locked ? colors.textMuted : colors.text }]}>{label}</Text>
          {desc && <Text style={[styles.rowDesc, { color: colors.textMuted }]}>{desc}</Text>}
        </View>
        {locked && requiredTier && <TierBadge tier={requiredTier} />}
      </View>
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const active = value === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, { borderColor: active ? accent : colors.border }, active && { backgroundColor: accent + "1A" }]}
              onPress={() => {
                if (locked) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); router.push("/premium"); return; }
                Haptics.selectionAsync();
                onSelect(opt);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, { color: active ? accent : colors.textMuted }]}>{opt.toUpperCase()}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function AdvancedFeaturesScreen() {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const { features, loading: advLoading, setFeature } = useAdvancedFeatures();
  const { prefs, loading: prefsLoading, updatePref } = useChatPreferences();
  const { appTheme, setAppTheme } = useAppAccent();
  const [saving, setSaving] = useState(false);

  const loading = advLoading || prefsLoading;
  const currentStatus = STATUS_OPTIONS.find((s) => s.value === features.activity_status) ?? STATUS_OPTIONS[0];
  const themeAccent = CHAT_THEME_COLORS[appTheme]?.accent || accent;

  async function toggle<K extends keyof typeof features>(key: K, val: (typeof features)[K]) {
    setSaving(true);
    await setFeature(key, val);
    setSaving(false);
  }

  async function handleTypingToggle(v: boolean) {
    setSaving(true);
    await updatePref("typing_indicators", v);
    setSaving(false);
  }

  async function handleTheme(t: ChatTheme) {
    Haptics.selectionAsync();
    setSaving(true);
    await updatePref("chat_theme", t);
    setAppTheme(t);
    setSaving(false);
  }

  async function handleStatus(s: ActivityStatus) {
    Haptics.selectionAsync();
    setSaving(true);
    await setFeature("activity_status", s);
    setSaving(false);
  }

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={{ padding: 16, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Advanced Features" right={saving ? <ActivityIndicator size="small" color={accent} /> : undefined} />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── BRANDING ───────────────────────────────── */}
        <SectionHeader title="BRANDING" />
        <Card>
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: themeAccent }]}>
              <Ionicons name="color-palette" size={17} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>App Colour</Text>
              <Text style={[styles.rowDesc, { color: colors.textMuted }]}>Changes tabs, buttons, and chat bubbles</Text>
            </View>
            <Text style={[styles.chipLabel, { color: themeAccent }]}>{appTheme}</Text>
          </View>
          <View style={styles.colourRow}>
            {THEMES.map((t) => (
              <TouchableOpacity
                key={t.name}
                onPress={() => handleTheme(t.name)}
                style={[styles.colourCircle, { backgroundColor: t.hex }, appTheme === t.name && styles.colourCircleActive]}
                activeOpacity={0.8}
              >
                {appTheme === t.name && <Ionicons name="checkmark" size={18} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* ── PRESENCE ──────────────────────────────── */}
        <SectionHeader title="PRESENCE" />
        <Card>
          <View style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <View style={[styles.iconWrap, { backgroundColor: currentStatus.color }]}>
              <Ionicons name={currentStatus.icon} size={17} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Activity Status</Text>
              <Text style={[styles.rowDesc, { color: colors.textMuted }]}>What others see about your availability</Text>
            </View>
          </View>
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map((s) => {
              const active = features.activity_status === s.value;
              return (
                <TouchableOpacity
                  key={s.value}
                  onPress={() => handleStatus(s.value)}
                  style={[styles.statusChip, { borderColor: active ? s.color : colors.border }, active && { backgroundColor: s.color + "1A" }]}
                  activeOpacity={0.7}
                >
                  <Ionicons name={s.icon} size={14} color={active ? s.color : colors.textMuted} />
                  <Text style={[styles.statusLabel, { color: active ? s.color : colors.textMuted }]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        <View style={{ marginTop: 10 }}>
          <Card>
            <ToggleRow
              icon="moon"
              iconBg="#FF9500"
              label="Focus Mode"
              desc="Sets your status to Do Not Disturb and hides your online indicator"
              value={features.focus_mode}
              onValueChange={(v) => toggle("focus_mode", v)}
            />
            <ToggleRow
              icon="time-outline"
              iconBg="#5856D6"
              label="Scheduled Focus Mode"
              desc="Automatically enable Focus Mode on a timed schedule"
              value={features.focus_mode_schedule}
              onValueChange={(v) => toggle("focus_mode_schedule", v)}
              requiredTier="gold"
            />
            <ToggleRow
              icon="person-circle-outline"
              iconBg="#00BCD4"
              label="Mini Profile Popup"
              desc="Show a quick profile card when you tap on a username"
              value={features.mini_profile_popup}
              onValueChange={(v) => toggle("mini_profile_popup", v)}
              lastInCard
            />
          </Card>
        </View>

        {/* ── MESSAGING ─────────────────────────────── */}
        <SectionHeader title="MESSAGING" />
        <Card>
          <ToggleRow
            icon="ellipsis-horizontal"
            iconBg="#5856D6"
            label="Typing Indicators"
            desc="Show when others are composing a message"
            value={prefs.typing_indicators}
            onValueChange={handleTypingToggle}
          />
          <ToggleRow
            icon="document-text-outline"
            iconBg="#34C759"
            label="Offline Drafts"
            desc="Save half-typed messages and restore them when you return"
            value={features.offline_drafts}
            onValueChange={(v) => toggle("offline_drafts", v)}
          />
          <ToggleRow
            icon="create-outline"
            iconBg="#007AFF"
            label="Message Edit History"
            desc="Allow others to see when and how you've edited a message"
            value={features.message_edit_history}
            onValueChange={(v) => toggle("message_edit_history", v)}
          />
          <ToggleRow
            icon="at-outline"
            iconBg="#FF9500"
            label="User Tagging"
            desc="Enable @mentions to notify specific people in chats"
            value={features.user_tagging}
            onValueChange={(v) => toggle("user_tagging", v)}
          />
          <ToggleRow
            icon="happy-outline"
            iconBg="#FF2D55"
            label="Advanced Emoji Reactions"
            desc="Access extended and trending emoji reactions on messages"
            value={features.emoji_reactions_advanced}
            onValueChange={(v) => toggle("emoji_reactions_advanced", v)}
          />
          <ToggleRow
            icon="alarm-outline"
            iconBg="#34C759"
            label="Message Reminders"
            desc="Set a reminder to follow up on any message"
            value={features.message_reminders}
            onValueChange={(v) => toggle("message_reminders", v)}
          />
          <ToggleRow
            icon="share-social-outline"
            iconBg="#AF52DE"
            label="Chat to Post"
            desc="Share a message to your public feed as a post"
            value={features.chat_to_post}
            onValueChange={(v) => toggle("chat_to_post", v)}
            lastInCard
          />
        </Card>

        {/* ── INTERFACE ─────────────────────────────── */}
        <SectionHeader title="INTERFACE" />
        <Card>
          <ToggleRow
            icon="flash-outline"
            iconBg="#FF9500"
            label="Quick Action Menu"
            desc="Long-press a message to access actions instantly"
            value={features.quick_action_menu}
            onValueChange={(v) => toggle("quick_action_menu", v)}
          />
          <ToggleRow
            icon="open-outline"
            iconBg="#007AFF"
            label="In-App Browser"
            desc="Open links inside AfuChat without switching apps"
            value={features.in_app_browser}
            onValueChange={(v) => toggle("in_app_browser", v)}
          />
          <ToggleRow
            icon="link-outline"
            iconBg="#00BCD4"
            label="Interactive Link Previews"
            desc="Show rich previews for links shared in chats"
            value={features.interactive_link_preview}
            onValueChange={(v) => toggle("interactive_link_preview", v)}
          />
          <ToggleRow
            icon="images-outline"
            iconBg="#34C759"
            label="Auto Media Organisation"
            desc="Automatically group shared files, photos, and videos"
            value={features.auto_media_organization}
            onValueChange={(v) => toggle("auto_media_organization", v)}
          />
          <ToggleRow
            icon="cloud-upload-outline"
            iconBg="#5856D6"
            label="Drag & Drop Upload"
            desc="Drop files directly into a chat to send them (web)"
            value={features.drag_drop_upload}
            onValueChange={(v) => toggle("drag_drop_upload", v)}
          />
          <ToggleRow
            icon="tablet-landscape-outline"
            iconBg="#8E8E93"
            label="Split Screen Mode"
            desc="View two chats side by side on wide screens"
            value={features.split_screen_mode}
            onValueChange={(v) => toggle("split_screen_mode", v)}
            requiredTier="gold"
          />
          <ToggleRow
            icon="sync-outline"
            iconBg="#007AFF"
            label="Cross-Device Sync"
            desc="Sync read status, drafts, and preferences across all your devices"
            value={features.cross_device_sync}
            onValueChange={(v) => toggle("cross_device_sync", v)}
            requiredTier="gold"
            lastInCard
          />
        </Card>

        {/* ── NOTIFICATIONS ─────────────────────────── */}
        <SectionHeader title="NOTIFICATIONS" />
        <Card>
          <ToggleRow
            icon="notifications-outline"
            iconBg="#FF3B30"
            label="Smart Notifications"
            desc="Let AI prioritise and filter your notifications by importance"
            value={features.smart_notifications}
            onValueChange={(v) => toggle("smart_notifications", v)}
          />
          <ToggleRow
            icon="megaphone-outline"
            iconBg="#FF9500"
            label="Keyword Alerts"
            desc="Get notified when specific words are mentioned in your chats"
            value={features.keyword_alerts}
            onValueChange={(v) => toggle("keyword_alerts", v)}
            requiredTier="gold"
            lastInCard
          />
        </Card>

        {/* ── AI TOOLS ──────────────────────────────── */}
        <SectionHeader title="AI TOOLS" />
        <Card>
          <ToggleRow
            icon="language-outline"
            iconBg="#007AFF"
            label="Message Translation"
            desc="Translate incoming messages to your preferred language using AI"
            value={features.message_translation}
            onValueChange={(v) => toggle("message_translation", v)}
            requiredTier="silver"
          />
          <ToggleRow
            icon="mic-outline"
            iconBg="#AF52DE"
            label="Voice to Text"
            desc="Transcribe voice messages to text automatically"
            value={features.voice_to_text}
            onValueChange={(v) => toggle("voice_to_text", v)}
            requiredTier="silver"
          />
          <ToggleRow
            icon="volume-high-outline"
            iconBg="#5856D6"
            label="Text to Speech"
            desc="Have messages read aloud to you by AI"
            value={features.text_to_speech}
            onValueChange={(v) => toggle("text_to_speech", v)}
            requiredTier="silver"
          />
          <ToggleRow
            icon="document-outline"
            iconBg="#34C759"
            label="Chat Summary"
            desc="Generate an AI summary of long conversations"
            value={features.chat_summary}
            onValueChange={(v) => toggle("chat_summary", v)}
            requiredTier="gold"
            lastInCard
          />
        </Card>

        {/* ── CHAT MANAGEMENT ───────────────────────── */}
        <SectionHeader title="CHAT MANAGEMENT" />
        <Card>
          <ToggleRow
            icon="folder-outline"
            iconBg="#FF9500"
            label="Chat Folders"
            desc="Organise your chats into custom folders"
            value={features.chat_folders}
            onValueChange={(v) => toggle("chat_folders", v)}
            requiredTier="silver"
          />
          <ToggleRow
            icon="timer-outline"
            iconBg="#FF3B30"
            label="Temporary Chat Mode"
            desc="Messages auto-delete after a set time for private conversations"
            value={features.temp_chat_enabled}
            onValueChange={(v) => toggle("temp_chat_enabled", v)}
            requiredTier="silver"
          />
          <ToggleRow
            icon="chatbubble-ellipses-outline"
            iconBg="#5856D6"
            label="Auto-Reply"
            desc="Send automatic responses when you're unavailable"
            value={features.auto_reply_enabled}
            onValueChange={(v) => toggle("auto_reply_enabled", v)}
            requiredTier="silver"
          />
          <ToggleRow
            icon="filter-outline"
            iconBg="#8E8E93"
            label="Content Filter"
            desc="Filter out topics or keywords from your chat feed"
            value={features.content_filter_topics}
            onValueChange={(v) => toggle("content_filter_topics", v)}
            requiredTier="gold"
          />
          <ToggleRow
            icon="people-outline"
            iconBg="#AF52DE"
            label="Group Roles System"
            desc="Assign roles and permissions to members within your groups"
            value={features.group_roles_system}
            onValueChange={(v) => toggle("group_roles_system", v)}
            requiredTier="gold"
          />
          <ToggleRow
            icon="videocam-outline"
            iconBg="#FF3B30"
            label="Screen Share in Chat"
            desc="Share your screen during a video call directly in a chat (web)"
            value={features.screen_share}
            onValueChange={(v) => toggle("screen_share", v)}
            requiredTier="gold"
          />
          <SelectRow
            icon="download-outline"
            iconBg="#007AFF"
            label="Chat Export Format"
            desc="Choose the file format when exporting a chat"
            options={EXPORT_FORMATS}
            value={features.chat_export_format}
            onSelect={(v) => toggle("chat_export_format" as any, v as any)}
            requiredTier="gold"
            lastInCard
          />
        </Card>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 44, alignItems: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  body: { paddingTop: 24, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 24,
    paddingLeft: 4,
  },
  card: {
    borderRadius: 14,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  chipLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  colourRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 4,
  },
  colourCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  colourCircleActive: {
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  statusLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  tierBadge: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  tierBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingLeft: 58,
    flexWrap: "wrap",
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
