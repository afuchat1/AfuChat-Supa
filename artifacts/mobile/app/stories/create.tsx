import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import { TextInput } from "@/components/ui/AfuTextInput";
import type { TextInputInstance } from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GlassBackButton } from "@/components/ui/GlassBackButton";
import { LinearGradient } from "@/components/ui/SafeGradient";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "@/lib/haptics";
import MediaGalleryPicker, { type GalleryAsset } from "@/components/MediaGalleryPicker";
import VideoPreview from "@/components/ui/VideoPreview";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import StoryMusicPickerModal, { type StoryMusicSelection } from "@/components/stories/StoryMusicPickerModal";
import type { AfuMusicTrack } from "@/modules/afumusic";

import Colors from "@/constants/colors";
import { useAppAccent } from "@/context/AppAccentContext";
import { showAlert } from "@/lib/alert";
import {
  cleanupPreparedMediaForUpload,
  prepareMediaForUpload,
  uploadToStorage,
} from "@/lib/mediaUpload";
import { consumeStoryMediaDraft } from "@/lib/storyMediaDraft";
import { IMAGE_STORY_DURATION_SECONDS } from "@/lib/storyTiming";
import { useTheme } from "@/hooks/useTheme";
import * as FileSystem from "expo-file-system/legacy";
import { isOnline } from "@/lib/offlineStore";
import { getDailyUsage, recordDailyUsage } from "@/lib/featureUsage";
import {
  startStoryUpload,
  updateStoryProgress,
  finishStoryUpload,
  failStoryUpload,
} from "@/lib/storyUploadStore";

const CAPTION_MAX = 200;

type Privacy = "everyone" | "close_friends" | "only_me";
type StoryMentionProfile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
};
const PRIVACY_OPTIONS: { id: Privacy; label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; desc: string }[] = [
  { id: "everyone", label: "Everyone", icon: "earth", desc: "All your followers can see this story" },
  { id: "close_friends", label: "Close Friends", icon: "star", desc: "Only people in your close friends list" },
  { id: "only_me", label: "Only Me", icon: "lock-closed", desc: "Only you can see this story" },
];

