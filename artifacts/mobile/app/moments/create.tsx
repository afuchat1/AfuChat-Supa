import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { uploadToStorage } from "@/lib/mediaUpload";
import { aiEnhancePost, aiGenerateHashtags, aiGenerateCaption } from "@/lib/aiHelper";

export default function CreatePostScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 9,
    });
    if (!result.canceled) {
      setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 9));
    }
  }

  async function handlePost() {
    if (!content.trim()) {
      showAlert("Empty post", "Write something to share.");
      return;
    }
    if (content.trim().length > 280) {
      showAlert("Too long", "Posts are limited to 280 characters.");
      return;
    }
    if (!user) return;
    setLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let uploadedUrls: string[] = [];
    for (const uri of images) {
      const ext = uri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
      const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { publicUrl } = await uploadToStorage("post-images", fileName, uri);
      if (publicUrl) uploadedUrls.push(publicUrl);
    }

    const firstImage = uploadedUrls.length > 0 ? uploadedUrls[0] : null;
    const { data: post, error } = await supabase
      .from("posts")
      .insert({
        author_id: user.id,
        content: content.trim(),
        image_url: firstImage,
      })
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
  const isOverLimit = charCount > 280;

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New Post</Text>
        <TouchableOpacity
          style={[styles.postBtn, (loading || isOverLimit) && styles.btnDisabled]}
          onPress={handlePost}
          disabled={loading || isOverLimit}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.postBtnText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextInput
          style={[styles.textInput, { color: colors.text }]}
          placeholder="What's happening?"
          placeholderTextColor={colors.textMuted}
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus
          maxLength={300}
        />

        <Text
          style={[
            styles.charCounter,
            { color: isOverLimit ? "#FF3B30" : colors.textMuted },
          ]}
        >
          {charCount}/280
        </Text>

        {images.length > 0 && (
          <View style={styles.imageGrid}>
            {images.map((uri, i) => (
              <View key={i} style={styles.imageWrap}>
                <Image source={{ uri }} style={styles.imageThumb} resizeMode="cover" />
                <Pressable
                  style={styles.removeImg}
                  onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Ionicons name="close-circle" size={22} color="#fff" />
                </Pressable>
              </View>
            ))}
            {images.length < 9 && (
              <TouchableOpacity
                style={[styles.addImgBtn, { backgroundColor: colors.inputBg }]}
                onPress={pickImage}
              >
                <Ionicons name="add" size={32} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {aiLoading && (
          <View style={[styles.aiLoadingBar, { backgroundColor: Colors.brand + "15" }]}>
            <ActivityIndicator size="small" color={Colors.brand} />
            <Text style={[styles.aiLoadingText, { color: Colors.brand }]}>
              {aiLoading === "enhance" ? "Enhancing post..." : aiLoading === "hashtags" ? "Generating hashtags..." : "Writing caption..."}
            </Text>
          </View>
        )}

        <View style={[styles.aiToolbar, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.aiBtn, { backgroundColor: Colors.brand + "12", borderColor: Colors.brand + "30" }]}
            onPress={async () => {
              if (!content.trim()) { showAlert("Write first", "Write something first, then let AI enhance it."); return; }
              setAiLoading("enhance");
              try {
                const enhanced = await aiEnhancePost(content);
                setContent(enhanced.slice(0, 280));
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch { showAlert("AI Error", "Could not enhance your post. Try again."); }
              setAiLoading(null);
            }}
            disabled={!!aiLoading}
          >
            <Ionicons name="sparkles" size={16} color={Colors.brand} />
            <Text style={[styles.aiBtnText, { color: Colors.brand }]}>Enhance</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.aiBtn, { backgroundColor: Colors.brand + "12", borderColor: Colors.brand + "30" }]}
            onPress={async () => {
              if (!content.trim()) { showAlert("Write first", "Write something first to get hashtag suggestions."); return; }
              setAiLoading("hashtags");
              try {
                const tags = await aiGenerateHashtags(content);
                if (tags.length > 0) {
                  const newContent = (content.trim() + "\n" + tags.join(" ")).slice(0, 280);
                  setContent(newContent);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
              } catch { showAlert("AI Error", "Could not generate hashtags. Try again."); }
              setAiLoading(null);
            }}
            disabled={!!aiLoading}
          >
            <Ionicons name="pricetag" size={16} color={Colors.brand} />
            <Text style={[styles.aiBtnText, { color: Colors.brand }]}>Hashtags</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.aiBtn, { backgroundColor: Colors.brand + "12", borderColor: Colors.brand + "30" }]}
            onPress={async () => {
              setAiLoading("caption");
              try {
                const caption = await aiGenerateCaption();
                setContent(caption.slice(0, 280));
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch { showAlert("AI Error", "Could not generate caption. Try again."); }
              setAiLoading(null);
            }}
            disabled={!!aiLoading}
          >
            <Ionicons name="bulb" size={16} color={Colors.brand} />
            <Text style={[styles.aiBtnText, { color: Colors.brand }]}>Caption</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.toolbar, { borderTopColor: colors.border }]}>
          <TouchableOpacity style={styles.toolBtn} onPress={pickImage}>
            <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.toolLabel, { color: colors.textSecondary }]}>Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn}>
            <Ionicons name="location-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.toolLabel, { color: colors.textSecondary }]}>Location</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn}>
            <Ionicons name="at-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.toolLabel, { color: colors.textSecondary }]}>Mention</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn}>
            <Ionicons name="globe-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.toolLabel, { color: colors.textSecondary }]}>Language</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: { minWidth: 60 },
  cancelText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  postBtn: {
    backgroundColor: Colors.brand,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  postBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  body: { padding: 16, gap: 16 },
  textInput: {
    fontSize: 17,
    fontFamily: "Inter_400Regular",
    lineHeight: 26,
    minHeight: 120,
    textAlignVertical: "top",
  },
  charCounter: {
    textAlign: "right",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  imageWrap: { position: "relative" },
  imageThumb: { width: 100, height: 100, borderRadius: 10 },
  removeImg: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 11,
  },
  addImgBtn: {
    width: 100,
    height: 100,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  toolBtn: { alignItems: "center", gap: 4 },
  toolLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  aiToolbar: { flexDirection: "row", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  aiBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flex: 1, justifyContent: "center" },
  aiBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  aiLoadingBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  aiLoadingText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
