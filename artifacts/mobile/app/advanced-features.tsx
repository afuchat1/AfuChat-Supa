import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
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
import { useChatPreferences, type ChatTheme } from "@/context/ChatPreferencesContext";
import { useAppAccent } from "@/context/AppAccentContext";
import { useTier, TIER_COLORS, TIER_LABELS, type Tier } from "@/hooks/useTier";
import { ListRowSkeleton } from "@/components/ui/Skeleton";

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Constants ────────────────────────────────────────────────────────────────

const THEMES: { name: ChatTheme; hex: string }[] = [
  { name: "Teal",    hex: "#00BCD4" },
  { name: "Blue",    hex: "#007AFF" },
  { name: "Purple",  hex: "#AF52DE" },
  { name: "Rose",    hex: "#FF2D55" },
  { name: "Amber",   hex: "#FF9500" },
  { name: "Emerald", hex: "#34C759" },
];

const STATUS_OPTIONS: {
  value: ActivityStatus;
  label: string;
  color: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}[] = [
  { value: "online",    label: "Online",         color: "#34C759", icon: "radio-button-on" },
  { value: "busy",      label: "Busy",           color: "#FF3B30", icon: "ban-outline" },
  { value: "focus",     label: "Focus Mode",     color: "#FF9500", icon: "moon-outline" },
  { value: "last_seen", label: "Last Seen Only", color: "#8E8E93", icon: "eye-outline" },
  { value: "offline",   label: "Appear Offline", color: "#636366", icon: "ellipse-outline" },
];

const EXPORT_FORMATS = ["pdf", "txt", "json"] as const;

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = "look" | "presence" | "chat" | "power";
const TABS: { id: TabId; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { id: "look",     label: "Look",     icon: "color-palette-outline" },
  { id: "presence", label: "Presence", icon: "radio-button-on-outline" },
  { id: "chat",     label: "Chat",     icon: "chatbubble-outline" },
  { id: "power",    label: "Power",    icon: "flash-outline" },
];

// ─── Tiny shared components ───────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[af.sectionLabel, { color: colors.textMuted }]}>{label}</Text>
  );
}

function FloatCard({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[af.floatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  const color = TIER_COLORS[tier];
  return (
    <View style={[af.tierPill, { backgroundColor: color + "20", borderColor: color + "55" }]}>
      <Text style={[af.tierPillText, { color }]}>{TIER_LABELS[tier]}</Text>
    </View>
  );
}

function Sep() {
  const { colors } = useTheme();
  return <View style={[af.sep, { backgroundColor: colors.border }]} />;
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────

function ToggleRow({
  icon, iconBg, label, desc, value, onValueChange, requiredTier, last,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  requiredTier?: Tier;
  last?: boolean;
}) {
  const { colors, accent } = useTheme();
  const { hasTier } = useTier();
  const locked = requiredTier ? !hasTier(requiredTier) : false;

  function handlePress() {
    if (locked) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); router.push("/premium"); return; }
    Haptics.selectionAsync();
    onValueChange(!value);
  }

  return (
    <>
      <TouchableOpacity style={af.row} onPress={handlePress} activeOpacity={0.75}>
        <View style={[af.iconWrap, { backgroundColor: locked ? colors.backgroundTertiary : iconBg }]}>
          <Ionicons name={locked ? "lock-closed" : icon} size={17} color={locked ? colors.textMuted : "#fff"} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[af.rowLabel, { color: locked ? colors.textMuted : colors.text }]}>{label}</Text>
          {desc ? <Text style={[af.rowDesc, { color: colors.textMuted }]} numberOfLines={2}>{desc}</Text> : null}
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
      {!last && <Sep />}
    </>
  );
}

// ─── Select Row ───────────────────────────────────────────────────────────────