export default function CreateStoryScreen() {
  const { accent } = useAppAccent();
  const { colors } = useTheme();
  const { user, profile, subscription } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const params = useLocalSearchParams<{ mediaUri?: string; mediaType?: string; mediaDuration?: string }>();
  const mediaDraft = consumeStoryMediaDraft();
  const [mediaUri, setMediaUri] = useState<string | null>(params.mediaUri ?? mediaDraft?.uri ?? null);
  useEffect(() => {
    return () => {
      if (mediaUri) void cleanupPreparedMediaForUpload(mediaUri);
    };
  }, [mediaUri]);
  const [mediaType, setMediaType] = useState<"image" | "video">(
    params.mediaType === "video" ? "video" : mediaDraft?.mediaType === "video" ? "video" : "image"
  );
  const routeDuration = Number(params.mediaDuration);
  const [mediaDurationSeconds, setMediaDurationSeconds] = useState(
    mediaDraft?.durationSeconds ??
      (Number.isFinite(routeDuration) && routeDuration > 0 ? routeDuration : 0),
  );
  const [caption, setCaption] = useState("");
  const [mediaMimeType, setMediaMimeType] = useState<string | null>(mediaDraft?.mimeType ?? null);
  const [starting, setStarting] = useState(false);
  const [privacy, setPrivacy] = useState<Privacy>("everyone");
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionResults, setMentionResults] = useState<StoryMentionProfile[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<AfuMusicTrack | null>(null);
  const [musicStartSeconds, setMusicStartSeconds] = useState(0);
  const [showEmojis, setShowEmojis] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [tintColor, setTintColor] = useState<string | null>(null);

  const shareScale = useRef(new Animated.Value(1)).current;
  const captionRef = useRef<TextInputInstance>(null);
  const mentionSearchRequest = useRef(0);
  const previewRadius = 24;
  const previewMargin = 8;
  const previewW = screenW - previewMargin * 2;
  const previewH = Math.min(screenH * 0.65, previewW * 1.6);

  const handleVideoDuration = useCallback((durationSeconds: number) => {
    setMediaDurationSeconds((current) =>
      Math.abs(current - durationSeconds) > 0.05 ? durationSeconds : current,
    );
  }, []);

  function pickMedia() {
    setShowMediaPicker(true);
  }

  async function searchStoryMentions(value: string) {
    setMentionSearch(value);
    const query = value.trim().replace(/^@/, "").replace(/[^a-zA-Z0-9_.\-\s]/g, "").slice(0, 48);
    const requestId = ++mentionSearchRequest.current;
    if (query.length < 2) {
      setMentionResults([]);
      setMentionLoading(false);
      return;
    }

    setMentionLoading(true);
    try {
      let request = supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url")
        .or(`handle.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(10);
      if (user?.id) request = request.neq("id", user.id);
      const { data, error } = await request;
      if (error) throw error;
      if (requestId === mentionSearchRequest.current) {
        setMentionResults((data ?? []) as StoryMentionProfile[]);
      }
    } catch {
      if (requestId === mentionSearchRequest.current) setMentionResults([]);
    } finally {
      if (requestId === mentionSearchRequest.current) setMentionLoading(false);
    }
  }

  function insertStoryMention(handle: string) {
    setCaption((current) => {
      const separator = current.length > 0 && !/\s$/.test(current) ? " " : "";
      return `${current}${separator}@${handle} `.slice(0, CAPTION_MAX);
    });
    setShowMentionPicker(false);
    setMentionSearch("");
    setMentionResults([]);
    setTimeout(() => captionRef.current?.focus(), 120);
  }

  function handleGallerySelect(assets: GalleryAsset[]) {
    const asset = assets[0];
    if (!asset) return;
    const isVideo = asset.mediaType === "video";
    setMediaType(isVideo ? "video" : "image");
    setMediaDurationSeconds(isVideo ? asset.duration : 0);
    setSelectedMusic(null);
    setMusicStartSeconds(0);
    setMediaMimeType(isVideo ? "video/mp4" : "image/jpeg");
    // MediaLibrary can return a content:// URI or an Expo host-cache URI.
    // Resolve it while the picker is still active, before publishing.
    prepareMediaForUpload(asset.uri, isVideo ? "mp4" : "jpg")
      .then(setMediaUri)
      .catch((error: any) => {
        setMediaUri(null);
        showAlert("Could not read file", error?.message || "Please choose the media again.");
      });
  }

  async function publish() {
    if (starting || !mediaUri || !user) return;

    if (selectedMusic) {
      const storyDuration = mediaType === "video" ? mediaDurationSeconds : IMAGE_STORY_DURATION_SECONDS;
      if (
        !storyDuration ||
        !selectedMusic.durationSeconds ||
        musicStartSeconds + storyDuration > selectedMusic.durationSeconds + 0.05
      ) {
        showAlert("Soundtrack needs an update", "Choose a longer excerpt or wait for the video duration to finish loading.");
        return;
      }
    }

    if (!isOnline()) {
      showAlert("No internet", "Publishing a story requires an internet connection.");
      return;
    }

    if (selectedMusic) {
      const { error: schemaError } = await supabase
        .from("stories")
        .select("music_track_id, music_start_seconds, music_end_seconds")
        .limit(0);
      if (schemaError) {
        const message = String(schemaError.message || "").toLowerCase();
        const missingMusicColumn = ["music_track_id", "music_start_seconds", "music_end_seconds"]
          .some((column) => message.includes(column));
        showAlert(
          missingMusicColumn ? "Story music isn't ready" : "Could not check story music",
          missingMusicColumn
            ? "The story-music database update is not available yet. Your story was not uploaded."
            : "Please try again before sharing this story.",
        );
        return;
      }
    }

    setStarting(true);
    const tier = (subscription?.plan_tier as "free" | "silver" | "gold" | "platinum") || "free";
    const usage = await getDailyUsage("stories_create", tier);
    if (!usage.allowed) {
      setStarting(false);
      const nextTier = tier === "free" ? "Standard" : tier === "silver" ? "Pro" : "Platinum";
      showAlert(
        "Daily story limit reached",
        `You've shared all ${usage.limit} free stories for today. Upgrade to ${nextTier} for more.`,
        [
          { text: `Upgrade to ${nextTier}`, onPress: () => router.push("/premium") },
          { text: "OK" },
        ]
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Capture for background closure before navigation
    const _mediaType = mediaType;
    const _mediaMimeType = mediaMimeType;
    const _caption = caption.trim();
    const _privacy = privacy;
    const _userId = user.id;
    const _musicTrackId = selectedMusic?.id ?? null;
    const _musicStartSeconds = musicStartSeconds;
    const storyClipDurationSeconds = mediaType === "video"
      ? mediaDurationSeconds
      : IMAGE_STORY_DURATION_SECONDS;
    const _musicEndSeconds = musicStartSeconds + storyClipDurationSeconds;

    // ── Stable file copy (native) ──────────────────────────────────────────
    // Picker URIs can point to volatile temp locations. Copy user media into
    // persistent app storage before publishing so OS cache cleanup cannot
    // remove the source while the upload is running.
    // We skip data: and blob: (already in-memory) and web (no FileSystem).
    //
    // IMPORTANT: In Expo Go on Android the ImagePicker writes temp files to the
    // host app's private sandbox (/data/user/0/host.exp.exponent/…). That path
    // is inaccessible to FileSystem.copyAsync (cross-app sandbox boundary), so
    // the copy will throw FileNotFoundException. When that happens we do NOT
    // abort — we warn and proceed with the original URI. uploadToStorage then
    // attempts FileSystem.uploadAsync directly on the original path, which goes
    // through Android's native layer and CAN cross that boundary, or falls back
    // to the proxy upload path. Either way the upload has a chance to succeed.
    let _mediaUri = mediaUri;
    const isNativeFileUri =
      Platform.OS !== "web" &&
      !mediaUri.startsWith("data:") &&
      !mediaUri.startsWith("blob:");
    const stagingDirectory = FileSystem.documentDirectory
      ? `${FileSystem.documentDirectory}afuchat_upload_staging/`
      : null;
    if (isNativeFileUri && stagingDirectory) {
      try {
        if (mediaUri.startsWith(stagingDirectory)) {
          const existing = await FileSystem.getInfoAsync(mediaUri);
          if (existing.exists) {
            _mediaUri = mediaUri;
          } else {
            throw new Error("Saved story media is no longer available.");
          }
        } else {
          const rawExt =
            mediaUri.split(".").pop()?.split("?")[0]?.toLowerCase() || (_mediaType === "video" ? "mp4" : "jpg");
          await FileSystem.makeDirectoryAsync(stagingDirectory, { intermediates: true });
          const safeExt = rawExt.replace(/[^a-z0-9]/gi, "").slice(0, 8) || (_mediaType === "video" ? "mp4" : "jpg");
          const uniqueSuffix = Math.random().toString(36).slice(2, 10);
          const stablePath = `${stagingDirectory}story_src_${Date.now()}_${uniqueSuffix}.${safeExt}`;
          await FileSystem.copyAsync({ from: mediaUri, to: stablePath });
          _mediaUri = stablePath;
        }
      } catch (copyErr: any) {
        // Non-fatal: Expo Go on Android cannot copy from the host app's private
        // ImagePicker cache via FileSystem. Log and continue with the original
        // URI — uploadToStorage has a readable-URI fallback and will report a
        // clear error if it is gone.
        console.warn("[Story Publish] Pre-copy skipped:", copyErr?.message || copyErr);
      }
    }

    // Keep this screen mounted until the native upload finishes. Expo Go on
    // Android can return media from the host app's temporary cache; dismissing
    // this screen first lets that URI disappear before the native uploader has
    // finished reading it.
    startStoryUpload(_caption);

    try {
      updateStoryProgress(0.15);

      let ext: string;
      let mime: string;
      if (_mediaMimeType) {
        mime = _mediaMimeType;
        const mimeToExtMap: Record<string, string> = {
          "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
          "image/gif": "gif", "image/webp": "webp", "image/heic": "jpg",
          "image/heif": "jpg", "video/mp4": "mp4", "video/quicktime": "mov",
          "video/webm": "webm", "video/x-mkvideo": "mkv",
        };
        ext = mimeToExtMap[_mediaMimeType] || _mediaUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
      } else if (_mediaUri.startsWith("data:")) {
        const dataMime = _mediaUri.match(/data:([^;]+)/)?.[1] || "";
        ext = dataMime.includes("png") ? "png" : dataMime.includes("webp") ? "webp" : "jpg";
        mime = dataMime || "image/jpeg";
      } else {
        ext = _mediaUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "jpg";
        mime = _mediaType === "video"
          ? `video/${ext === "mov" ? "quicktime" : "mp4"}`
          : `image/${ext === "jpg" ? "jpeg" : ext}`;
      }

      updateStoryProgress(0.3);
      const uniqueSuffix = Math.random().toString(36).slice(2, 10);
      const fileName = `${_userId}/${Date.now()}_${uniqueSuffix}.${ext}`;
      const { publicUrl, error: uploadErr } = await uploadToStorage("stories", fileName, _mediaUri, mime);

      if (uploadErr || !publicUrl) {
        console.error("[Story Upload] Upload failed:", uploadErr);
        failStoryUpload(uploadErr || "Upload failed");
        setStarting(false);
        showAlert("Story upload failed", uploadErr || "Could not read the selected photo or video. Please choose it again.");
        return;
      }

      updateStoryProgress(0.75);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const storyInsert = {
        user_id: _userId,
        media_url: publicUrl,
        media_type: _mediaType,
        caption: _caption || null,
        expires_at: expiresAt,
        privacy: _privacy,
        ...(_musicTrackId ? {
          music_track_id: _musicTrackId,
          music_start_seconds: _musicStartSeconds,
          music_end_seconds: _musicEndSeconds,
        } : {}),
      };
      const { data: createdStory, error } = await supabase
        .from("stories")
        .insert(storyInsert)
        .select("id")
        .single();

      if (error) {
        console.error("[Story Upload] DB insert failed:", error.message);
        failStoryUpload(error.message || "Failed to save story");
        setStarting(false);
        showAlert("Story could not be shared", error.message || "Failed to save your story. Please try again.");
        return;
      }

      let mentionDeliveryFailed = false;
      if (createdStory?.id && /@[a-zA-Z0-9_.-]{1,32}/.test(_caption)) {
        const { error: mentionError } = await supabase.rpc("share_story_mentions", {
          p_story_id: createdStory.id,
        });
        if (mentionError) {
          mentionDeliveryFailed = true;
          console.error("[Story mentions] Delivery failed:", mentionError.message);
        }
      }

      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("story_created"); } catch (_) {}
      await recordDailyUsage("stories_create");
      await cleanupPreparedMediaForUpload(_mediaUri);
      finishStoryUpload();

      if (router.canDismiss()) {
        router.dismissAll();
      } else {
        router.replace("/(tabs)/chats");
      }
      if (mentionDeliveryFailed) {
        setTimeout(() => {
          showAlert(
            "Story shared, but mentions were not delivered",
            "Please try again later. Your story is already live.",
          );
        }, 300);
      }
    } catch (error: any) {
      const message = error?.message || "Could not publish story. Please try again.";
      console.error("[Story Upload] Unexpected failure:", message);
      failStoryUpload(message);
      setStarting(false);
      showAlert("Story upload failed", message);
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
  const storyClipDurationSeconds = mediaType === "video"
    ? mediaDurationSeconds
    : IMAGE_STORY_DURATION_SECONDS;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {starting && (
        <View style={[styles.progressBar, { top: insets.top }]}>
          <LinearGradient
            colors={[accent, "#26C6DA"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: "40%" }]}
          />
        </View>
      )}

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <GlassBackButton
          style={styles.topBtn}
          onPress={() => router.back()}
          icon="close"
          accessibilityLabel="Close"
        />

        <View style={styles.topCenter}>
          {starting && (
            <View style={styles.uploadingPill}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.uploadingText}>Checking...</Text>
            </View>
          )}
        </View>

        <View style={styles.topRight}>
          <TouchableOpacity
            style={styles.topBtn}
            onPress={pickMedia}
            hitSlop={12}
          >
            <Ionicons name="images" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <View style={styles.previewContainer}>
          {mediaUri ? (
            <View style={[styles.previewWrap, { width: previewW, height: previewH, borderRadius: previewRadius, backgroundColor: colors.backgroundSecondary }]}>
              {mediaType === "video" ? (
                <VideoPreview
                  uri={mediaUri!}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                  shouldPlay
                  isLooping
                  isMuted={!!selectedMusic}
                  onDurationChange={handleVideoDuration}
                />
              ) : (
                <Image
                  source={{ uri: mediaUri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="contain"
                />
              )}

              {/* Tint colour overlay */}
              {tintColor && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: tintColor, borderRadius: previewRadius, pointerEvents: "none" }]} />
              )}

              <View style={styles.sideToolbar}>
                {/* Retake → go back to camera */}
                <TouchableOpacity style={styles.sideBtn} onPress={() => router.back()} activeOpacity={0.75}>
                  <Ionicons name="camera-reverse" size={22} color="#fff" />
                </TouchableOpacity>
                {/* Text → focus caption */}
                <TouchableOpacity style={styles.sideBtn} activeOpacity={0.75}
                  onPress={() => { setShowEmojis(false); setShowColors(false); captionRef.current?.focus(); }}>
                  <Ionicons name="text" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sideBtn}
                  activeOpacity={0.75}
                  onPress={() => {
                    setShowEmojis(false);
                    setShowColors(false);
                    setMentionSearch("");
                    setMentionResults([]);
                    setShowMentionPicker(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Mention someone in your story"
                  testID="story-mention-button"
                >
                  <Ionicons name="at" size={22} color="#fff" />
                </TouchableOpacity>
                {/* Emoji picker toggle */}
                <TouchableOpacity style={[styles.sideBtn, showEmojis && { backgroundColor: "rgba(255,255,255,0.35)" }]}
                  activeOpacity={0.75}
                  onPress={() => { setShowColors(false); setShowEmojis((v) => !v); }}>
                  <Ionicons name="happy" size={22} color="#fff" />
                </TouchableOpacity>
                {/* Colour tint toggle */}
                <TouchableOpacity style={[styles.sideBtn, showColors && { backgroundColor: "rgba(255,255,255,0.35)" }]}
                  activeOpacity={0.75}
                  onPress={() => { setShowEmojis(false); setShowColors((v) => !v); }}>
                  <Ionicons name="brush" size={22} color={tintColor ? "#fff" : "#fff"} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sideBtn, selectedMusic && { backgroundColor: accent }]}
                  activeOpacity={0.75}
                  onPress={() => {
                    if (mediaType === "video" && mediaDurationSeconds <= 0) {
                      showAlert("Video still loading", "Wait for the video duration to load before adding music.");
                      return;
                    }
                    setShowMusicPicker(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={selectedMusic ? "Edit story soundtrack" : "Add story soundtrack"}
                >
                  <Ionicons name="musical-notes" size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              {selectedMusic && (
                <View style={[styles.musicBadge, { top: mediaType === "video" ? 48 : 16 }]}>
                  <Ionicons name="musical-notes" size={13} color="#fff" />
                  <Text numberOfLines={1} style={styles.musicBadgeText}>{selectedMusic.title}</Text>
                  <TouchableOpacity
                    onPress={() => { setSelectedMusic(null); setMusicStartSeconds(0); }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove story soundtrack"
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Emoji quick-pick panel */}
              {showEmojis && (
                <View style={styles.emojiPanel}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiScroll}>
                    {["😊","😂","❤️","🔥","👍","😍","🎉","😎","🙏","💪","🤩","💯","😭","👀","🫶","🥳","😅","🤣","🌟"].map((e) => (
                      <TouchableOpacity key={e} style={styles.emojiItem}
                        onPress={() => { setCaption((c) => (c + e).slice(0, CAPTION_MAX)); setShowEmojis(false); }}>
                        <Text style={{ fontSize: 26 }}>{e}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Colour tint panel */}
              {showColors && (
                <View style={styles.colorPanel}>
                  {[null, "#FF000055", "#FF660055", "#FFD70055", "#00CC4455", "#0088FF55", "#9900FF55", "#FF007755"].map((c, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.colorDot,
                        { backgroundColor: c ?? "transparent", borderWidth: c === null ? 1.5 : tintColor === c ? 3 : 0,
                          borderColor: c === null ? "rgba(255,255,255,0.6)" : "#fff" }]}
                      onPress={() => { setTintColor(tintColor === c ? null : c); setShowColors(false); }}
                    >
                      {c === null && <Ionicons name="close" size={14} color="rgba(255,255,255,0.7)" />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.65)"]}
                style={styles.captionOverlay}
              >
                <View style={styles.captionRow}>
                  <TextInput
                    ref={captionRef}
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
              <Ionicons name="time" size={13} color="rgba(255,255,255,0.5)" />
              <Text style={styles.expiryText}>24h</Text>
            </View>
          </View>

          <Animated.View style={{ transform: [{ scale: shareScale }] }}>
            <Pressable
              onPress={publish}
              onPressIn={handleSharePressIn}
              onPressOut={handleSharePressOut}
              disabled={!mediaUri || starting}
              style={[
                styles.shareBtn,
                (!mediaUri || starting) && { opacity: 0.4 },
              ]}
            >
              <LinearGradient
                colors={[accent, "#1D73B7"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.shareBtnGradient}
              >
                {starting ? (
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
            style={[styles.modalSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Who can see your story?</Text>

            {PRIVACY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.privacyRow,
                  privacy === opt.id && [styles.privacyRowActive, { backgroundColor: colors.backgroundSecondary }],
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
                  privacy === opt.id && { backgroundColor: accent + "20" },
                ]}>
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={privacy === opt.id ? accent : colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.privacyLabel,
                    { color: colors.text },
                  ]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.privacyDesc, { color: colors.textMuted }]}>{opt.desc}</Text>
                </View>
                {privacy === opt.id && (
                  <Ionicons name="checkmark-circle" size={22} color={accent} />
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      )}
      <Modal
        visible={showMentionPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMentionPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowMentionPicker(false)}
        >
          <Pressable
            style={[styles.modalSheet, styles.mentionSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            <View style={styles.mentionHeader}>
              <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>Mention someone</Text>
              <TouchableOpacity
                onPress={() => setShowMentionPicker(false)}
                accessibilityRole="button"
                accessibilityLabel="Close mention picker"
                hitSlop={10}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={[styles.mentionSearchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="search" size={17} color={colors.textMuted} />
              <TextInput
                appearance="embedded"
                style={[styles.mentionSearchInput, { color: colors.text }]}
                placeholder="Search by name or handle"
                placeholderTextColor={colors.textMuted}
                value={mentionSearch}
                onChangeText={searchStoryMentions}
                autoFocus
                testID="story-mention-search"
              />
              {mentionLoading && <ActivityIndicator size="small" color={colors.accent} />}
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 320 }}
              showsVerticalScrollIndicator={false}
            >
              {mentionResults.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.mentionResultRow}
                  onPress={() => insertStoryMention(item.handle)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Mention @${item.handle}`}
                >
                  <Avatar uri={item.avatar_url} name={item.display_name || item.handle} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mentionHandle, { color: colors.text }]} numberOfLines={1}>
                      @{item.handle}
                    </Text>
                    {!!item.display_name && item.display_name !== item.handle && (
                      <Text style={[styles.mentionDisplayName, { color: colors.textMuted }]} numberOfLines={1}>
                        {item.display_name}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
              {mentionResults.length === 0 && (
                <Text style={[styles.mentionEmpty, { color: colors.textMuted }]}>
                  {mentionLoading
                    ? "Searching…"
                    : mentionSearch.trim().length >= 2
                      ? "No users found"
                      : "Type at least two characters"}
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <MediaGalleryPicker
        visible={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        title="Pick Story Media"
        initialTab="all"
        maxSelection={1}
        onSelect={handleGallerySelect}
      />
      {showMusicPicker && (
        <StoryMusicPickerModal
          visible
          clipDurationSeconds={storyClipDurationSeconds}
          initialTrack={selectedMusic}
          initialStartSeconds={musicStartSeconds}
          onClose={() => setShowMusicPicker(false)}
          onConfirm={(selection: StoryMusicSelection) => {
            setSelectedMusic(selection.track);
            setMusicStartSeconds(selection.startSeconds);
          }}
        />
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
    ...Platform.select({
      web: { textShadow: "0 1px 3px rgba(0,0,0,0.5)" } as any,
      default: { textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
    }),
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
  musicBadge: {
    position: "absolute",
    left: 16,
    maxWidth: "68%",
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  musicBadgeText: {
    flexShrink: 1,
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  emojiPanel: {
    position: "absolute",
    bottom: 90,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingVertical: 10,
  },
  emojiScroll: {
    paddingHorizontal: 12,
    gap: 4,
  },
  emojiItem: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  colorPanel: {
    position: "absolute",
    bottom: 90,
    right: 8,
    flexDirection: "column",
    gap: 8,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
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
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
    zIndex: 200,
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  mentionSheet: {
    maxHeight: "76%",
  },
  mentionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  mentionSearchWrap: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  mentionSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 10,
  },
  mentionResultRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  mentionHandle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  mentionDisplayName: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  mentionEmpty: {
    paddingVertical: 22,
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
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
