/**
 * VideoCommentsSheet
 * Shared comment sheet for the video feed and discover.
 * Supports: text · voice notes (≤ 60 s) · image attachments
 */
import { showAlert } from "@/lib/alert";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image as RNImage,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
// expo-av: lazy-load on native only.
// Do NOT gate on NativeModules.ExponentAV — in Expo SDK 55 + New Architecture
// production builds expo-av uses TurboModules/JSI and is absent from NativeModules,
// so that check always returns null and silently disables all audio.
let Audio: typeof import("expo-av").Audio | null = null;
type AudioSound = import("expo-av/build/Audio/Sound").Sound;
type AudioRecording = import("expo-av/build/Audio/Recording").Recording;
import { Platform as _AvPlatform } from "react-native";
import { isExpoGo } from "@/lib/expoEnvironment";
if (_AvPlatform.OS !== "web" && !isExpoGo()) {
  try { Audio = require("expo-av").Audio; } catch {}
}
import * as ImagePicker from "expo-image-picker";

import { supabase } from "@/lib/supabase";
import {
  createAfuChatPostReply,
  getAfuChatPostReplies,
  setAfuChatReplyLike,
} from "@/lib/afuchatApi";
import { audioFocus } from "@/lib/audioFocus";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { useAppAccent } from "@/context/AppAccentContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import UserName from "@/components/ui/UserName";
import { RichText } from "@/components/ui/RichText";
import * as Haptics from "@/lib/haptics";
import { uploadToStorage } from "@/lib/mediaUpload";

// ─── Constants ────────────────────────────────────────────────────────────────

const USE_NATIVE = true;
const VID_THREAD_COLORS = ["#1018D8", "#5C6BC0", "#26A69A", "#EF6C00", "#8E24AA"];
export const QUICK_EMOJIS = ["🔥", "❤️", "😂", "😮", "👏", "💯", "🙌", "😍"];
export const MAX_VOICE_SECS = 60;
const WAVEFORM_BARS = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

export type Reply = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  parent_reply_id: string | null;
  like_count: number;
  voice_url: string | null;
  voice_duration: number | null;
  image_url: string | null;
  profile: { display_name: string; handle: string; avatar_url: string | null };
  children?: Reply[];
};

type RecordState = "idle" | "recording" | "recorded";

// ─── Utilities ────────────────────────────────────────────────────────────────

export function buildReplyTree(flat: Reply[]): Reply[] {
  const map = new Map<string, Reply>();
  const roots: Reply[] = [];
  for (const r of flat) map.set(r.id, { ...r, children: [] });
  for (const r of flat) {
    const node = map.get(r.id)!;
    if (r.parent_reply_id && map.has(r.parent_reply_id)) {
      map.get(r.parent_reply_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRelative(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return "now";
  if (d < 3600000) return `${Math.floor(d / 60000)}m`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
  if (d < 2592000000) return `${Math.floor(d / 86400000)}d`;
  return `${Math.floor(d / 2592000000)}mo`;
}

function formatSecs(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = Math.floor(totalSecs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseCommentText(text: string, accent: string): React.ReactNode {
  return text.split(/(@\w[\w.]*|#\w+)/g).map((p, i) => {
    if (/^@\w/.test(p)) return <Text key={i} style={{ color: accent, fontFamily: "Inter_600SemiBold" }}>{p}</Text>;
    if (/^#\w/.test(p)) return <Text key={i} style={{ color: accent + "BB" }}>{p}</Text>;
    return <Text key={i}>{p}</Text>;
  });
}

function genWaveHeights(seed: string): number[] {
  const n = seed.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 7);
  return Array.from({ length: WAVEFORM_BARS }, (_, i) => {
    const v = Math.abs(Math.sin(n * 0.0013 + i * 0.71) * Math.cos(i * 0.43 + n * 0.007));
    return 0.15 + v * 0.85;
  });
}

// ─── CommentSkeleton ──────────────────────────────────────────────────────────

export function CommentSkeleton({ isDark }: { isDark: boolean }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
      {[0.85, 0.65, 0.75, 0.55, 0.70].map((w, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <Skeleton width={36} height={36} borderRadius={18} forceDark={isDark} />
          <View style={{ flex: 1, gap: 6, paddingTop: 2 }}>
            <Skeleton width="40%" height={11} borderRadius={6} forceDark={isDark} />
            <Skeleton width={`${Math.round(w * 100)}%`} height={14} borderRadius={6} forceDark={isDark} />
            {i % 2 === 0 && (
              <Skeleton width="60%" height={14} borderRadius={6} forceDark={isDark} />
            )}
            <View style={{ flexDirection: "row", gap: 14, marginTop: 2 }}>
              <Skeleton width={36} height={10} borderRadius={5} forceDark={isDark} />
              <Skeleton width={36} height={10} borderRadius={5} forceDark={isDark} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── WaveformBars ─────────────────────────────────────────────────────────────

function WaveformBars({
  heights, progress, accent, animating,
}: {
  heights: number[]; progress: number; accent: string; animating: boolean;
}) {
  const pulseAnims = useRef(heights.map(() => new Animated.Value(1))).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (animating) {
      loopRef.current = Animated.loop(
        Animated.stagger(
          40,
          pulseAnims.map((a) =>
            Animated.sequence([
              Animated.timing(a, { toValue: 1.5 + Math.random() * 0.5, duration: 200 + Math.random() * 200, useNativeDriver: true }),
              Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]),
          ),
        ),
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      pulseAnims.forEach((a) => a.setValue(1));
    }
    return () => { loopRef.current?.stop(); };
  }, [animating]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2, height: 30 }}>
      {heights.map((h, i) => {
        const isPlayed = progress > 0 && (i + 1) / heights.length <= progress;
        return (
          <Animated.View
            key={i}
            style={{
              width: 3,
              height: Math.max(4, h * 28),
              borderRadius: 2,
              backgroundColor: isPlayed ? accent : accent + "44",
              transform: animating ? [{ scaleY: pulseAnims[i] }] : [],
            }}
          />
        );
      })}
    </View>
  );
}

// ─── VoicePlayer ──────────────────────────────────────────────────────────────

function VoicePlayer({
  uri, durationSecs, accent, isDark = true,
}: {
  uri: string; durationSecs: number; accent: string; isDark?: boolean;
}) {
  const [sound, setSound] = useState<AudioSound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(Math.max(1000, durationSecs * 1000));
  const containerWidth = useRef(220);
  const heights = useMemo(() => genWaveHeights(uri), [uri]);
  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  useEffect(() => {
    let mounted = true;
    async function loadVoice() {
      try {
        if (!Audio || !Audio.Sound) return;
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false }).catch(() => {});
        const { sound: s } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
        if (!mounted) { s.unloadAsync().catch(() => {}); return; }
        s.setOnPlaybackStatusUpdate((st) => {
          if (!st.isLoaded) return;
          setPositionMs(st.positionMillis);
          if (st.durationMillis) setDurationMs(st.durationMillis);
          if (st.didJustFinish) {
            setPlaying(false);
            setPositionMs(0);
            s.setPositionAsync(0).catch(() => {});
          }
        });
        setSound(s);
      } catch {}
    }
    loadVoice();
    return () => {
      mounted = false;
      setSound((prev) => { prev?.unloadAsync().catch(() => {}); return null; });
    };
  }, [uri]);

  useEffect(() => {
    if (!sound) return;
    const unsubscribe = audioFocus.subscribe(() => {
      sound.stopAsync().catch(() => {});
      setPlaying(false);
      setPositionMs(0);
    });
    return () => {
      unsubscribe();
    };
  }, [sound]);

  async function togglePlay() {
    if (!sound) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (playing) {
      await sound.pauseAsync();
      setPlaying(false);
    } else {
      if (!Audio) return;
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false }).then(() => {}, () => {});
      await sound.playAsync();
      setPlaying(true);
    }
  }

  function handleSeek(x: number) {
    if (!sound || durationMs <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / containerWidth.current));
    const seekMs = ratio * durationMs;
    setPositionMs(seekMs);
    sound.setPositionAsync(seekMs).catch(() => {});
  }

  const displayTime = positionMs > 100 ? formatSecs(Math.floor(positionMs / 1000)) : formatSecs(Math.ceil(durationMs / 1000));

  const wrapperBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(26,18,8,0.07)";
  const timeClr   = isDark ? "rgba(255,255,255,0.4)"  : "rgba(26,18,8,0.45)";

  return (
    <View style={[vpStyles.wrapper, { backgroundColor: wrapperBg }]}>
      <TouchableOpacity onPress={togglePlay} activeOpacity={0.8} style={[vpStyles.playBtn, { backgroundColor: accent }]}>
        <Ionicons name={playing ? "pause" : "play"} size={13} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1, gap: 4 }}>
        <TouchableOpacity
          activeOpacity={0.95}
          onLayout={(e) => { containerWidth.current = e.nativeEvent.layout.width; }}
          onPress={(e) => handleSeek(e.nativeEvent.locationX)}
        >
          <WaveformBars heights={heights} progress={progress} accent={accent} animating={playing} />
        </TouchableOpacity>
        <Text style={[vpStyles.time, { color: timeClr }]}>{displayTime}</Text>
      </View>
    </View>
  );
}

