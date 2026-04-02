import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  KeyboardAvoidingView,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "@/lib/haptics";
import { Video, ResizeMode } from "expo-av";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";

import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { uploadToStorage } from "@/lib/mediaUpload";

const CAPTION_MAX = 200;

type Privacy = "everyone" | "close_friends" | "only_me";
const PRIVACY_OPTIONS: { id: Privacy; label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; desc: string }[] = [
  { id: "everyone", label: "Everyone", icon: "earth", desc: "All your followers can see this story" },
  { id: "close_friends", label: "Close Friends", icon: "star", desc: "Only people in your close friends list" },
  { id: "only_me", label: "Only Me", icon: "lock-closed", desc: "Only you can see this story" },
];

export default function CreateStoryScreen() {
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const params = useLocalSearchParams<{ mediaUri?: string; mediaType?: string }>();
  const [mediaUri, setMediaUri] = useState<string | null>(params.mediaUri ?? null);
  const [mediaType, setMediaType] = useState<"image" | "video">(
    params.mediaType === "video" ? "video" : "image"
  );
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [privacy, setPrivacy] = useState<Privacy>("everyone");
  const [showPrivacy, setShowPrivacy] = useState(false);

  const shareScale = useRef(new Animated.Value(1)).current;

  const previewRadius = 24;
  const previewMargin = 8;
  const previewW = screenW - previewMargin * 2;
  const previewH = Math.min(screenH * 0.65, previewW * 1.6);

  async function pickMedia() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setMediaUri(asset.uri);
        setMediaType(asset.type === "video" ? "video" : "image");
      }
    } catch (e: any) {
      showAlert("Error", e?.message || "Could not open media picker.");
    }
  }

  async function publish() {
    if (!mediaUri || !user) return;
    setLoading(true);
    setUploadProgress(0.1);

    try {
      let ext: string;
      let mime: string;
      if (mediaUri.startsWith("data:")) {
        const dataMime = mediaUri.match(/data:([^;]+)/)?.[1] || "";
        ext = dataMime.includes("png") ? "png" : dataMime.includes("webp") ? "webp" : "jpg";
        mime = dataMime || "image/jpeg";
      } else {
        ext = mediaUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
        mime = mediaType === "video" ? `video/${ext === "mov" ? "quicktime" : "mp4"}` : `image/${ext === "jpg" ? "jpeg" : ext}`;
      }

      setUploadProgress(0.3);
      const fileName = `${user.id}/${Date.now()}.${ext}`;
      const { publicUrl, error: uploadErr } = await uploadToStorage("stories", fileName, mediaUri, mime);

      if (uploadErr || !publicUrl) {
        showAlert("Upload failed", uploadErr || "Could not upload media.");
        return;
      }

      setUploadProgress(0.7);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("stories").insert({
        user_id: user.id,
        media_url: publicUrl,
        media_type: mediaType,
        caption: caption.trim() || null,
        expires_at: expiresAt,
      });

      setUploadProgress(1);
      if (error) {
        showAlert("Error", "Could not post story.");
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("story_created"); } catch (_) {}
        if (router.canDismiss()) {
          router.dismissAll();
        } else {
          router.back();
        }
      }
    } catch (e: any) {
      showAlert("Error", e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  }

  function handleSharePressIn() {
    Animated.spring(shareScale, { toValue: 0.92, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  }
  function handleSharePressOut() {
    Animated.spring(shareScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }).start();
  }

  const privacyOption = PRIVACY_OPTIONS.find((p) => p.id === privacy) || PRIVACY_OPTIONS[0];
  const charPct = caption.length / CAPTION_MAX;
  const charColor = charPct > 0.9 ? "#FF3B30" : charPct > 0.75 ? "#FF9500" : "rgba(255,255,255,0.5)";

  return (
    <View style={[styles.root, { backgroundColor: "#000" }]}>
      {loading && uploadProgress > 0 && (
        <View style={[styles.progressBar, { top: insets.top }]}>
          <LinearGradient
            colors={[Colors.brand, "#26C6DA"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${Math.round(uploadProgress * 100)}%` }]}
          />
        </View>
      )}

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.topBtn}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.topCenter}>
          {loading && (
            <View style={styles.uploadingPill}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.uploadingText}>Sharing...</Text>
            </View>
          )}
        </View>

        <View style={styles.topRight}>
          <TouchableOpacity
            style={styles.topBtn}
            onPress={pickMedia}
            hitSlop={12}
          >
            <Ionicons name="images-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.previewContainer}>
          {mediaUri ? (
            <View style={[styles.previewWrap, { width: previewW, height: previewH, borderRadius: previewRadius }]}>
              {mediaType === "video" ? (
                <Video
                  source={{ uri: mediaUri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode={ResizeMode.COVER}
                  shouldPlay
                  isLooping
                  isMuted={false}
                />
              ) : (
                <Image
                  source={{ uri: mediaUri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
              )}

              <View style={styles.sideToolbar}>
                <TouchableOpacity style={styles.sideBtn} onPress={pickMedia}>
                  <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.sideBtn}>
                  <Ionicons name="text-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.sideBtn}>
                  <Ionicons name="happy-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.sideBtn}>
                  <Ionicons name="brush-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.sideBtn}>
                  <Ionicons name="musical-notes-outline" size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.65)"]}
                style={styles.captionOverlay}
              >
                <View style={styles.captionRow}>
                  <TextInput
                    style={styles.captionInput}
                    placeholder="Add a caption..."
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    value={caption}
                    onChangeText={(t) => setCaption(t.slice(0, CAPTION_MAX))}
                    multiline
                    maxLength={CAPTION_MAX}
                  />
                  {caption.length > 0 && (
                    <Text style={[styles.charCount, { color: charColor }]}>
                      {caption.length}/{CAPTION_MAX}
                    </Text>
                  )}
                </View>
              </LinearGradient>

              {mediaType === "video" && (
                <View style={styles.mediaTypeBadge}>
                  <Ionicons name="videocam" size={12} color="#fff" />
                  <Text style={styles.mediaTypeBadgeText}>Video</Text>
                </View>
              )}
            </View>
          ) : (
            <Pressable
              style={[styles.emptyPreview, { width: previewW, height: previewH, borderRadius: previewRadius }]}
              onPress={pickMedia}
            >
              <LinearGradient
                colors={["#1a1a2e", "#16213e", "#0f3460"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: previewRadius }]}
              />
              <View style={styles.emptyContent}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="add" size={40} color="#fff" />
                </View>
                <Text style={styles.emptyTitle}>Add to your story</Text>
                <Text style={styles.emptySub}>Share a photo or video that disappears after 24 hours</Text>
              </View>
            </Pressable>
          )}
        </View>

        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.bottomLeft}>
            <TouchableOpacity
              style={styles.privacyChip}
              onPress={() => { Haptics.selectionAsync(); setShowPrivacy(true); }}
              activeOpacity={0.7}
            >
              <Ionicons name={privacyOption.icon} size={14} color="#fff" />
              <Text style={styles.privacyText}>{privacyOption.label}</Text>
              <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>

            <View style={styles.expiryChip}>
              <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.5)" />
              <Text style={styles.expiryText}>24h</Text>
            </View>
          </View>

          <Animated.View style={{ transform: [{ scale: shareScale }] }}>
            <Pressable
              onPress={publish}
              onPressIn={handleSharePressIn}
              onPressOut={handleSharePressOut}
              disabled={!mediaUri || loading}
              style={[
                styles.shareBtn,
                (!mediaUri || loading) && { opacity: 0.4 },
              ]}
            >
              <LinearGradient
                colors={[Colors.brand, "#0097A7"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.shareBtnGradient}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Avatar
                      uri={profile?.avatar_url}
                      name={profile?.display_name || "You"}
                      size={24}
                    />
                    <Text style={styles.shareBtnText}>Share Story</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>

      {showPrivacy && (
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowPrivacy(false)}
        >
          <Pressable
            style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Who can see your story?</Text>

            {PRIVACY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.privacyRow,
                  privacy === opt.id && styles.privacyRowActive,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPrivacy(opt.id);
                  setShowPrivacy(false);
                }}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.privacyIconWrap,
                  privacy === opt.id && { backgroundColor: Colors.brand + "20" },
                ]}>
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={privacy === opt.id ? Colors.brand : "#999"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.privacyLabel,
                    privacy === opt.id && { color: "#fff" },
                  ]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.privacyDesc}>{opt.desc}</Text>
                </View>
                {privacy === opt.id && (
                  <Ionicons name="checkmark-circle" size={22} color={Colors.brand} />
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  progressBar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    zIndex: 100,
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
    zIndex: 10,
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  topCenter: {
    flex: 1,
    alignItems: "center",
  },
  topRight: {
    flexDirection: "row",
    gap: 8,
  },
  uploadingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  uploadingText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  previewContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  previewWrap: {
    overflow: "hidden",
    backgroundColor: "#111",
    position: "relative",
  },
  sideToolbar: {
    position: "absolute",
    right: 12,
    top: 16,
    gap: 12,
    alignItems: "center",
  },
  sideBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  captionOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 40,
  },
  captionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  captionInput: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
    maxHeight: 80,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  charCount: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  mediaTypeBadge: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  mediaTypeBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  emptyPreview: {
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContent: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptySub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  bottomLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  privacyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  privacyText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  expiryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  expiryText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  shareBtn: {
    borderRadius: 24,
    overflow: "hidden",
  },
  shareBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  shareBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
    zIndex: 200,
  },
  modalSheet: {
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 16,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  privacyRowActive: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  privacyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  privacyLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  privacyDesc: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
