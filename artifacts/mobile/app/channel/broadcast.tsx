import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "@/lib/haptics";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { uploadToStorage } from "@/lib/mediaUpload";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";

const PURPLE = "#5856D6";

export default function BroadcastScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [content, setContent] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const inputRef = useRef<TextInput>(null);

  const canPost = !!(content.trim() || imageUri);

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission required", "Please allow photo library access.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function publish() {
    if (!user || !channelId) return;
    if (!canPost) {
      showAlert("Nothing to post", "Add some text or an image to broadcast.");
      return;
    }

    const { data: channel } = await supabase
      .from("channels")
      .select("owner_id")
      .eq("id", channelId)
      .maybeSingle();

    if (!channel || channel.owner_id !== user.id) {
      showAlert("Not authorized", "Only the channel owner can broadcast.");
      return;
    }

    setPosting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      let uploadedImageUrl: string | null = null;

      if (imageUri) {
        const ext = imageUri.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
        const fileName = `channel-post-${user.id}-${Date.now()}.${ext}`;
        const { publicUrl } = await uploadToStorage(
          "post-images",
          `${user.id}/${fileName}`,
          imageUri,
          `image/${ext === "png" ? "png" : "jpeg"}`
        );
        uploadedImageUrl = publicUrl;
      }

      const { error } = await supabase.from("posts").insert({
        author_id: user.id,
        channel_id: channelId,
        content: content.trim() || null,
        image_url: uploadedImageUrl,
        post_type: "post",
        visibility: "public",
      });

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      showAlert("Error", err?.message ?? "Could not publish. Please try again.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={insets.bottom}
    >
      <GlassHeader
        title="New Broadcast"
        onBack={() => router.back()}
        right={
          <TouchableOpacity
            onPress={publish}
            disabled={posting || !canPost}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {posting ? (
              <ActivityIndicator color={PURPLE} size="small" />
            ) : (
              <View style={[styles.publishBtn, { backgroundColor: canPost ? PURPLE : colors.border }]}>
                <Text style={styles.publishBtnText}>Publish</Text>
              </View>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.composerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.megaphoneRow}>
            <View style={[styles.megaphoneIcon, { backgroundColor: PURPLE + "18" }]}>
              <Ionicons name="megaphone" size={20} color={PURPLE} />
            </View>
            <Text style={[styles.broadcastLabel, { color: colors.textMuted }]}>
              Broadcasting to all subscribers
            </Text>
          </View>

          <TextInput
            ref={inputRef}
            style={[styles.textInput, { color: colors.text }]}
            placeholder="What do you want to share with your subscribers?"
            placeholderTextColor={colors.textMuted}
            value={content}
            onChangeText={setContent}
            multiline
            autoFocus
            maxLength={2000}
            textAlignVertical="top"
          />

          {imageUri && (
            <View style={styles.imagePreviewWrap}>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} contentFit="cover" />
              <TouchableOpacity
                style={styles.removeImageBtn}
                onPress={() => setImageUri(null)}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={[styles.toolbar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.toolbarBtn} onPress={pickImage} activeOpacity={0.7}>
            <Ionicons name="image-outline" size={22} color={PURPLE} />
            <Text style={[styles.toolbarBtnLabel, { color: colors.textMuted }]}>Photo</Text>
          </TouchableOpacity>

          <View style={[styles.toolbarDivider, { backgroundColor: colors.border }]} />

          <View style={styles.charCount}>
            <Text style={[styles.charCountText, { color: content.length > 1800 ? "#FF3B30" : colors.textMuted }]}>
              {content.length}/2000
            </Text>
          </View>
        </View>

        <View style={[styles.tipCard, { backgroundColor: PURPLE + "0E", borderColor: PURPLE + "30" }]}>
          <Ionicons name="information-circle-outline" size={16} color={PURPLE} />
          <Text style={[styles.tipText, { color: PURPLE }]}>
            Only you can post to this channel. Subscribers can like and comment on your broadcasts.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 14, gap: 12 },

  publishBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
  },
  publishBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  composerCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  megaphoneRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  megaphoneIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  broadcastLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },

  textInput: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
    minHeight: 140,
    padding: 0,
  },

  imagePreviewWrap: { position: "relative", borderRadius: 12, overflow: "hidden" },
  imagePreview: { width: "100%", height: 220, borderRadius: 12 },
  removeImageBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12,
  },

  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toolbarBtn: { flexDirection: "row", alignItems: "center", gap: 8 },
  toolbarBtnLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  toolbarDivider: { width: 1, height: 20, marginHorizontal: 16 },
  charCount: { marginLeft: "auto" },
  charCountText: { fontSize: 12, fontFamily: "Inter_400Regular" },

  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  tipText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
});