const vpStyles = StyleSheet.create({
  wrapper: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 16,
    marginTop: 6, maxWidth: 280,
  },
  playBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  time: {
    fontSize: 10, fontFamily: "Inter_500Medium",
  },
});

// ─── VideoReplyItem ───────────────────────────────────────────────────────────

export const VideoReplyItem = React.memo(function VideoReplyItem({
  reply: r, depth, onReplyTo, isCreator, isNew, accent, likedSet, onLike, isDark = true,
}: {
  reply: Reply; depth: number; onReplyTo: (r: Reply) => void;
  isCreator: boolean; isNew: boolean; accent: string;
  likedSet: Set<string>; onLike: (id: string, wasLiked: boolean) => void;
  isDark?: boolean;
}) {
  const indent = Math.min(depth, 4) * 20;
  const [liked, setLiked] = useState(() => likedSet.has(r.id));
  const [localLikes, setLocalLikes] = useState(r.like_count);
  const [collapsed, setCollapsed] = useState(() => depth === 0 && (r.children?.length ?? 0) > 0);
  const [imgExpanded, setImgExpanded] = useState(false);
  const likeScale = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(isNew ? 24 : 0)).current;
  const fadeAnim = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const threadColor = VID_THREAD_COLORS[depth % VID_THREAD_COLORS.length];
  const hasChildren = (r.children?.length ?? 0) > 0;
  const isTop = depth === 0;

  const ri_textPrimary   = isDark ? "#fff"                    : "#1A1208";
  const ri_textSecondary = isDark ? "rgba(255,255,255,0.5)"   : "rgba(26,18,8,0.55)";
  const ri_textMuted     = isDark ? "rgba(255,255,255,0.3)"   : "rgba(26,18,8,0.38)";
  const ri_textBody      = isDark ? "rgba(255,255,255,0.88)"  : "rgba(26,18,8,0.88)";
  const ri_separator     = isDark ? "rgba(255,255,255,0.05)"  : "rgba(26,18,8,0.07)";

  useEffect(() => {
    if (!isNew) return;
    Animated.parallel([
      // Timing instead of spring — no bounce overshoot when new comments appear.
      Animated.timing(slideAnim, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: USE_NATIVE }),
    ]).start();
  }, []);

  function handleLike() {
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLocalLikes((c) => (!wasLiked ? c + 1 : Math.max(0, c - 1)));
    onLike(r.id, wasLiked);
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.5, tension: 350, friction: 7, useNativeDriver: USE_NATIVE }),
      Animated.spring(likeScale, { toValue: 1, tension: 350, friction: 7, useNativeDriver: USE_NATIVE }),
    ]).start();
  }

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }}>
      <View style={{ flexDirection: "row", paddingLeft: indent, paddingTop: isTop ? 14 : 8, paddingBottom: 2, position: "relative" }}>
        {depth > 0 && (
          <View style={{ position: "absolute", left: indent - 10, top: 0, bottom: 0, width: 2, borderRadius: 1, backgroundColor: threadColor + "40" }} />
        )}
        <View style={{ marginRight: 10, marginTop: 1 }}>
          <Avatar uri={r.profile.avatar_url} name={r.profile.display_name} size={isTop ? 36 : 26} userId={r.author_id} />
        </View>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4, flexWrap: "wrap" }}>
            <UserName userId={r.author_id} name={r.profile.display_name} style={{ color: ri_textPrimary, fontSize: 13, fontFamily: "Inter_700Bold" }} />
            {isCreator && (
              <View style={{ backgroundColor: accent + "22", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: accent + "55" }}>
                <Text style={{ color: accent, fontSize: 10, fontFamily: "Inter_700Bold" }}>Author</Text>
              </View>
            )}
            <Text style={{ color: ri_textSecondary, fontSize: 11 }}>· {formatRelative(r.created_at)}</Text>
          </View>

          {r.content.length > 0 && (
            <RichText style={{ color: ri_textBody, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 }} linkColor={accent}>
              {r.content}
            </RichText>
          )}

          {r.voice_url && (
            <VoicePlayer uri={r.voice_url} durationSecs={r.voice_duration ?? 0} accent={accent} isDark={isDark} />
          )}

          {r.image_url && (
            <>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => setImgExpanded(true)}
                style={{ marginTop: 8, borderRadius: 12, overflow: "hidden", maxWidth: 220 }}
              >
                <Image
                  source={{ uri: r.image_url }}
                  style={{ width: 220, height: 160, borderRadius: 12 }}
                  resizeMode="cover"
                />
              </TouchableOpacity>
              <Modal visible={imgExpanded} transparent animationType="none" onRequestClose={() => setImgExpanded(false)}>
                <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center" }} onPress={() => setImgExpanded(false)}>
                  <Image source={{ uri: r.image_url }} style={{ width: "92%", height: "70%", borderRadius: 16 }} resizeMode="contain" />
                  <TouchableOpacity onPress={() => setImgExpanded(false)} style={{ position: "absolute", top: 52, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="close" size={20} color="#fff" />
                  </TouchableOpacity>
                </Pressable>
              </Modal>
            </>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 8, marginBottom: 2 }}>
            <TouchableOpacity onPress={() => onReplyTo(r)} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ color: ri_textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Reply</Text>
            </TouchableOpacity>
            {hasChildren && (
              <TouchableOpacity onPress={() => setCollapsed((c) => !c)} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={12} color={threadColor} />
                <Text style={{ color: threadColor, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {collapsed ? `View ${r.children!.length} ${r.children!.length === 1 ? "reply" : "replies"}` : "Hide replies"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={{ alignItems: "center", paddingTop: 4, paddingLeft: 4, minWidth: 40 }}>
          <TouchableOpacity onPress={handleLike} activeOpacity={0.7}>
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons name={liked ? "heart" : "heart"} size={18} color={liked ? "#FF2D55" : ri_textMuted} />
            </Animated.View>
          </TouchableOpacity>
          {localLikes > 0 && (
            <Text style={{ color: liked ? "#FF2D55" : ri_textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold", marginTop: 2 }}>
              {localLikes}
            </Text>
          )}
        </View>
      </View>
      {isTop && !hasChildren && (
        <View style={{ height: 0.5, backgroundColor: ri_separator, marginLeft: indent + 46, marginTop: 4 }} />
      )}
      {!collapsed && r.children?.map((child) => (
        <VideoReplyItem key={child.id} reply={child} depth={depth + 1} onReplyTo={onReplyTo} isCreator={isCreator} isNew={false} accent={accent} likedSet={likedSet} onLike={onLike} isDark={isDark} />
      ))}
    </Animated.View>
  );
});

// ─── RecordingBar ─────────────────────────────────────────────────────────────

export function RecordingBar({
  elapsed, onStop, accent,
}: {
  elapsed: number; onStop: () => void; accent: string;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pct = elapsed / MAX_VOICE_SECS;
  const isNearEnd = elapsed >= MAX_VOICE_SECS - 10;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={rbStyles.row}>
      <Animated.View style={[rbStyles.dot, { backgroundColor: isNearEnd ? "#FF3B30" : "#FF2D55", transform: [{ scale: pulseAnim }] }]} />
      <View style={rbStyles.progressTrack}>
        <View style={[rbStyles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: isNearEnd ? "#FF3B30" : accent }]} />
      </View>
      <Text style={[rbStyles.timer, { color: isNearEnd ? "#FF3B30" : "rgba(255,255,255,0.7)" }]}>
        {formatSecs(elapsed)}<Text style={{ color: "rgba(255,255,255,0.3)" }}>/{formatSecs(MAX_VOICE_SECS)}</Text>
      </Text>
      <TouchableOpacity onPress={onStop} style={[rbStyles.stopBtn, { borderColor: accent + "80" }]} activeOpacity={0.7}>
        <Ionicons name="stop" size={13} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const rbStyles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  timer: { fontSize: 12, fontFamily: "Inter_600SemiBold", minWidth: 70, textAlign: "right" },
  stopBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, alignItems: "center", justifyContent: "center" },
});

// ─── VoicePreviewBar ──────────────────────────────────────────────────────────

export function VoicePreviewBar({
  uri, durationSecs, onDiscard, accent,
}: {
  uri: string; durationSecs: number; onDiscard: () => void; accent: string;
}) {
  return (
    <View style={pvStyles.row}>
      <View style={pvStyles.label}>
        <Ionicons name="mic" size={13} color={accent} />
        <Text style={{ color: accent, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Voice note</Text>
      </View>
      <View style={{ flex: 1 }}>
        <VoicePlayer uri={uri} durationSecs={durationSecs} accent={accent} />
      </View>
      <TouchableOpacity onPress={onDiscard} hitSlop={8} style={pvStyles.discard}>
        <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.5)" />
      </TouchableOpacity>
    </View>
  );
}

const pvStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderTopColor: "rgba(255,255,255,0.08)" },
  label: { flexDirection: "row", alignItems: "center", gap: 4 },
  discard: { paddingLeft: 4 },
});

// ─── VideoCommentsSheet ───────────────────────────────────────────────────────

export function VideoCommentsSheet({
  visible, onClose, postId, postAuthorId, onReplyCountChange, inline = false,
}: {
  visible: boolean; onClose: () => void; postId: string; postAuthorId: string;
  onReplyCountChange: (postId: string, delta: number) => void;
  inline?: boolean;
}) {
  const { accent } = useAppAccent();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  // Stable ref so the keyboard listeners (set up with [] deps) always read the
  // latest insets value — mirrors the pattern used in the chat input bar.
  const insetsRef = useRef(insets);
  useEffect(() => { insetsRef.current = insets; }, [insets]);

  // ── Theme tokens ─────────────────────────────────────────────────────────
  const sheetBg      = isDark ? "#111115"                   : "#F5F0E8";
  const handleClr    = isDark ? "rgba(255,255,255,0.2)"     : "rgba(0,0,0,0.18)";
  const titleClr     = isDark ? "#fff"                      : "#1A1208";
  const titleCntClr  = isDark ? "rgba(255,255,255,0.4)"     : "rgba(26,18,8,0.4)";
  const sortTabTxt   = isDark ? "rgba(255,255,255,0.45)"    : "rgba(26,18,8,0.5)";
  const closeBtnClr  = isDark ? "rgba(255,255,255,0.5)"     : "rgba(26,18,8,0.5)";
  const separatorClr = isDark ? "rgba(255,255,255,0.1)"     : "rgba(26,18,8,0.1)";
  const emptyIconClr = isDark ? "rgba(255,255,255,0.2)"     : "rgba(26,18,8,0.2)";
  const emptyTxtClr  = isDark ? "rgba(255,255,255,0.5)"     : "rgba(26,18,8,0.5)";
  const emptySubClr  = isDark ? "rgba(255,255,255,0.3)"     : "rgba(26,18,8,0.35)";
  const replyToTxt   = isDark ? "rgba(255,255,255,0.5)"     : "rgba(26,18,8,0.55)";
  const replyToIcon  = isDark ? "rgba(255,255,255,0.4)"     : "rgba(26,18,8,0.4)";
  const inputBg      = isDark ? "rgba(255,255,255,0.08)"    : "#EDE8DC";
  const inputTxt     = isDark ? "#fff"                      : "#1A1208";
  const inputPH      = isDark ? "rgba(255,255,255,0.3)"     : "rgba(26,18,8,0.35)";
  const attachIconCl = isDark ? "rgba(255,255,255,0.45)"    : "rgba(26,18,8,0.45)";
  const sendDisabled = isDark ? "rgba(255,255,255,0.12)"    : "rgba(0,0,0,0.09)";
  const borderTopClr = isDark ? "rgba(255,255,255,0.08)"    : "rgba(26,18,8,0.08)";
  const imgRmvClr    = isDark ? "rgba(255,255,255,0.4)"     : "rgba(26,18,8,0.4)";

  const sheetTranslateY = useRef(new Animated.Value(1000)).current;
  // Animated keyboard offset — drives ONLY the input bar (no driver restrictions: useNativeDriver: false)
  const kbAnim = useRef(new Animated.Value(insets.bottom)).current;

  // ── Smart expand / collapse ──────────────────────────────────────────────────
  // animSheetH drives the sheet's visible height (peek ↔ full).
  // sheetTranslateY drives the enter/exit slide-in animation (native driver).
  // We keep them separate so native-driver translateY and JS-driver height
  // can coexist without conflicts.
  const animSheetH    = useRef(new Animated.Value(0)).current;
  const isFullSheetRef  = useRef(false);
  const listScrollYRef  = useRef(0);

  // Ref-stable snap functions — PanResponder closure reads .current at call time.
  const peekSHRef       = useRef(0);
  const fullSHRef       = useRef(0);
  const snapToFullRef   = useRef<() => void>(() => {});
  const snapToPeekRef   = useRef<() => void>(() => {});
  const dismissSheetRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (visible) {
      isFullSheetRef.current = false;
      animSheetH.setValue(peekSHRef.current || 400);
      Animated.timing(sheetTranslateY, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      sheetTranslateY.setValue(1000);
    }
  }, [visible]);

  function dismissSheet() {
    Animated.timing(sheetTranslateY, { toValue: 1000, duration: 220, useNativeDriver: true }).start(() => onClose());
  }

  const sheetPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => {
      const isV = Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 5;
      if (!isV) return false;
      if (!isFullSheetRef.current) {
        // peek mode: capture downward swipes (dismiss/collapse) always,
        // but only capture upward swipes when list is at the top (to expand).
        // This lets the FlatList scroll normally when already scrolled down.
        if (g.dy > 5) return true;                          // downward → dismiss
        return g.dy < -5 && listScrollYRef.current <= 1;   // upward at top → expand
      }
      // full mode: only intercept downward drag when list is scrolled to top
      return g.dy > 8 && listScrollYRef.current <= 1;
    },
    onPanResponderMove: (_, g) => {
      const base = isFullSheetRef.current ? fullSHRef.current : peekSHRef.current;
      const next = Math.max(peekSHRef.current * 0.15, Math.min(fullSHRef.current, base - g.dy));
      animSheetH.setValue(next);
    },
    onPanResponderRelease: (_, g) => {
      const base      = isFullSheetRef.current ? fullSHRef.current : peekSHRef.current;
      const projected = base - g.dy - g.vy * 120;
      const mid       = (fullSHRef.current + peekSHRef.current) / 2;

      if (g.vy > 1.5 || (!isFullSheetRef.current && g.dy > 100)) {
        dismissSheetRef.current();
      } else if (isFullSheetRef.current && (g.vy > 0.6 || g.dy > 80)) {
        snapToPeekRef.current();
      } else if (g.vy < -0.5 || g.dy < -50) {
        snapToFullRef.current();
      } else if (projected >= mid) {
        snapToFullRef.current();
      } else if (projected >= peekSHRef.current * 0.4) {
        snapToPeekRef.current();
      } else {
        dismissSheetRef.current();
      }
    },
  })).current;

  const [replies, setReplies] = useState<Reply[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Reply | null>(null);
  const [sortMode, setSortMode] = useState<"recent" | "top">("recent");
  const [newCommentIds, setNewCommentIds] = useState<Set<string>>(new Set());
  const [kbHeight, setKbHeight] = useState(0);

  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [recordingObj, setRecordingObj] = useState<AudioRecording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [attachedImage, setAttachedImage] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);

  // ── Mention suggestions ──────────────────────────────────────────────────────
  const [mentionSuggestions, setMentionSuggestions] = useState<Array<{
    id: string; handle: string; display_name: string; avatar_url: string | null;
  }>>([]);
  const mentionQueryRef = useRef<string | null>(null);
  const mentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const sendScale = useRef(new Animated.Value(1)).current;
  const repliesLoadSeqRef = useRef(0);
  const repliesReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(visible);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    // iOS fires Will* events with exact keyboard animation duration for perfect sync.
    // Android fires Did* events — we use a fixed 220ms curve that matches the system.
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e) => {
      const h = e.endCoordinates.height;
      const dur = Platform.OS === "ios" ? (e.duration ?? 250) : 220;
      setKbHeight(h);
      // Match chat bar: use max(keyboardHeight, insets.bottom) so the bar never
      // sits lower than the safe area on any device.
      Animated.timing(kbAnim, { toValue: Math.max(h, insetsRef.current.bottom), duration: dur, useNativeDriver: false }).start();
    });
    const hide = Keyboard.addListener(hideEvent, (e) => {
      const dur = Platform.OS === "ios" ? (e.duration ?? 200) : 180;
      setKbHeight(0);
      // Rest position = safe area bottom, not 0 — mirrors effectiveBottom in chat.
      Animated.timing(kbAnim, { toValue: insetsRef.current.bottom, duration: dur, useNativeDriver: false }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  const loadReplies = useCallback(async () => {
    if (!postId || !visibleRef.current) return;
    const requestId = ++repliesLoadSeqRef.current;
    const { data, error } = await getAfuChatPostReplies(postId);

    if (error) {
      console.error("[VideoCommentsSheet] loadReplies:", error.message, error.code);
      if (requestId === repliesLoadSeqRef.current) setLoading(false);
      return;
    }
    if (!data || requestId !== repliesLoadSeqRef.current || !visibleRef.current) return;

    const visibleReplies = data.slice(0, 50);
    setLikedIds(new Set<string>(
      visibleReplies.filter((reply) => reply.liked === true).map((reply) => reply.id),
    ));
    setReplies(visibleReplies.map((r: any) => ({
      id: r.id,
      author_id: r.author_id,
      content: r.content || "",
      created_at: r.created_at,
      parent_reply_id: r.parent_reply_id || null,
      like_count: Number.isFinite(r.like_count) ? r.like_count : 0,
      voice_url: r.voice_url || null,
      voice_duration: r.voice_duration ?? null,
      image_url: r.image_url || null,
      profile: {
        display_name: r.profile?.display_name || "User",
        handle: r.profile?.handle || "user",
        avatar_url: r.profile?.avatar_url ?? null,
      },
    })));
    setLoading(false);
  }, [postId]);

  const scheduleRepliesReload = useCallback(() => {
    if (!visibleRef.current) return;
    if (repliesReloadTimerRef.current) clearTimeout(repliesReloadTimerRef.current);
    repliesReloadTimerRef.current = setTimeout(() => {
      repliesReloadTimerRef.current = null;
      loadReplies().catch(() => {});
    }, 250);
  }, [loadReplies]);

  useEffect(() => {
    if (!visible || !postId) return;
    setReplies([]); setLoading(true); setText(""); setReplyingTo(null); setNewCommentIds(new Set());
    discardRecording();
    setAttachedImage(null);
    setShowEmojiPanel(false);
    loadReplies().catch(() => {});
  }, [visible, postId, loadReplies]);

  useEffect(() => {
    if (!visible || !postId) return;
    const ch = supabase
      .channel(`video-comments:${postId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_replies", filter: `post_id=eq.${postId}` }, scheduleRepliesReload)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "post_replies", filter: `post_id=eq.${postId}` }, scheduleRepliesReload)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (repliesReloadTimerRef.current) {
        clearTimeout(repliesReloadTimerRef.current);
        repliesReloadTimerRef.current = null;
      }
    };
  }, [visible, postId, scheduleRepliesReload]);

  async function fetchMentionSuggestions(query: string) {
    try {
      const q = supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url")
        .limit(8);
      if (query.length > 0) q.ilike("handle", `${query}%`);
      const { data } = await q;
      if (data && mentionQueryRef.current !== null) {
        setMentionSuggestions(data as any);
      }
    } catch {}
  }

  function handleTextChange(val: string) {
    setText(val);
    const match = val.match(/@(\w*)$/);
    if (match) {
      const query = match[1];
      mentionQueryRef.current = query;
      if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
      mentionTimerRef.current = setTimeout(() => {
        mentionTimerRef.current = null;
        fetchMentionSuggestions(query);
      }, 180);
    } else {
      mentionQueryRef.current = null;
      if (mentionSuggestions.length > 0) setMentionSuggestions([]);
    }
  }

  function insertMention(handle: string) {
    const q = mentionQueryRef.current ?? "";
    setText((prev) => prev.replace(new RegExp(`@${q}$`), `@${handle} `));
    mentionQueryRef.current = null;
    setMentionSuggestions([]);
    inputRef.current?.focus();
  }

  const handleReplyTo = useCallback((reply: Reply) => {
    setReplyingTo(reply);
    setText("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleReplyLike = useCallback(async (id: string, wasLiked: boolean) => {
    if (!user?.id || !postId) return;
    const nextLiked = !wasLiked;
    if (wasLiked) {
      setLikedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setReplies((prev) => prev.map((r) => r.id === id ? { ...r, like_count: Math.max(0, r.like_count - 1) } : r));
    } else {
      setLikedIds((prev) => new Set([...prev, id]));
      setReplies((prev) => prev.map((r) => r.id === id ? { ...r, like_count: r.like_count + 1 } : r));
    }
    const { error } = await setAfuChatReplyLike(postId, id, nextLiked, user.id);
    if (error) {
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(id);
        else next.delete(id);
        return next;
      });
      setReplies((prev) => prev.map((r) => r.id === id
        ? { ...r, like_count: Math.max(0, r.like_count + (wasLiked ? 1 : -1)) }
        : r));
      showAlert("Could not update like", error.message);
    }
  }, [user?.id, postId]);

  const sortedTree = useMemo(() => {
    const tree = buildReplyTree(replies);
    if (sortMode === "top") {
      return [...tree].sort((a, b) => {
        const aScore = (a.children?.length ?? 0) * 2 + a.like_count;
        const bScore = (b.children?.length ?? 0) * 2 + b.like_count;
        return bScore - aScore;
      });
    }
    return [...tree].reverse();
  }, [replies, sortMode]);

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function discardRecording() {
    stopTimer();
    if (recordingObj) {
      recordingObj.stopAndUnloadAsync().catch(() => {});
      setRecordingObj(null);
      // Restore audio session so playback (voice messages, video) works normally.
      // Without this reset, iOS stays in .playAndRecord category and routes
      // subsequent audio through the earpiece at near-zero volume.
      Audio?.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }).catch(() => {});
    }
    setRecordState("idle");
    setRecordedUri(null);
    setRecordedDuration(0);
    setRecordElapsed(0);
  }

  async function startRecording() {
    if (!Audio) {
      showAlert("Not supported", "Audio recording is not available in this environment.");
      return;
    }
    audioFocus.claimRecording();
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) {
      showAlert("Microphone access needed", "Please enable microphone access in Settings to record voice notes.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      setRecordingObj(recording);
      setRecordElapsed(0);
      setRecordState("recording");
      timerRef.current = setInterval(async () => {
        setRecordElapsed((prev) => {
          const next = prev + 1;
          if (next >= MAX_VOICE_SECS) {
            stopRecording(recording, next);
          }
          return next;
        });
      }, 1000);
    } catch (e: any) {
      showAlert("Could not start recording", e?.message || "Please try again.");
    }
  }

  async function stopRecording(rec?: AudioRecording | null, elapsed?: number) {
    stopTimer();
    const activeRec = rec ?? recordingObj;
    if (!activeRec) { setRecordState("idle"); return; }
    try {
      const status = await activeRec.getStatusAsync();
      await activeRec.stopAndUnloadAsync();
      const uri = activeRec.getURI();
      const durationMs = (status as any).durationMillis as number | undefined;
      const durationS = durationMs ? Math.ceil(durationMs / 1000) : (elapsed ?? recordElapsed);
      setRecordingObj(null);
      if (uri && durationS > 0) {
        setRecordedUri(uri);
        setRecordedDuration(durationS);
        setRecordState("recorded");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setRecordState("idle");
        setRecordElapsed(0);
      }
    } catch {
      setRecordState("idle");
      setRecordElapsed(0);
    }
    Audio?.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }).catch(() => {});
  }

  async function pickImage() {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      showAlert("Photos access needed", "Please enable photo library access in Settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.82,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      const a = result.assets[0];
      setAttachedImage({ uri: a.uri, width: a.width, height: a.height });
    }
  }

  async function sendReply() {
    const hasText = text.trim().length > 0;
    const hasVoice = recordState === "recorded" && !!recordedUri;
    const hasImage = !!attachedImage;
    if (!user || (!hasText && !hasVoice && !hasImage)) return;

    setSending(true);
    Animated.sequence([
      Animated.spring(sendScale, { toValue: 0.78, tension: 400, friction: 8, useNativeDriver: USE_NATIVE }),
      Animated.spring(sendScale, { toValue: 1, tension: 400, friction: 8, useNativeDriver: USE_NATIVE }),
    ]).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    let finalVoiceUrl: string | null = null;
    let finalImageUrl: string | null = null;

    if (hasVoice && recordedUri) {
      const ext = "m4a";
      const path = `${user.id}/comment_${Date.now()}.${ext}`;
      const { publicUrl, error } = await uploadToStorage("voice-messages", path, recordedUri, "audio/mp4");
      if (error || !publicUrl) {
        showAlert("Upload failed", "Could not upload voice note. Please try again.");
        setSending(false);
        return;
      }
      finalVoiceUrl = publicUrl;
    }

    if (hasImage && attachedImage) {
      const uriLower = attachedImage.uri.toLowerCase();
      const ext = uriLower.includes(".png") ? "png" : uriLower.includes(".webp") ? "webp" : "jpg";
      const path = `${user.id}/comment_${postId}_${Date.now()}.${ext}`;
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const { publicUrl, error } = await uploadToStorage("post-images", path, attachedImage.uri, mime);
      if (error || !publicUrl) {
        showAlert("Upload failed", "Could not upload image. Please try again.");
        setSending(false);
        return;
      }
      finalImageUrl = publicUrl;
    }

    const { data, error } = await createAfuChatPostReply(postId, {
      content: text.trim(),
      ...(replyingTo ? { parent_reply_id: replyingTo.id } : {}),
      ...(finalVoiceUrl
        ? { voice_url: finalVoiceUrl, voice_duration: recordedDuration }
        : {}),
      ...(finalImageUrl ? { image_url: finalImageUrl } : {}),
    });

    if (
      !error &&
      data &&
      typeof data.author_id === "string" &&
      typeof data.content === "string" &&
      typeof data.created_at === "string"
    ) {
      const newReply: Reply = {
        id: data.id,
        author_id: data.author_id,
        content: data.content,
        created_at: data.created_at,
        parent_reply_id: typeof data.parent_reply_id === "string" ? data.parent_reply_id : null,
        like_count: 0,
        voice_url: typeof data.voice_url === "string" ? data.voice_url : null,
        voice_duration: typeof data.voice_duration === "number" ? data.voice_duration : null,
        image_url: typeof data.image_url === "string" ? data.image_url : null,
        profile: {
          display_name: profile?.display_name || "You",
          handle: profile?.handle || "you",
          avatar_url: profile?.avatar_url || null,
        },
      };
      setReplies((prev) => [...prev, newReply]);
      setNewCommentIds((prev) => new Set([...prev, data.id]));
      onReplyCountChange(postId, 1);
      const wasThreaded = !!replyingTo;
      setText("");
      setReplyingTo(null);
      discardRecording();
      setAttachedImage(null);
      if (!wasThreaded) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    } else {
      console.error("[VideoCommentsSheet] sendReply:", error?.message, error?.code);
      showAlert(
        "Comment failed",
        error?.message || "Your comment could not be posted. Please try again.",
        [{ text: "OK" }],
      );
    }
    setSending(false);
  }

  const charLeft = 500 - text.length;
  const { height: screenDimH } = useWindowDimensions();
  const sheetMaxH = Math.min(screenDimH * 0.88, 680);

  // Smart-sheet peek / full heights (computed fresh every render, refs updated below)
  const peekSH = screenDimH * 0.58;
  const fullSH = screenDimH - insets.top - 16;
  peekSHRef.current = peekSH;
  fullSHRef.current = fullSH;

  // Keep ref-stable snap functions up to date
  snapToFullRef.current = () => {
    isFullSheetRef.current = true;
    Animated.timing(animSheetH, { toValue: fullSHRef.current, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  };
  snapToPeekRef.current = () => {
    isFullSheetRef.current = false;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    Animated.timing(animSheetH, { toValue: peekSHRef.current, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  };
  dismissSheetRef.current = dismissSheet;

  // Seed animSheetH once dimensions are known (first valid render)
  if ((animSheetH as any).__getValue() === 0 && peekSH > 0) {
    animSheetH.setValue(peekSH);
  }

  // Dynamic input bar height — mirrors the same calculation as post/[id].tsx so
  // the FlatList paddingBottom always clears the absolutely-positioned input bar.
  const inputBaseH = 56; // inputRow: avatar(32) + padding(8+8) + pill
  const inputDynH =
    inputBaseH +
    (replyingTo ? 36 : 0) +
    (showEmojiPanel ? 52 : 0) +
    (attachedImage ? 72 : 0) +
    (recordState === "recorded" && recordedUri ? 88 : 0) +
    (mentionSuggestions.length > 0 ? 56 : 0);

  const mediaBarH = (recordState === "recorded" && recordedUri) ? 88 : (attachedImage ? 72 : 0);

  const canSend = !sending && (text.trim().length > 0 || (recordState === "recorded" && !!recordedUri) || !!attachedImage);
  // ─── Native bottom sheet content ───────────────────────────────────────────
  const borderTopStyle = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)";

  // The bottom input area (always pinned at bottom of sheet)
  const bottomInputArea = (
    <View style={{ backgroundColor: sheetBg }}>
      {replyingTo && (
        <View style={[cStyles.replyingTo, { borderTopColor: borderTopClr }]}>
          <Text style={[cStyles.replyingToText, { color: replyToTxt }]}>
            Replying to <Text style={{ color: accent }}>@{replyingTo.profile.handle}</Text>
          </Text>
          <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={replyToIcon} />
          </TouchableOpacity>
        </View>
      )}

      {attachedImage && (
        <View style={[cStyles.imagePreviewBar, { borderTopColor: borderTopClr }]}>
          <View style={cStyles.imageThumbWrap}>
            <Image source={{ uri: attachedImage.uri }} style={cStyles.imageThumb} resizeMode="cover" />
            <TouchableOpacity onPress={() => setAttachedImage(null)} style={cStyles.imageRemoveBtn}>
              <Ionicons name="close-circle" size={18} color={imgRmvClr} />
            </TouchableOpacity>
          </View>
          <Text style={{ color: imgRmvClr, fontSize: 11, fontFamily: "Inter_400Regular" }}>Tap × to remove image</Text>
        </View>
      )}

      {recordState === "recorded" && recordedUri && (
        <VoicePreviewBar
          uri={recordedUri}
          durationSecs={recordedDuration}
          onDiscard={discardRecording}
          accent={accent}
        />
      )}

      {showEmojiPanel && (
        <View style={[cStyles.emojiBar, { borderTopColor: borderTopClr }]}>
          {QUICK_EMOJIS.map((e) => (
            <TouchableOpacity key={e} onPress={() => { setText((t) => t + e); }} style={cStyles.emojiBtn} activeOpacity={0.6}>
              <Text style={cStyles.emojiText}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Mention suggestion row — appears when user types @handle */}
      {mentionSuggestions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          style={[cStyles.mentionRow, { borderTopColor: borderTopClr }]}
          contentContainerStyle={{ paddingHorizontal: 8, gap: 6 }}
        >
          {mentionSuggestions.map((u) => (
            <TouchableOpacity
              key={u.id}
              onPress={() => insertMention(u.handle)}
              style={cStyles.mentionChip}
              activeOpacity={0.7}
            >
              <Avatar uri={u.avatar_url} name={u.display_name} size={28} userId={u.id} />
              <Text style={{ color: accent, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                @{u.handle}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {user ? (
        <View style={[cStyles.inputRow, { paddingBottom: kbHeight > 0 ? 8 : 12 }]}>
          {/* Avatar — sits to the left of the pill, never inside it */}
          <Avatar uri={profile?.avatar_url} name={profile?.display_name || "You"} size={32} />

          {/* ── Glass pill — text + all buttons on the right ── */}
          <View style={[cStyles.inputGlassPill, { backgroundColor: inputBg, borderColor: isDark ? "rgba(255,255,255,0.13)" : "rgba(26,18,8,0.13)" }]}>
            <View style={cStyles.inputBarRow}>
              {recordState === "recording" ? (
                /* Active recording fills the whole pill */
                <RecordingBar elapsed={recordElapsed} onStop={() => stopRecording()} accent={accent} />
              ) : (
                <>
                  {/* Text input — grows to fill available space */}
                  <TextInput
                    ref={inputRef}
                    style={[cStyles.input, { color: inputTxt }]}
                    placeholder={recordState === "recorded" ? "Add a caption… (optional)" : "Add a comment…"}
                    placeholderTextColor={inputPH}
                    value={text}
                    onChangeText={handleTextChange}
                    multiline
                    maxLength={500}
                  />

                  {/* Char counter */}
                  {text.length > 400 && (
                    <Text style={[cStyles.charCounter, { color: charLeft < 20 ? "#FF453A" : inputPH }]}>
                      {charLeft}
                    </Text>
                  )}

                  {/* Right: action icons — shown when idle */}
                  {!canSend && (
                    <>
                      <TouchableOpacity
                        onPress={() => setShowEmojiPanel((p) => !p)}
                        hitSlop={6}
                        activeOpacity={0.7}
                        style={[cStyles.pillIconBtn, showEmojiPanel && { backgroundColor: accent + "25" }]}
                      >
                        <Ionicons name="happy-outline" size={20} color={showEmojiPanel ? accent : attachIconCl} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={pickImage}
                        hitSlop={6}
                        activeOpacity={0.7}
                        style={[cStyles.pillIconBtn, attachedImage && { backgroundColor: accent + "30" }]}
                      >
                        <Ionicons name="image-outline" size={20} color={attachedImage ? accent : attachIconCl} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => { setText((t) => t + "@"); setTimeout(() => inputRef.current?.focus(), 50); }}
                        hitSlop={6}
                        activeOpacity={0.7}
                        style={cStyles.pillIconBtn}
                      >
                        <Text style={{ color: attachIconCl, fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 20 }}>@</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={recordState === "recorded" ? discardRecording : startRecording}
                        hitSlop={6}
                        activeOpacity={0.7}
                        style={[cStyles.pillIconBtn, recordState === "recorded" && { backgroundColor: accent + "30" }]}
                      >
                        <Ionicons name="mic-outline" size={20} color={recordState === "recorded" ? accent : attachIconCl} />
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Right: send button — replaces icons when content is ready */}
                  {canSend && (
                    <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                      <TouchableOpacity
                        onPress={sendReply}
                        disabled={!canSend}
                        style={[cStyles.sendBtn, { backgroundColor: accent }]}
                      >
                        {sending
                          ? <ActivityIndicator size={14} color="#fff" />
                          : <Ionicons name="arrow-up" size={16} color="#fff" />
                        }
                      </TouchableOpacity>
                    </Animated.View>
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={{ paddingVertical: 14, alignItems: "center", paddingBottom: kbHeight > 0 ? 8 : 14 }}
          onPress={() => { onClose(); router.push("/(auth)/login"); }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: accent + "50", backgroundColor: accent + "18" }}>
            <Ionicons name="person-circle" size={16} color={accent} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: accent }}>Sign in to comment</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );

  const innerSheet = (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: sheetBg, borderTopLeftRadius: 20, borderTopRightRadius: 20 }]} />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 0.5, borderLeftWidth: 0.5, borderRightWidth: 0.5, borderColor: borderTopStyle, pointerEvents: "none" } as any} />

      {/* Drag handle — visual only, no pan gesture */}
      <View style={[cStyles.handle, { backgroundColor: handleClr }]} />

      {/* Header */}
      <View style={cStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[cStyles.title, { color: titleClr }]}>
            {replies.length > 0 ? `${formatCount(replies.length)} ` : ""}Comments
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setSortMode((m) => m === "recent" ? "top" : "recent")}
          hitSlop={10}
          activeOpacity={0.7}
          style={{
            flexDirection: "row", alignItems: "center", gap: 4,
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
            backgroundColor: sortMode === "top" ? accent + "22" : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
          }}
        >
          <Ionicons name="funnel" size={13} color={sortMode === "top" ? accent : sortTabTxt} />
          <Text style={{ color: sortMode === "top" ? accent : sortTabTxt, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
            {sortMode === "recent" ? "Recent" : "Top"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} hitSlop={12} style={{ paddingLeft: 6 }}>
          <Ionicons name="close" size={22} color={closeBtnClr} />
        </TouchableOpacity>
      </View>

      <View style={{ height: 0.5, backgroundColor: separatorClr }} />

      {/* Scrollable comment list — flex:1 fills all remaining vertical space */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <CommentSkeleton isDark={isDark} />
        ) : sortedTree.length === 0 ? (
          <View style={[cStyles.emptyBox, { flex: 1, justifyContent: "center" }]}>
            <Ionicons name="chatbubble" size={32} color={emptyIconClr} />
            <Text style={[cStyles.emptyText, { color: emptyTxtClr }]}>No comments yet</Text>
            <Text style={[cStyles.emptySub, { color: emptySubClr }]}>Be the first to comment</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={sortedTree}
            keyExtractor={(r) => r.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: inputDynH + Math.max(kbHeight, insets.bottom) }}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScroll={(e) => { listScrollYRef.current = e.nativeEvent.contentOffset.y; }}
            renderItem={({ item: r }) => (
              <VideoReplyItem
                reply={r} depth={0} onReplyTo={handleReplyTo}
                isCreator={r.author_id === postAuthorId}
                isNew={newCommentIds.has(r.id)} accent={accent}
                likedSet={likedIds} onLike={handleReplyLike} isDark={isDark}
              />
            )}
          />
        )}
      </View>

      {/* Input bar — absolutely positioned so ONLY IT moves above the keyboard.
          The comment list (flex:1 above) stays completely still.
          kbAnim smoothly tracks keyboard height so the bar glides, not jumps. */}
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: kbAnim,
          backgroundColor: sheetBg,
          ...Platform.select({
            web: {},
            default: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: isDark ? 0.28 : 0.10,
            shadowRadius: 12,
            elevation: 12,
            },
          })
        }}
      >
        {bottomInputArea}
      </Animated.View>
    </>
  );

  // ─── Inline mode: render directly (no Modal, no backdrop) ───────────────────
  if (inline) {
    if (!visible) return null;
    return (
      <View style={[cStyles.container, { flex: 1 }]}>
        {innerSheet}
      </View>
    );
  }

  // ─── Modal mode: stable bottom sheet — fixed height, keyboard-independent ────
  // The sheet NEVER moves when the keyboard opens. Only the input bar (inside innerSheet,
  // absolutely positioned with bottom: kbAnim) lifts above the keyboard independently.
  const sheetH = screenDimH * 0.65;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismissSheet} statusBarTranslucent>
      {/* Full-screen overlay including tab bar area */}
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
        {/* Backdrop: tap to close */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* Entrance / exit slide animation only — sheet never repositions for keyboard */}
        <Animated.View style={{ transform: [{ translateY: sheetTranslateY }] }}>
          <View
            style={[
              cStyles.container,
              {
                height: sheetH,
                overflow: "hidden",
              },
            ]}
          >
            <Pressable onPress={() => {}} style={{ flex: 1 }}>
              {innerSheet}
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const cStyles = StyleSheet.create({
  kavFull: { flex: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  container: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginVertical: 12 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sortRow: { flexDirection: "row", gap: 6 },
  sortTab: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "transparent" },
  sortTabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyBox: { padding: 32, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  replyingTo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  replyingToText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emojiBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, gap: 2 },
  emojiBtn: { flex: 1, alignItems: "center", paddingVertical: 6 },
  emojiText: { fontSize: 20 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  inputGlassPill: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 0.5,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 4px 20px rgba(0,0,0,0.14)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 10 },
    }),
  },
  inputBarRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingVertical: 4, gap: 2 },
  pillIconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, maxHeight: 100, paddingVertical: 4, paddingHorizontal: 4 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginRight: 2 },
  charCounter: { fontSize: 10, fontFamily: "Inter_500Medium" },
  attachBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  imagePreviewBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  imageThumbWrap: { position: "relative" },
  imageThumb: { width: 52, height: 52, borderRadius: 8 },
  imageRemoveBtn: { position: "absolute", top: -6, right: -6 },
  mentionRow: {
    flexDirection: "row", flexWrap: "nowrap",
    paddingHorizontal: 10, paddingVertical: 6, gap: 6,
    borderTopWidth: 0.5,
  },
  mentionChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
});
