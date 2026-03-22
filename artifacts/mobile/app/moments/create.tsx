import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

export default function CreatePostScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

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

    const firstImage = images.length > 0 ? images[0] : null;
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

    if (images.length > 0) {
      const imageRows = images.map((uri, i) => ({
        post_id: post.id,
        image_url: uri,
        display_order: i,
      }));
      await supabase.from("post_images").insert(imageRows);
    }

    setLoading(false);
    router.back();
  }

  const charCount = content.trim().length;
  const isOverLimit = charCount > 280;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
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
    </View>
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
});
