import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

const TIER_ORDER: Record<string, number> = { free: 0, silver: 1, gold: 2, platinum: 3 };
const TIER_COLORS: Record<string, string> = { silver: "#8E9BAD", gold: "#F5A623", platinum: "#BF5AF2" };
const TIER_LABELS: Record<string, string> = { silver: "Silver", gold: "Gold", platinum: "Platinum" };

type FeatureSettings = {
  // Chat intelligence
  message_translation: boolean;
  translation_language: string;
  voice_to_text: boolean;
  text_to_speech: boolean;
  chat_summary: boolean;
  smart_notifications: boolean;
  // Chat behavior
  chat_folders: boolean;
  offline_drafts: boolean;
  temp_chat_default_minutes: number;
  temp_chat_enabled: boolean;
  auto_reply_enabled: boolean;
  auto_reply_message: string;
  focus_mode: boolean;
  focus_mode_schedule: boolean;
  // Profile & presence
  activity_status: "online" | "busy" | "focus" | "offline" | "last_seen";
  mini_profile_popup: boolean;
  show_typing_indicator: boolean;
  // Content & media
  interactive_link_preview: boolean;
  link_to_mini_app: boolean;
  auto_media_organization: boolean;
  emoji_reactions_advanced: boolean;
  content_filter_topics: boolean;
  content_filter_keywords: string;
  // Productivity
  message_reminders: boolean;
  keyword_alerts: boolean;
  keyword_alerts_list: string;
  chat_to_post: boolean;
  chat_export_format: "pdf" | "txt" | "json";
  // Advanced
  quick_action_menu: boolean;
  split_screen_mode: boolean;
  cross_device_sync: boolean;
  group_roles_system: boolean;
  screen_share: boolean;
  drag_drop_upload: boolean;
  user_tagging: boolean;
  message_edit_history: boolean;
  in_app_browser: boolean;
};

const defaults: FeatureSettings = {
  message_translation: false, translation_language: "en",
  voice_to_text: false, text_to_speech: false, chat_summary: false, smart_notifications: true,
  chat_folders: false, offline_drafts: true,
  temp_chat_default_minutes: 60, temp_chat_enabled: false,
  auto_reply_enabled: false, auto_reply_message: "I'm currently unavailable. I'll reply soon!",
  focus_mode: false, focus_mode_schedule: false,
  activity_status: "online", mini_profile_popup: true, show_typing_indicator: true,
  interactive_link_preview: true, link_to_mini_app: false,
  auto_media_organization: true, emoji_reactions_advanced: true,
  content_filter_topics: false, content_filter_keywords: "",
  message_reminders: true, keyword_alerts: false, keyword_alerts_list: "",
  chat_to_post: true,
  chat_export_format: "pdf",
  quick_action_menu: true, split_screen_mode: false,
  cross_device_sync: true, group_roles_system: false,
  screen_share: false, drag_drop_upload: true,
  user_tagging: true, message_edit_history: true, in_app_browser: true,
};

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" }, { code: "zh", label: "Chinese" },
  { code: "es", label: "Spanish" }, { code: "fr", label: "French" },
  { code: "ar", label: "Arabic" }, { code: "hi", label: "Hindi" },
  { code: "pt", label: "Portuguese" }, { code: "ru", label: "Russian" },
  { code: "ja", label: "Japanese" }, { code: "de", label: "German" },
];

const STATUS_OPTIONS: { value: FeatureSettings["activity_status"]; label: string; emoji: string; color: string }[] = [
  { value: "online", label: "Online", emoji: "🟢", color: "#34C759" },
  { value: "busy", label: "Busy", emoji: "🔴", color: "#FF3B30" },
  { value: "focus", label: "Focus Mode", emoji: "🎯", color: "#FF9500" },
  { value: "last_seen", label: "Last Seen Only", emoji: "👁️", color: "#8E9BAD" },
  { value: "offline", label: "Appear Offline", emoji: "⚫", color: "#636366" },
];

type Section = { title: string; subtitle: string; icon: string; color: string; key: string };

