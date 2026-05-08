import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  PanResponder,
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
import { registerVideoAsset } from "@/lib/videoApi";
import {
  startPostUpload,
  updatePostProgress,
  finishPostUpload,
  failPostUpload,
} from "@/lib/postUploadStore";

const MAX_DURATION_SECONDS = 90;
const WARN_SIZE_MB = 80;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(seconds: number) {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

/**
 * Extract a thumbnail from a video using the HTML Canvas API (web only).
 * Seeks to `atSecond` and captures the frame.
 */
async function generateWebThumbnail(
  videoObjectUrl: string,
  atSecond: number,
): Promise<string | null> {
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
 * Extract a thumbnail on native using expo-video-thumbnails at `atMs` milliseconds.
 */
async function generateNativeThumbnail(
  videoUri: string,
  atMs: number,
): Promise<string | null> {
  try {
    const thumbMod = await import("expo-video-thumbnails");
    const fn =
      thumbMod.getThumbnailAsync ??
      (thumbMod as any).default?.getThumbnailAsync;
    if (!fn) return null;
    const result = await fn(videoUri, {
      time: Math.max(0, atMs),
      quality: 0.7,
    });
    return result?.uri ?? null;
  } catch {
    return null;
  }
}

// ─── Thumbnail scrubber ────────────────────────────────────────────────────

interface ScrubberProps {
  value: number;
  max: number;
  accentColor: string;
  onChange: (t: number) => void;
}

function ThumbnailScrubber({ value, max, accentColor, onChange }: ScrubberProps) {
  const trackWidthRef = useRef(1);

  const clampedPct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  function xToTime(x: number) {
    return Math.max(0, Math.min(max, (x / trackWidthRef.current) * max));
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        onChange(xToTime(e.nativeEvent.locationX));
      },
      onPanResponderMove: (e) => {
        onChange(xToTime(e.nativeEvent.locationX));
      },
    }),
  ).current;

  return (
    <View
      style={scrubStyles.outer}
      onLayout={(e) => {
        trackWidthRef.current = e.nativeEvent.layout.width || 1;
      }}
      {...panResponder.panHandlers}
    >
      <View style={scrubStyles.track}>
        <View
          style={[
            scrubStyles.fill,
            {
              width: `${clampedPct * 100}%` as any,
              backgroundColor: accentColor,
            },
          ]}
        />
      </View>
      <View
        style={[
          scrubStyles.thumb,
          {
            left: `${clampedPct * 100}%` as any,
            backgroundColor: accentColor,
          },
        ]}
      />
    </View>
  );
}

const scrubStyles = StyleSheet.create({
  outer: {
    height: 36,
    justifyContent: "center",
    position: "relative",
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.25)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 2,
  },
  thumb: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    top: "50%",
    marginTop: -10,
    marginLeft: -10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
});

// ─── Main screen ───────────────────────────────────────────────────────────

