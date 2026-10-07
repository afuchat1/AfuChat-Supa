import React, { useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { clearAfuChatHistory } from "@/lib/afuchatApi";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import { showAlert } from "@/lib/alert";
import {
  useChatPreferences,
  CHAT_THEME_COLORS,
  ACCENT_SWATCHES,
  ChatTheme,
  BubbleStyle,
  MediaQuality,
  BUBBLE_RADIUS,
} from "@/context/ChatPreferencesContext";
import { requestGalleryPermissionOnce } from "@/lib/storage/chatAttachmentCache";
import { useAppAccent } from "@/context/AppAccentContext";
import { useAdvancedFeatures } from "@/context/AdvancedFeaturesContext";
import { useLanguage } from "@/context/LanguageContext";
import { registerUiTexts } from "@/lib/i18n";

const FONT_SIZES = [13, 15, 17, 19];
const MEDIA_QUALITIES: MediaQuality[] = ["Auto", "High", "Low"];
const CHAT_DYNAMIC_UI_TEXTS = ["Rounded", "Sharp", "Minimal", ...MEDIA_QUALITIES];
registerUiTexts(CHAT_DYNAMIC_UI_TEXTS);

export default function ChatSettingsScreen() {
  const { colors, accent, isDark } = useTheme();
  const { t } = useLanguage();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { prefs, loading, updatePref } = useChatPreferences();
  const { setAppTheme } = useAppAccent();
  const { features: adv, setFeature } = useAdvancedFeatures();
  const [clearing, setClearing] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  const themeColor = CHAT_THEME_COLORS[prefs.chat_theme]?.accent ?? accent;
  const bubbleRadius = BUBBLE_RADIUS[prefs.bubble_style] ?? 18;

  async function handleColorPick(key: ChatTheme) {
    await updatePref("chat_theme", key);
    setAppTheme(key);
  }

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
              const { error } = await clearAfuChatHistory({
                archive: prefs.archive_on_delete,
                expectedUserId: user.id,
              });
              if (error) throw error;
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
      const { count, error } = await supabase
        .from("chat_members")
        .select("chat_id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (error) throw error;
      const n = count ?? 0;
      if (n === 0) { showAlert("Backup", "No chats to back up."); return; }
      showAlert(
        "Cloud sync is automatic",
      `Your ${n} chat${n === 1 ? "" : "s"} are continuously synced to AfuChat cloud while you're online. No manual backup needed.`,
      );
    } catch (error: any) {
      showAlert("Backup unavailable", error?.message || "We couldn't verify cloud sync right now. Please try again.");
    } finally {
      setBackingUp(false);
    }
  }

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
        <GlassHeader title="Chat Settings" />
        <View style={{ padding: 16, gap: 10 }}>
          {[1,2,3,4,5,6].map(i => <ListRowSkeleton key={i} />)}
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Chat Settings" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 48, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── THEME COLOR ──────────────────────────────────── */}
        <SectionTitle label="ACCENT COLOUR" />
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.cardHeaderRow}>
            <View style={s.iconWrap}>
              <Ionicons name="color-palette-outline" size={22} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, { color: colors.text }]}>App Accent</Text>
              <Text style={[s.cardSub, { color: colors.textMuted }]}>Applies to bubbles, tabs and buttons</Text>
            </View>
            <View style={[s.accentPill, { backgroundColor: themeColor + "20", borderColor: themeColor + "55" }]}>
              <Text style={[s.accentPillText, { color: themeColor }]}>{prefs.chat_theme}</Text>
            </View>
          </View>

          <View style={s.swatchGrid}>
            {ACCENT_SWATCHES.map(({ key }) => {
              const hex = CHAT_THEME_COLORS[key]?.accent ?? "#ccc";
              const active = prefs.chat_theme === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => handleColorPick(key)}
                  style={[s.swatch, { backgroundColor: hex }, active && s.swatchActive]}
                  activeOpacity={0.8}
                >
                  {active && <Ionicons name="checkmark" size={17} color="#fff" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── LIVE PREVIEW ─────────────────────────────────── */}
        <View style={[s.previewCard, { backgroundColor: isDark ? colors.surface : "#f0f0f5", borderColor: colors.border }]}>
          <Text style={[s.previewLabel, { color: colors.textMuted }]}>PREVIEW</Text>
          <View style={s.previewBubbleRow}>
            <View style={[s.previewBubble, s.previewBubbleLeft, { backgroundColor: colors.surface, borderRadius: bubbleRadius, borderColor: colors.border, borderWidth: 0.5 }]}>
              <Text style={[s.previewBubbleText, { color: colors.text, fontSize: prefs.font_size * 0.78 }]}>Hey, how are you? 👋</Text>
            </View>
          </View>
          <View style={s.previewBubbleRow}>
            <View style={{ flex: 1 }} />
            <View style={[s.previewBubble, s.previewBubbleRight, { backgroundColor: themeColor, borderRadius: bubbleRadius }]}>
              <Text style={[s.previewBubbleText, { color: "#fff", fontSize: prefs.font_size * 0.78 }]}>I'm great, thanks! 😊</Text>
              <View style={s.previewTsRow}>
                <Text style={[s.previewTs, { color: "rgba(255,255,255,0.75)" }]}>12:35</Text>
                <Ionicons name="checkmark-done" size={11} color="rgba(255,255,255,0.75)" />
              </View>
            </View>
          </View>
        </View>

        {/* ── APPEARANCE ───────────────────────────────────── */}
        <SectionTitle label="APPEARANCE" />
        {/* Bubble style */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 10 }]}>
          <View style={s.cardHeaderRow}>
            <View style={s.iconWrap}>
              <Ionicons name="chatbubble-outline" size={22} color={colors.text} />
            </View>
            <Text style={[s.cardTitle, { color: colors.text }]}>Bubble Style</Text>
          </View>
          <View style={s.bubbleStyleRow}>
            {(["Rounded", "Sharp", "Minimal"] as BubbleStyle[]).map((name) => {
              const active = prefs.bubble_style === name;
              const r = BUBBLE_RADIUS[name];
              return (
                <TouchableOpacity
                  key={name}
                  onPress={() => updatePref("bubble_style", name)}
                  style={[s.bubbleTile, { borderColor: active ? themeColor : colors.border }, active && { backgroundColor: themeColor + "14" }]}
                  activeOpacity={0.8}
                >
                  <View style={[s.bubbleShape, { borderRadius: r, backgroundColor: active ? themeColor : colors.backgroundSecondary, borderColor: active ? themeColor : colors.border, borderWidth: active ? 0 : 1.5 }]} />
                  <Text style={[s.bubbleTileLabel, { color: active ? themeColor : colors.textMuted }]}>{t(name)}</Text>
                  {active && <View style={[s.activeDot, { backgroundColor: themeColor }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Font size */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 10 }]}>
          <View style={s.cardHeaderRow}>
            <View style={s.iconWrap}>
              <Ionicons name="text-outline" size={22} color={colors.text} />
            </View>
            <Text style={[s.cardTitle, { color: colors.text, flex: 1 }]}>Font Size</Text>
            <Text style={[s.accentPillText, { color: themeColor }]}>{prefs.font_size}px</Text>
          </View>
          <View style={s.fontRow}>
            {FONT_SIZES.map((sz) => {
              const active = prefs.font_size === sz;
              return (
                <TouchableOpacity
                  key={sz}
                  onPress={() => updatePref("font_size", sz)}
                  style={[s.fontTile, { borderColor: active ? themeColor : colors.border }, active && { backgroundColor: themeColor + "14" }]}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: sz * 0.85, color: active ? themeColor : colors.textMuted, fontFamily: "Inter_700Bold" }}>Aa</Text>
                  <Text style={[s.fontSzLabel, { color: active ? themeColor : colors.textMuted }]}>{sz}px</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Layout toggles */}
        <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TogRow colors={colors} themeColor={themeColor} icon="reorder-four"
            label="Compact Mode" desc="Tighter message spacing for more content on screen"
            value={prefs.compact_mode} onChange={(v) => updatePref("compact_mode", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="people"
            label="Message Grouping" desc="Group consecutive messages from the same sender"
            value={prefs.message_grouping} onChange={(v) => updatePref("message_grouping", v)} />
        </View>

        {/* ── MESSAGING ────────────────────────────────────── */}
        <SectionTitle label="MESSAGING" />
        <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TogRow colors={colors} themeColor={themeColor} icon="volume-high"
            label="Sound Effects" desc="Play sounds for sent and received messages"
            value={prefs.sounds_enabled} onChange={(v) => updatePref("sounds_enabled", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="checkmark-done"
            label="Read Receipts" desc="Senders see when you've read their messages"
            value={prefs.read_receipts} onChange={(v) => updatePref("read_receipts", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="ellipsis-horizontal"
            label="Typing Indicators" desc="Show when others are composing a message"
            value={prefs.typing_indicators} onChange={(v) => updatePref("typing_indicators", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="link"
            label="Link Previews" desc="Show rich previews for URLs in messages"
            value={prefs.link_previews} onChange={(v) => updatePref("link_previews", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="happy"
            label="Emoji Reactions" desc="Let others react to your messages with emojis"
            value={prefs.reactions_enabled} onChange={(v) => updatePref("reactions_enabled", v)} />
          {(
            <>
              <Sep color={colors.border} />
              <TogRow colors={colors} themeColor={themeColor} icon="return-down-back"
                label="Enter Key to Send" desc="Use Enter to send instead of new line"
                value={prefs.enter_to_send} onChange={(v) => updatePref("enter_to_send", v)} />
              <Sep color={colors.border} />
              <TogRow colors={colors} themeColor={themeColor} icon="phone-portrait"
                label="Haptic Feedback" desc="Vibrate when you send or receive messages"
                value={prefs.send_haptics} onChange={(v) => updatePref("send_haptics", v)} />
            </>
          )}
        </View>

        {/* ── SMART FEATURES ───────────────────────────────── */}
        <SectionTitle label="SMART FEATURES" />
        <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TogRow colors={colors} themeColor={themeColor} icon="folder"
            label="Chat Folders"
            desc="Organise chats into Personal, Groups, Channels and Unread tabs"
            value={adv.chat_folders} onChange={(v) => setFeature("chat_folders", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="mic"
            label="Voice to Text"
            desc="Transcribe voice messages to text with a tap"
            value={adv.voice_to_text} onChange={(v) => setFeature("voice_to_text", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="volume-high"
            label="Text to Speech"
            desc="Have received messages read aloud to you"
            value={adv.text_to_speech} onChange={(v) => setFeature("text_to_speech", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="options-outline"
            label="Chat Summary"
            desc="AI-generated summary of any conversation from the ⋮ menu"
            value={adv.chat_summary} onChange={(v) => setFeature("chat_summary", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="language"
            label="Message Translation"
            desc="Translate any message to your preferred language"
            value={adv.message_translation} onChange={(v) => setFeature("message_translation", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="at"
            label="User Tagging"
            desc="Tag people in group chats with @mention"
            value={adv.user_tagging} onChange={(v) => setFeature("user_tagging", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="person-circle"
            label="Mini Profile Popup"
            desc="Tap an avatar in chat to see a quick profile preview"
            value={adv.mini_profile_popup} onChange={(v) => setFeature("mini_profile_popup", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="create"
            label="Message Edit History"
            desc="See the original text of edited messages"
            value={adv.message_edit_history} onChange={(v) => setFeature("message_edit_history", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="pin"
            label="Offline Drafts"
            desc="Save unsent messages locally so you never lose them"
            value={adv.offline_drafts} onChange={(v) => setFeature("offline_drafts", v)} />
          {(
            <>
              <Sep color={colors.border} />
              <TogRow colors={colors} themeColor={themeColor} icon="cloud-upload"
                label="Drag & Drop Upload"
                desc="Drag files directly into the chat to send them"
                value={adv.drag_drop_upload} onChange={(v) => setFeature("drag_drop_upload", v)} />
            </>
          )}
        </View>

        {/* ── MEDIA ────────────────────────────────────────── */}
        <SectionTitle label="MEDIA" />
        <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TogRow colors={colors} themeColor={themeColor} icon="cloud-download"
            label="Auto-Download Media" desc="Automatically download photos and videos"
            value={prefs.auto_download} onChange={(v) => updatePref("auto_download", v)} />
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="logo-github"
            label="Auto-Play GIFs" desc="Animate GIFs as soon as they load"
            value={prefs.autoplay_gifs} onChange={(v) => updatePref("autoplay_gifs", v)} />
          <Sep color={colors.border} />
          <View style={s.row}>
            <View style={s.iconWrap}>
              <Ionicons name="image-outline" size={22} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Upload Quality</Text>
              <Text style={[s.rowDesc, { color: colors.textMuted }]}>Quality when sending photos & videos</Text>
            </View>
            <View style={[s.seg, { borderColor: colors.border }]}>
              {MEDIA_QUALITIES.map((q) => (
                <TouchableOpacity
                  key={q}
                  onPress={() => updatePref("media_quality", q)}
                  style={[s.segBtn, prefs.media_quality === q && { backgroundColor: themeColor }]}
                >
                  <Text style={[s.segTxt, { color: prefs.media_quality === q ? "#fff" : colors.textMuted }]}>{t(q)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {(
            <>
              <Sep color={colors.border} />
              <View style={s.row}>
                <View style={s.iconWrap}>
                  <Ionicons name="download-outline" size={22} color={colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowLabel, { color: colors.text }]}>Save to Gallery</Text>
                  <Text style={[s.rowDesc, { color: colors.textMuted }]}>Auto-save received photos to camera roll</Text>
                </View>
                <Switch
                  value={prefs.save_to_gallery}
                  onValueChange={async (enabled) => {
                    if (enabled) {
                      const granted = await requestGalleryPermissionOnce();
                      if (!granted) {
                        showAlert("Permission Required", "AfuChat needs access to your photo library. Please enable it in device Settings.");
                        return;
                      }
                    }
                    updatePref("save_to_gallery", enabled);
                  }}
                  trackColor={{ true: themeColor, false: colors.border }}
                  thumbColor="#fff"
                />
              </View>
            </>
          )}
        </View>

        {/* ── PRIVACY & SECURITY ───────────────────────────── */}
        <SectionTitle label="PRIVACY & SECURITY" />
        <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TogRow colors={colors} themeColor={themeColor} icon="lock-closed"
            label="Chat Lock" desc="Require Face ID / fingerprint to open chats"
            value={prefs.chat_lock} onChange={(v) => updatePref("chat_lock", v)} />
          {(
            <>
              <Sep color={colors.border} />
              <TogRow colors={colors} themeColor={themeColor} icon="eye-off"
                label="Screenshot Protection" desc="If any chat member enables this, screenshots are blocked for everyone in that chat"
                value={prefs.screenshot_protection} onChange={(v) => updatePref("screenshot_protection", v)} />
            </>
          )}
          <Sep color={colors.border} />
          <TogRow colors={colors} themeColor={themeColor} icon="archive"
            label="Archive on Delete" desc="Move messages to archive instead of deleting"
            value={prefs.archive_on_delete} onChange={(v) => updatePref("archive_on_delete", v)} />
        </View>

        {/* ── BACKUP ───────────────────────────────────────── */}
        <SectionTitle label="BACKUP" />
        <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.row}>
            <View style={s.iconWrap}>
              <Ionicons name="cloud-done-outline" size={22} color={colors.accent} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Cloud sync</Text>
              <Text style={[s.rowDesc, { color: colors.textMuted }]}>Your chats sync automatically while you’re online</Text>
            </View>
            <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
          </View>
          <Sep color={colors.border} />
          <TouchableOpacity style={s.row} onPress={handleBackupNow} activeOpacity={0.7} disabled={backingUp}>
            <View style={s.iconWrap}>
              {backingUp
                ? <ActivityIndicator size="small" color={colors.text} />
                : <Ionicons name="refresh-outline" size={22} color={colors.text} />}
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Check sync status</Text>
              <Text style={[s.rowDesc, { color: colors.textMuted }]}>Verify your conversations are backed up</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── DANGER ZONE ──────────────────────────────────── */}
        <SectionTitle label="DANGER ZONE" />
        <View style={[s.group, { backgroundColor: colors.surface, borderColor: "#FF3B3033" }]}>
          <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={handleClearAllChats} disabled={clearing}>
            <View style={[s.iconBadge, { backgroundColor: "#FF3B30" }]}>
              {clearing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="trash" size={16} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, { color: "#FF3B30" }]}>{clearing ? "Clearing…" : "Clear All Chats"}</Text>
              <Text style={[s.rowDesc, { color: colors.textMuted }]}>
                {prefs.archive_on_delete ? "Archives your sent messages" : "Permanently deletes your sent messages"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={s.footer}>
          <Ionicons name="information-circle" size={14} color={colors.textMuted} />
          <Text style={[s.footerText, { color: colors.textMuted }]}>
            Settings are saved automatically and synced across your devices.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

function SectionTitle({ label }: { label: string }) {
  const { colors } = useTheme();
  return <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{label}</Text>;
}

function Sep({ color }: { color: string }) {
  return <View style={[s.sep, { backgroundColor: color }]} />;
}

function TogRow({
  colors, themeColor, icon, label, desc, value, onChange,
}: {
  colors: any; themeColor: string; icon: string;
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={s.row}>
      <View style={s.iconWrap}>
        <Ionicons name={icon as any} size={22} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, { color: colors.text }]}>{label}</Text>
        {desc && <Text style={[s.rowDesc, { color: colors.textMuted }]}>{desc}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: themeColor, false: colors.border }}
        thumbColor="#fff"
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.9,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 8,
  },

  card: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 0.5,
    overflow: "hidden",
    padding: 16,
  },

  group: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 0.5,
    overflow: "hidden",
  },

  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardSub:   { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  accentPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  accentPillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  swatchGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "flex-start" },
  swatch: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
  swatchActive: { borderWidth: 3, borderColor: "#fff", transform: [{ scale: 1.12 }] },

  previewCard: {
    marginHorizontal: 16, marginTop: 10, borderRadius: 18,
    borderWidth: 0.5, padding: 14, gap: 8,
  },
  previewLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8, marginBottom: 4 },
  previewBubbleRow: { flexDirection: "row" },
  previewBubble: { maxWidth: "72%", paddingHorizontal: 12, paddingVertical: 8 },
  previewBubbleLeft: {},
  previewBubbleRight: {},
  previewBubbleText: { fontFamily: "Inter_400Regular" },
  previewTsRow: { flexDirection: "row", alignItems: "center", gap: 2, justifyContent: "flex-end", marginTop: 3 },
  previewTs: { fontSize: 10, fontFamily: "Inter_400Regular" },

  bubbleStyleRow: { flexDirection: "row", gap: 10 },
  bubbleTile: {
    flex: 1, alignItems: "center", paddingVertical: 14,
    borderRadius: 14, borderWidth: 1.5,
    gap: 8,
  },
  bubbleShape: { width: 36, height: 22 },
  bubbleTileLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  activeDot: { width: 6, height: 6, borderRadius: 3 },

  fontRow: { flexDirection: "row", gap: 8 },
  fontTile: {
    flex: 1, alignItems: "center", paddingVertical: 12,
    borderRadius: 12, borderWidth: 1.5, gap: 4,
  },
  fontSzLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  rowText: { flex: 1 },
  iconWrap: {
    width: 28, height: 28,
    alignItems: "center", justifyContent: "center",
  },
  iconBadge: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  sep: { height: 0.5, marginLeft: 60 },

  seg: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  segBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  segTxt: { fontSize: 12, fontFamily: "Inter_500Medium" },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  footerText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
});
