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
      onPanResponderGrant: (e) => { onChange(xToTime(e.nativeEvent.locationX)); },
      onPanResponderMove: (e) => { onChange(xToTime(e.nativeEvent.locationX)); },
    }),
  ).current;
  return (
    <View
      style={scrubStyles.outer}
      onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width || 1; }}
      {...panResponder.panHandlers}
    >
      <View style={scrubStyles.track}>
        <View style={[scrubStyles.fill, { width: `${clampedPct * 100}%` as any, backgroundColor: accentColor }]} />
      </View>
      <View style={[scrubStyles.thumb, { left: `${clampedPct * 100}%` as any, backgroundColor: accentColor }]} />
    </View>
  );
}

const scrubStyles = StyleSheet.create({
  outer: { height: 36, justifyContent: "center", position: "relative" },
  track: { height: 4, borderRadius: 2, backgroundColor: "rgba(128,128,128,0.25)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2 },
  thumb: {
    position: "absolute", width: 20, height: 20, borderRadius: 10,
    top: "50%", marginTop: -10, marginLeft: -10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3,
  },
});

const VIDEO_FILTERS = [
  { id: "normal",  label: "Normal",  overlay: null },
  { id: "vivid",   label: "Vivid",   overlay: "rgba(255,80,30,0.18)" },
  { id: "vintage", label: "Vintage", overlay: "rgba(200,140,60,0.28)" },
  { id: "cool",    label: "Cool",    overlay: "rgba(40,100,255,0.18)" },
  { id: "drama",   label: "Drama",   overlay: "rgba(0,0,0,0.35)" },
  { id: "glow",    label: "Glow",    overlay: "rgba(255,220,80,0.22)" },
  { id: "rose",    label: "Rose",    overlay: "rgba(255,60,120,0.18)" },
  { id: "teal",    label: "Teal",    overlay: "rgba(0,200,180,0.18)" },
];

const TRENDING_AVATARS = [
  { id: "none",   emoji: "",   label: "None",      bg: "transparent", border: true },
  { id: "fox",    emoji: "🦊", label: "Fox",       bg: "#FF6B35" },
  { id: "panda",  emoji: "🐼", label: "Panda",     bg: "#2D2D2D" },
  { id: "cat",    emoji: "🐱", label: "Cat",       bg: "#9B59B6" },
  { id: "frog",   emoji: "🐸", label: "Frog",      bg: "#27AE60" },
  { id: "lion",   emoji: "🦁", label: "Lion",      bg: "#E67E22" },
  { id: "wolf",   emoji: "🐺", label: "Wolf",      bg: "#7F8C8D" },
  { id: "bear",   emoji: "🐻", label: "Bear",      bg: "#8B4513" },
  { id: "fly",    emoji: "🦋", label: "Butterfly", bg: "#3498DB" },
  { id: "dragon", emoji: "🐉", label: "Dragon",    bg: "#C0392B" },
];

export default function CreateVideoScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { soundName, soundAlbumArt } = useLocalSearchParams<{ soundName?: string; soundAlbumArt?: string }>();

  const [mode, setMode] = useState<"library" | "camera">(Platform.OS === "web" ? "library" : "library");
  const [cameraFacing, setCameraFacing] = useState<"front" | "back">("back");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const cameraRef = useRef<any>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const [selectedFilter, setSelectedFilter] = useState("normal");
  const [selectedAvatar, setSelectedAvatar] = useState("none");

  const videoRef = useRef<Video>(null);
  const webFileInputRef = useRef<HTMLInputElement | null>(null);
  const thumbDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      } catch {} finally {
        setThumbGenerating(false);
      }
    }, 280);
    return () => { if (thumbDebounceRef.current) clearTimeout(thumbDebounceRef.current); };
  }, [thumbTime, videoUri]);

  function pickVideoWeb() {
    if (Platform.OS !== "web" || !webFileInputRef.current) return;
    webFileInputRef.current.click();
  }

  async function handleWebFileChange(file: File | null) {
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) { showAlert("Too large", "Please pick a video smaller than 200 MB."); return; }
    const objectUrl = URL.createObjectURL(file);
    setVideoUri(objectUrl);
    setVideoMime(file.type || undefined);
    setFileSize(file.size || 0);
    setThumbnailUri(null);
    try {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.src = objectUrl;
      await new Promise<void>((resolve, reject) => { probe.onloadedmetadata = () => resolve(); probe.onerror = () => reject(); });
      const dur = isFinite(probe.duration) ? probe.duration : 0;
      if (dur > MAX_DURATION_SECONDS) { URL.revokeObjectURL(objectUrl); setVideoUri(null); showAlert("Too long", `Videos must be ${MAX_DURATION_SECONDS} seconds or shorter.`); return; }
      setDuration(dur);
      setVideoWidth(probe.videoWidth || null);
      setVideoHeight(probe.videoHeight || null);
    } catch {}
    setThumbTime(1);
  }

  async function pickVideo() {
    if (Platform.OS === "web") { pickVideoWeb(); return; }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showAlert("Permission required", "Please allow access to your media library."); return; }
    const { getVideoPickerQuality } = await import("@/lib/networkQuality");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "videos", allowsEditing: false, quality: getVideoPickerQuality(), videoMaxDuration: MAX_DURATION_SECONDS,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const dur = (asset.duration || 0) / 1000;
      if (dur > MAX_DURATION_SECONDS) { showAlert("Too long", `Videos must be ${MAX_DURATION_SECONDS} seconds or shorter.`); return; }
      setVideoUri(asset.uri);
      setVideoMime(asset.mimeType || undefined);
      setDuration(dur);
      setFileSize(0);
      setVideoWidth((asset as any).width ?? null);
      setVideoHeight((asset as any).height ?? null);
      setThumbnailUri(null);
      try { const info = await FileSystem.getInfoAsync(asset.uri); if (info.exists) setFileSize((info as any).size ?? 0); } catch {}
      setThumbTime(1);
    }
  }

  async function startCameraRecording() {
    if (!cameraRef.current || isRecording) return;
    try {
      const { Camera } = await import("expo-camera");
      const perm = await Camera.requestCameraPermissionsAsync();
      if (!perm.granted) { showAlert("Camera permission", "Allow camera access to record videos."); return; }
      const micPerm = await Camera.requestMicrophonePermissionsAsync();
      if (!micPerm.granted) { showAlert("Microphone permission", "Allow microphone access to record videos with audio."); return; }
    } catch {}
    setIsRecording(true);
    setRecordingSeconds(0);
    recordTimerRef.current = setInterval(() => {
      setRecordingSeconds((s) => {
        if (s + 1 >= MAX_DURATION_SECONDS) { stopCameraRecording(); return s; }
        return s + 1;
      });
    }, 1000);
    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: MAX_DURATION_SECONDS, quality: "720p" });
      if (result?.uri) {
        setVideoUri(result.uri);
        setVideoMime("video/mp4");
        setDuration(recordingSeconds > 0 ? recordingSeconds : 10);
        setThumbnailUri(null);
        setThumbTime(1);
        setMode("library");
      }
    } catch {}
    setIsRecording(false);
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
  }

  function stopCameraRecording() {
    if (!cameraRef.current || !isRecording) return;
    cameraRef.current.stopRecording?.();
    setIsRecording(false);
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
  }

  function post() {
    if (!user) { router.push("/(auth)/login"); return; }
    if (!videoUri) { showAlert("No video", "Please pick or record a video first."); return; }
    if (!caption.trim()) { showAlert("Caption required", "Please add a caption before posting."); return; }
    if (fileSize > WARN_SIZE_MB * 1024 * 1024) {
      showAlert("Large file", `This video is ${formatBytes(fileSize)}. Large videos take longer to upload. Continue?`, [
        { text: "Cancel", style: "cancel", onPress: () => {} },
        { text: "Upload anyway", style: "default", onPress: () => doPost() },
      ]);
      return;
    }
    doPost();
  }

  function doPost() {
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
    const _filter = selectedFilter !== "normal" ? selectedFilter : null;
    const _avatar = selectedAvatar !== "none" ? selectedAvatar : null;

    if (router.canDismiss()) { router.dismissAll(); } else { router.replace("/(tabs)"); }
    startPostUpload("video", _caption);

    (async () => {
      try {
        updatePostProgress(0.05);
        const rawExt = _videoUri.split(".").pop()?.split("?")[0]?.toLowerCase() || "";
        const ext = ["mp4","mov","avi","webm","mkv","m4v"].includes(rawExt) ? rawExt : "mp4";
        const filePath = `${_userId}/${Date.now()}.${ext}`;
        const resolvedMime = _videoMime || (ext === "mov" ? "video/quicktime" : `video/${ext}`);

        updatePostProgress(0.2);
        const { publicUrl, error: uploadError } = await uploadToStorage("videos", filePath, _videoUri, resolvedMime);
        if (uploadError || !publicUrl) throw new Error(uploadError || "Upload failed");

        updatePostProgress(0.7);
        let thumbnailPublicUrl: string | null = null;
        try {
          let thumbLocalUri = _thumbnailUri;
          if (!thumbLocalUri) {
            if (Platform.OS === "web") { thumbLocalUri = await generateWebThumbnail(_videoUri, _thumbTime); }
            else if (!_videoUri.startsWith("blob:")) { thumbLocalUri = await generateNativeThumbnail(_videoUri, Math.round(_thumbTime * 1000)); }
          }
          if (thumbLocalUri) {
            const thumbPath = `${_userId}/${Date.now()}_thumb.jpg`;
            const uploaded = await uploadToStorage("videos", thumbPath, thumbLocalUri, "image/jpeg");
            if (uploaded.publicUrl) thumbnailPublicUrl = uploaded.publicUrl;
          }
        } catch {}

        updatePostProgress(0.85);
        const { data: insertedPost, error } = await supabase.from("posts").insert({
          author_id: _userId,
          content: _caption,
          video_url: publicUrl,
          image_url: thumbnailPublicUrl,
          post_type: "video",
          visibility: "public",
          view_count: 0,
          ...(_soundName && !_soundDismissed ? { audio_name: _soundName } : {}),
          ...(_filter ? { filter: _filter } : {}),
          ...(_avatar ? { avatar_overlay: _avatar } : {}),
        }).select("id").single();
        if (error) throw error;

        const newPostId = (insertedPost as { id?: string } | null)?.id ?? null;
        registerVideoAsset({
          source_path: filePath, post_id: newPostId,
          duration: _duration > 0 ? _duration : null,
          width: _videoWidth, height: _videoHeight,
          source_size_bytes: _fileSize > 0 ? _fileSize : null,
          source_mime: resolvedMime,
        }).catch((e) => console.warn("registerVideoAsset:", e));

        try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_created"); } catch {}
        finishPostUpload();
      } catch (err: any) {
        failPostUpload(err?.message || "Failed to post video.");
      }
    })();
  }

  const canPost = !!videoUri && !!caption.trim();
  const durationLabel = duration > 0 ? `${Math.round(duration)}s / ${MAX_DURATION_SECONDS}s` : "";
  const sizeLabel = fileSize > 0 ? formatBytes(fileSize) : "";
  const isLargeFile = fileSize > WARN_SIZE_MB * 1024 * 1024;
  const showScrubber = !!videoUri && duration > 0;
  const activeFilter = VIDEO_FILTERS.find((f) => f.id === selectedFilter);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {Platform.OS === "web" ? (
        // @ts-ignore
        <input
          ref={webFileInputRef as any}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/*"
          style={{ display: "none" }}
          onChange={(e: any) => { const f = e.target?.files?.[0] ?? null; handleWebFileChange(f); if (e.target) e.target.value = ""; }}
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
          <Text style={[styles.postBtnText, { color: canPost ? "#fff" : colors.textMuted }]}>Post</Text>
        </TouchableOpacity>
      </View>

      {/* Mode tabs (native only) */}
      {Platform.OS !== "web" && (
        <View style={[styles.modeTabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          {(["library", "camera"] as const).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setMode(m)}
              style={[styles.modeTab, mode === m && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
              activeOpacity={0.7}
            >
              <Ionicons
                name={m === "library" ? "images-outline" : "videocam-outline"}
                size={16}
                color={mode === m ? colors.accent : colors.textMuted}
              />
              <Text style={[styles.modeTabText, { color: mode === m ? colors.accent : colors.textMuted }]}>
                {m === "library" ? "Library" : "Camera"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* Camera mode (native only) */}
          {mode === "camera" && Platform.OS !== "web" ? (
            <CameraSection
              cameraRef={cameraRef}
              cameraFacing={cameraFacing}
              isRecording={isRecording}
              recordingSeconds={recordingSeconds}
              filterOverlay={activeFilter?.overlay ?? null}
              selectedAvatar={TRENDING_AVATARS.find((a) => a.id === selectedAvatar) ?? null}
              onFlipCamera={() => setCameraFacing((f) => f === "back" ? "front" : "back")}
              onRecord={() => isRecording ? stopCameraRecording() : startCameraRecording()}
            />
          ) : (
            <>
              {/* Library: video picker / preview */}
              {!videoUri ? (
                <TouchableOpacity
                  style={[styles.pickerArea, { backgroundColor: colors.backgroundTertiary, borderColor: colors.border }]}
                  onPress={pickVideo}
                >
                  <View style={[styles.pickerIcon, { backgroundColor: colors.accent + "20" }]}>
                    <Ionicons name="videocam" size={40} color={colors.accent} />
                  </View>
                  <Text style={[styles.pickerTitle, { color: colors.text }]}>Tap to select a video</Text>
                  <Text style={[styles.pickerSub, { color: colors.textMuted }]}>MP4, MOV, WebM · max {MAX_DURATION_SECONDS}s</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.previewContainer, { backgroundColor: "#000" }]}>
                  <Video
                    ref={videoRef}
                    source={{ uri: videoUri }}
                    style={styles.preview}
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay={false}
                    isLooping
                    useNativeControls
                  />
                  {/* Filter overlay on preview */}
                  {activeFilter?.overlay && (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: activeFilter.overlay, borderRadius: 16 }]} pointerEvents="none" />
                  )}
                  {/* Avatar overlay on preview */}
                  {selectedAvatar !== "none" && (() => {
                    const av = TRENDING_AVATARS.find((a) => a.id === selectedAvatar);
                    return av ? (
                      <View style={styles.avatarPreviewOverlay} pointerEvents="none">
                        <View style={[styles.avatarPreviewBubble, { backgroundColor: av.bg }]}>
                          <Text style={{ fontSize: 28 }}>{av.emoji}</Text>
                        </View>
                      </View>
                    ) : null;
                  })()}
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
            </>
          )}

          {/* Video filter carousel */}
          <View style={styles.sectionWrap}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Filter</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {VIDEO_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => setSelectedFilter(f.id)}
                  style={[
                    styles.filterChip,
                    { backgroundColor: selectedFilter === f.id ? colors.accent : colors.inputBg },
                  ]}
                  activeOpacity={0.7}
                >
                  {f.overlay ? (
                    <View style={[styles.filterSwatch, { backgroundColor: f.overlay.replace(/[\d.]+\)$/, "0.9)") }]} />
                  ) : (
                    <Ionicons name="sunny-outline" size={12} color={selectedFilter === f.id ? "#fff" : colors.textMuted} style={{ marginRight: 4 }} />
                  )}
                  <Text style={[styles.filterLabel, { color: selectedFilter === f.id ? "#fff" : colors.textSecondary }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Trending avatar overlays */}
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Avatar Overlay</Text>
              <View style={styles.trendingBadge}>
                <Ionicons name="flame" size={11} color="#FF6B35" />
                <Text style={styles.trendingBadgeText}>Trending</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarRow}>
              {TRENDING_AVATARS.map((av) => (
                <TouchableOpacity
                  key={av.id}
                  onPress={() => setSelectedAvatar(av.id)}
                  style={styles.avatarItem}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.avatarCircle,
                    { backgroundColor: av.id === "none" ? colors.backgroundTertiary : av.bg },
                    selectedAvatar === av.id && { borderWidth: 2.5, borderColor: colors.accent },
                    (av as any).border && { borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed" as any },
                  ]}>
                    {av.id === "none" ? (
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    ) : (
                      <Text style={{ fontSize: 26 }}>{av.emoji}</Text>
                    )}
                  </View>
                  <Text style={[styles.avatarLabel, { color: colors.textMuted }]} numberOfLines={1}>{av.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Thumbnail scrubber */}
          {showScrubber && (
            <View style={[styles.thumbCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.thumbCardHeader}>
                <Ionicons name="image-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.thumbCardTitle, { color: colors.text }]}>Thumbnail</Text>
                {thumbGenerating ? (
                  <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: "auto" }} />
                ) : (
                  <View style={[styles.thumbReadyBadge, { backgroundColor: colors.accent + "18", marginLeft: "auto" as any }]}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.accent} />
                    <Text style={[styles.thumbReadyText, { color: colors.accent }]}>Ready</Text>
                  </View>
                )}
              </View>
              <View style={styles.thumbCardBody}>
                <View style={[styles.thumbPreviewBox, { backgroundColor: colors.backgroundTertiary }]}>
                  {thumbnailUri && !thumbGenerating ? (
                    <ExpoImage source={{ uri: thumbnailUri }} style={styles.thumbPreviewImg} contentFit="cover" />
                  ) : (
                    <View style={styles.thumbPreviewPlaceholder}>
                      {thumbGenerating ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Ionicons name="image-outline" size={28} color={colors.textMuted} />}
                    </View>
                  )}
                </View>
                <View style={styles.thumbScrubberArea}>
                  <View style={styles.thumbTimeRow}>
                    <Text style={[styles.thumbTimeLabel, { color: colors.textSecondary }]}>Frame at</Text>
                    <Text style={[styles.thumbTimeCurrent, { color: colors.text }]}>{formatTime(thumbTime)}</Text>
                    <Text style={[styles.thumbTimeSep, { color: colors.textMuted }]}>/</Text>
                    <Text style={[styles.thumbTimeTotal, { color: colors.textMuted }]}>{formatTime(duration)}</Text>
                  </View>
                  <ThumbnailScrubber value={thumbTime} max={duration} accentColor={colors.accent} onChange={(t) => setThumbTime(t)} />
                  <Text style={[styles.thumbHint, { color: colors.textMuted }]}>Drag to choose your thumbnail frame</Text>
                </View>
              </View>
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
              placeholder="Add a caption… (required) #hashtags @mentions"
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
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function CameraSection({
  cameraRef,
  cameraFacing,
  isRecording,
  recordingSeconds,
  filterOverlay,
  selectedAvatar,
  onFlipCamera,
  onRecord,
}: {
  cameraRef: React.RefObject<any>;
  cameraFacing: "front" | "back";
  isRecording: boolean;
  recordingSeconds: number;
  filterOverlay: string | null;
  selectedAvatar: { emoji: string; bg: string; label: string } | null;
  onFlipCamera: () => void;
  onRecord: () => void;
}) {
  const [CameraView, setCameraView] = useState<any>(null);
  const [cameraAvailable, setCameraAvailable] = useState(true);

  useEffect(() => {
    import("expo-camera").then((mod) => {
      setCameraView(() => mod.CameraView ?? (mod as any).Camera ?? null);
    }).catch(() => setCameraAvailable(false));
  }, []);

  if (!cameraAvailable || !CameraView) {
    return (
      <View style={camStyles.unavailable}>
        <Ionicons name="videocam-off-outline" size={40} color="#666" />
        <Text style={camStyles.unavailableText}>Camera not available</Text>
      </View>
    );
  }

  return (
    <View style={camStyles.container}>
      <CameraView
        ref={cameraRef}
        style={camStyles.camera}
        facing={cameraFacing}
        mode="video"
      >
        {filterOverlay && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: filterOverlay }]} pointerEvents="none" />
        )}
        {selectedAvatar && (
          <View style={camStyles.avatarOverlay} pointerEvents="none">
            <View style={[camStyles.avatarBubble, { backgroundColor: selectedAvatar.bg }]}>
              <Text style={{ fontSize: 28 }}>{selectedAvatar.emoji}</Text>
            </View>
          </View>
        )}
        {isRecording && (
          <View style={camStyles.recIndicator}>
            <View style={camStyles.recDot} />
            <Text style={camStyles.recTime}>
              {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}
            </Text>
          </View>
        )}
        <View style={camStyles.controls}>
          <TouchableOpacity onPress={onFlipCamera} style={camStyles.flipBtn} activeOpacity={0.8}>
            <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onRecord} style={[camStyles.recordBtn, isRecording && camStyles.recordBtnActive]} activeOpacity={0.8}>
            {isRecording ? <View style={camStyles.stopSquare} /> : <View style={camStyles.recordCircle} />}
          </TouchableOpacity>
          <View style={{ width: 50 }} />
        </View>
      </CameraView>
    </View>
  );
}