export default function CreateVideoScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { soundName, soundAlbumArt } = useLocalSearchParams<{
    soundName?: string;
    soundAlbumArt?: string;
  }>();

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState<string | undefined>(undefined);
  const [duration, setDuration] = useState<number>(0);
  const [fileSize, setFileSize] = useState<number>(0);
  const [videoWidth, setVideoWidth] = useState<number | null>(null);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [soundDismissed, setSoundDismissed] = useState(false);

  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [thumbTime, setThumbTime] = useState<number>(1);
  const [thumbGenerating, setThumbGenerating] = useState(false);

  const videoRef = useRef<Video>(null);
  const webFileInputRef = useRef<HTMLInputElement | null>(null);
  const thumbDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Regenerate thumbnail whenever thumbTime or videoUri changes ───────────
  useEffect(() => {
    if (!videoUri) return;

    if (thumbDebounceRef.current) clearTimeout(thumbDebounceRef.current);

    setThumbGenerating(true);

    thumbDebounceRef.current = setTimeout(async () => {
      try {
        let uri: string | null = null;
        if (Platform.OS === "web") {
          uri = await generateWebThumbnail(videoUri, thumbTime);
        } else if (!videoUri.startsWith("blob:")) {
          uri = await generateNativeThumbnail(videoUri, Math.round(thumbTime * 1000));
        }
        if (uri) setThumbnailUri(uri);
      } catch {
        // non-fatal
      } finally {
        setThumbGenerating(false);
      }
    }, 280);

    return () => {
      if (thumbDebounceRef.current) clearTimeout(thumbDebounceRef.current);
    };
  }, [thumbTime, videoUri]);

  // ── Web file input ─────────────────────────────────────────────────────────
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
        showAlert(
          "Too long",
          `Videos must be ${MAX_DURATION_SECONDS} seconds or shorter.`,
        );
        return;
      }
      setDuration(dur);
      setVideoWidth(probe.videoWidth || null);
      setVideoHeight(probe.videoHeight || null);
    } catch {
      // Non-fatal — upload without metadata.
    }

    setThumbTime(1);
  }

  // ── Native picker ──────────────────────────────────────────────────────────
  async function pickVideo() {
    if (Platform.OS === "web") {
      pickVideoWeb();
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(
        "Permission required",
        "Please allow access to your media library to pick a video.",
      );
      return;
    }
    const { getVideoPickerQuality } = await import("@/lib/networkQuality");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "videos",
      allowsEditing: false,
      quality: getVideoPickerQuality(),
      videoMaxDuration: MAX_DURATION_SECONDS,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const dur = (asset.duration || 0) / 1000;
      if (dur > MAX_DURATION_SECONDS) {
        showAlert(
          "Too long",
          `Videos must be ${MAX_DURATION_SECONDS} seconds or shorter.`,
        );
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

      setThumbTime(1);
    }
  }

  // ── Post ───────────────────────────────────────────────────────────────────
  function post() {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    if (!videoUri) {
      showAlert("No video", "Please pick a video first.");
      return;
    }
    if (!caption.trim()) {
      showAlert(
        "Caption required",
        "Please add a caption for your video before posting.",
      );
      return;
    }

    if (fileSize > WARN_SIZE_MB * 1024 * 1024) {
      showAlert(
        "Large file",
        `This video is ${formatBytes(fileSize)}. Large videos take longer to upload and use more data. Continue?`,
        [
          { text: "Cancel", style: "cancel", onPress: () => {} },
          { text: "Upload anyway", style: "default", onPress: () => doPost() },
        ],
      );
      return;
    }
    doPost();
  }

  function doPost() {
    // Capture all state before navigating away
    const _videoUri = videoUri!;
    const _videoMime = videoMime;
    const _caption = caption.trim();
    const _thumbnailUri = thumbnailUri;
    const _thumbTime = thumbTime;
    const _duration = duration;
    const _fileSize = fileSize;
    const _videoWidth = videoWidth;
    const _videoHeight = videoHeight;
    const _userId = user!.id;
    const _soundName = soundName;
    const _soundDismissed = soundDismissed;

    // Navigate immediately — upload runs in the background
    if (router.canDismiss()) {
      router.dismissAll();
    } else {
      router.replace("/(tabs)");
    }

    startPostUpload("video", _caption);

    (async () => {
      try {
        // Step 1: Prepare — file type detection and path setup
        updatePostProgress(0.05);

        const rawExt =
          _videoUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
        const ext = ["mp4", "mov", "avi", "webm", "mkv", "m4v"].includes(rawExt)
          ? rawExt
          : "mp4";
        const filePath = `${_userId}/${Date.now()}.${ext}`;
        const resolvedMime =
          _videoMime || (ext === "mov" ? "video/quicktime" : `video/${ext}`);

        // Step 2: Network-aware pre-compression on cellular to save upload data
        // On WiFi the server re-encodes anyway, so we skip client compression there.
        let uploadUri = _videoUri;
        if (Platform.OS !== "web" && !_videoUri.startsWith("blob:")) {
          try {
            const { isCellular } = await import("@/lib/networkQuality");
            if (isCellular()) {
              // Attempt hardware-accelerated compression to ~720p before upload.
              // Falls back to original if the compressor isn't available (Expo Go).
              const Compressor = await import("react-native-compressor").catch(() => null);
              if (Compressor?.Video?.compress) {
                updatePostProgress(0.1);
                const compressed = await Compressor.Video.compress(_videoUri, {
                  compressionMethod: "auto",
                  maxSize: 1280,
                  bitrate: 1_500_000,
                }, (progress: number) => {
                  // Map 0–100 → 0.10–0.20 in the progress bar
                  updatePostProgress(0.1 + progress * 0.001);
                });
                if (compressed) uploadUri = compressed;
              }
            }
          } catch {
            // Non-fatal — continue with original file
          }
        }

        updatePostProgress(0.2);
        const { publicUrl, error: uploadError } = await uploadToStorage(
          "videos",
          filePath,
          uploadUri,
          resolvedMime,
        );
        if (uploadError || !publicUrl)
          throw new Error(uploadError || "Upload failed");

        updatePostProgress(0.7);
        let thumbnailPublicUrl: string | null = null;
        try {
          let thumbLocalUri = _thumbnailUri;
          if (!thumbLocalUri) {
            if (Platform.OS === "web") {
              thumbLocalUri = await generateWebThumbnail(_videoUri, _thumbTime);
            } else if (!_videoUri.startsWith("blob:")) {
              thumbLocalUri = await generateNativeThumbnail(
                _videoUri,
                Math.round(_thumbTime * 1000),
              );
            }
          }
          if (thumbLocalUri) {
            const thumbPath = `${_userId}/${Date.now()}_thumb.jpg`;
            const uploaded = await uploadToStorage(
              "videos",
              thumbPath,
              thumbLocalUri,
              "image/jpeg",
            );
            if (uploaded.publicUrl) thumbnailPublicUrl = uploaded.publicUrl;
          }
        } catch (_) {}

        updatePostProgress(0.85);
        const { data: insertedPost, error } = await supabase
          .from("posts")
          .insert({
            author_id: _userId,
            content: _caption,
            video_url: publicUrl,
            image_url: thumbnailPublicUrl,
            post_type: "video",
            visibility: "public",
            view_count: 0,
            ...(_soundName && !_soundDismissed ? { audio_name: _soundName } : {}),
          })
          .select("id")
          .single();
        if (error) throw error;

        const newPostId = (insertedPost as { id?: string } | null)?.id ?? null;
        registerVideoAsset({
          source_path: filePath,
          post_id: newPostId,
          duration: _duration > 0 ? _duration : null,
          width: _videoWidth,
          height: _videoHeight,
          source_size_bytes: _fileSize > 0 ? _fileSize : null,
          source_mime: resolvedMime,
        }).catch((e) => console.warn("registerVideoAsset:", e));

        try {
          const { rewardXp } = await import("../../lib/rewardXp");
          rewardXp("post_created");
        } catch (_) {}

        finishPostUpload();
      } catch (err: any) {
        failPostUpload(err?.message || "Failed to post video.");
      }
    })();
  }

  const canPost = !!videoUri && !!caption.trim();
  const durationLabel =
    duration > 0 ? `${Math.round(duration)}s / ${MAX_DURATION_SECONDS}s` : "";
  const sizeLabel = fileSize > 0 ? formatBytes(fileSize) : "";
  const isLargeFile = fileSize > WARN_SIZE_MB * 1024 * 1024;
  const showScrubber = !!videoUri && duration > 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
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

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          New Video
        </Text>
        <TouchableOpacity
          onPress={post}
          disabled={!canPost}
          style={[
            styles.postBtn,
            {
              backgroundColor: canPost
                ? colors.accent
                : colors.backgroundTertiary,
            },
          ]}
        >
          <Text
            style={[
              styles.postBtnText,
              { color: canPost ? "#fff" : colors.textMuted },
            ]}
          >
            Post
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Video picker / preview */}
          {!videoUri ? (
            <TouchableOpacity
              style={[
                styles.pickerArea,
                {
                  backgroundColor: colors.backgroundTertiary,
                  borderColor: colors.border,
                },
              ]}
              onPress={pickVideo}
            >
              <View
                style={[
                  styles.pickerIcon,
                  { backgroundColor: colors.accent + "20" },
                ]}
              >
                <Ionicons name="videocam" size={40} color={colors.accent} />
              </View>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>
                Tap to select a video
              </Text>
              <Text style={[styles.pickerSub, { color: colors.textMuted }]}>
                MP4, MOV, WebM · max {MAX_DURATION_SECONDS}s
              </Text>
            </TouchableOpacity>
          ) : (
            <View
              style={[
                styles.previewContainer,
                { backgroundColor: "#000" },
              ]}
            >
              <Video
                ref={videoRef}
                source={{ uri: videoUri }}
                style={styles.preview}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
                isLooping
                useNativeControls
              />

              <View style={styles.previewOverlay}>
                {durationLabel ? (
                  <View style={styles.durationBadge}>
                    <Ionicons name="time-outline" size={12} color="#fff" />
                    <Text style={styles.durationText}>{durationLabel}</Text>
                  </View>
                ) : null}
                {sizeLabel ? (
                  <View
                    style={[
                      styles.durationBadge,
                      isLargeFile && {
                        backgroundColor: "rgba(255,80,0,0.75)",
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        isLargeFile
                          ? "warning-outline"
                          : "cloud-upload-outline"
                      }
                      size={12}
                      color="#fff"
                    />
                    <Text style={styles.durationText}>{sizeLabel}</Text>
                  </View>
                ) : null}
              </View>
              <TouchableOpacity
                style={[
                  styles.changeVideoBtn,
                  { backgroundColor: colors.backgroundTertiary },
                ]}
                onPress={pickVideo}
              >
                <Ionicons name="swap-horizontal" size={16} color={colors.text} />
                <Text
                  style={[styles.changeVideoText, { color: colors.text }]}
                >
                  Change video
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Thumbnail picker */}
          {showScrubber ? (
            <View
              style={[
                styles.thumbCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.thumbCardHeader}>
                <Ionicons
                  name="image-outline"
                  size={16}
                  color={colors.textMuted}
                />
                <Text
                  style={[styles.thumbCardTitle, { color: colors.text }]}
                >
                  Thumbnail
                </Text>
                {thumbGenerating ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.accent}
                    style={{ marginLeft: "auto" }}
                  />
                ) : (
                  <View
                    style={[
                      styles.thumbReadyBadge,
                      { backgroundColor: colors.accent + "18", marginLeft: "auto" as any },
                    ]}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={12}
                      color={colors.accent}
                    />
                    <Text
                      style={[
                        styles.thumbReadyText,
                        { color: colors.accent },
                      ]}
                    >
                      Ready
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.thumbCardBody}>
                {/* Preview image */}
                <View
                  style={[
                    styles.thumbPreviewBox,
                    { backgroundColor: colors.backgroundTertiary },
                  ]}
                >
                  {thumbnailUri && !thumbGenerating ? (
                    <ExpoImage
                      source={{ uri: thumbnailUri }}
                      style={styles.thumbPreviewImg}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.thumbPreviewPlaceholder}>
                      {thumbGenerating ? (
                        <ActivityIndicator
                          size="small"
                          color={colors.textMuted}
                        />
                      ) : (
                        <Ionicons
                          name="image-outline"
                          size={28}
                          color={colors.textMuted}
                        />
                      )}
                    </View>
                  )}
                </View>

                {/* Scrubber controls */}
                <View style={styles.thumbScrubberArea}>
                  <View style={styles.thumbTimeRow}>
                    <Text
                      style={[
                        styles.thumbTimeLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Frame at
                    </Text>
                    <Text
                      style={[
                        styles.thumbTimeCurrent,
                        { color: colors.text },
                      ]}
                    >
                      {formatTime(thumbTime)}
                    </Text>
                    <Text
                      style={[
                        styles.thumbTimeSep,
                        { color: colors.textMuted },
                      ]}
                    >
                      /
                    </Text>
                    <Text
                      style={[
                        styles.thumbTimeTotal,
                        { color: colors.textMuted },
                      ]}
                    >
                      {formatTime(duration)}
                    </Text>
                  </View>

                  <ThumbnailScrubber
                    value={thumbTime}
                    max={duration}
                    accentColor={colors.accent}
                    onChange={(t) => setThumbTime(t)}
                  />

                  <Text
                    style={[styles.thumbHint, { color: colors.textMuted }]}
                  >
                    Drag to choose the frame for your thumbnail
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Sound banner */}
          {soundName && !soundDismissed ? (
            <View
              style={[
                styles.soundBanner,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              {soundAlbumArt ? (
                <ExpoImage
                  source={{ uri: soundAlbumArt }}
                  style={styles.soundArt}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.soundArt, styles.soundArtFallback]}>
                  <Ionicons
                    name="musical-notes"
                    size={16}
                    color={colors.accent}
                  />
                </View>
              )}
              <View style={styles.soundInfo}>
                <Text
                  style={[styles.soundLabel, { color: colors.textMuted }]}
                >
                  Using sound
                </Text>
                <Text
                  style={[styles.soundName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {soundName}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSoundDismissed(true)}
                hitSlop={8}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Caption */}
          <View
            style={[
              styles.captionBox,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              name="pencil-outline"
              size={18}
              color={colors.textMuted}
              style={{ marginTop: 2 }}
            />
            <TextInput
              style={[styles.captionInput, { color: colors.text }]}
              placeholder="Add a caption… (required) #hashtags @mentions"
              placeholderTextColor={colors.textMuted}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={500}
            />
          </View>

          {/* Tips */}
          <View
            style={[
              styles.tipsBox,
              { backgroundColor: colors.backgroundTertiary },
            ]}
          >
            <Text
              style={[styles.tipsTitle, { color: colors.textSecondary }]}
            >
              Tips for great videos
            </Text>
            {[
              "Keep it under 60 seconds for maximum engagement",
              "Good lighting makes a huge difference",
              "Add hashtags to reach more people",
            ].map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <View
                  style={[
                    styles.tipDot,
                    { backgroundColor: colors.accent },
                  ]}
                />
                <Text
                  style={[styles.tipText, { color: colors.textMuted }]}
                >
                  {tip}
                </Text>
              </View>
            ))}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  postBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  postBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  content: { padding: 20, gap: 16 },
  pickerArea: {
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
    gap: 12,
  },
  pickerIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  pickerSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  previewContainer: {
    borderRadius: 16,
    overflow: "hidden",
    aspectRatio: 9 / 16,
    maxHeight: 420,
  },
  preview: { flex: 1 },
  previewOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
    gap: 8,
  },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  durationText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  changeVideoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
  },
  changeVideoText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  // Thumbnail picker card
  thumbCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  thumbCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  thumbCardTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  thumbReadyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  thumbReadyText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  thumbCardBody: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  thumbPreviewBox: {
    width: 72,
    height: 104,
    borderRadius: 8,
    overflow: "hidden",
    flexShrink: 0,
  },
  thumbPreviewImg: { width: "100%", height: "100%" },
  thumbPreviewPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbScrubberArea: {
    flex: 1,
    gap: 6,
  },
  thumbTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  thumbTimeLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginRight: 2,
  },
  thumbTimeCurrent: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  thumbTimeSep: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  thumbTimeTotal: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  thumbHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },

  // Sound banner
  soundBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  soundArt: { width: 44, height: 44, borderRadius: 8 },
  soundArtFallback: {
    backgroundColor: "rgba(0,188,212,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  soundInfo: { flex: 1, gap: 2 },
  soundLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  soundName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  // Caption
  captionBox: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "flex-start",
  },
  captionInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    minHeight: 60,
  },

  // Tips
  tipsBox: { borderRadius: 12, padding: 16, gap: 8 },
  tipsTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tipDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 7 },
  tipText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },

  // Progress
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