function SelectRow({
  icon, iconBg, label, desc, options, value, onSelect, requiredTier, last,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  label: string;
  desc?: string;
  options: readonly string[];
  value: string;
  onSelect: (v: string) => void;
  requiredTier?: Tier;
  last?: boolean;
}) {
  const { colors, accent } = useTheme();
  const { hasTier } = useTier();
  const locked = requiredTier ? !hasTier(requiredTier) : false;

  return (
    <>
      <View style={[af.row, { flexDirection: "column", alignItems: "flex-start", paddingBottom: 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, width: "100%" }}>
          <View style={[af.iconWrap, { backgroundColor: locked ? colors.backgroundTertiary : iconBg }]}>
            <Ionicons name={locked ? "lock-closed" : icon} size={17} color={locked ? colors.textMuted : "#fff"} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[af.rowLabel, { color: locked ? colors.textMuted : colors.text }]}>{label}</Text>
            {desc ? <Text style={[af.rowDesc, { color: colors.textMuted }]}>{desc}</Text> : null}
          </View>
          {locked && requiredTier && <TierBadge tier={requiredTier} />}
        </View>
        <View style={af.chipRow}>
          {options.map((opt) => {
            const active = value === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={[af.optChip, { borderColor: active ? accent : colors.border }, active && { backgroundColor: accent + "18" }]}
                onPress={() => {
                  if (locked) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); router.push("/premium"); return; }
                  Haptics.selectionAsync();
                  onSelect(opt);
                }}
              >
                <Text style={[af.optChipText, { color: active ? accent : colors.textMuted }]}>{opt.toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {!last && <Sep />}
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdvancedFeaturesScreen() {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const { features, loading: advLoading, setFeature } = useAdvancedFeatures();
  const { prefs, loading: prefsLoading, updatePref } = useChatPreferences();
  const { appTheme, setAppTheme } = useAppAccent();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("look");
  const pillX = useRef(new Animated.Value(0)).current;
  const tabW = (SCREEN_W - 32) / TABS.length;

  const loading = advLoading || prefsLoading;

  function switchTab(id: TabId) {
    const idx = TABS.findIndex((t) => t.id === id);
    Animated.spring(pillX, { toValue: idx * tabW, useNativeDriver: true, damping: 20, stiffness: 180 }).start();
    setActiveTab(id);
    Haptics.selectionAsync();
  }

  async function toggle<K extends keyof typeof features>(key: K, val: (typeof features)[K]) {
    setSaving(true); await setFeature(key, val); setSaving(false);
  }
  async function handleTypingToggle(v: boolean) {
    setSaving(true); await updatePref("typing_indicators", v); setSaving(false);
  }
  async function handleTheme(t: ChatTheme) {
    Haptics.selectionAsync(); setSaving(true);
    await updatePref("chat_theme", t);
    setAppTheme(t);
    setSaving(false);
  }
  async function handleStatus(s: ActivityStatus) {
    Haptics.selectionAsync(); setSaving(true);
    await setFeature("activity_status", s);
    setSaving(false);
  }

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === features.activity_status) ?? STATUS_OPTIONS[0];

  if (loading) {
    return (
      <View style={[af.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
        <View style={[af.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={af.headerBack}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[af.headerTitle, { color: colors.text }]}>Advanced Features</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ padding: 20, gap: 12 }}>
          {[1,2,3,4,5].map((i) => <ListRowSkeleton key={i} />)}
        </View>
      </View>
    );
  }

  return (
    <View style={[af.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={[af.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={af.headerBack}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[af.headerTitle, { color: colors.text }]}>Advanced Features</Text>
        <View style={af.headerRight}>
          {saving
            ? <ActivityIndicator size="small" color={accent} />
            : <View style={[af.saveDot, { backgroundColor: "#34C759" }]} />
          }
        </View>
      </View>

      {/* ── Animated pill tab bar ─────────────────────────────────────── */}
      <View style={[af.tabBarWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[af.tabBar, { backgroundColor: colors.backgroundSecondary }]}>
          <Animated.View
            style={[af.tabPill, { width: tabW - 6, backgroundColor: accent, transform: [{ translateX: Animated.add(pillX, new Animated.Value(3)) }] }]}
          />
          {TABS.map((tab, idx) => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[af.tab, { width: tabW }]}
                onPress={() => switchTab(tab.id)}
                activeOpacity={0.75}
              >
                <Ionicons name={tab.icon} size={14} color={active ? "#fff" : colors.textMuted} />
                <Text style={[af.tabLabel, { color: active ? "#fff" : colors.textMuted }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Tab content ──────────────────────────────────────────────── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[af.scroll, { paddingBottom: insets.bottom + 48 }]}
        key={activeTab}
      >

        {/* ── LOOK ─────────────────────────────────────────────────────── */}
        {activeTab === "look" && (
          <>
            <SectionLabel label="APP COLOUR" />
            <FloatCard>
              <View style={af.row}>
                <View style={[af.iconWrap, { backgroundColor: accent }]}>
                  <Ionicons name="color-palette" size={17} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[af.rowLabel, { color: colors.text }]}>App Colour</Text>
                  <Text style={[af.rowDesc, { color: colors.textMuted }]}>Changes tabs, buttons, and chat bubbles</Text>
                </View>
                <Text style={[af.rowValue, { color: accent }]}>{appTheme}</Text>
              </View>
              <Sep />
              <View style={af.colourRow}>
                {THEMES.map((t) => (
                  <TouchableOpacity
                    key={t.name}
                    onPress={() => handleTheme(t.name)}
                    style={[af.colourCircle, { backgroundColor: t.hex }, appTheme === t.name && af.colourActive]}
                    activeOpacity={0.8}
                  >
                    {appTheme === t.name && <Ionicons name="checkmark" size={18} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
            </FloatCard>
          </>
        )}

        {/* ── PRESENCE ─────────────────────────────────────────────────── */}
        {activeTab === "presence" && (
          <>
            <SectionLabel label="ACTIVITY STATUS" />
            <FloatCard>
              <View style={af.row}>
                <View style={[af.iconWrap, { backgroundColor: currentStatus.color }]}>
                  <Ionicons name={currentStatus.icon} size={17} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[af.rowLabel, { color: colors.text }]}>Current: {currentStatus.label}</Text>
                  <Text style={[af.rowDesc, { color: colors.textMuted }]}>What others see about your availability</Text>
                </View>
              </View>
              <Sep />
              <View style={af.statusGrid}>
                {STATUS_OPTIONS.map((s) => {
                  const active = features.activity_status === s.value;
                  return (
                    <TouchableOpacity
                      key={s.value}
                      onPress={() => handleStatus(s.value)}
                      style={[af.statusChip, { borderColor: active ? s.color : colors.border, backgroundColor: active ? s.color + "18" : "transparent" }]}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={s.icon} size={14} color={active ? s.color : colors.textMuted} />
                      <Text style={[af.statusLabel, { color: active ? s.color : colors.textMuted }]}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </FloatCard>

            <SectionLabel label="FOCUS & VISIBILITY" />
            <FloatCard>
              <ToggleRow icon="moon" iconBg="#FF9500" label="Focus Mode" desc="Sets your status to Do Not Disturb and hides your online indicator" value={features.focus_mode} onValueChange={(v) => toggle("focus_mode", v)} />
              <ToggleRow icon="time-outline" iconBg="#5856D6" label="Scheduled Focus Mode" desc="Automatically enable Focus Mode on a timed schedule" value={features.focus_mode_schedule} onValueChange={(v) => toggle("focus_mode_schedule", v)} requiredTier="gold" />
              <ToggleRow icon="person-circle-outline" iconBg="#00BCD4" label="Mini Profile Popup" desc="Show a quick profile card when you tap on a username" value={features.mini_profile_popup} onValueChange={(v) => toggle("mini_profile_popup", v)} last />
            </FloatCard>
          </>
        )}

        {/* ── CHAT ─────────────────────────────────────────────────────── */}
        {activeTab === "chat" && (
          <>
            <SectionLabel label="MESSAGING" />
            <FloatCard>
              <ToggleRow icon="ellipsis-horizontal" iconBg="#5856D6" label="Typing Indicators" desc="Show when others are composing a message" value={prefs.typing_indicators} onValueChange={handleTypingToggle} />
              <ToggleRow icon="document-text-outline" iconBg="#34C759" label="Offline Drafts" desc="Save half-typed messages and restore them when you return" value={features.offline_drafts} onValueChange={(v) => toggle("offline_drafts", v)} />
              <ToggleRow icon="create-outline" iconBg="#007AFF" label="Message Edit History" desc="Allow others to see when and how you've edited a message" value={features.message_edit_history} onValueChange={(v) => toggle("message_edit_history", v)} />
              <ToggleRow icon="at-outline" iconBg="#FF9500" label="User Tagging" desc="Enable @mentions to notify specific people in chats" value={features.user_tagging} onValueChange={(v) => toggle("user_tagging", v)} />
              <ToggleRow icon="happy-outline" iconBg="#FF2D55" label="Advanced Emoji Reactions" desc="Access extended and trending emoji reactions on messages" value={features.emoji_reactions_advanced} onValueChange={(v) => toggle("emoji_reactions_advanced", v)} />
              <ToggleRow icon="alarm-outline" iconBg="#34C759" label="Message Reminders" desc="Set a reminder to follow up on any message" value={features.message_reminders} onValueChange={(v) => toggle("message_reminders", v)} />
              <ToggleRow icon="share-social-outline" iconBg="#AF52DE" label="Chat to Post" desc="Share a message to your public feed as a post" value={features.chat_to_post} onValueChange={(v) => toggle("chat_to_post", v)} last />
            </FloatCard>

            <SectionLabel label="CHAT MANAGEMENT" />
            <FloatCard>
              <ToggleRow icon="folder-outline" iconBg="#FF9500" label="Chat Folders" desc="Organise your chats into custom folders" value={features.chat_folders} onValueChange={(v) => toggle("chat_folders", v)} requiredTier="silver" />
              <ToggleRow icon="timer-outline" iconBg="#FF3B30" label="Temporary Chat Mode" desc="Messages auto-delete after a set time for private conversations" value={features.temp_chat_enabled} onValueChange={(v) => toggle("temp_chat_enabled", v)} requiredTier="silver" />
              <ToggleRow icon="chatbubble-ellipses-outline" iconBg="#5856D6" label="Auto-Reply" desc="Send automatic responses when you're unavailable" value={features.auto_reply_enabled} onValueChange={(v) => toggle("auto_reply_enabled", v)} requiredTier="silver" />
              <ToggleRow icon="filter-outline" iconBg="#8E8E93" label="Content Filter" desc="Filter out topics or keywords from your chat feed" value={features.content_filter_topics} onValueChange={(v) => toggle("content_filter_topics", v)} requiredTier="gold" />
              <ToggleRow icon="people-outline" iconBg="#AF52DE" label="Group Roles System" desc="Assign roles and permissions to members within your groups" value={features.group_roles_system} onValueChange={(v) => toggle("group_roles_system", v)} requiredTier="gold" />
              <ToggleRow icon="videocam-outline" iconBg="#FF3B30" label="Screen Share in Chat" desc="Share your screen during a video call (web)" value={features.screen_share} onValueChange={(v) => toggle("screen_share", v)} requiredTier="gold" />
              <SelectRow icon="download-outline" iconBg="#007AFF" label="Chat Export Format" desc="Choose the file format when exporting a chat" options={EXPORT_FORMATS} value={features.chat_export_format} onSelect={(v) => toggle("chat_export_format" as any, v as any)} requiredTier="gold" last />
            </FloatCard>
          </>
        )}

        {/* ── POWER ────────────────────────────────────────────────────── */}
        {activeTab === "power" && (
          <>
            <SectionLabel label="INTERFACE" />
            <FloatCard>
              <ToggleRow icon="flash-outline" iconBg="#FF9500" label="Quick Action Menu" desc="Long-press a message to access actions instantly" value={features.quick_action_menu} onValueChange={(v) => toggle("quick_action_menu", v)} />
              <ToggleRow icon="open-outline" iconBg="#007AFF" label="In-App Browser" desc="Open links inside AfuChat without switching apps" value={features.in_app_browser} onValueChange={(v) => toggle("in_app_browser", v)} />
              <ToggleRow icon="link-outline" iconBg="#00BCD4" label="Interactive Link Previews" desc="Show rich previews for links shared in chats" value={features.interactive_link_preview} onValueChange={(v) => toggle("interactive_link_preview", v)} />
              <ToggleRow icon="images-outline" iconBg="#34C759" label="Auto Media Organisation" desc="Automatically group shared files, photos, and videos" value={features.auto_media_organization} onValueChange={(v) => toggle("auto_media_organization", v)} />
              <ToggleRow icon="cloud-upload-outline" iconBg="#5856D6" label="Drag & Drop Upload" desc="Drop files directly into a chat to send them (web)" value={features.drag_drop_upload} onValueChange={(v) => toggle("drag_drop_upload", v)} />
              <ToggleRow icon="tablet-landscape-outline" iconBg="#8E8E93" label="Split Screen Mode" desc="View two chats side by side on wide screens" value={features.split_screen_mode} onValueChange={(v) => toggle("split_screen_mode", v)} requiredTier="gold" />
              <ToggleRow icon="sync-outline" iconBg="#007AFF" label="Cross-Device Sync" desc="Sync read status, drafts, and preferences across all your devices" value={features.cross_device_sync} onValueChange={(v) => toggle("cross_device_sync", v)} requiredTier="gold" last />
            </FloatCard>

            <SectionLabel label="NOTIFICATIONS" />
            <FloatCard>
              <ToggleRow icon="notifications-outline" iconBg="#FF3B30" label="Smart Notifications" desc="Let AI prioritise and filter your notifications by importance" value={features.smart_notifications} onValueChange={(v) => toggle("smart_notifications", v)} />
              <ToggleRow icon="megaphone-outline" iconBg="#FF9500" label="Keyword Alerts" desc="Get notified when specific words are mentioned in your chats" value={features.keyword_alerts} onValueChange={(v) => toggle("keyword_alerts", v)} requiredTier="gold" last />
            </FloatCard>

            <SectionLabel label="AI TOOLS" />
            <FloatCard>
              <ToggleRow icon="language-outline" iconBg="#007AFF" label="Message Translation" desc="Translate incoming messages to your preferred language using AI" value={features.message_translation} onValueChange={(v) => toggle("message_translation", v)} requiredTier="silver" />
              <ToggleRow icon="mic-outline" iconBg="#AF52DE" label="Voice to Text" desc="Transcribe voice messages to text automatically" value={features.voice_to_text} onValueChange={(v) => toggle("voice_to_text", v)} requiredTier="silver" />
              <ToggleRow icon="volume-high-outline" iconBg="#5856D6" label="Text to Speech" desc="Have messages read aloud to you by AI" value={features.text_to_speech} onValueChange={(v) => toggle("text_to_speech", v)} requiredTier="silver" />
              <ToggleRow icon="document-outline" iconBg="#34C759" label="Chat Summary" desc="Generate an AI summary of long conversations" value={features.chat_summary} onValueChange={(v) => toggle("chat_summary", v)} requiredTier="gold" last />
            </FloatCard>
          </>
        )}

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const af = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  headerBack: { padding: 6 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Inter_700Bold" },
  headerRight: { width: 40, alignItems: "center" },
  saveDot: { width: 7, height: 7, borderRadius: 3.5 },

  tabBarWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  tabBar: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 3,
    position: "relative",
    overflow: "hidden",
  },
  tabPill: {
    position: "absolute",
    top: 3,
    bottom: 3,
    borderRadius: 11,
    zIndex: 0,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    zIndex: 1,
  },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.7,
    marginTop: 6,
    marginBottom: 2,
    marginLeft: 2,
  },

  floatCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
  rowValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  sep: { height: StyleSheet.hairlineWidth, marginLeft: 62 },

  tierPill: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tierPillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  colourRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "center",
  },
  colourCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  colourActive: {
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },

  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 14,
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
  statusLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  optChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5 },
  optChipText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
});
