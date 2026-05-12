import React, { useEffect, useRef, useState } from "react";
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
import { showAlert } from "@/lib/alert";
import { uploadToStorage } from "@/lib/mediaUpload";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import { registerVideoAsset } from "@/lib/videoApi";

const MAX_DURATION_SECONDS = 90;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function generateWebThumbnail(videoObjectUrl: string, atSecond: number): Promise<string | null> {
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
        video.currentTime = Math.max(0, Math.min(atSecond, video.duration - 0.01 || atSecond));
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
      canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), "image/jpeg", 0.8);
    });
  } catch {
    return null;
  }
}

async function generateNativeThumbnail(videoUri: string, atMs: number): Promise<string | null> {
  try {
    const thumbMod = await import("expo-video-thumbnails");
    const fn = thumbMod.getThumbnailAsync ?? (thumbMod as any).default?.getThumbnailAsync;
    if (!fn) return null;
    const result = await fn(videoUri, { time: Math.max(0, atMs), quality: 0.7 });
    return result?.uri ?? null;
  } catch {
    return null;
  }
}

type OriginalPost = {
  id: string;
  content: string;
  video_url: string;
  image_url: string | null;
  author_id: string;
  profile: { display_name: string; handle: string; avatar_url: string | null };
};

export default function CreateDuetScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { postId } = useLocalSearchParams<{ postId: string }>();

  const [original, setOriginal] = useState<OriginalPost | null>(null);
  const [loadingOriginal, setLoadingOriginal] = useState(true);

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState<string | undefined>(undefined);
  const [duration, setDuration] = useState<number>(0);
  const [fileSize, setFileSize] = useState<number>(0);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);

  const webFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!postId) return;
    supabase
      .from("posts")
      .select("id, content, video_url, image_url, author_id, profiles!posts_author_id_fkey(display_name, handle, avatar_url)")
      .eq("id", postId)
      .single()
      .then(({ data }) => {
        if (data) {
          const p = data as any;
          setOriginal({
            id: p.id,
            content: p.content || "",
            video_url: p.video_url,
            image_url: p.image_url || null,
            author_id: p.author_id,
            profile: {
              display_name: p.profiles?.display_name || "User",
              handle: p.profiles?.handle || "user",
              avatar_url: p.profiles?.avatar_url || null,
            },
          });
          setCaption(`Duet with @${p.profiles?.handle || "user"}`);
        }
        setLoadingOriginal(false);
      });
  }, [postId]);

  useEffect(() => {
    if (!videoUri) return;
    const go = async () => {
      try {
        let uri: string | null = null;
        if (Platform.OS === "web") {
          uri = await generateWebThumbnail(videoUri, 1);
        } else if (!videoUri.startsWith("blob:")) {
          uri = await generateNativeThumbnail(videoUri, 1000);
        }
        if (uri) setThumbnailUri(uri);
      } catch {}
    };
    go();
  }, [videoUri]);

  function pickVideoWeb() {
    if (Platform.OS !== "web" || !webFileInputRef.current) return;
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
    } catch {}
  }

  async function pickVideo() {
    if (Platform.OS === "web") { pickVideoWeb(); return; }
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
      } catch {}
    }
  }

  async function post() {
    if (!user) { router.push("/(auth)/login"); return; }
    if (!original) { showAlert("Error", "Original video not found."); return; }
    if (!videoUri) { showAlert("No video", "Please pick your response video first."); return; }
    if (!caption.trim()) { showAlert("Caption required", "Please add a caption for your duet."); return; }

    setLoading(true);
    setUploadProgress("Preparing video…");
    try {
      const rawExt = videoUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
      const ext = ["mp4", "mov", "avi", "webm", "mkv", "m4v"].includes(rawExt) ? rawExt : "mp4";
      const filePath = `${user.id}/${Date.now()}_duet.${ext}`;
      const resolvedMime = videoMime || (ext === "mov" ? "video/quicktime" : `video/${ext}`);

      setUploadProgress("Uploading your video…");
      const { publicUrl, error: uploadError } = await uploadToStorage("videos", filePath, videoUri, resolvedMime);
      if (uploadError || !publicUrl) throw new Error(uploadError || "Upload failed");

      setUploadProgress("Uploading thumbnail…");
      let thumbnailPublicUrl: string | null = null;
      try {
        let thumbLocalUri = thumbnailUri;
        if (!thumbLocalUri) {
          if (Platform.OS === "web") {
            thumbLocalUri = await generateWebThumbnail(videoUri, 1);
          } else if (!videoUri.startsWith("blob:")) {
            thumbLocalUri = await generateNativeThumbnail(videoUri, 1000);
          }
        }
        if (thumbLocalUri) {
          const thumbPath = `${user.id}/${Date.now()}_duet_thumb.jpg`;
          const uploaded = await uploadToStorage("videos", thumbPath, thumbLocalUri, "image/jpeg");
          if (uploaded.publicUrl) thumbnailPublicUrl = uploaded.publicUrl;
        }
      } catch {}

      setUploadProgress("Publishing duet…");
      const { data: insertedPost, error } = await supabase
        .from("posts")
        .insert({
          author_id: user.id,
          content: caption.trim(),
          video_url: publicUrl,
          image_url: thumbnailPublicUrl,
          post_type: "duet",
          duet_of_post_id: original.id,
          visibility: "public",
          view_count: 0,
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

      try {
        const { rewardXp } = await import("../../lib/rewardXp");
        rewardXp("post_created");
      } catch {}
      router.back();
    } catch (err: any) {
      showAlert("Error", err.message || "Failed to post duet.");
    } finally {
      setLoading(false);
      setUploadProgress("");
    }
  }

  const canPost = !!videoUri && !!caption.trim() && !loading && !!original;

  if (loadingOriginal) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Duet</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={{ padding: 16, gap: 10 }}>
          {[1,2,3,4].map(i => <ListRowSkeleton key={i} />)}
        </View>
      </View>
    );
  }

  if (!original) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Duet</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ color: colors.textMuted, textAlign: "center" }}>Could not load the original video.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {Platform.OS === "web" ? (
        // @ts-ignore
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

      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Duet</Text>
        <TouchableOpacity
          onPress={post}
          disabled={!canPost}
          style={[s.postBtn, { backgroundColor: canPost ? colors.accent : colors.backgroundTertiary }]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[s.postBtnText, { color: canPost ? "#fff" : colors.textMuted }]}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Duet label */}
          <View style={[s.duetBadge, { backgroundColor: colors.accent + "20" }]}>
            <Ionicons name="git-branch-outline" size={16} color={colors.accent} />
            <Text style={[s.duetBadgeText, { color: colors.accent }]}>
              Duet with @{original.profile.handle}
            </Text>
          </View>

          {/* Side-by-side preview */}
          <View style={s.sideBySide}>
            {/* Original video */}
            <View style={s.videoHalf}>
              <Text style={[s.videoHalfLabel, { color: colors.textMuted }]}>Original</Text>
              <View style={[s.videoBox, { backgroundColor: "#000" }]}>
                {Platform.OS !== "web" ? (
                  <Video
                    source={{ uri: original.video_url }}
                    style={StyleSheet.absoluteFill}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={false}
                    isLooping
                    isMuted
                    posterSource={original.image_url ? { uri: original.image_url } : undefined}
                    {...(original.image_url ? { usePosterImage: true } as any : {})}
                  />
                ) : (
                  // @ts-ignore
                  <video
                    src={original.video_url}
                    poster={original.image_url || undefined}
                    muted
                    playsInline
                    loop
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}
                <View style={s.videoLabel}>
                  <Text style={s.videoLabelText} numberOfLines={1}>
                    @{original.profile.handle}
                  </Text>
                </View>
              </View>
            </View>

            {/* Divider */}
            <View style={[s.dividerLine, { backgroundColor: colors.accent }]}>
              <View style={[s.dividerBadge, { backgroundColor: colors.accent }]}>
                <Text style={s.dividerBadgeText}>VS</Text>
              </View>
            </View>

            {/* Your video */}
            <View style={s.videoHalf}>
              <Text style={[s.videoHalfLabel, { color: colors.textMuted }]}>Your response</Text>
              <TouchableOpacity
                style={[s.videoBox, { backgroundColor: colors.backgroundTertiary, borderWidth: 2, borderColor: colors.border, borderStyle: "dashed" }]}
                onPress={pickVideo}
                activeOpacity={0.8}
              >
                {videoUri ? (
                  Platform.OS !== "web" ? (
                    <Video
                      source={{ uri: videoUri }}
                      style={StyleSheet.absoluteFill}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay={false}
                      isLooping
                      isMuted
                    />
                  ) : (
                    // @ts-ignore
                    <video
                      src={videoUri}
                      muted
                      playsInline
                      loop
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  )
                ) : (
                  <View style={{ alignItems: "center", gap: 8 }}>
                    <Ionicons name="add-circle-outline" size={36} color={colors.textMuted} />
                    <Text style={[s.pickText, { color: colors.textMuted }]}>Tap to pick video</Text>
                  </View>
                )}
                {videoUri && (
                  <View style={s.videoLabel}>
                    <Text style={s.videoLabelText} numberOfLines={1}>You</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {videoUri && (
            <TouchableOpacity style={[s.changeBtn, { borderColor: colors.border }]} onPress={pickVideo}>
              <Ionicons name="swap-horizontal" size={16} color={colors.text} />
              <Text style={[s.changeBtnText, { color: colors.text }]}>Change video</Text>
            </TouchableOpacity>
          )}

          {/* Caption */}
          <View style={[s.captionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TextInput
              style={[s.captionInput, { color: colors.text }]}
              placeholder="Add a caption..."
              placeholderTextColor={colors.textMuted}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={500}
            />
            <Text style={[s.captionCount, { color: colors.textMuted }]}>{caption.length}/500</Text>
          </View>

          {/* Info card */}
          <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
            <Text style={[s.infoText, { color: colors.textMuted }]}>
              Your duet will appear side-by-side with the original video in the feed. It will be public on your profile.
            </Text>
          </View>

          {loading && uploadProgress ? (
            <View style={s.progressRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={[s.progressText, { color: colors.textMuted }]}>{uploadProgress}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 52, alignItems: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  postBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  postBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  content: { padding: 16, gap: 16 },
  duetBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  duetBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sideBySide: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 0,
    height: 280,
  },
  videoHalf: { flex: 1, gap: 6 },
  videoHalfLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  videoBox: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  dividerLine: {
    width: 2,
    marginHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  dividerBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dividerBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  videoLabel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  videoLabelText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  pickText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  changeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  changeBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  captionCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  captionInput: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 60,
    textAlignVertical: "top",
  },
  captionCount: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "right" },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center" },
  progressText: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
