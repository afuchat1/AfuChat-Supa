import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
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
import { useAppAccent } from "@/context/AppAccentContext";
import { showAlert } from "@/lib/alert";
import { uploadToStorage } from "@/lib/mediaUpload";
import { isOnline } from "@/lib/offlineStore";
import { getDailyUsage, recordDailyUsage } from "@/lib/featureUsage";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import {
  startStoryUpload,
  updateStoryProgress,
  finishStoryUpload,
  failStoryUpload,
} from "@/lib/storyUploadStore";

const CAPTION_MAX = 200;

type Privacy = "everyone" | "close_friends" | "only_me";
const PRIVACY_OPTIONS: { id: Privacy; label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; desc: string }[] = [
  { id: "everyone", label: "Everyone", icon: "earth", desc: "All your followers can see this story" },
  { id: "close_friends", label: "Close Friends", icon: "star", desc: "Only people in your close friends list" },
  { id: "only_me", label: "Only Me", icon: "lock-closed", desc: "Only you can see this story" },
];

export default function CreateStoryScreen() {
  const { accent } = useAppAccent();
  const { user, profile, subscription } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const params = useLocalSearchParams<{ mediaUri?: string; mediaType?: string }>();
  const [mediaUri, setMediaUri] = useState<string | null>(params.mediaUri ?? null);
  const [mediaType, setMediaType] = useState<"image" | "video">(
    params.mediaType === "video" ? "video" : "image"
  );
  const [caption, setCaption] = useState("");
  const [mediaMimeType, setMediaMimeType] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [privacy, setPrivacy] = useState<Privacy>("everyone");
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [tintColor, setTintColor] = useState<string | null>(null);

  const shareScale = useRef(new Animated.Value(1)).current;
  const captionRef = useRef<TextInput>(null);
  const { isDesktop } = useIsDesktop();

  useEffect(() => {
    if (isDesktop) router.replace("/");
  }, [isDesktop]);
  if (isDesktop) return null;

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
        setMediaMimeType(asset.mimeType || null);
      }
    } catch (e: any) {
      showAlert("Error", e?.message || "Could not open media picker.");
    }
  }

  async function publish() {
    if (starting || !mediaUri || !user) return;

    if (!isOnline()) {
      showAlert("No internet", "Publishing a story requires an internet connection.");
      return;
    }

    setStarting(true);
    const tier = (subscription?.plan_tier as "free" | "silver" | "gold" | "platinum") || "free";
    const usage = await getDailyUsage("stories_create", tier);
    if (!usage.allowed) {
      setStarting(false);
      const nextTier = tier === "free" ? "Silver" : tier === "silver" ? "Gold" : "Platinum";
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
    const _mediaUri = mediaUri;
    const _mediaType = mediaType;
    const _mediaMimeType = mediaMimeType;
    const _caption = caption.trim();
    const _privacy = privacy;
    const _userId = user.id;

    // Navigate immediately — screen closes right away
    if (router.canDismiss()) {
      router.dismissAll();
    } else {
      router.replace("/(tabs)");
    }

    // Start background upload — drives the progress bar in the chat UI
    startStoryUpload(_caption);

    (async () => {
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
        const fileName = `${_userId}/${Date.now()}.${ext}`;
        const { publicUrl, error: uploadErr } = await uploadToStorage("stories", fileName, _mediaUri, mime);

        if (uploadErr || !publicUrl) {
          console.error("[Story Upload] Upload failed:", uploadErr);
          failStoryUpload(uploadErr || "Upload failed");
          return;
        }

        updateStoryProgress(0.75);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { error } = await supabase.from("stories").insert({
          user_id: _userId,
          media_url: publicUrl,
          media_type: _mediaType,
          caption: _caption || null,
          expires_at: expiresAt,
          privacy: _privacy,
        });

        if (error) {
          console.error("[Story Upload] DB insert failed:", error.message);
          failStoryUpload(error.message || "Failed to save story");
        } else {
          try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("story_created"); } catch (_) {}
          await recordDailyUsage("stories_create");
          finishStoryUpload();
        }
      } catch {
        failStoryUpload();
      }
    })();
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
        <TouchableOpacity
          style={styles.topBtn}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>

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
            <Ionicons name="images-outline" size={22} color="#fff" />
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
            <View style={[styles.previewWrap, { width: previewW, height: previewH, borderRadius: previewRadius }]}>
              {mediaType === "video" ? (
                <Video
                  source={{ uri: mediaUri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  isLooping
                  isMuted={false}
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
                <View style={[StyleSheet.absoluteFill, { backgroundColor: tintColor, borderRadius: previewRadius }]} pointerEvents="none" />
              )}

              <View style={styles.sideToolbar}>
                {/* Retake → go back to camera */}
                <TouchableOpacity style={styles.sideBtn} onPress={() => router.back()} activeOpacity={0.75}>
                  <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
                </TouchableOpacity>
                {/* Text → focus caption */}
                <TouchableOpacity style={styles.sideBtn} activeOpacity={0.75}
                  onPress={() => { setShowEmojis(false); setShowColors(false); captionRef.current?.focus(); }}>
                  <Ionicons name="text-outline" size={22} color="#fff" />
                </TouchableOpacity>
                {/* Emoji picker toggle */}
                <TouchableOpacity style={[styles.sideBtn, showEmojis && { backgroundColor: "rgba(255,255,255,0.35)" }]}
                  activeOpacity={0.75}
                  onPress={() => { setShowColors(false); setShowEmojis((v) => !v); }}>
                  <Ionicons name="happy-outline" size={22} color="#fff" />
                </TouchableOpacity>
                {/* Colour tint toggle */}
                <TouchableOpacity style={[styles.sideBtn, showColors && { backgroundColor: "rgba(255,255,255,0.35)" }]}
                  activeOpacity={0.75}
                  onPress={() => { setShowEmojis(false); setShowColors((v) => !v); }}>
                  <Ionicons name="brush-outline" size={22} color={tintColor ? "#fff" : "#fff"} />
                </TouchableOpacity>
                {/* Music → coming soon */}
                <TouchableOpacity style={styles.sideBtn} activeOpacity={0.75}
                  onPress={() => showAlert("Music", "Adding music to stories is coming soon! 🎵")}>
                  <Ionicons name="musical-notes-outline" size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Emoji quick-pick panel */}
              {showEmojis && (
                <View style={styles.emojiPanel}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiScroll}>
                    {["😊","😂","❤️","🔥","👍","😍","🎉","😎","🙏","💪","✨","🤩","💯","😭","👀","🫶","🥳","😅","🤣","🌟"].map((e) => (
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
              <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.5)" />
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
                colors={[accent, "#0097A7"]}
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
                  privacy === opt.id && { backgroundColor: accent + "20" },
                ]}>
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={privacy === opt.id ? accent : "#999"}
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
                  <Ionicons name="checkmark-circle" size={22} color={accent} />
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