const camStyles = StyleSheet.create({
  container: { borderRadius: 16, overflow: "hidden", aspectRatio: 9 / 16, maxHeight: 480, backgroundColor: "#000" },
  camera: { flex: 1 },
  unavailable: { aspectRatio: 9 / 16, maxHeight: 480, alignItems: "center", justifyContent: "center", backgroundColor: "#111", borderRadius: 16, gap: 12 },
  unavailableText: { color: "#666", fontSize: 14, fontFamily: "Inter_400Regular" },
  recIndicator: {
    position: "absolute", top: 16, left: 16,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF3B30" },
  recTime: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  controls: {
    position: "absolute", bottom: 30, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 30,
  },
  flipBtn: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
  recordBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.25)", borderWidth: 4, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  recordBtnActive: { backgroundColor: "rgba(255,59,48,0.4)", borderColor: "#FF3B30" },
  recordCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#FF3B30" },
  stopSquare: { width: 28, height: 28, borderRadius: 6, backgroundColor: "#FF3B30" },
  avatarOverlay: { position: "absolute", top: 16, right: 16 },
  avatarBubble: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  headerBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  postBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  postBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  modeTabs: {
    flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modeTab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  modeTabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  content: { padding: 16, gap: 16 },

  pickerArea: {
    borderRadius: 16, borderWidth: 2, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", padding: 48, gap: 12,
  },
  pickerIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  pickerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  pickerSub: { fontSize: 13, fontFamily: "Inter_400Regular" },

  previewContainer: { borderRadius: 16, overflow: "hidden", aspectRatio: 9 / 16, maxHeight: 420 },
  preview: { flex: 1 },
  previewOverlay: { position: "absolute", top: 12, right: 12, gap: 8 },
  durationBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  durationText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },
  changeVideoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12 },
  changeVideoText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  avatarPreviewOverlay: { position: "absolute", top: 16, right: 16 },
  avatarPreviewBubble: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },

  sectionWrap: { gap: 8 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 2 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  trendingBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FF6B3518", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  trendingBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#FF6B35" },

  filterRow: { gap: 8, paddingHorizontal: 2 },
  filterChip: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, gap: 4,
  },
  filterSwatch: { width: 10, height: 10, borderRadius: 5, marginRight: 4 },
  filterLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  avatarRow: { gap: 12, paddingHorizontal: 2 },
  avatarItem: { alignItems: "center", gap: 4, width: 62 },
  avatarCircle: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  avatarLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },

  thumbCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  thumbCardHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  thumbCardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  thumbReadyBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  thumbReadyText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  thumbCardBody: { flexDirection: "row", gap: 14, alignItems: "center" },
  thumbPreviewBox: { width: 72, height: 104, borderRadius: 8, overflow: "hidden", flexShrink: 0 },
  thumbPreviewImg: { width: "100%", height: "100%" },
  thumbPreviewPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  thumbScrubberArea: { flex: 1, gap: 6 },
  thumbTimeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  thumbTimeLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginRight: 2 },
  thumbTimeCurrent: { fontSize: 14, fontFamily: "Inter_700Bold" },
  thumbTimeSep: { fontSize: 13, fontFamily: "Inter_400Regular" },
  thumbTimeTotal: { fontSize: 13, fontFamily: "Inter_400Regular" },
  thumbHint: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },

  soundBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  soundArt: { width: 44, height: 44, borderRadius: 8 },
  soundArtFallback: { backgroundColor: "rgba(0,188,212,0.1)", alignItems: "center", justifyContent: "center" },
  soundInfo: { flex: 1, gap: 2 },
  soundLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  soundName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  captionBox: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: "flex-start" },
  captionInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, minHeight: 60 },

  tipsBox: { borderRadius: 12, padding: 16, gap: 8 },
  tipsTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tipDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 7 },
  tipText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },

  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
