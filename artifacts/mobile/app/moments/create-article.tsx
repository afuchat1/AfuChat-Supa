import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
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
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";
import { uploadToStorage } from "@/lib/mediaUpload";

const { width: SCREEN_W } = Dimensions.get("window");

type Audience = "public" | "followers" | "private";

const AUDIENCE_OPTIONS: { key: Audience; label: string; icon: string; desc: string }[] = [
  { key: "public", label: "Everyone", icon: "globe-outline", desc: "Anyone can see this article" },
  { key: "followers", label: "Followers", icon: "people-outline", desc: "Only your followers" },
  { key: "private", label: "Only Me", icon: "lock-closed-outline", desc: "Visible only to you" },
];

function estimateReadTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

export default function CreateArticleScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const bodyRef = useRef<TextInput>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingInline, setUploadingInline] = useState(false);
  const [audience, setAudience] = useState<Audience>("public");
  const [showAudienceModal, setShowAudienceModal] = useState(false);

  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const canPublish = title.trim().length >= 3 && body.trim().length >= 20;

  async function pickAndUpload(
    purpose: "cover" | "inline",
  ): Promise<string | null> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: purpose === "cover",
      aspect: purpose === "cover" ? [16, 9] : undefined,
    });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    if (!user) { showAlert("Error", "You must be signed in."); return null; }
    const ext = (asset.uri.split(".").pop() || "jpg").toLowerCase();
    const safeExt = ["png", "webp"].includes(ext) ? ext : "jpg";
    const fileName = `${user.id}/articles/${Date.now()}_${purpose}.${safeExt}`;
    const { publicUrl, error } = await uploadToStorage(
      "post-images",
      fileName,
      asset.uri,
      `image/${safeExt === "jpg" ? "jpeg" : safeExt}`,
    );
    if (error || !publicUrl) {
      showAlert("Upload failed", error || "Could not upload image.");
      return null;
    }
    return publicUrl;
  }

  async function handlePickCover() {
    setUploadingCover(true);
    try {
      const url = await pickAndUpload("cover");
      if (url) setCoverUrl(url);
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleInsertImage() {
    setUploadingInline(true);
    try {
      const url = await pickAndUpload("inline");
      if (url) {
        setBody((prev) => {
          const trimmed = prev.trimEnd();
          return trimmed + (trimmed ? "\n\n" : "") + `[img:${url}]` + "\n\n";
        });
      }
    } finally {
      setUploadingInline(false);
    }
  }

  async function publish() {
    if (!user) { router.push("/(auth)/login"); return; }
    if (!canPublish) {
      showAlert("Not ready", "Your article needs a title (3+ chars) and body (20+ chars).");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from("posts").insert({
        author_id: user.id,
        content: body.trim(),
        article_title: title.trim(),
        article_body: body.trim(),
        article_cover_url: coverUrl || null,
        post_type: "article",
        visibility: audience,
        view_count: 0,
      });
      if (error) throw error;
      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_created"); } catch (_) {}
      router.back();
    } catch (err: any) {
      showAlert("Error", err.message || "Failed to publish article.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>New Article</Text>
        </View>
        <TouchableOpacity
          onPress={publish}
          disabled={loading || !canPublish}
          style={[styles.publishBtn, { backgroundColor: canPublish ? colors.accent : colors.backgroundTertiary, opacity: loading ? 0.7 : 1 }]}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={[styles.publishText, { color: canPublish ? "#fff" : colors.textMuted }]}>Publish</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Cover image */}
          <TouchableOpacity
            onPress={handlePickCover}
            activeOpacity={0.85}
            style={[styles.coverPicker, { borderColor: colors.border, backgroundColor: colors.backgroundTertiary }]}
          >
            {uploadingCover ? (
              <ActivityIndicator color={colors.accent} />
            ) : coverUrl ? (
              <>
                <Image source={{ uri: coverUrl }} style={styles.coverPreview} resizeMode="cover" />
                <View style={styles.coverEditBadge}>
                  <Ionicons name="pencil" size={13} color="#fff" />
                  <Text style={styles.coverEditText}>Change cover</Text>
                </View>
              </>
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                <Text style={[styles.coverPlaceholderText, { color: colors.textMuted }]}>
                  Add cover image
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Author row */}
          <View style={styles.authorRow}>
            <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={38} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.authorName, { color: colors.text }]}>{profile?.display_name || "You"}</Text>
              <TouchableOpacity
                style={[styles.audienceBtn, { backgroundColor: colors.backgroundTertiary }]}
                onPress={() => setShowAudienceModal(true)}
              >
                <Ionicons
                  name={AUDIENCE_OPTIONS.find(a => a.key === audience)?.icon as any || "globe-outline"}
                  size={12}
                  color={colors.textSecondary}
                />
                <Text style={[styles.audienceBtnText, { color: colors.textSecondary }]}>
                  {AUDIENCE_OPTIONS.find(a => a.key === audience)?.label}
                </Text>
                <Ionicons name="chevron-down" size={10} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Title input */}
          <TextInput
            style={[styles.titleInput, { color: colors.text }]}
            placeholder="Article title…"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
            multiline
            maxLength={200}
            returnKeyType="next"
            onSubmitEditing={() => bodyRef.current?.focus()}
            autoFocus
          />

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Body input */}
          <TextInput
            ref={bodyRef}
            style={[styles.bodyInput, { color: colors.text }]}
            placeholder={"Tell your story…\n\nTip: tap 📷 in the toolbar below to insert images inline."}
            placeholderTextColor={colors.textMuted}
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
          />

          {/* Inline image previews */}
          {body.match(/\[img:(https?:\/\/[^\]]+)\]/g)?.map((match, i) => {
            const url = match.slice(5, -1);
            return (
              <View key={i} style={[styles.inlinePreviewWrap, { borderColor: colors.border }]}>
                <Image source={{ uri: url }} style={styles.inlinePreview} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.inlineRemoveBtn}
                  onPress={() => setBody((prev) => prev.replace(`[img:${url}]`, "").replace(/\n{3,}/g, "\n\n"))}
                >
                  <Ionicons name="close-circle" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer toolbar */}
      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 }]}>
        <Text style={[styles.footerStat, { color: colors.textMuted }]}>{wordCount} words</Text>
        <View style={[styles.footerDot, { backgroundColor: colors.textMuted }]} />
        <Text style={[styles.footerStat, { color: colors.textMuted }]}>{estimateReadTime(body)}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={handleInsertImage}
          disabled={uploadingInline}
          style={[styles.insertImgBtn, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "40" }]}
        >
          {uploadingInline
            ? <ActivityIndicator size="small" color={colors.accent} />
            : <>
                <Ionicons name="image-outline" size={16} color={colors.accent} />
                <Text style={[styles.insertImgText, { color: colors.accent }]}>Insert photo</Text>
              </>
          }
        </TouchableOpacity>
      </View>

      {/* Audience Modal */}
      <Modal visible={showAudienceModal} transparent animationType="slide" onRequestClose={() => setShowAudienceModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAudienceModal(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Who can see this?</Text>
            {AUDIENCE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.audienceOption, { borderColor: audience === opt.key ? colors.accent : colors.border }]}
                onPress={() => { setAudience(opt.key); setShowAudienceModal(false); }}
              >
                <Ionicons name={opt.icon as any} size={22} color={audience === opt.key ? colors.accent : colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.audienceLabel, { color: colors.text }]}>{opt.label}</Text>
                  <Text style={[styles.audienceDesc, { color: colors.textMuted }]}>{opt.desc}</Text>
                </View>
                {audience === opt.key && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  headerBtn: { padding: 4 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  publishBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  publishText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 0 },
  coverPicker: { width: "100%", height: 180, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", marginBottom: 20, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  coverPreview: { width: "100%", height: "100%" },
  coverEditBadge: { position: "absolute", bottom: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  coverEditText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  coverPlaceholder: { alignItems: "center", gap: 8 },
  coverPlaceholderText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  authorName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  audienceBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: "flex-start" },
  audienceBtnText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  titleInput: { fontSize: 26, fontFamily: "Inter_700Bold", lineHeight: 34, marginBottom: 16, minHeight: 60 },
  divider: { height: 1, marginBottom: 20 },
  bodyInput: { fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 26, minHeight: 300 },
  inlinePreviewWrap: { width: "100%", height: 200, borderRadius: 12, marginTop: 12, marginBottom: 4, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  inlinePreview: { width: "100%", height: "100%" },
  inlineRemoveBtn: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 12 },
  footer: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  footerStat: { fontSize: 12, fontFamily: "Inter_400Regular" },
  footerDot: { width: 3, height: 3, borderRadius: 1.5 },
  insertImgBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  insertImgText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  modalTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  audienceOption: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 12, borderWidth: 1.5 },
  audienceLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  audienceDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
});