const SECTIONS: Section[] = [
  { key: "ai", title: "AI Features", subtitle: "Translation, summaries, smart notifications", icon: "sparkles", color: "#BF5AF2" },
  { key: "chat", title: "Chat Behavior", subtitle: "Folders, drafts, auto-reply, focus mode", icon: "chatbubbles", color: "#007AFF" },
  { key: "presence", title: "Activity & Presence", subtitle: "Status, profile popup, typing indicators", icon: "radio-button-on", color: "#34C759" },
  { key: "content", title: "Content & Media", subtitle: "Link previews, reactions, feed filters", icon: "images", color: "#FF9500" },
  { key: "productivity", title: "Productivity", subtitle: "Reminders, keyword alerts, chat export", icon: "briefcase", color: "#00BCD4" },
  { key: "advanced", title: "Advanced", subtitle: "Split screen, tagging, edit history", icon: "construct", color: "#FF3B30" },
];

export default function AdvancedFeaturesScreen() {
  const { colors } = useTheme();
  const { user, subscription, isPremium } = useAuth();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<FeatureSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>("ai");
  const [showAutoReplyEditor, setShowAutoReplyEditor] = useState(false);
  const [showKeywordEditor, setShowKeywordEditor] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [tempAutoReply, setTempAutoReply] = useState("");
  const [tempKeywords, setTempKeywords] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("advanced_feature_settings").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) setPrefs({ ...defaults, ...data });
      setLoading(false);
    });
  }, [user]);

  async function setPref<K extends keyof FeatureSettings>(key: K, value: FeatureSettings[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaving(true);
    await supabase.from("advanced_feature_settings").upsert({ user_id: user!.id, [key]: value }, { onConflict: "user_id" });

    // Wire activity_status → profiles.show_online_status + last_seen
    if (key === "activity_status") {
      const status = value as FeatureSettings["activity_status"];
      const showOnline = status === "online" || status === "busy" || status === "focus";
      const profileUpdate: Record<string, any> = { show_online_status: showOnline };
      if (status === "offline" || status === "last_seen") {
        profileUpdate.last_seen = new Date().toISOString();
      }
      await supabase.from("profiles").update(profileUpdate).eq("id", user!.id);
    }

    // Wire focus_mode → busy status on profile
    if (key === "focus_mode") {
      const inFocus = value as boolean;
      if (inFocus) {
        await supabase.from("profiles").update({ show_online_status: true, last_seen: new Date().toISOString() }).eq("id", user!.id);
      }
    }

    setSaving(false);
  }

  async function saveAll(updates: Partial<FeatureSettings>) {
    const merged = { ...prefs, ...updates };
    setPrefs(merged);
    setSaving(true);
    await supabase.from("advanced_feature_settings").upsert({ user_id: user!.id, ...merged }, { onConflict: "user_id" });

    // Sync activity_status on bulk saves too
    if (updates.activity_status !== undefined) {
      const status = updates.activity_status;
      const showOnline = status === "online" || status === "busy" || status === "focus";
      const profileUpdate: Record<string, any> = { show_online_status: showOnline };
      if (status === "offline" || status === "last_seen") profileUpdate.last_seen = new Date().toISOString();
      await supabase.from("profiles").update(profileUpdate).eq("id", user!.id);
    }

    setSaving(false);
  }

  function Toggle({ label, desc, field, note }: { label: string; desc?: string; field: keyof FeatureSettings; note?: string }) {
    return (
      <View style={[styles.prefRow, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.prefLabel, { color: colors.text }]}>{label}</Text>
          {desc && <Text style={[styles.prefDesc, { color: colors.textMuted }]}>{desc}</Text>}
          {note && <View style={[styles.betaBadge, { backgroundColor: colors.accent + "22" }]}><Text style={[styles.betaText, { color: colors.accent }]}>{note}</Text></View>}
        </View>
        <Switch
          value={prefs[field] as boolean}
          onValueChange={(v) => setPref(field, v as any)}
          trackColor={{ true: colors.accent, false: colors.backgroundTertiary }}
          thumbColor="#fff"
        />
      </View>
    );
  }

  function Link({ label, desc, value, onPress }: { label: string; desc?: string; value?: string; onPress: () => void }) {
    return (
      <TouchableOpacity style={[styles.prefRow, { borderBottomColor: colors.border }]} onPress={onPress}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.prefLabel, { color: colors.text }]}>{label}</Text>
          {desc && <Text style={[styles.prefDesc, { color: colors.textMuted }]}>{desc}</Text>}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {value && <Text style={[styles.prefValue, { color: colors.textSecondary }]}>{value}</Text>}
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </TouchableOpacity>
    );
  }

  function hasTier(required: "silver" | "gold" | "platinum") {
    if (!isPremium) return false;
    const userTier = (subscription?.plan_tier || "free").toLowerCase();
    return (TIER_ORDER[userTier] ?? 0) >= TIER_ORDER[required];
  }

  function LockedRow({ label, desc, tier }: { label: string; desc?: string; tier: "silver" | "gold" | "platinum" }) {
    const tierColor = TIER_COLORS[tier];
    return (
      <TouchableOpacity style={[styles.prefRow, { borderBottomColor: colors.border }]} onPress={() => router.push("/premium")}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.prefLabel, { color: colors.textMuted }]}>{label}</Text>
          {desc && <Text style={[styles.prefDesc, { color: colors.textMuted }]}>{desc}</Text>}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
            <Ionicons name="lock-closed" size={10} color={tierColor} />
            <Text style={{ fontSize: 11, color: tierColor, fontWeight: "600" }}>{TIER_LABELS[tier]}+ required</Text>
          </View>
        </View>
        <View style={{ backgroundColor: tierColor + "22", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: tierColor, fontSize: 12, fontWeight: "700" }}>Upgrade</Text>
        </View>
      </TouchableOpacity>
    );
  }

  function LockedToggle({ label, desc, field, tier, note }: { label: string; desc?: string; field: keyof FeatureSettings; tier: "silver" | "gold" | "platinum"; note?: string }) {
    if (hasTier(tier)) return <Toggle label={label} desc={desc} field={field} note={note} />;
    return <LockedRow label={label} desc={desc} tier={tier} />;
  }

  function LockedLink({ label, desc, value, tier, onPress }: { label: string; desc?: string; value?: string; tier: "silver" | "gold" | "platinum"; onPress: () => void }) {
    if (hasTier(tier)) return <Link label={label} desc={desc} value={value} onPress={onPress} />;
    return <LockedRow label={label} desc={desc} tier={tier} />;
  }

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === prefs.activity_status);
  const currentLang = LANGUAGE_OPTIONS.find((l) => l.code === prefs.translation_language);

  function renderSection(key: string) {
    switch (key) {
      case "ai": return (
        <>
          <LockedToggle label="Message Translation" desc="Instantly translate messages to your language" field="message_translation" tier="silver" note="AI" />
          {prefs.message_translation && hasTier("silver") && (
            <Link label="Translate to" desc="Choose your preferred language" value={currentLang?.label} onPress={() => setShowLangPicker(true)} />
          )}
          <LockedToggle label="Voice to Text" desc="Convert voice notes into readable text automatically" field="voice_to_text" tier="silver" note="AI" />
          <Toggle label="Text to Speech" desc="Tap any message to have it read aloud" field="text_to_speech" />
          <LockedToggle label="Chat Summary" desc="Summarize long conversations into key points" field="chat_summary" tier="gold" note="AI" />
          <LockedToggle label="Smart Notifications" desc="AI filters important vs non-important notifications" field="smart_notifications" tier="silver" note="AI" />
        </>
      );
      case "chat": return (
        <>
          <LockedToggle label="Smart Chat Folders" desc="Auto-organize chats into Work, Friends, Business, Spam" field="chat_folders" tier="silver" />
          <Toggle label="Offline Drafts" desc="Write messages offline and send when connected" field="offline_drafts" />
          <LockedToggle label="Temporary Chat Mode" desc="Chats that auto-delete after a set time" field="temp_chat_enabled" tier="silver" />
          {prefs.temp_chat_enabled && hasTier("silver") && (
            <Link label="Auto-delete after" value={`${prefs.temp_chat_default_minutes} min`} onPress={() => {
              const options = [5, 15, 30, 60, 360, 1440];
              showAlert("Auto-delete timer", "Choose how long before messages disappear", options.map((m) => ({
                text: m < 60 ? `${m} minutes` : `${m / 60} hour${m / 60 > 1 ? "s" : ""}`,
                onPress: () => setPref("temp_chat_default_minutes", m),
              })));
            }} />
          )}
          <LockedToggle label="Auto-Reply Mode" desc="Set automatic replies when you're busy" field="auto_reply_enabled" tier="silver" />
          {prefs.auto_reply_enabled && hasTier("silver") && (
            <Link label="Auto-reply message" value={`"${prefs.auto_reply_message.slice(0, 30)}…"`} onPress={() => { setTempAutoReply(prefs.auto_reply_message); setShowAutoReplyEditor(true); }} />
          )}
          <LockedToggle label="Focus Mode" desc="Mute distractions and prioritize selected chats" field="focus_mode" tier="silver" />
          {prefs.focus_mode && hasTier("silver") && (
            <LockedToggle label="Scheduled Focus" desc="Automatically enable focus during set hours" field="focus_mode_schedule" tier="gold" />
          )}
        </>
      );
      case "presence": return (
        <>
          <LockedLink label="Activity Status" desc="Control what others see about your availability" value={`${currentStatus?.emoji} ${currentStatus?.label}`} tier="silver" onPress={() => setShowStatusPicker(true)} />
          <Toggle label="Mini Profile Popup" desc="Tap a username to see quick profile preview in chat" field="mini_profile_popup" />
          <Toggle label="Typing Indicator" desc="Show when you're typing to others" field="show_typing_indicator" />
        </>
      );
      case "content": return (
        <>
          <Toggle label="Interactive Link Preview" desc="Links expand into rich previews with actions" field="interactive_link_preview" />
          <LockedToggle label="Link → Mini App" desc="Convert shared links into interactive mini apps" field="link_to_mini_app" tier="gold" note="Beta" />
          <LockedToggle label="Auto Media Organization" desc="Group images, videos, and docs by type and date" field="auto_media_organization" tier="silver" />
          <LockedToggle label="Advanced Emoji Reactions" desc="Extended reactions with counters and trending emojis" field="emoji_reactions_advanced" tier="silver" />
          <LockedToggle label="Content Filter" desc="Filter what appears in your feed by topic" field="content_filter_topics" tier="silver" />
          {prefs.content_filter_topics && hasTier("silver") && (
            <Link label="Filtered keywords" desc="Topics you don't want to see" value={prefs.content_filter_keywords || "None set"} onPress={() => { setTempKeywords(prefs.content_filter_keywords); setShowKeywordEditor(true); }} />
          )}
        </>
      );
      case "productivity": return (
        <>
          <LockedToggle label="Message Reminders" desc="Set reminders on specific messages" field="message_reminders" tier="silver" />
          <LockedToggle label="Keyword Alerts" desc="Get notified when specific words are mentioned" field="keyword_alerts" tier="gold" />
          {prefs.keyword_alerts && hasTier("gold") && (
            <Link label="Alert keywords" desc="Words that trigger a notification" value={prefs.keyword_alerts_list || "None set"} onPress={() => { setTempKeywords(prefs.keyword_alerts_list); setShowKeywordEditor(true); }} />
          )}
          <LockedToggle label="Chat → Post" desc="Convert any message into a public post" field="chat_to_post" tier="silver" />
          <LockedLink label="Chat export format" value={prefs.chat_export_format.toUpperCase()} tier="gold" onPress={() => {
            showAlert("Export format", "Choose format for exported chats", [
              { text: "PDF", onPress: () => setPref("chat_export_format", "pdf") },
              { text: "Plain Text", onPress: () => setPref("chat_export_format", "txt") },
              { text: "JSON", onPress: () => setPref("chat_export_format", "json") },
            ]);
          }} />
        </>
      );
      case "advanced": return (
        <>
          <Toggle label="Quick Action Menu" desc="Long-press anywhere for fast actions (reply, save, share)" field="quick_action_menu" />
          <Toggle label="User Tagging" desc="Tag users with @ in chats, posts, and comments" field="user_tagging" />
          <LockedToggle label="Message Edit History" desc="View all previous versions of edited messages" field="message_edit_history" tier="silver" />
          <Toggle label="In-App Browser" desc="Browse websites without leaving AfuChat" field="in_app_browser" />
          {Platform.OS === "web" && (
            <Toggle label="Drag & Drop Upload" desc="Upload files with drag-and-drop on web" field="drag_drop_upload" />
          )}
          <LockedToggle label="Cross-Device Sync" desc="Instant sync across mobile, web, and desktop" field="cross_device_sync" tier="gold" />
          {Platform.OS === "web" && (
            <LockedToggle label="Split Screen Mode" desc="Use chat and browser side by side" field="split_screen_mode" tier="gold" note="Beta" />
          )}
          {Platform.OS === "web" && (
            <LockedToggle label="Screen Share in Chat" desc="Share your screen during a conversation" field="screen_share" tier="gold" note="Beta" />
          )}
          <LockedToggle label="Group Roles System" desc="Advanced permissions for admins, mods, and members" field="group_roles_system" tier="gold" />
        </>
      );
      default: return null;
    }
  }

  if (loading) return <ActivityIndicator color={colors.accent} style={{ flex: 1, justifyContent: "center" }} />;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Advanced Features</Text>
        {saving ? <ActivityIndicator color={colors.accent} size="small" /> : <View style={{ width: 24 }} />}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {SECTIONS.map((section) => (
          <View key={section.key}>
            <TouchableOpacity
              style={[styles.sectionHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
              onPress={() => setOpenSection(openSection === section.key ? null : section.key)}
            >
              <View style={[styles.sectionIcon, { backgroundColor: section.color + "20" }]}>
                <Ionicons name={section.icon as any} size={20} color={section.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
                <Text style={[styles.sectionSub, { color: colors.textMuted }]}>{section.subtitle}</Text>
              </View>
              <Ionicons name={openSection === section.key ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {openSection === section.key && (
              <View style={[styles.sectionBody, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                {renderSection(section.key)}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Auto-reply / Keyword editor modal */}
      <Modal visible={showAutoReplyEditor || showKeywordEditor} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {showAutoReplyEditor ? "Auto-Reply Message" : "Keywords"}
            </Text>
            <Text style={[styles.modalDesc, { color: colors.textMuted }]}>
              {showAutoReplyEditor
                ? "This message is sent automatically when auto-reply is enabled"
                : "Separate keywords with commas (e.g. urgent, meeting, help)"}
            </Text>
            <View style={[styles.textArea, { backgroundColor: colors.backgroundTertiary }]}>
              <TextInput
                style={[styles.textAreaInput, { color: colors.text }]}
                value={showAutoReplyEditor ? tempAutoReply : tempKeywords}
                onChangeText={showAutoReplyEditor ? setTempAutoReply : setTempKeywords}
                multiline
                numberOfLines={4}
                placeholder={showAutoReplyEditor ? "Type your auto-reply…" : "keyword1, keyword2, …"}
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => { setShowAutoReplyEditor(false); setShowKeywordEditor(false); }}>
                <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.accent }]}
                onPress={() => {
                  if (showAutoReplyEditor) {
                    setPref("auto_reply_message", tempAutoReply);
                    setShowAutoReplyEditor(false);
                  } else {
                    setPref(prefs.keyword_alerts ? "keyword_alerts_list" : "content_filter_keywords", tempKeywords);
                    setShowKeywordEditor(false);
                  }
                }}
              >
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Language picker modal */}
      <Modal visible={showLangPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Translate to Language</Text>
            {LANGUAGE_OPTIONS.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                onPress={() => { setPref("translation_language", lang.code); setShowLangPicker(false); }}
              >
                <Text style={[styles.pickerLabel, { color: colors.text }]}>{lang.label}</Text>
                {prefs.translation_language === lang.code && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border, marginTop: 12 }]} onPress={() => setShowLangPicker(false)}>
              <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Status picker modal */}
      <Modal visible={showStatusPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Activity Status</Text>
            {STATUS_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s.value}
                style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                onPress={() => { setPref("activity_status", s.value); setShowStatusPicker(false); }}
              >
                <Text style={{ fontSize: 20 }}>{s.emoji}</Text>
                <Text style={[styles.pickerLabel, { color: s.color, flex: 1 }]}>{s.label}</Text>
                {prefs.activity_status === s.value && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border, marginTop: 12 }]} onPress={() => setShowStatusPicker(false)}>
              <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  sectionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 1 },
  sectionSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sectionBody: { borderBottomWidth: StyleSheet.hairlineWidth },
  prefRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  prefLabel: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 2 },
  prefDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  prefValue: { fontSize: 13, fontFamily: "Inter_400Regular" },
  betaBadge: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 3 },
  betaText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  modalOverlay: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "80%" },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 8 },
  modalDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 16 },
  textArea: { borderRadius: 14, padding: 14, marginBottom: 20, minHeight: 100 },
  textAreaInput: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  modalBtns: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  saveBtn: { flex: 2, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
