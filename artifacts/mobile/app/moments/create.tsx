import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image as RNImage,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { createAfuChatPost } from "@/lib/afuchatApi";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/context/LanguageContext";
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";
import { uploadToStorage } from "@/lib/mediaUpload";
import { aiEnhancePost, aiGenerateHashtags, aiGenerateCaption } from "@/lib/aiHelper";
import {
  startPostUpload,
  updatePostProgress,
  finishPostUpload,
  failPostUpload,
} from "@/lib/postUploadStore";
import { BUNDLED_UI_LANGUAGES, LANG_LABELS } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────
type Audience = "public" | "followers" | "private";

const MAX_CHARS = 500;
const AVATAR_SZ = 44;
const MEDIA_THUMB = 96;

const AUDIENCE_OPTIONS: { key: Audience; label: string; icon: string; desc: string }[] = [
  { key: "public",    label: "Everyone",  icon: "globe",       desc: "Anyone can see this post"  },
  { key: "followers", label: "Followers", icon: "people",      desc: "Only your followers"       },
  { key: "private",   label: "Only Me",   icon: "lock-closed", desc: "Visible only to you"       },
];

const LANG_LIST = BUNDLED_UI_LANGUAGES.map((code) => ({ code, label: LANG_LABELS[code] }));

const AI_COLOR = { enhance: "#6366F1", hashtags: "#F59E0B", caption: "#10B981" } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Circular character progress ring (SVG-based, no deps beyond react-native-svg)
// ─────────────────────────────────────────────────────────────────────────────
function CharRing({ count }: { count: number }) {
  if (count === 0) return null;
  const pct    = Math.min(count / MAX_CHARS, 1);
  const isOver = count > MAX_CHARS;
  const color  = isOver
    ? "#FF3B30"
    : count > MAX_CHARS * 0.9
    ? "#FF9500"
    : count > MAX_CHARS * 0.7
    ? "#FFCC00"
    : "#30D158";
  const r     = 11;
  const circ  = 2 * Math.PI * r;
  const showLabel = count > MAX_CHARS * 0.75 || isOver;

  return (
    <View style={ss.charRingWrap}>
      <Svg width={28} height={28}>
        <Circle cx={14} cy={14} r={r} stroke="rgba(128,128,128,0.18)" strokeWidth={2.5} fill="none" />
        <Circle
          cx={14} cy={14} r={r}
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeDasharray={`${circ}`}
          strokeDashoffset={`${circ * (1 - pct)}`}
          strokeLinecap="round"
          rotation="-90"
          origin="14,14"
        />
      </Svg>
      {showLabel && (
        <Text style={[ss.charRingLabel, { color }]}>
          {isOver ? `-${count - MAX_CHARS}` : `${MAX_CHARS - count}`}
        </Text>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function CreatePostScreen() {
  const { colors, isDark } = useTheme();
  const { user, profile }  = useAuth();
  const { preferredLang }  = useLanguage();
  const insets             = useSafeAreaInsets();
  const params             = useLocalSearchParams<{ prefill?: string; imageUrl?: string; imageUrls?: string }>();
  const inputRef           = useRef<TextInput>(null);
  const postBtnScale       = useRef(new Animated.Value(1)).current;

  // ── state ──────────────────────────────────────────────────────────────────
  const [content,          setContent]          = useState(params.prefill ?? "");
  // Pre-populate with a shared image URL when coming from "Share to Feed" in chat
  const initialImages = useMemo(() => {
    if (params.imageUrls) {
      try {
        const parsed = JSON.parse(params.imageUrls);
        if (Array.isArray(parsed)) return parsed.filter((uri): uri is string => typeof uri === "string").slice(0, 9);
      } catch {}
    }
    return params.imageUrl ? [params.imageUrl] : [];
  }, [params.imageUrl, params.imageUrls]);
  const [images,           setImages]           = useState<string[]>(initialImages);
  const [audience,         setAudience]         = useState<Audience>("public");
  const [langCode,         setLangCode]         = useState<string | null>(preferredLang);
  const [locationTag,      setLocationTag]      = useState("");
  const [locationInput,    setLocationInput]    = useState("");
  const [mentionSearch,    setMentionSearch]    = useState("");
  const [mentionResults,   setMentionResults]   = useState<{ id: string; handle: string; display_name: string; avatar_url: string | null }[]>([]);
  const [mentionLoading,   setMentionLoading]   = useState(false);
  const [langSearch,       setLangSearch]       = useState("");
  const [aiLoading,        setAiLoading]        = useState<string | null>(null);

  // ── modal visibility ───────────────────────────────────────────────────────
  const [showAudience,  setShowAudience]  = useState(false);
  const [showLang,      setShowLang]      = useState(false);
  const [showLocation,  setShowLocation]  = useState(false);
  const [showMention,   setShowMention]   = useState(false);
  const [showAiPanel,   setShowAiPanel]   = useState(false);

  // ── derived ────────────────────────────────────────────────────────────────
  const charCount      = content.length;
  const isOverLimit    = charCount > MAX_CHARS;
  const canPost        = (content.trim().length > 0 || images.length > 0) && !isOverLimit;
  const audienceOption = AUDIENCE_OPTIONS.find(a => a.key === audience)!;
  const filteredLangs  = LANG_LIST.filter(l =>
    !langSearch ||
    l.label.toLowerCase().includes(langSearch.toLowerCase()) ||
    l.code.includes(langSearch.toLowerCase())
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────
  async function pickImage() {
    const { getImageQuality } = await import("@/lib/networkQuality");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: getImageQuality(),
      allowsMultipleSelection: true,
      selectionLimit: 9 - images.length,
    });
    if (!res.canceled) setImages(p => [...p, ...res.assets.map(a => a.uri)].slice(0, 9));
  }

  async function searchMentions(q: string) {
    setMentionSearch(q);
    if (q.length < 2) { setMentionResults([]); return; }
    setMentionLoading(true);
    try {
      const { data } = await supabase.from("profiles")
        .select("id, handle, display_name, avatar_url")
        .or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(10);
      setMentionResults(data || []);
    } catch { setMentionResults([]); }
    setMentionLoading(false);
  }

  function insertMention(handle: string) {
    setContent(p => p + `@${handle} `);
    setShowMention(false);
    setMentionSearch("");
    setMentionResults([]);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handlePost() {
    if (!canPost || !user) return;
    Keyboard.dismiss();
    Animated.sequence([
      Animated.timing(postBtnScale, { toValue: 0.88, duration: 65, useNativeDriver: true }),
      Animated.spring(postBtnScale, { toValue: 1, tension: 240, friction: 8, useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const _content     = content.trim();
    const _images      = [...images];
    const _userId      = user.id;
    const _audience    = audience;
    const _langCode    = langCode;
    const _locationTag = locationTag;

    if (router.canGoBack()) router.back(); else router.replace("/(tabs)/discover" as any);
    startPostUpload("post", _content.slice(0, 80));

    (async () => {
      try {
        const urls: string[] = [];
        for (let i = 0; i < _images.length; i++) {
          updatePostProgress(0.05 + (i / Math.max(_images.length, 1)) * 0.6);
          const uri  = _images[i];
          let ext    = uri.startsWith("data:") ? (uri.match(/data:image\/([^;]+)/)?.[1] ?? "jpg") : (uri.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg");
          let mime   = uri.startsWith("data:") ? (uri.match(/data:([^;]+)/)?.[1] ?? "image/jpeg") : undefined;
          const name = `${_userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { publicUrl, error } = await uploadToStorage("post-images", name, uri, mime);
          if (!publicUrl) throw new Error(error || `Could not upload image ${i + 1}`);
          urls.push(publicUrl);
        }
        updatePostProgress(0.75);
        let body = _content;
        if (_locationTag) body += `\n📍 ${_locationTag}`;
        const { data: post, error: pe } = await createAfuChatPost({
          content: body,
          image_url: urls[0] ?? null,
          visibility: _audience,
          language_code: _langCode || null,
          images: urls,
        });
        if (pe || !post) throw new Error(pe?.message || "Could not create post.");
        try { const { rewardXp } = await import("../../lib/rewardXp"); await rewardXp("post_created"); } catch {}
        finishPostUpload();
      } catch (err: any) { failPostUpload(err?.message || "Failed to create post."); }
    })();
  }

  // ── AI ─────────────────────────────────────────────────────────────────────
  async function runAi(mode: "enhance" | "hashtags" | "caption") {
    setShowAiPanel(false);
    if (mode !== "caption" && !content.trim()) { showAlert("Write first", "Add some text before using AI."); return; }
    setAiLoading(mode);
    try {
      if (mode === "enhance") {
        const r = await aiEnhancePost(content);
        setContent(r.slice(0, MAX_CHARS));
      } else if (mode === "hashtags") {
        const tags = await aiGenerateHashtags(content);
        if (tags.length) setContent(p => (p.trim() + "\n" + tags.join(" ")).slice(0, MAX_CHARS));
      } else {
        const cap = await aiGenerateCaption();
        setContent(cap.slice(0, MAX_CHARS));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { showAlert("AI Error", "Could not complete. Try again."); }
    setAiLoading(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[ss.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* ──────────────────────────── Header ──────────────────────────────── */}
      <View style={[ss.header, { paddingTop: insets.top + 6, borderBottomColor: colors.separator }]}>
        <TouchableOpacity
          style={ss.closeBtn}
          onPress={() => { Keyboard.dismiss(); if (router.canGoBack()) router.back(); else router.replace("/(tabs)/discover" as any); }}
          hitSlop={12}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={[ss.headerTitle, { color: colors.text }]}>New Post</Text>

        <Animated.View style={{ transform: [{ scale: postBtnScale }] }}>
          <TouchableOpacity
            style={[ss.postBtn, { backgroundColor: colors.accent, opacity: canPost ? 1 : 0.4 }]}
            onPress={handlePost}
            disabled={!canPost}
            activeOpacity={0.85}
          >
            <Text style={ss.postBtnText}>Post</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ─────────────────────────── Compose body ─────────────────────────── */}
      <ScrollView
        style={ss.scroll}
        contentContainerStyle={ss.scrollBody}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* Author row + text input (side-by-side with avatar) */}
        <View style={ss.composeRow}>
          {/* Left: avatar + thread line */}
          <View style={ss.avatarCol}>
            <Avatar uri={profile?.avatar_url} name={profile?.display_name || "You"} size={AVATAR_SZ} />
            {(images.length > 0 || locationTag !== "" || langCode !== null) && (
              <View style={[ss.threadLine, { backgroundColor: colors.separator }]} />
            )}
          </View>

          {/* Right: name + audience + text input */}
          <View style={ss.composeRight}>
            <View style={ss.nameRow}>
              <Text style={[ss.authorName, { color: colors.text }]} numberOfLines={1}>
                {profile?.display_name || "You"}
              </Text>
              <TouchableOpacity
                style={[ss.audiencePill, { backgroundColor: colors.accent + "14", borderColor: colors.accent + "28" }]}
                onPress={() => setShowAudience(true)}
                activeOpacity={0.7}
              >
                <Ionicons name={audienceOption.icon as any} size={11} color={colors.accent} />
                <Text style={[ss.audiencePillText, { color: colors.accent }]}>{audienceOption.label}</Text>
                <Ionicons name="chevron-down" size={10} color={colors.accent} />
              </TouchableOpacity>
            </View>

            <TextInput
              ref={inputRef}
              style={[ss.input, { color: colors.text }]}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.textMuted}
              value={content}
              onChangeText={setContent}
              multiline
              autoFocus={!params.prefill}
              maxLength={MAX_CHARS + 30}
              textAlignVertical="top"
              scrollEnabled={false}
            />

            {/* AI loading bar */}
            {aiLoading && (
              <View style={[ss.aiBar, { backgroundColor: colors.accent + "0E" }]}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[ss.aiBarText, { color: colors.accent }]}>
                  {aiLoading === "enhance" ? "Enhancing…" : aiLoading === "hashtags" ? "Adding hashtags…" : "Writing caption…"}
                </Text>
              </View>
            )}

            {/* Active tag chips */}
            {(locationTag || langCode) && (
              <View style={ss.tagsRow}>
                {locationTag ? (
                  <TouchableOpacity
                    style={[ss.tagChip, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "22" }]}
                    onPress={() => setLocationTag("")}
                  >
                    <Ionicons name="location" size={11} color={colors.accent} />
                    <Text style={[ss.tagChipText, { color: colors.accent }]} numberOfLines={1}>{locationTag}</Text>
                    <Ionicons name="close-circle" size={13} color={colors.accent + "99"} />
                  </TouchableOpacity>
                ) : null}
                {langCode ? (
                  <TouchableOpacity
                    style={[ss.tagChip, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "22" }]}
                    onPress={() => setLangCode(null)}
                  >
                    <Ionicons name="language" size={11} color={colors.accent} />
                    <Text style={[ss.tagChipText, { color: colors.accent }]} numberOfLines={1}>{LANG_LABELS[langCode] || langCode}</Text>
                    <Ionicons name="close-circle" size={13} color={colors.accent + "99"} />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>
        </View>

        {/* Media strip (full-width, below the compose row) */}
        {images.length > 0 && (
          <FlatList
            horizontal
            data={[...images, "__add__"] as string[]}
            keyExtractor={(item, i) => `${item}-${i}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[ss.mediaStrip, { paddingLeft: 16 + AVATAR_SZ + 14 }]}
            renderItem={({ item, index }) => {
              if (item === "__add__") {
                return images.length < 9 ? (
                  <TouchableOpacity
                    style={[ss.mediaAdd, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                    onPress={pickImage}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={22} color={colors.textMuted} />
                    {images.length < 8 && (
                      <Text style={[ss.mediaAddLabel, { color: colors.textMuted }]}>{9 - images.length}</Text>
                    )}
                  </TouchableOpacity>
                ) : null;
              }
              return (
                <View style={ss.mediaThumb}>
                  <Image source={{ uri: item }} style={ss.mediaImg} resizeMode="cover" />
                  {images.length > 1 && (
                    <View style={ss.mediaNumBadge}>
                      <Text style={ss.mediaNumText}>{index + 1}</Text>
                    </View>
                  )}
                  <Pressable
                    style={ss.mediaRemove}
                    onPress={() => setImages(p => p.filter((_, i) => i !== index))}
                    hitSlop={8}
                  >
                    <View style={ss.mediaRemoveCircle}>
                      <Ionicons name="close" size={11} color="#fff" />
                    </View>
                  </Pressable>
                </View>
              );
            }}
          />
        )}

        {/* Bottom padding for toolbar clearance */}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ─────────────────────────── Toolbar ──────────────────────────────── */}
      <View
        style={[
          ss.toolbar,
          {
            borderTopColor: colors.separator,
            paddingBottom: insets.bottom + (Platform.OS === "android" ? 6 : 2),
            backgroundColor: colors.background,
          },
        ]}
      >
        {/* Action icons */}
        <TouchableOpacity style={ss.toolBtn} onPress={pickImage} activeOpacity={0.7}>
          <Ionicons
            name={images.length > 0 ? "images" : "image-outline"}
            size={22}
            color={images.length > 0 ? colors.accent : colors.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity style={ss.toolBtn} onPress={() => setShowMention(true)} activeOpacity={0.7}>
          <Ionicons name="at" size={22} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={ss.toolBtn} onPress={() => setShowLocation(true)} activeOpacity={0.7}>
          <Ionicons
            name={locationTag ? "location" : "location-outline"}
            size={22}
            color={locationTag ? colors.accent : colors.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity style={ss.toolBtn} onPress={() => setShowLang(true)} activeOpacity={0.7}>
          <Ionicons
            name={langCode ? "globe" : "globe-outline"}
            size={22}
            color={langCode ? colors.accent : colors.textSecondary}
          />
        </TouchableOpacity>

        {/* AI pill button */}
        <TouchableOpacity
          style={[ss.aiPill, { backgroundColor: colors.accent + "13", borderColor: colors.accent + "28" }]}
          onPress={() => { setShowAiPanel(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          activeOpacity={0.75}
        >
          <Ionicons name="bulb-outline" size={13} color={colors.accent} />
          <Text style={[ss.aiPillText, { color: colors.accent }]}>AI</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {/* Character ring */}
        <CharRing count={charCount} />

        {/* Over-limit indicator */}
        {isOverLimit && (
          <Text style={ss.overLimit}>{charCount - MAX_CHARS} over</Text>
        )}
      </View>

      {/* ════════════════════════════ MODALS ══════════════════════════════════ */}

      {/* Audience */}
      <Modal visible={showAudience} transparent animationType="slide" onRequestClose={() => setShowAudience(false)}>
        <Pressable style={ss.overlay} onPress={() => setShowAudience(false)}>
          <Pressable style={[ss.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 16) + 8 }]} onPress={() => {}}>
            <View style={[ss.handle, { backgroundColor: colors.border }]} />
            <Text style={[ss.sheetTitle, { color: colors.text }]}>Who can see this?</Text>
            {AUDIENCE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[ss.audRow, audience === opt.key && { backgroundColor: colors.accent + "0C" }]}
                onPress={() => { setAudience(opt.key); setShowAudience(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.75}
              >
                <View style={[ss.audIcon, { backgroundColor: audience === opt.key ? colors.accent + "1A" : colors.inputBg }]}>
                  <Ionicons name={opt.icon as any} size={20} color={audience === opt.key ? colors.accent : colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ss.audTitle, { color: colors.text }]}>{opt.label}</Text>
                  <Text style={[ss.audDesc, { color: colors.textMuted }]}>{opt.desc}</Text>
                </View>
                {audience === opt.key && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Language */}
      <Modal visible={showLang} transparent animationType="slide" onRequestClose={() => { setShowLang(false); setLangSearch(""); }}>
        <Pressable style={ss.overlay} onPress={() => { setShowLang(false); setLangSearch(""); }}>
          <Pressable style={[ss.sheet, ss.sheetTall, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 8) + 8 }]} onPress={() => {}}>
            <View style={[ss.handle, { backgroundColor: colors.border }]} />
            <Text style={[ss.sheetTitle, { color: colors.text }]}>Post Language</Text>
            <View style={[ss.searchPill, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={[ss.searchInput, { color: colors.text }]}
                placeholder="Search languages…"
                placeholderTextColor={colors.textMuted}
                value={langSearch}
                onChangeText={setLangSearch}
                autoFocus
              />
            </View>
            <TouchableOpacity
              style={[ss.langRow, !langCode && { backgroundColor: colors.accent + "0C" }]}
              onPress={() => { setLangCode(null); setShowLang(false); setLangSearch(""); }}
            >
              <Text style={[ss.langLabel, { color: colors.text }]}>Auto-detect</Text>
              {!langCode && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
            </TouchableOpacity>
            <FlatList
              data={filteredLangs}
              keyExtractor={item => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[ss.langRow, langCode === item.code && { backgroundColor: colors.accent + "0C" }]}
                  onPress={() => { setLangCode(item.code); setShowLang(false); setLangSearch(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Text style={[ss.langLabel, { color: colors.text }]}>{item.label}</Text>
                  <Text style={[ss.langCode, { color: colors.textMuted }]}>{item.code}</Text>
                  {langCode === item.code && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                </TouchableOpacity>
              )}
              style={{ maxHeight: 300 }}
              keyboardShouldPersistTaps="handled"
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Location */}
      <Modal visible={showLocation} transparent animationType="slide" onRequestClose={() => setShowLocation(false)}>
        <Pressable style={ss.overlay} onPress={() => setShowLocation(false)}>
          <Pressable style={[ss.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 16) + 8 }]} onPress={() => {}}>
            <View style={[ss.handle, { backgroundColor: colors.border }]} />
            <Text style={[ss.sheetTitle, { color: colors.text }]}>Add Location</Text>
            <View style={[ss.searchPill, { backgroundColor: colors.inputBg, borderColor: colors.accent + "40" }]}>
              <Ionicons name="location" size={16} color={colors.accent} />
              <TextInput
                style={[ss.searchInput, { color: colors.text }]}
                placeholder="City, venue, neighbourhood…"
                placeholderTextColor={colors.textMuted}
                value={locationInput}
                onChangeText={setLocationInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (locationInput.trim()) {
                    setLocationTag(locationInput.trim()); setShowLocation(false); setLocationInput("");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                }}
              />
            </View>
            <TouchableOpacity
              style={[ss.sheetActionBtn, { backgroundColor: colors.accent, opacity: locationInput.trim() ? 1 : 0.45 }]}
              disabled={!locationInput.trim()}
              onPress={() => { setLocationTag(locationInput.trim()); setShowLocation(false); setLocationInput(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={ss.sheetActionBtnText}>Add Location</Text>
            </TouchableOpacity>
            {locationTag ? (
              <TouchableOpacity
                style={ss.removeBtn}
                onPress={() => { setLocationTag(""); setShowLocation(false); }}
              >
                <Text style={ss.removeBtnText}>Remove Location</Text>
              </TouchableOpacity>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Mention */}
      <Modal visible={showMention} transparent animationType="slide" onRequestClose={() => setShowMention(false)}>
        <Pressable style={ss.overlay} onPress={() => setShowMention(false)}>
          <Pressable style={[ss.sheet, ss.sheetTall, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 8) + 8 }]} onPress={() => {}}>
            <View style={[ss.handle, { backgroundColor: colors.border }]} />
            <Text style={[ss.sheetTitle, { color: colors.text }]}>Mention Someone</Text>
            <View style={[ss.searchPill, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="at" size={16} color={colors.accent} />
              <TextInput
                style={[ss.searchInput, { color: colors.text }]}
                placeholder="Search by name or handle…"
                placeholderTextColor={colors.textMuted}
                value={mentionSearch}
                onChangeText={searchMentions}
                autoFocus
              />
              {mentionLoading && <ActivityIndicator size={14} color={colors.accent} />}
            </View>
            <FlatList
              data={mentionResults}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={ss.mentionRow} onPress={() => insertMention(item.handle)} activeOpacity={0.75}>
                  <Avatar uri={item.avatar_url} name={item.display_name} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={[ss.mentionName, { color: colors.text }]}>{item.display_name}</Text>
                    <Text style={[ss.mentionHandle, { color: colors.textMuted }]}>@{item.handle}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[ss.emptyText, { color: colors.textMuted }]}>
                  {mentionSearch.length >= 2 && !mentionLoading ? "No users found" : "Type at least 2 characters"}
                </Text>
              }
              style={{ maxHeight: 300 }}
              keyboardShouldPersistTaps="handled"
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* AI Panel */}
      <Modal visible={showAiPanel} transparent animationType="slide" onRequestClose={() => setShowAiPanel(false)}>
        <Pressable style={ss.overlay} onPress={() => setShowAiPanel(false)}>
          <Pressable style={[ss.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 16) + 8 }]} onPress={() => {}}>
            <View style={[ss.handle, { backgroundColor: colors.border }]} />
            <View style={ss.aiSheetHeader}>
              <View style={[ss.aiSheetIconWrap, { backgroundColor: colors.accent + "14" }]}>
                <Ionicons name="bulb-outline" size={18} color={colors.accent} />
              </View>
              <View>
                <Text style={[ss.sheetTitle, { color: colors.text, marginBottom: 2 }]}>AI Writing Tools</Text>
                <Text style={[ss.aiSheetSub, { color: colors.textMuted }]}>Let AI help you craft the perfect post</Text>
              </View>
            </View>

            {([
              { id: "enhance" as const,  icon: "color-wand",  color: AI_COLOR.enhance,  title: "Enhance",      desc: "Improve grammar, clarity, and flow" },
              { id: "hashtags" as const, icon: "pricetag",    color: AI_COLOR.hashtags, title: "Add Hashtags", desc: "Generate relevant hashtags for reach" },
              { id: "caption" as const,  icon: "bulb-outline",color: AI_COLOR.caption,  title: "Auto Caption", desc: "Write a fresh catchy caption for you"  },
            ] as const).map(opt => (
              <TouchableOpacity
                key={opt.id}
                style={[ss.aiRow, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }]}
                onPress={() => runAi(opt.id)}
                activeOpacity={0.75}
              >
                <View style={[ss.aiRowIcon, { backgroundColor: opt.color + "16" }]}>
                  <Ionicons name={opt.icon as any} size={20} color={opt.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ss.aiRowTitle, { color: colors.text }]}>{opt.title}</Text>
                  <Text style={[ss.aiRowDesc,  { color: colors.textMuted }]}>{opt.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: { width: 42, height: 42, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Inter_600SemiBold", letterSpacing: 0.15 },
  postBtn: {
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 999,
    minWidth: 70,
    alignItems: "center",
    ...Platform.select({
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4 },
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.18)" } as any,
    }),
  },
  postBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15, letterSpacing: 0.1 },

  // Scroll
  scroll: { flex: 1 },
  scrollBody: { paddingTop: 18, paddingBottom: 20 },

  // Compose row
  composeRow: { flexDirection: "row", paddingHorizontal: 16, gap: 14 },
  avatarCol: { alignItems: "center", width: AVATAR_SZ },
  threadLine: {
    width: 2,
    flex: 1,
    borderRadius: 1,
    marginTop: 6,
    marginBottom: 2,
    opacity: 0.35,
    minHeight: 12,
  },
  composeRight: { flex: 1, paddingBottom: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 7 },
  authorName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  audiencePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  audiencePillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  input: {
    fontSize: 17,
    fontFamily: "Inter_400Regular",
    lineHeight: 26,
    minHeight: 130,
    textAlignVertical: "top",
    paddingTop: 0,
    paddingBottom: 4,
    ...Platform.select({ web: { outlineStyle: "none" } as any, default: {} }),
  },

  // AI loading bar
  aiBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  aiBarText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  // Tags
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 200,
  },
  tagChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  // Media strip
  mediaStrip: { paddingRight: 16, paddingVertical: 12, gap: 8 },
  mediaThumb: {
    width: MEDIA_THUMB,
    height: MEDIA_THUMB,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  mediaImg: { width: MEDIA_THUMB, height: MEDIA_THUMB },
  mediaNumBadge: {
    position: "absolute",
    bottom: 5,
    left: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.52)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaNumText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" },
  mediaRemove: { position: "absolute", top: 5, right: 5 },
  mediaRemoveCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaAdd: {
    width: MEDIA_THUMB,
    height: MEDIA_THUMB,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  mediaAddLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  // Toolbar
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 0,
    minHeight: 52,
  },
  toolBtn: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  aiPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginLeft: 2,
  },
  aiPillText: { fontSize: 12, fontFamily: "Inter_800ExtraBold" },
  charRingWrap: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  charRingLabel: {
    position: "absolute",
    fontSize: 7,
    fontFamily: "Inter_700Bold",
  },
  overLimit: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#FF3B30",
    marginRight: 6,
  },

  // Overlay / sheet
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.52)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  sheetTall: { maxHeight: "70%" },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 18 },

  // Audience sheet
  audRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    marginBottom: 4,
  },
  audIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  audTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  audDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Search pill
  searchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 0.5,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 0,
    ...Platform.select({ web: { outlineStyle: "none" } as any, default: {} }),
  },

  // Language sheet
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 2,
  },
  langLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  langCode: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Location sheet
  sheetActionBtn: { paddingVertical: 15, borderRadius: 14, alignItems: "center", marginTop: 8 },
  sheetActionBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  removeBtn: { paddingVertical: 12, alignItems: "center" },
  removeBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#FF3B30" },

  // Mention sheet
  mentionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    marginBottom: 2,
  },
  mentionName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  mentionHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  emptyText: { textAlign: "center", paddingVertical: 28, fontSize: 13, fontFamily: "Inter_400Regular" },

  // AI sheet
  aiSheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 18 },
  aiSheetIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  aiSheetSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  aiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 16,
    marginBottom: 8,
  },
  aiRowIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  aiRowTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  aiRowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
