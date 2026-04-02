import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
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
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/context/LanguageContext";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { uploadToStorage } from "@/lib/mediaUpload";
import { aiEnhancePost, aiGenerateHashtags, aiGenerateCaption } from "@/lib/aiHelper";
import { LANG_LABELS } from "@/lib/translate";

type Audience = "public" | "followers" | "private";

const AUDIENCE_OPTIONS: { key: Audience; label: string; icon: string; desc: string }[] = [
  { key: "public", label: "Everyone", icon: "globe-outline", desc: "Anyone can see this post" },
  { key: "followers", label: "Followers", icon: "people-outline", desc: "Only your followers" },
  { key: "private", label: "Only Me", icon: "lock-closed-outline", desc: "Visible only to you" },
];

const LANG_LIST = Object.entries(LANG_LABELS).map(([code, label]) => ({ code, label }));

export default function CreatePostScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const { preferredLang } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);

  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>("public");
  const [showAudienceModal, setShowAudienceModal] = useState(false);
  const [langCode, setLangCode] = useState<string | null>(preferredLang);
  const [showLangModal, setShowLangModal] = useState(false);
  const [langSearch, setLangSearch] = useState("");
  const [locationTag, setLocationTag] = useState("");
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [showMentionModal, setShowMentionModal] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionResults, setMentionResults] = useState<{ id: string; handle: string; display_name: string; avatar_url: string | null }[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  const postBtnScale = useRef(new Animated.Value(1)).current;

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 9 - images.length,
    });
    if (!result.canceled) {
      setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 9));
    }
  }

  async function searchMentions(query: string) {
    setMentionSearch(query);
    if (query.length < 2) { setMentionResults([]); return; }
    setMentionLoading(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url")
        .or(`handle.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(10);
      setMentionResults(data || []);
    } catch {
      setMentionResults([]);
    }
    setMentionLoading(false);
  }

  function insertMention(handle: string) {
    setContent((prev) => prev + `@${handle} `);
    setShowMentionModal(false);
    setMentionSearch("");
    setMentionResults([]);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function handlePost() {
    if (!content.trim() && images.length === 0) {
      showAlert("Empty post", "Write something or add a photo to share.");
      return;
    }
    if (content.trim().length > 500) {
      showAlert("Too long", "Posts are limited to 500 characters.");
      return;
    }
    if (!user) return;
    setLoading(true);

    Animated.sequence([
      Animated.timing(postBtnScale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(postBtnScale, { toValue: 1, tension: 200, friction: 10, useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let uploadedUrls: string[] = [];
    if (images.length > 0) {
      for (let idx = 0; idx < images.length; idx++) {
        setUploadProgress(`Uploading ${idx + 1}/${images.length}...`);
        const uri = images[idx];
        let ext: string;
        let mime: string | undefined;
        if (uri.startsWith("data:")) {
          const dataMime = uri.match(/data:([^;]+)/)?.[1] || "";
          ext = dataMime.includes("png") ? "png" : dataMime.includes("webp") ? "webp" : "jpg";
          mime = dataMime || "image/jpeg";
        } else {
          ext = uri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
        }
        const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { publicUrl, error: upErr } = await uploadToStorage("post-images", fileName, uri, mime);
        if (publicUrl) {
          uploadedUrls.push(publicUrl);
        } else {
          setLoading(false);
          setUploadProgress("");
          showAlert("Upload failed", upErr || `Could not upload image ${idx + 1}. Please try again.`);
          return;
        }
      }
      setUploadProgress("");
    }

    const firstImage = uploadedUrls.length > 0 ? uploadedUrls[0] : null;
    let postContent = content.trim();
    if (locationTag) postContent += `\n📍 ${locationTag}`;

    const insertPayload: any = {
      author_id: user.id,
      content: postContent,
      image_url: firstImage,
      visibility: audience,
    };
    if (langCode) insertPayload.language_code = langCode;

    const { data: post, error } = await supabase
      .from("posts")
      .insert(insertPayload)
      .select()
      .single();

    if (error || !post) {
      setLoading(false);
      showAlert("Error", "Could not create post. Please try again.");
      return;
    }

    if (uploadedUrls.length > 0) {
      const imageRows = uploadedUrls.map((url, i) => ({
        post_id: post.id,
        image_url: url,
        display_order: i,
      }));
      await supabase.from("post_images").insert(imageRows);
    }

    try {
      const { rewardXp } = await import("../../lib/rewardXp");
      await rewardXp("post_created");
    } catch (_) {}

    setLoading(false);
    router.back();
  }

  const charCount = content.trim().length;
  const isOverLimit = charCount > 500;
  const charPercent = Math.min(charCount / 500, 1);
  const charColor = isOverLimit ? "#FF3B30" : charCount > 450 ? "#FF9500" : colors.textMuted;

  const imgGridSize = images.length <= 1 ? screenW - 64 : (screenW - 64 - 6) / 2;
  const singleImgHeight = Math.min(imgGridSize * 0.65, 260);

  const filteredLangs = langSearch
    ? LANG_LIST.filter((l) => l.label.toLowerCase().includes(langSearch.toLowerCase()) || l.code.includes(langSearch.toLowerCase()))
    : LANG_LIST;

  const audienceOption = AUDIENCE_OPTIONS.find((a) => a.key === audience)!;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 4, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {loading && uploadProgress ? (
          <View style={styles.progressPill}>
            <ActivityIndicator size={12} color="#fff" />
            <Text style={styles.progressText}>{uploadProgress}</Text>
          </View>
        ) : null}
        <Animated.View style={{ transform: [{ scale: postBtnScale }] }}>
          <TouchableOpacity
            style={[
              styles.postBtn,
              { opacity: loading || isOverLimit || (!content.trim() && images.length === 0) ? 0.5 : 1 },
            ]}
            onPress={handlePost}
            disabled={loading || isOverLimit}
            activeOpacity={0.8}
          >
            {loading && !uploadProgress ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.postBtnText}>Post</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.composeRow}>
          <Avatar
            uri={profile?.avatar_url}
            name={profile?.display_name || "You"}
            size={40}
          />
          <View style={styles.composeRight}>
            <View style={styles.nameAudienceRow}>
              <Text style={[styles.composeName, { color: colors.text }]} numberOfLines={1}>
                {profile?.display_name || "You"}
              </Text>
              <TouchableOpacity
                style={[styles.audiencePill, { backgroundColor: Colors.brand + "14", borderColor: Colors.brand + "30" }]}
                onPress={() => setShowAudienceModal(true)}
                activeOpacity={0.7}
              >
                <Ionicons name={audienceOption.icon as any} size={12} color={Colors.brand} />
                <Text style={[styles.audienceText, { color: Colors.brand }]}>{audienceOption.label}</Text>
                <Ionicons name="chevron-down" size={10} color={Colors.brand} />
              </TouchableOpacity>
            </View>
            <TextInput
              ref={inputRef}
              style={[styles.textInput, { color: colors.text }]}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.textMuted}
              value={content}
              onChangeText={setContent}
              multiline
              autoFocus
              maxLength={520}
            />
          </View>
        </View>

        {(locationTag || langCode) && (
          <View style={styles.tagsRow}>
            {locationTag ? (
              <TouchableOpacity
                style={[styles.tagChip, { backgroundColor: colors.inputBg }]}
                onPress={() => { setLocationTag(""); }}
              >
                <Ionicons name="location" size={12} color={Colors.brand} />
                <Text style={[styles.tagText, { color: colors.text }]} numberOfLines={1}>{locationTag}</Text>
                <Ionicons name="close" size={12} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
            {langCode ? (
              <TouchableOpacity
                style={[styles.tagChip, { backgroundColor: colors.inputBg }]}
                onPress={() => setLangCode(null)}
              >
                <Ionicons name="language" size={12} color={Colors.brand} />
                <Text style={[styles.tagText, { color: colors.text }]} numberOfLines={1}>{LANG_LABELS[langCode] || langCode}</Text>
                <Ionicons name="close" size={12} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {images.length > 0 && (
          <View style={styles.imageGrid}>
            {images.map((uri, i) => (
              <View
                key={`${uri}-${i}`}
                style={[
                  styles.imageWrap,
                  {
                    width: images.length === 1 ? screenW - 64 : imgGridSize,
                    height: images.length === 1 ? singleImgHeight : imgGridSize,
                  },
                ]}
              >
                <Image source={{ uri }} style={styles.imageFill} resizeMode="cover" />
                <Pressable
                  style={styles.removeImg}
                  onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
                {images.length > 1 && (
                  <View style={styles.imgIndex}>
                    <Text style={styles.imgIndexText}>{i + 1}</Text>
                  </View>
                )}
              </View>
            ))}
            {images.length < 9 && (
              <TouchableOpacity
                style={[
                  styles.addImgBtn,
                  {
                    backgroundColor: colors.inputBg,
                    width: images.length === 0 ? screenW - 64 : imgGridSize,
                    height: images.length === 0 ? 120 : imgGridSize,
                    borderColor: colors.border,
                  },
                ]}
                onPress={pickImage}
                activeOpacity={0.7}
              >
                <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                <Text style={[styles.addImgLabel, { color: colors.textMuted }]}>
                  {images.length === 0 ? "Add Photos" : "Add More"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={[styles.charRow, { borderTopColor: colors.separator }]}>
          <View style={styles.charRingOuter}>
            <View
              style={[
                styles.charRingFill,
                {
                  backgroundColor: charColor,
                  width: `${charPercent * 100}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.charText, { color: charColor }]}>
            {charCount}/500
          </Text>
        </View>

        {aiLoading && (
          <View style={[styles.aiLoadingBar, { backgroundColor: Colors.brand + "12" }]}>
            <ActivityIndicator size="small" color={Colors.brand} />
            <Text style={[styles.aiLoadingText, { color: Colors.brand }]}>
              {aiLoading === "enhance" ? "Enhancing your post..." : aiLoading === "hashtags" ? "Generating hashtags..." : "Writing a caption..."}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.aiToggle, { backgroundColor: Colors.brand + "0A", borderColor: Colors.brand + "20" }]}
          onPress={() => setShowAiPanel(!showAiPanel)}
          activeOpacity={0.7}
        >
          <Ionicons name="sparkles" size={16} color={Colors.brand} />
          <Text style={[styles.aiToggleText, { color: Colors.brand }]}>AI Writing Tools</Text>
          <Ionicons name={showAiPanel ? "chevron-up" : "chevron-down"} size={14} color={Colors.brand} />
        </TouchableOpacity>

        {showAiPanel && (
          <View style={styles.aiPanel}>
            <TouchableOpacity
              style={[styles.aiOption, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={async () => {
                if (!content.trim()) { showAlert("Write first", "Write something first, then let AI enhance it."); return; }
                setAiLoading("enhance");
                try {
                  const enhanced = await aiEnhancePost(content);
                  setContent(enhanced.slice(0, 500));
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } catch { showAlert("AI Error", "Could not enhance your post. Try again."); }
                setAiLoading(null);
              }}
              disabled={!!aiLoading}
              activeOpacity={0.7}
            >
              <View style={[styles.aiIconCircle, { backgroundColor: "#6366F1" + "18" }]}>
                <Ionicons name="color-wand-outline" size={18} color="#6366F1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.aiOptionTitle, { color: colors.text }]}>Enhance</Text>
                <Text style={[styles.aiOptionDesc, { color: colors.textMuted }]}>Improve grammar and clarity</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.aiOption, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={async () => {
                if (!content.trim()) { showAlert("Write first", "Write something first to get hashtag suggestions."); return; }
                setAiLoading("hashtags");
                try {
                  const tags = await aiGenerateHashtags(content);
                  if (tags.length > 0) {
                    const newContent = (content.trim() + "\n" + tags.join(" ")).slice(0, 500);
                    setContent(newContent);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }
                } catch { showAlert("AI Error", "Could not generate hashtags. Try again."); }
                setAiLoading(null);
              }}
              disabled={!!aiLoading}
              activeOpacity={0.7}
            >
              <View style={[styles.aiIconCircle, { backgroundColor: "#F59E0B" + "18" }]}>
                <Ionicons name="pricetag-outline" size={18} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.aiOptionTitle, { color: colors.text }]}>Hashtags</Text>
                <Text style={[styles.aiOptionDesc, { color: colors.textMuted }]}>Generate relevant hashtags</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.aiOption, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={async () => {
                setAiLoading("caption");
                try {
                  const caption = await aiGenerateCaption();
                  setContent(caption.slice(0, 500));
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } catch { showAlert("AI Error", "Could not generate caption. Try again."); }
                setAiLoading(null);
              }}
              disabled={!!aiLoading}
              activeOpacity={0.7}
            >
              <View style={[styles.aiIconCircle, { backgroundColor: "#10B981" + "18" }]}>
                <Ionicons name="bulb-outline" size={18} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.aiOptionTitle, { color: colors.text }]}>Auto Caption</Text>
                <Text style={[styles.aiOptionDesc, { color: colors.textMuted }]}>Generate a catchy caption</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 6, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity style={styles.bottomAction} onPress={pickImage}>
          <Ionicons name="image-outline" size={22} color={images.length > 0 ? Colors.brand : colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomAction} onPress={() => setShowMentionModal(true)}>
          <Ionicons name="at-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomAction} onPress={() => setShowLocationModal(true)}>
          <Ionicons name="location-outline" size={22} color={locationTag ? Colors.brand : colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomAction} onPress={() => setShowLangModal(true)}>
          <Ionicons name="globe-outline" size={22} color={langCode ? Colors.brand : colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {images.length > 0 && (
          <Text style={[styles.imgCount, { color: colors.textMuted }]}>{images.length}/9</Text>
        )}
      </View>

      <Modal visible={showAudienceModal} transparent animationType="fade" onRequestClose={() => setShowAudienceModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAudienceModal(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Who can see this?</Text>
            {AUDIENCE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.audienceRow, audience === opt.key && { backgroundColor: Colors.brand + "10" }]}
                onPress={() => { setAudience(opt.key); setShowAudienceModal(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <View style={[styles.audienceIconCircle, { backgroundColor: audience === opt.key ? Colors.brand + "20" : colors.inputBg }]}>
                  <Ionicons name={opt.icon as any} size={20} color={audience === opt.key ? Colors.brand : colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.audienceLabel, { color: colors.text }]}>{opt.label}</Text>
                  <Text style={[styles.audienceDesc, { color: colors.textMuted }]}>{opt.desc}</Text>
                </View>
                {audience === opt.key && <Ionicons name="checkmark-circle" size={22} color={Colors.brand} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showLangModal} transparent animationType="fade" onRequestClose={() => setShowLangModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowLangModal(false)}>
          <Pressable style={[styles.modalSheet, styles.langSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Post Language</Text>
            <View style={[styles.searchBar, { backgroundColor: colors.inputBg }]}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search languages..."
                placeholderTextColor={colors.textMuted}
                value={langSearch}
                onChangeText={setLangSearch}
                autoFocus
              />
            </View>
            <TouchableOpacity
              style={[styles.langRow, !langCode && { backgroundColor: Colors.brand + "10" }]}
              onPress={() => { setLangCode(null); setShowLangModal(false); setLangSearch(""); }}
            >
              <Text style={[styles.langLabel, { color: colors.text }]}>Auto-detect</Text>
              {!langCode && <Ionicons name="checkmark-circle" size={20} color={Colors.brand} />}
            </TouchableOpacity>
            <FlatList
              data={filteredLangs}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.langRow, langCode === item.code && { backgroundColor: Colors.brand + "10" }]}
                  onPress={() => { setLangCode(item.code); setShowLangModal(false); setLangSearch(""); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Text style={[styles.langLabel, { color: colors.text }]}>{item.label}</Text>
                  <Text style={[styles.langCode, { color: colors.textMuted }]}>{item.code}</Text>
                  {langCode === item.code && <Ionicons name="checkmark-circle" size={20} color={Colors.brand} />}
                </TouchableOpacity>
              )}
              style={{ maxHeight: 300 }}
              keyboardShouldPersistTaps="handled"
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showLocationModal} transparent animationType="fade" onRequestClose={() => setShowLocationModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowLocationModal(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Location</Text>
            <View style={[styles.searchBar, { backgroundColor: colors.inputBg }]}>
              <Ionicons name="location" size={16} color={Colors.brand} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Type a location..."
                placeholderTextColor={colors.textMuted}
                value={locationInput}
                onChangeText={setLocationInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (locationInput.trim()) {
                    setLocationTag(locationInput.trim());
                    setShowLocationModal(false);
                    setLocationInput("");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                }}
              />
            </View>
            <TouchableOpacity
              style={[styles.locationDone, { backgroundColor: Colors.brand, opacity: locationInput.trim() ? 1 : 0.5 }]}
              disabled={!locationInput.trim()}
              onPress={() => {
                setLocationTag(locationInput.trim());
                setShowLocationModal(false);
                setLocationInput("");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text style={styles.locationDoneText}>Add Location</Text>
            </TouchableOpacity>
            {locationTag ? (
              <TouchableOpacity
                style={styles.removeLocationBtn}
                onPress={() => { setLocationTag(""); setShowLocationModal(false); setLocationInput(""); }}
              >
                <Text style={[styles.removeLocationText, { color: "#FF3B30" }]}>Remove Location</Text>
              </TouchableOpacity>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showMentionModal} transparent animationType="fade" onRequestClose={() => setShowMentionModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowMentionModal(false)}>
          <Pressable style={[styles.modalSheet, styles.langSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Mention Someone</Text>
            <View style={[styles.searchBar, { backgroundColor: colors.inputBg }]}>
              <Ionicons name="at" size={16} color={Colors.brand} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search by name or handle..."
                placeholderTextColor={colors.textMuted}
                value={mentionSearch}
                onChangeText={searchMentions}
                autoFocus
              />
              {mentionLoading && <ActivityIndicator size={14} color={Colors.brand} />}
            </View>
            <FlatList
              data={mentionResults}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.mentionRow}
                  onPress={() => insertMention(item.handle)}
                >
                  <Avatar uri={item.avatar_url} name={item.display_name} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mentionName, { color: colors.text }]}>{item.display_name}</Text>
                    <Text style={[styles.mentionHandle, { color: colors.textMuted }]}>@{item.handle}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                mentionSearch.length >= 2 && !mentionLoading ? (
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>No users found</Text>
                ) : mentionSearch.length < 2 ? (
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>Type at least 2 characters to search</Text>
                ) : null
              }
              style={{ maxHeight: 260 }}
              keyboardShouldPersistTaps="handled"
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  cancelBtn: { padding: 4 },
  postBtn: {
    backgroundColor: Colors.brand,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 22,
    minWidth: 68,
    alignItems: "center",
  },
  postBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15, letterSpacing: 0.2 },
  progressPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.brand,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  progressText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  body: { padding: 16, paddingBottom: 32, gap: 14 },
  composeRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  composeRight: { flex: 1 },
  nameAudienceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  composeName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  audiencePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  audienceText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  textInput: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
    minHeight: 100,
    textAlignVertical: "top",
    paddingTop: 0,
    ...Platform.select({ web: { outlineStyle: "none" } as any, default: {} }),
  },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingLeft: 52 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    maxWidth: 180,
  },
  tagText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingLeft: 52,
  },
  imageWrap: { position: "relative", borderRadius: 12, overflow: "hidden" },
  imageFill: { width: "100%", height: "100%", borderRadius: 12 },
  removeImg: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  imgIndex: {
    position: "absolute",
    bottom: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  imgIndexText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  addImgBtn: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  addImgLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  charRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 52,
  },
  charRingOuter: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#E0E0E0",
    overflow: "hidden",
  },
  charRingFill: {
    height: "100%",
    borderRadius: 1.5,
  },
  charText: { fontSize: 12, fontFamily: "Inter_500Medium", minWidth: 44, textAlign: "right" },
  aiLoadingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginLeft: 52,
  },
  aiLoadingText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  aiToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: 52,
  },
  aiToggleText: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  aiPanel: { gap: 8, marginLeft: 52 },
  aiOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  aiIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  aiOptionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  aiOptionDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  bottomAction: {
    padding: 10,
  },
  imgCount: { fontSize: 12, fontFamily: "Inter_500Medium" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  langSheet: { maxHeight: "60%" },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 14 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0, ...Platform.select({ web: { outlineStyle: "none" } as any, default: {} }) },
  audienceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  audienceIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  audienceLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  audienceDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 8,
  },
  langLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  langCode: { fontSize: 12, fontFamily: "Inter_400Regular" },
  locationDone: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  locationDoneText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  removeLocationBtn: { paddingVertical: 12, alignItems: "center" },
  removeLocationText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  mentionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  mentionName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  mentionHandle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emptyText: { textAlign: "center", paddingVertical: 20, fontSize: 13, fontFamily: "Inter_400Regular" },
});
