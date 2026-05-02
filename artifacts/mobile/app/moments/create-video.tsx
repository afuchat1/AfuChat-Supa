import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Video, ResizeMode } from "expo-av";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { uploadToStorage } from "@/lib/mediaUpload";
import { registerVideoAsset } from "@/lib/videoApi";

const MAX_DURATION_SECONDS = 90;
const WARN_SIZE_MB = 80;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Extract a thumbnail from a video using the HTML Canvas API (web only).
 * Seeks to 1 second and draws the frame into an offscreen canvas,
 * then converts it to a blob URL.
 */
async function generateWebThumbnail(videoObjectUrl: string): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "metadata";
    video.src = videoObjectUrl;
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("error", onError);
        video.currentTime = Math.min(1, video.duration || 1);
      };
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        reject(new Error("Video seek failed"));
      };
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);
      video.load();
    });
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 360;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return await new Promise<string | null>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob ? URL.createObjectURL(blob) : null),
        "image/jpeg",
        0.8,
      );
    });
  } catch {
    return null;
  }
}

/**
 * Extract a thumbnail on native using expo-video-thumbnails.
 * Returns the local file URI of the generated JPEG or null on failure.
 */
async function generateNativeThumbnail(videoUri: string): Promise<string | null> {
  try {
    const thumbMod = await import("expo-video-thumbnails");
    const fn = thumbMod.getThumbnailAsync ?? (thumbMod as any).default?.getThumbnailAsync;
    if (!fn) return null;
    const result = await fn(videoUri, { time: 1000, quality: 0.7 });
    return result?.uri ?? null;
  } catch {
    return null;
  }
}

export default function CreateVideoScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { soundName, soundAlbumArt } = useLocalSearchParams<{ soundName?: string; soundAlbumArt?: string }>();

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState<string | undefined>(undefined);
  const [duration, setDuration] = useState<number>(0);
  const [fileSize, setFileSize] = useState<number>(0);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [soundDismissed, setSoundDismissed] = useState(false);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [thumbGenerating, setThumbGenerating] = useState(false);
  const videoRef = useRef<Video>(null);

  const webFileInputRef = useRef<HTMLInputElement | null>(null);

  function pickVideoWeb() {
    if (Platform.OS !== "web") return;
    if (!webFileInputRef.current) return;
    webFileInputRef.current.click();
  }

  async function handleWebFileChange(file: File | null) {
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      showAlert("Too large", "Please pick a video smaller than 200 MB.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setVideoUri(objectUrl);
    setVideoMime(file.type || undefined);
    setFileSize(file.size || 0);
    setThumbnailUri(null);

    try {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.src = objectUrl;
      await new Promise<void>((resolve, reject) => {
        probe.onloadedmetadata = () => resolve();
        probe.onerror = () => reject(new Error("Could not read video"));
      });
      const dur = isFinite(probe.duration) ? probe.duration : 0;
      if (dur > MAX_DURATION_SECONDS) {
        URL.revokeObjectURL(objectUrl);
        setVideoUri(null);
        showAlert("Too long", `Videos must be ${MAX_DURATION_SECONDS} seconds or shorter.`);
        return;
      }
      setDuration(dur);
      setVideoWidth(probe.videoWidth || null);
      setVideoHeight(probe.videoHeight || null);
    } catch {
      // Non-fatal — upload without metadata.
    }

    // Auto-generate thumbnail immediately after pick (web).
    setThumbGenerating(true);
    generateWebThumbnail(objectUrl)
      .then((uri) => setThumbnailUri(uri))
      .catch(() => setThumbnailUri(null))
      .finally(() => setThumbGenerating(false));
  }

  async function pickVideo() {
    if (Platform.OS === "web") {
      pickVideoWeb();
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert("Permission required", "Please allow access to your media library to pick a video.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "videos",
      allowsEditing: false,
      quality: 0.7,
      videoMaxDuration: MAX_DURATION_SECONDS,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const dur = (asset.duration || 0) / 1000;
      if (dur > MAX_DURATION_SECONDS) {
        showAlert("Too long", `Videos must be ${MAX_DURATION_SECONDS} seconds or shorter.`);
        return;
      }
      setVideoUri(asset.uri);
      setVideoMime(asset.mimeType || undefined);
      setDuration(dur);
      setFileSize(0);
      setVideoWidth((asset as any).width ?? null);
      setVideoHeight((asset as any).height ?? null);
      setThumbnailUri(null);
      try {
        const info = await FileSystem.getInfoAsync(asset.uri);
        if (info.exists) setFileSize((info as any).size ?? 0);
      } catch (_) {}

      // Auto-generate thumbnail immediately after pick (native).
      setThumbGenerating(true);
      generateNativeThumbnail(asset.uri)
        .then((uri) => setThumbnailUri(uri))
        .catch(() => setThumbnailUri(null))
        .finally(() => setThumbGenerating(false));
    }
  }

  async function post() {
    if (!user) { router.push("/(auth)/login"); return; }
    if (!videoUri) { showAlert("No video", "Please pick a video first."); return; }

    if (fileSize > WARN_SIZE_MB * 1024 * 1024) {
      showAlert(
        "Large file",
        `This video is ${formatBytes(fileSize)}. Large videos take longer to upload and use more data. Continue?`,
        [
          { text: "Cancel", style: "cancel", onPress: () => {} },
          { text: "Upload anyway", style: "default", onPress: () => doPost() },
        ]
      );
      return;
    }
    doPost();
  }

  async function doPost() {
    setLoading(true);
    setUploadProgress("Preparing video…");
    try {
      const rawExt = videoUri!.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
      const ext = ["mp4", "mov", "avi", "webm", "mkv", "m4v"].includes(rawExt) ? rawExt : "mp4";
      const filePath = `${user!.id}/${Date.now()}.${ext}`;
      const resolvedMime = videoMime || (ext === "mov" ? "video/quicktime" : `video/${ext}`);

      setUploadProgress("Uploading video…");
      const { publicUrl, error: uploadError } = await uploadToStorage("videos", filePath, videoUri!, resolvedMime);
      if (uploadError || !publicUrl) throw new Error(uploadError || "Upload failed");

      // Upload the thumbnail that was already generated at pick-time.
      // If it wasn't generated yet, attempt a fresh one now.
      setUploadProgress("Uploading thumbnail…");
      let thumbnailPublicUrl: string | null = null;
      try {
        let thumbLocalUri = thumbnailUri;

        // Fall back to on-demand generation if auto-generation failed or hasn't finished.
        if (!thumbLocalUri) {
          if (Platform.OS === "web") {
            thumbLocalUri = await generateWebThumbnail(videoUri!);
          } else if (!videoUri!.startsWith("blob:")) {
            thumbLocalUri = await generateNativeThumbnail(videoUri!);
          }
        }

        if (thumbLocalUri) {
          const thumbPath = `${user!.id}/${Date.now()}_thumb.jpg`;
          const uploaded = await uploadToStorage("videos", thumbPath, thumbLocalUri, "image/jpeg");
          if (uploaded.publicUrl) thumbnailPublicUrl = uploaded.publicUrl;
        }
      } catch (_) {}

      setUploadProgress("Publishing…");
      const { data: insertedPost, error } = await supabase
        .from("posts")
        .insert({
          author_id: user!.id,
          content: caption.trim(),
          video_url: publicUrl,
          image_url: thumbnailPublicUrl,
          post_type: "video",
          visibility: "public",
          view_count: 0,
          ...(soundName && !soundDismissed ? { audio_name: soundName } : {}),
        })
        .select("id")
        .single();
      if (error) throw error;

      const newPostId = (insertedPost as { id?: string } | null)?.id ?? null;
      registerVideoAsset({
        source_path: filePath,
        post_id: newPostId,
        duration: duration > 0 ? duration : null,
        width: videoWidth,
        height: videoHeight,
        source_size_bytes: fileSize > 0 ? fileSize : null,
        source_mime: resolvedMime,
      }).catch((e) => console.warn("registerVideoAsset:", e));

      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_created"); } catch (_) {}
      router.back();
    } catch (err: any) {
      showAlert("Error", err.message || "Failed to post video.");
    } finally {
      setLoading(false);
      setUploadProgress("");
    }
  }

  const canPost = !!videoUri && !loading;
  const durationLabel = duration > 0 ? `${Math.round(duration)}s / ${MAX_DURATION_SECONDS}s` : "";
  const sizeLabel = fileSize > 0 ? formatBytes(fileSize) : "";
  const isLargeFile = fileSize > WARN_SIZE_MB * 1024 * 1024;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Hidden file picker for web */}
      {Platform.OS === "web" ? (
        // @ts-ignore — react-native-web renders this as a real <input>
        <input
          ref={webFileInputRef as any}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/*"
          style={{ display: "none" }}
          onChange={(e: any) => {
            const f = e.target?.files?.[0] ?? null;
            handleWebFileChange(f);
            if (e.target) e.target.value = "";
          }}
        />
      ) : null}

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>New Video</Text>
        <TouchableOpacity
          onPress={post}
          disabled={!canPost}
          style={[styles.postBtn, { backgroundColor: canPost ? colors.accent : colors.backgroundTertiary }]}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={[styles.postBtnText, { color: canPost ? "#fff" : colors.textMuted }]}>Post</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Video picker / preview */}
          {!videoUri ? (
            <TouchableOpacity style={[styles.pickerArea, { backgroundColor: colors.backgroundTertiary, borderColor: colors.border }]} onPress={pickVideo}>
              <View style={[styles.pickerIcon, { backgroundColor: colors.accent + "20" }]}>
                <Ionicons name="videocam" size={40} color={colors.accent} />
              </View>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Tap to select a video</Text>
              <Text style={[styles.pickerSub, { color: colors.textMuted }]}>MP4, MOV, WebM · max {MAX_DURATION_SECONDS}s</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.previewContainer}>
              <Video
                ref={videoRef}
                source={{ uri: videoUri }}
                style={styles.preview}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
                isLooping
                useNativeControls
              />

              {/* Thumbnail preview badge — shown once thumbnail is ready */}
              {(thumbnailUri || thumbGenerating) ? (
                <View style={styles.thumbBadge}>
                  {thumbGenerating ? (
                    <View style={styles.thumbGenerating}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.thumbGeneratingText}>Generating thumbnail…</Text>
                    </View>
                  ) : thumbnailUri ? (
                    <View style={styles.thumbReady}>
                      <ExpoImage
                        source={{ uri: thumbnailUri }}
                        style={styles.thumbPreviewImg}
                        contentFit="cover"
                      />
                      <View style={styles.thumbLabel}>
                        <Ionicons name="checkmark-circle" size={12} color="#4caf50" />
                        <Text style={styles.thumbLabelText}>Thumbnail ready</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.previewOverlay}>
                {durationLabel ? (
                  <View style={styles.durationBadge}>
                    <Ionicons name="time-outline" size={12} color="#fff" />
                    <Text style={styles.durationText}>{durationLabel}</Text>
                  </View>
                ) : null}
                {sizeLabel ? (
                  <View style={[styles.durationBadge, isLargeFile && { backgroundColor: "rgba(255,80,0,0.75)" }]}>
                    <Ionicons name={isLargeFile ? "warning-outline" : "cloud-upload-outline"} size={12} color="#fff" />
                    <Text style={styles.durationText}>{sizeLabel}</Text>
                  </View>
                ) : null}
              </View>
              <TouchableOpacity style={[styles.changeVideoBtn, { backgroundColor: colors.backgroundTertiary }]} onPress={pickVideo}>
                <Ionicons name="swap-horizontal" size={16} color={colors.text} />
                <Text style={[styles.changeVideoText, { color: colors.text }]}>Change video</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Sound banner */}
          {soundName && !soundDismissed ? (
            <View style={[styles.soundBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {soundAlbumArt ? (
                <ExpoImage source={{ uri: soundAlbumArt }} style={styles.soundArt} contentFit="cover" />
              ) : (
                <View style={[styles.soundArt, styles.soundArtFallback]}>
                  <Ionicons name="musical-notes" size={16} color={colors.accent} />
                </View>
              )}
              <View style={styles.soundInfo}>
                <Text style={[styles.soundLabel, { color: colors.textMuted }]}>Using sound</Text>
                <Text style={[styles.soundName, { color: colors.text }]} numberOfLines={1}>{soundName}</Text>
              </View>
              <TouchableOpacity onPress={() => setSoundDismissed(true)} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Caption */}
          <View style={[styles.captionBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="pencil-outline" size={18} color={colors.textMuted} style={{ marginTop: 2 }} />
            <TextInput
              style={[styles.captionInput, { color: colors.text }]}
              placeholder="Write a caption… #hashtags @mentions"
              placeholderTextColor={colors.textMuted}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={500}
            />
          </View>

          {/* Tips */}
          <View style={[styles.tipsBox, { backgroundColor: colors.backgroundTertiary }]}>
            <Text style={[styles.tipsTitle, { color: colors.textSecondary }]}>Tips for great videos</Text>
            {[
              "Keep it under 60 seconds for maximum engagement",
              "Good lighting makes a huge difference",
              "Add hashtags to reach more people",
            ].map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <View style={[styles.tipDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.tipText, { color: colors.textMuted }]}>{tip}</Text>
              </View>
            ))}
          </View>

          {/* Upload progress */}
          {uploadProgress ? (
            <View style={styles.progressRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[styles.progressText, { color: colors.textSecondary }]}>{uploadProgress}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  headerBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  postBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  postBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  content: { padding: 20, gap: 16 },
  pickerArea: { borderRadius: 16, borderWidth: 2, borderStyle: "dashed", alignItems: "center", justifyContent: "center", padding: 48, gap: 12 },
  pickerIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  pickerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  pickerSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  previewContainer: { borderRadius: 16, overflow: "hidden", aspectRatio: 9 / 16, maxHeight: 420, backgroundColor: "#000" },
  preview: { flex: 1 },
  previewOverlay: { position: "absolute", top: 12, right: 12, gap: 8 },
  durationBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  durationText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },
  changeVideoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, margin: 0 },
  changeVideoText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  captionBox: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: "flex-start" },
  captionInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, minHeight: 60 },
  tipsBox: { borderRadius: 12, padding: 16, gap: 8 },
  tipsTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tipDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 7 },
  tipText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  soundBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  soundArt: { width: 44, height: 44, borderRadius: 8 },
  soundArtFallback: { backgroundColor: "rgba(0,188,212,0.1)", alignItems: "center", justifyContent: "center" },
  soundInfo: { flex: 1, gap: 2 },
  soundLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  soundName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  thumbBadge: { position: "absolute", bottom: 52, left: 12, right: 12 },
  thumbGenerating: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  thumbGeneratingText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#fff" },
  thumbReady: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  thumbPreviewImg: { width: 40, height: 40, borderRadius: 6 },
  thumbLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  thumbLabelText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#fff" },
});
