/**
 * VideoPlayerScreen — TikTok-style vertical video feed.
 *
 * Scroll architecture (why it works):
 *  1. pagingEnabled on FlatList — simplest, most reliable native snap.
 *  2. TapHandler uses react-native-gesture-handler's native Gesture API
 *     (GestureDetector + Gesture.Tap/LongPress). Running on the UI thread
 *     via JSI means zero JS negotiation — FlatList scroll starts the instant
 *     the finger moves, no "hard push" needed.
 *  3. getItemLayout uses stable window dimensions — never dynamic state.
 *  4. onViewableItemsChanged stored in a stable ref — FlatList never re-wires.
 *  5. windowSize=3, removeClippedSubviews=false so neighbours preload smoothly.
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import { useAppAccent } from "@/context/AppAccentContext";
import { useTheme } from "@/hooks/useTheme";
import { notifyPostLike, notifyPostReply } from "@/lib/notifyUser";
import { RichText } from "@/components/ui/RichText";
import { encodeId, decodeId, isUuid } from "@/lib/shortId";
import { getCachedVideoUri, cacheVideo, markVideoWatched } from "@/lib/videoCache";
import { saveVideoProgress, clearVideoProgress } from "@/lib/videoProgress";
import { useResolvedVideoSource } from "@/hooks/useResolvedVideoSource";
import { getPostVideoManifest, pickBestSource } from "@/lib/videoApi";
import { getPreferredVideoHeight } from "@/lib/networkQuality";
import { ChatBubbleSkeleton, ShortsFeedSkeleton } from "@/components/ui/Skeleton";
import SignInPromptModal from "@/components/ui/SignInPromptModal";
import {
  computeFeedScore,
  getLearnedInterestBoosts,
  matchInterestsWeighted,
  diversifyFeed,
  type FeedSignals,
} from "../../lib/feedAlgorithm";
import * as Haptics from "@/lib/haptics";

// ─── Constants ────────────────────────────────────────────────────────────────

const USE_NATIVE = Platform.OS !== "web";
const VIDEO_PAGE_SIZE = 50;
const VID_THREAD_COLORS = ["#00BCD4", "#5C6BC0", "#26A69A", "#EF6C00", "#8E24AA"];
const QUICK_EMOJIS = ["🔥", "❤️", "😂", "😮", "👏", "💯", "🙌", "😍"];
const SOCIAL_PLATFORMS = [
  { id: "whatsapp",  label: "WhatsApp",  icon: "logo-whatsapp",  color: "#25D366", scheme: (u: string) => `https://wa.me/?text=${encodeURIComponent(u)}` },
  { id: "telegram",  label: "Telegram",  icon: "paper-plane",    color: "#0088CC", scheme: (u: string) => `https://t.me/share/url?url=${encodeURIComponent(u)}` },
  { id: "twitter",   label: "X",         icon: "logo-twitter",   color: "#000",    scheme: (u: string) => `https://x.com/intent/tweet?text=${encodeURIComponent(u)}` },
  { id: "facebook",  label: "Facebook",  icon: "logo-facebook",  color: "#1877F2", scheme: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { id: "instagram", label: "Instagram", icon: "logo-instagram", color: "#E1306C", scheme: (_: string) => `instagram://app` },
  { id: "copy",      label: "Copy link", icon: "link-outline",   color: "#8E8E93", scheme: null },
  { id: "more",      label: "More",      icon: "share-social",   color: "#00BCD4", scheme: null },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type VideoPost = {
  id: string; author_id: string; content: string; video_url: string;
  image_url: string | null; created_at: string; view_count: number;
  audio_name: string | null;
  profile: { display_name: string; handle: string; avatar_url: string | null };
  liked: boolean; bookmarked: boolean; likeCount: number; replyCount: number;
};

type Reply = {
  id: string; author_id: string; content: string; created_at: string;
  parent_reply_id: string | null; like_count: number;
  profile: { display_name: string; handle: string; avatar_url: string | null };
  children?: Reply[];
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function buildReplyTree(flat: Reply[]): Reply[] {
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

function formatCount(n: number): string {
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

function parseCommentText(text: string, accent: string): React.ReactNode {
  return text.split(/(@\w[\w.]*|#\w+)/g).map((p, i) => {
    if (/^@\w/.test(p)) return <Text key={i} style={{ color: accent, fontFamily: "Inter_600SemiBold" }}>{p}</Text>;
    if (/^#\w/.test(p)) return <Text key={i} style={{ color: accent + "BB" }}>{p}</Text>;
    return <Text key={i}>{p}</Text>;
  });
}

// ─── GradientOverlay ──────────────────────────────────────────────────────────

const GRADIENT_BASE: any = { position: "absolute", left: 0, right: 0, pointerEvents: "none" };

function GradientOverlay({
  position,
  height,
}: {
  position: "top" | "bottom";
  height: number;
}) {
  const posStyle = position === "bottom" ? { bottom: 0 } : { top: 0 };
  if (Platform.OS === "web") {
    const gradient =
      position === "bottom"
        ? "linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)"
        : "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)";
    return (
      <View
        style={[GRADIENT_BASE, posStyle, { height, background: gradient } as any]}
        pointerEvents="none"
      />
    );
  }
  return (
    <LinearGradient
      colors={
        position === "bottom"
          ? ["transparent", "rgba(0,0,0,0.88)"]
          : ["rgba(0,0,0,0.55)", "transparent"]
      }
      style={[GRADIENT_BASE, posStyle, { height }]}
      pointerEvents="none"
    />
  );
}

// ─── TapHandler ───────────────────────────────────────────────────────────────
/**
 * Transparent layer that detects taps/double-taps/long-presses using
 * react-native-gesture-handler's native Gesture API.
 *
 * Running on the UI thread via JSI means this NEVER competes with the
 * FlatList's scroll gesture — the scroll starts the instant the finger
 * moves, with zero JS-thread negotiation delay.
 */
function TapHandler({
  onTap,
  onDoubleTap,
  onLongPress,
}: {
  onTap: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
}) {
  const singleTap = Gesture.Tap()
    .maxDuration(300)
    .maxDistance(10)
    .runOnJS(true)
    .onEnd(() => { onTap(); });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .maxDistance(10)
    .runOnJS(true)
    .onEnd(() => { onDoubleTap?.(); });

  const longPress = Gesture.LongPress()
    .minDuration(500)
    .runOnJS(true)
    .onStart(() => { onLongPress?.(); });

  // Exclusive: double-tap wins over single-tap (waits to confirm no second tap)
  // Race: long-press fires as soon as threshold met, cancels tap
  const composed = Gesture.Race(
    longPress,
    Gesture.Exclusive(doubleTap, singleTap),
  );

  return (
    <GestureDetector gesture={composed}>
      <View style={StyleSheet.absoluteFill} />
    </GestureDetector>
  );
}

// ─── Web video player ─────────────────────────────────────────────────────────

function WebVideoPlayer({
  src, poster, active, paused, preloadOnly,
  onTogglePause, onDoubleTap, onLongPress,
  onProgress, onBuffering, onFirstPlay, externalRef,
}: {
  src: string; poster?: string | null; active: boolean; paused: boolean; preloadOnly: boolean;
  onTogglePause: () => void; onDoubleTap?: () => void; onLongPress?: () => void;
  onProgress: (posMs: number, durMs: number) => void; onBuffering: (b: boolean) => void;
  onFirstPlay?: () => void;
  externalRef?: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const innerRef = useRef<HTMLVideoElement | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  function setRef(el: HTMLVideoElement | null) {
    innerRef.current = el;
    if (externalRef) externalRef.current = el;
  }

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    if (active && !paused && !preloadOnly) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [active, paused, src, preloadOnly]);

  useEffect(() => {
    const el = innerRef.current;
    if (!el || active) return;
    try { el.currentTime = 0; } catch {}
  }, [active]);

  function handlePointerDown(e: any) {
    movedRef.current = false;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    if (onLongPress) {
      longPressRef.current = setTimeout(() => {
        longPressRef.current = null;
        if (!movedRef.current) onLongPress();
      }, 500);
    }
  }

  function handlePointerMove(e: any) {
    if (!pointerStartRef.current) return;
    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    if (dx > 8 || dy > 8) {
      movedRef.current = true;
      if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
    }
  }

  function handlePointerUp() {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
    pointerStartRef.current = null;
  }

  function handleClick(e: any) {
    if (preloadOnly || movedRef.current) return;
    e?.stopPropagation?.();
    const now = Date.now();
    if (onDoubleTap && now - lastTapRef.current < 300) {
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      lastTapRef.current = 0;
      onDoubleTap();
    } else {
      lastTapRef.current = now;
      tapTimerRef.current = setTimeout(() => {
        tapTimerRef.current = null;
        onTogglePause();
      }, 250);
    }
  }

  return (
    <>
      {/* @ts-ignore */}
      <video
        ref={setRef}
        src={src}
        poster={poster || undefined}
        playsInline
        loop
        preload="auto"
        onTimeUpdate={(e: any) => {
          const v = e.currentTarget as HTMLVideoElement;
          if (v.duration) onProgress(v.currentTime * 1000, v.duration * 1000);
        }}
        onWaiting={() => onBuffering(true)}
        onPlaying={() => { onBuffering(false); onFirstPlay?.(); }}
        onCanPlay={() => onBuffering(false)}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000", pointerEvents: "none" }}
      />
      {/* @ts-ignore */}
      <div
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, cursor: preloadOnly ? "default" : "pointer", touchAction: "pan-y" }}
      />
    </>
  );
}

// ─── VideoReplyItem ───────────────────────────────────────────────────────────

function VideoReplyItem({ reply: r, depth, onReplyTo, isCreator, isNew, accent }: {
  reply: Reply; depth: number; onReplyTo: (r: Reply) => void;
  isCreator: boolean; isNew: boolean; accent: string;
}) {
  const indent = Math.min(depth, 4) * 20;
  const [liked, setLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(r.like_count);
  const [collapsed, setCollapsed] = useState(false);
  const likeScale = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(isNew ? 24 : 0)).current;
  const fadeAnim = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const threadColor = VID_THREAD_COLORS[depth % VID_THREAD_COLORS.length];
  const hasChildren = (r.children?.length ?? 0) > 0;
  const isTop = depth === 0;

  useEffect(() => {
    if (!isNew) return;
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, tension: 180, friction: 22, useNativeDriver: USE_NATIVE }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: USE_NATIVE }),
    ]).start();
  }, []);

  function handleLike() {
    const next = !liked;
    setLiked(next);
    setLocalLikes((c) => (next ? c + 1 : Math.max(0, c - 1)));
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
          <Avatar uri={r.profile.avatar_url} name={r.profile.display_name} size={isTop ? 36 : 26} />
        </View>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4, flexWrap: "wrap" }}>
            <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" }}>{r.profile.display_name}</Text>
            {isCreator && (
              <View style={{ backgroundColor: accent + "22", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: accent + "55" }}>
                <Text style={{ color: accent, fontSize: 10, fontFamily: "Inter_700Bold" }}>Author</Text>
              </View>
            )}
            <Text style={{ color: "rgba(255,255,255,0.28)", fontSize: 11 }}>· {formatRelative(r.created_at)}</Text>
          </View>
          <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 }}>
            {parseCommentText(r.content, accent)}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 18, marginTop: 8, marginBottom: 2 }}>
            <TouchableOpacity onPress={handleLike} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                <Ionicons name={liked ? "heart" : "heart-outline"} size={14} color={liked ? "#FF2D55" : "rgba(255,255,255,0.3)"} />
              </Animated.View>
              <Text style={{ color: liked ? "#FF2D55" : "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                {localLikes > 0 ? localLikes : "Like"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onReplyTo(r)} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="arrow-undo-outline" size={13} color="rgba(255,255,255,0.3)" />
              <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Reply</Text>
            </TouchableOpacity>
            {hasChildren && (
              <TouchableOpacity onPress={() => setCollapsed((c) => !c)} activeOpacity={0.7} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={12} color={threadColor} />
                <Text style={{ color: threadColor, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {collapsed ? `${r.children!.length} ${r.children!.length === 1 ? "reply" : "replies"}` : "Hide replies"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
      {isTop && !hasChildren && (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.05)", marginLeft: indent + 46, marginTop: 4 }} />
      )}
      {!collapsed && r.children?.map((child) => (
        <VideoReplyItem key={child.id} reply={child} depth={depth + 1} onReplyTo={onReplyTo} isCreator={isCreator} isNew={false} accent={accent} />
      ))}
    </Animated.View>
  );
}

// ─── CommentsSheet ────────────────────────────────────────────────────────────

function CommentsSheet({ visible, onClose, postId, postAuthorId, onReplyCountChange }: {
  visible: boolean; onClose: () => void; postId: string; postAuthorId: string;
  onReplyCountChange: (postId: string, delta: number) => void;
}) {
  const { accent } = useAppAccent();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Reply | null>(null);
  const [sortMode, setSortMode] = useState<"recent" | "top">("recent");
  const [newCommentIds, setNewCommentIds] = useState<Set<string>>(new Set());
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const sendScale = useRef(new Animated.Value(1)).current;

  const loadReplies = useCallback(() => {
    if (!postId) return;
    supabase
      .from("post_replies")
      .select("id, author_id, content, created_at, parent_reply_id, profiles!post_replies_author_id_fkey(display_name, handle, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (data) {
          setReplies(data.map((r: any) => ({
            id: r.id, author_id: r.author_id, content: r.content || "",
            created_at: r.created_at, parent_reply_id: r.parent_reply_id || null, like_count: 0,
            profile: {
              display_name: r.profiles?.display_name || "User",
              handle: r.profiles?.handle || "user",
              avatar_url: r.profiles?.avatar_url || null,
            },
          })));
        }
        setLoading(false);
      });
  }, [postId]);

  useEffect(() => {
    if (!visible || !postId) return;
    setReplies([]); setLoading(true); setText(""); setReplyingTo(null); setNewCommentIds(new Set());
    loadReplies();
  }, [visible, postId, loadReplies]);

  useEffect(() => {
    if (!visible || !postId) return;
    const ch = supabase
      .channel(`video-comments:${postId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_replies", filter: `post_id=eq.${postId}` }, loadReplies)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "post_replies", filter: `post_id=eq.${postId}` }, loadReplies)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [visible, postId, loadReplies]);

  function handleReplyTo(reply: Reply) {
    setReplyingTo(reply);
    setText("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function getSortedTree(): Reply[] {
    const tree = buildReplyTree(replies);
    if (sortMode === "top") {
      return [...tree].sort((a, b) => {
        const aScore = (a.children?.length ?? 0) * 2 + a.like_count;
        const bScore = (b.children?.length ?? 0) * 2 + b.like_count;
        return bScore - aScore;
      });
    }
    return [...tree].reverse();
  }

  async function sendReply() {
    if (!user || !text.trim()) return;
    setSending(true);
    Animated.sequence([
      Animated.spring(sendScale, { toValue: 0.78, tension: 400, friction: 8, useNativeDriver: USE_NATIVE }),
      Animated.spring(sendScale, { toValue: 1, tension: 400, friction: 8, useNativeDriver: USE_NATIVE }),
    ]).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const payload: any = { post_id: postId, author_id: user.id, content: text.trim() };
    if (replyingTo) payload.parent_reply_id = replyingTo.id;
    const { data, error } = await supabase.from("post_replies").insert(payload).select("id, author_id, content, created_at, parent_reply_id").single();
    if (!error && data) {
      const newReply: Reply = {
        id: data.id, author_id: data.author_id, content: data.content,
        created_at: data.created_at, parent_reply_id: data.parent_reply_id || null, like_count: 0,
        profile: { display_name: profile?.display_name || "You", handle: profile?.handle || "you", avatar_url: profile?.avatar_url || null },
      };
      setReplies((prev) => [...prev, newReply]);
      setNewCommentIds((prev) => new Set([...prev, data.id]));
      onReplyCountChange(postId, 1);
      if (replyingTo && replyingTo.author_id !== user.id) {
        notifyPostReply({ postAuthorId: replyingTo.author_id, replierName: profile?.display_name || "Someone", replierUserId: user.id, postId, replyPreview: data.content });
      }
      const wasThreaded = !!replyingTo;
      setText(""); setReplyingTo(null);
      if (!wasThreaded) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    } else if (error) {
      Alert.alert(
        "Comment failed",
        "Your comment could not be posted. If this keeps happening, check the Status page under Settings → Help & About.",
        [{ text: "OK" }],
      );
    }
    setSending(false);
  }

  const sortedTree = getSortedTree();
  const charLeft = 500 - text.length;
  const { height: sheetH } = useWindowDimensions();
  const sheetMaxH = Math.min(sheetH * 0.88, 680);
  const listMaxH = Math.max(sheetMaxH - 210 - Math.max(insets.bottom, 16), 80);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "web" ? undefined : "height"} style={cStyles.kavFull}>
        <Pressable style={cStyles.overlay} onPress={onClose}>
          <Pressable onPress={() => {}} style={[cStyles.container, { paddingBottom: Math.max(insets.bottom, 16), maxHeight: sheetMaxH }]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111115", borderTopLeftRadius: 20, borderTopRightRadius: 20 }]} />
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)" }} pointerEvents="none" />
            <View style={cStyles.handle} />

            <View style={cStyles.header}>
              <View style={{ flex: 1 }}>
                <Text style={cStyles.title}>
                  Comments{replies.length > 0 && <Text style={cStyles.titleCount}> {formatCount(replies.length)}</Text>}
                </Text>
              </View>
              <View style={cStyles.sortRow}>
                {(["recent", "top"] as const).map((mode) => (
                  <TouchableOpacity key={mode} onPress={() => setSortMode(mode)} activeOpacity={0.7}
                    style={[cStyles.sortTab, sortMode === mode && { backgroundColor: accent + "22", borderColor: accent + "55" }]}>
                    <Text style={[cStyles.sortTabText, { color: sortMode === mode ? accent : "rgba(255,255,255,0.45)" }]}>
                      {mode === "recent" ? "Recent" : "Top"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>

            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.1)" }} />

            {loading ? (
              <View style={{ padding: 32, alignItems: "center" }}>
                <ActivityIndicator color={accent} />
              </View>
            ) : sortedTree.length === 0 ? (
              <View style={cStyles.emptyBox}>
                <Ionicons name="chatbubble-outline" size={32} color="rgba(255,255,255,0.2)" />
                <Text style={cStyles.emptyText}>No comments yet</Text>
                <Text style={cStyles.emptySub}>Be the first to comment</Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={sortedTree}
                keyExtractor={(r) => r.id}
                style={{ flexShrink: 1, minHeight: 80, maxHeight: listMaxH }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: r }) => (
                  <VideoReplyItem
                    reply={r} depth={0} onReplyTo={handleReplyTo}
                    isCreator={r.author_id === postAuthorId}
                    isNew={newCommentIds.has(r.id)} accent={accent}
                  />
                )}
              />
            )}

            {/* Reply-to indicator */}
            {replyingTo && (
              <View style={[cStyles.replyingTo, { borderTopColor: "rgba(255,255,255,0.08)" }]}>
                <Text style={cStyles.replyingToText}>
                  Replying to <Text style={{ color: accent }}>@{replyingTo.profile.handle}</Text>
                </Text>
                <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              </View>
            )}

            {/* Quick emoji bar */}
            <View style={[cStyles.emojiBar, { borderTopColor: "rgba(255,255,255,0.08)" }]}>
              {QUICK_EMOJIS.map((e) => (
                <TouchableOpacity key={e} onPress={() => setText((t) => t + e)} style={cStyles.emojiBtn} activeOpacity={0.6}>
                  <Text style={cStyles.emojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Input row */}
            {user ? (
              <View style={[cStyles.inputRow, { borderTopColor: "rgba(255,255,255,0.08)" }]}>
                <Avatar uri={profile?.avatar_url} name={profile?.display_name || "You"} size={32} />
                <View style={{ flex: 1, position: "relative" }}>
                  <TextInput
                    ref={inputRef}
                    style={cStyles.input}
                    placeholder="Add a comment…"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={text}
                    onChangeText={setText}
                    multiline
                    maxLength={500}
                  />
                  {text.length > 400 && (
                    <Text style={[cStyles.charCounter, { color: charLeft < 20 ? "#FF453A" : "rgba(255,255,255,0.3)" }]}>
                      {charLeft}
                    </Text>
                  )}
                </View>
                <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                  <TouchableOpacity
                    onPress={sendReply}
                    disabled={!text.trim() || sending}
                    style={[cStyles.sendBtn, { backgroundColor: text.trim() ? accent : "rgba(255,255,255,0.12)" }]}
                  >
                    {sending
                      ? <ActivityIndicator size={14} color="#fff" />
                      : <Ionicons name="arrow-up" size={16} color="#fff" />
                    }
                  </TouchableOpacity>
                </Animated.View>
              </View>
            ) : (
              <TouchableOpacity
                style={{ paddingVertical: 14, alignItems: "center" }}
                onPress={() => { onClose(); router.push("/(auth)/login"); }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: accent + "50", backgroundColor: accent + "18" }}>
                  <Ionicons name="person-circle-outline" size={16} color={accent} />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: accent }}>Sign in to comment</Text>
                </View>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const cStyles = StyleSheet.create({
  kavFull: { flex: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  container: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginVertical: 12 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  title: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  titleCount: { color: "rgba(255,255,255,0.4)", fontFamily: "Inter_400Regular", fontSize: 14 },
  sortRow: { flexDirection: "row", gap: 6 },
  sortTab: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "transparent" },
  sortTabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyBox: { padding: 32, alignItems: "center", gap: 8 },
  emptyText: { color: "rgba(255,255,255,0.5)", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySub: { color: "rgba(255,255,255,0.3)", fontSize: 13, fontFamily: "Inter_400Regular" },
  replyingTo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  replyingToText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Inter_400Regular" },
  emojiBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
  emojiBtn: { flex: 1, alignItems: "center", paddingVertical: 6 },
  emojiText: { fontSize: 20 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  input: { flex: 1, color: "#fff", fontFamily: "Inter_400Regular", fontSize: 14, maxHeight: 100, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)" },
  sendBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  charCounter: { position: "absolute", right: 14, bottom: 10, fontSize: 10, fontFamily: "Inter_500Medium" },
});

// ─── SocialShareSheet ─────────────────────────────────────────────────────────

function SocialShareSheet({ visible, onClose, url, title }: { visible: boolean; onClose: () => void; url: string; title: string }) {
  if (!visible) return null;
  async function handlePlatform(p: typeof SOCIAL_PLATFORMS[number]) {
    if (p.id === "copy") { Clipboard.setStringAsync(url); onClose(); return; }
    if (p.id === "more") { onClose(); setTimeout(async () => { await Share.share({ message: `${title} ${url}`, url, title }); }, 300); return; }
    onClose();
    const deepUrl = p.scheme!(url);
    const canOpen = await Linking.canOpenURL(deepUrl).catch(() => false);
    if (canOpen) await Linking.openURL(deepUrl).catch(() => {});
    else await Share.share({ message: `${title} ${url}`, url, title });
  }
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ssStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={ssStyles.sheet}>
        <View style={ssStyles.handle} />
        <Text style={ssStyles.title}>Share video</Text>
        <View style={ssStyles.grid}>
          {SOCIAL_PLATFORMS.map((p) => (
            <TouchableOpacity key={p.id} style={ssStyles.cell} onPress={() => handlePlatform(p)}>
              <View style={[ssStyles.iconCircle, { backgroundColor: p.color }]}>
                <Ionicons name={p.icon as any} size={22} color="#fff" />
              </View>
              <Text style={ssStyles.cellLabel}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={ssStyles.cancelBtn} onPress={onClose}>
          <Text style={ssStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
const ssStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#1a1a1a", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 14 },
  title: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center", marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  cell: { width: 72, alignItems: "center", gap: 6 },
  iconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  cellLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  cancelBtn: { marginTop: 16, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  cancelText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

// ─── VideoContextMenu ─────────────────────────────────────────────────────────

function VideoContextMenu({ visible, item, onClose, onShare, onRepost, onDownload, onCopyLink, onNotInterested, onReport }: {
  visible: boolean; item: VideoPost | null; onClose: () => void;
  onShare: () => void; onRepost: () => void; onDownload: () => void;
  onCopyLink: () => void; onNotInterested: () => void; onReport: () => void;
}) {
  if (!visible || !item) return null;
  const OPTIONS = [
    { id: "download",      label: "Save to device",  icon: "download-outline",     action: onDownload,      color: "#fff" },
    { id: "share",         label: "Share to...",     icon: "share-social-outline", action: onShare,         color: "#fff" },
    { id: "repost",        label: "Repost",          icon: "repeat-outline",       action: onRepost,        color: "#fff" },
    { id: "copylink",      label: "Copy link",       icon: "link-outline",         action: onCopyLink,      color: "#fff" },
    { id: "notinterested", label: "Not interested",  icon: "eye-off-outline",      action: onNotInterested, color: "rgba(255,255,255,0.65)" },
    { id: "report",        label: "Report",          icon: "flag-outline",         action: onReport,        color: "#FF453A" },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={cmStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={cmStyles.sheet}>
        <View style={cmStyles.handle} />
        <View style={cmStyles.authorPreview}>
          <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={36} />
          <View>
            <Text style={cmStyles.previewHandle}>@{item.profile.handle}</Text>
            <Text style={cmStyles.previewCaption} numberOfLines={1}>{item.content || "Video"}</Text>
          </View>
        </View>
        <View style={cmStyles.divider} />
        {OPTIONS.map((opt) => (
          <TouchableOpacity key={opt.id} style={cmStyles.row} onPress={() => { onClose(); setTimeout(opt.action, 200); }}>
            <View style={[cmStyles.rowIcon, opt.id === "report" && { backgroundColor: "rgba(255,69,58,0.12)" }]}>
              <Ionicons name={opt.icon as any} size={22} color={opt.color} />
            </View>
            <Text style={[cmStyles.rowLabel, { color: opt.color }]}>{opt.label}</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={cmStyles.cancelBtn} onPress={onClose}>
          <Text style={cmStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
const cmStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#1a1a1a", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 14 },
  authorPreview: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  previewHandle: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  previewCaption: { color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  cancelBtn: { marginTop: 6, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  cancelText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

// ─── VideoItem ────────────────────────────────────────────────────────────────

const VideoItem = React.memo(function VideoItem({
  item, isActive, isNearActive, screenH, screenW, isFollowing, isSelf,
  onLike, onBookmark, onOpenComments, onShare, onFollow, onRecordView, onOpenMenu,
}: {
  item: VideoPost; isActive: boolean; isNearActive: boolean; screenH: number; screenW: number;
  isFollowing: boolean; isSelf: boolean;
  onLike: (id: string, liked: boolean) => void; onBookmark: (id: string, bookmarked: boolean) => void;
  onOpenComments: (id: string) => void; onShare: (item: VideoPost) => void;
  onFollow: (authorId: string, isFollowing: boolean) => void; onRecordView: (postId: string) => void;
  onOpenMenu: (item: VideoPost) => void;
}) {
  const { accent } = useAppAccent();
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [showBuffering, setShowBuffering] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [cachedUri, setCachedUri] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const heartScale = useRef(new Animated.Value(1)).current;
  const doubleTapOpacity = useRef(new Animated.Value(0)).current;
  const doubleTapScale = useRef(new Animated.Value(0.3)).current;
  const viewRecorded = useRef(false);
  const offlineSaved = useRef(false);
  const cacheAttempted = useRef(false);
  const bufferingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Perf refs — avoid setState on every video frame
  const bufferingRef = useRef(false);
  const videoStartedRef = useRef(false);
  const lastProgressFrameRef = useRef(0);   // timestamp of last setProgress call
  const lastSavedProgressRef = useRef(0);   // timestamp of last AsyncStorage save
  const cacheDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolved = useResolvedVideoSource(item.id, item.video_url, { targetHeight: getPreferredVideoHeight() });
  // When an error occurs fall back directly to the raw video_url, bypassing cache/manifest
  const playbackUri = videoError ? item.video_url : (cachedUri || resolved.uri || item.video_url);
  const shouldMountVideo = isActive || isNearActive;
  const preloadOnly = !isActive && isNearActive;
  const showExpand = !!item.content && (item.content.split("\n").length > 2 || item.content.length > 120);

  // Start pre-caching once the video enters the preload window.
  // Delay by 500 ms so the download does NOT compete with the swipe animation.
  useEffect(() => {
    if (!isNearActive || cacheAttempted.current || !item.video_url) return;
    cacheAttempted.current = true;
    cacheDelayRef.current = setTimeout(() => {
      getCachedVideoUri(item.video_url).then((ex) => {
        if (ex) setCachedUri(ex);
        else cacheVideo(item.video_url).then((l) => { if (l) setCachedUri(l); });
      });
    }, 500);
    return () => { if (cacheDelayRef.current) { clearTimeout(cacheDelayRef.current); cacheDelayRef.current = null; } };
  }, [isNearActive]);

  // Reset when leaving viewport; record view when becoming active
  useEffect(() => {
    if (!isActive) {
      setPaused(false);
      setProgress(0);
      setExpanded(false);
      setVideoStarted(false);
      setShowBuffering(false);
      setVideoError(false);
      if (bufferingTimerRef.current) { clearTimeout(bufferingTimerRef.current); bufferingTimerRef.current = null; }
      // Do NOT call unloadAsync() here — it fires on first mount too (isActive=false
      // while preloading) and permanently breaks the underlying AVPlayer before it
      // has a chance to buffer. The Video component is unmounted automatically by
      // the shouldMountVideo gate when the item leaves the ±2 nearActive window,
      // which is the correct place to free native resources.
      // Reset per-frame perf refs when leaving viewport
      bufferingRef.current = false;
      videoStartedRef.current = false;
      lastProgressFrameRef.current = 0;
      lastSavedProgressRef.current = 0;
      // Reset offline-save flag so it retries on next view if the save failed
      offlineSaved.current = false;
    } else {
      if (!viewRecorded.current) {
        viewRecorded.current = true;
        onRecordView(item.id);
      }
      if (!offlineSaved.current) {
        offlineSaved.current = true;
        const title = (item.profile?.display_name ?? "") +
          (item.content ? `: ${item.content.slice(0, 60)}` : "");
        markVideoWatched(item.id, item.video_url, {
          title,
          thumbnail: item.image_url ?? null,
        }).catch(() => {
          // Reset so the next time the user views this video it tries again
          offlineSaved.current = false;
        });
      }
    }
  }, [isActive]);

  function handleTap() { setPaused((p) => !p); }

  function triggerDoubleTapLike() {
    if (!item.liked) onLike(item.id, false);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(doubleTapOpacity, { toValue: 1, duration: 100, useNativeDriver: USE_NATIVE }),
        Animated.spring(doubleTapScale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: USE_NATIVE }),
      ]),
      Animated.delay(500),
      Animated.parallel([
        Animated.timing(doubleTapOpacity, { toValue: 0, duration: 250, useNativeDriver: USE_NATIVE }),
        Animated.timing(doubleTapScale, { toValue: 0.3, duration: 250, useNativeDriver: USE_NATIVE }),
      ]),
    ]).start();
  }

  function handleLike() {
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 0.6, duration: 80, useNativeDriver: USE_NATIVE }),
      Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 7, useNativeDriver: USE_NATIVE }),
    ]).start();
    onLike(item.id, item.liked);
  }

  function onPlaybackStatus(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;

    // ── Buffering — only call setState when the value actually changes ────────
    const isNowBuffering = status.isBuffering;
    if (isNowBuffering !== bufferingRef.current) {
      bufferingRef.current = isNowBuffering;
      setBuffering(isNowBuffering);
      if (isNowBuffering) {
        if (!bufferingTimerRef.current) {
          bufferingTimerRef.current = setTimeout(() => { setShowBuffering(true); bufferingTimerRef.current = null; }, 400);
        }
      } else {
        if (bufferingTimerRef.current) { clearTimeout(bufferingTimerRef.current); bufferingTimerRef.current = null; }
        setShowBuffering(false);
      }
    }

    // ── Video started — only fire once ────────────────────────────────────────
    if ((status as any).isPlaying && !videoStartedRef.current) {
      videoStartedRef.current = true;
      setVideoStarted(true);
    }

    // ── Progress — throttle UI re-renders to ≤4fps (250 ms) ──────────────────
    if (status.durationMillis && status.durationMillis > 0) {
      const frac = status.positionMillis / status.durationMillis;
      const now = Date.now();

      if (now - lastProgressFrameRef.current >= 250) {
        lastProgressFrameRef.current = now;
        setDurationMs(status.durationMillis);
        setProgress(frac);
      }

      // Throttle AsyncStorage writes to every 2 s — they block the JS thread
      if (frac >= 0.97) {
        clearVideoProgress(item.id);
      } else if (now - lastSavedProgressRef.current >= 2000) {
        lastSavedProgressRef.current = now;
        saveVideoProgress(item.id, frac);
      }
    }
  }

  function handleProgressBarPress(locationX: number) {
    if (!progressBarWidth || !durationMs) return;
    const pct = Math.max(0, Math.min(1, locationX / progressBarWidth));
    videoRef.current?.setPositionAsync(durationMs * pct).catch(() => {});
  }

  const videoElement = Platform.OS === "web" ? (
    <View style={StyleSheet.absoluteFill}>
      {shouldMountVideo ? (
        <WebVideoPlayer
          src={playbackUri} poster={item.image_url} active={isActive} paused={paused} preloadOnly={preloadOnly}
          onTogglePause={() => setPaused((p) => !p)} onDoubleTap={triggerDoubleTapLike}
          onLongPress={() => onOpenMenu(item)}
          onProgress={(pos, dur) => {
            if (!dur) return;
            setDurationMs(dur);
            const frac = pos / dur;
            setProgress(frac);
            if (frac >= 0.97) clearVideoProgress(item.id); else saveVideoProgress(item.id, frac);
          }}
          onBuffering={(b) => {
            setBuffering(b);
            if (b) {
              if (!bufferingTimerRef.current) {
                bufferingTimerRef.current = setTimeout(() => { setShowBuffering(true); bufferingTimerRef.current = null; }, 400);
              }
            } else {
              if (bufferingTimerRef.current) { clearTimeout(bufferingTimerRef.current); bufferingTimerRef.current = null; }
              setShowBuffering(false);
            }
          }}
          onFirstPlay={() => setVideoStarted(true)}
          externalRef={webVideoRef}
        />
      ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />}
    </View>
  ) : (
    <View style={StyleSheet.absoluteFill}>
      {shouldMountVideo ? (
        <Video
          ref={videoRef}
          source={{ uri: playbackUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={isActive && !paused && !preloadOnly}
          isLooping
          isMuted={false}
          posterSource={item.image_url ? { uri: item.image_url } : undefined}
          {...(item.image_url ? { usePosterImage: true } as any : {})}
          onPlaybackStatusUpdate={onPlaybackStatus}
          onError={() => {
            if (!videoError) {
              setCachedUri(null);
              setVideoError(true);
            }
          }}
        />
      ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />}

      {/* TapHandler on native — uses Responder, does NOT block scroll */}
      <TapHandler
        onTap={handleTap}
        onDoubleTap={triggerDoubleTapLike}
        onLongPress={() => onOpenMenu(item)}
      />
    </View>
  );

  return (
    <View style={[vStyles.item, { width: screenW, height: screenH }]}>
      {videoElement}

      {/* Overlays — pointerEvents="none" so touches pass through to TapHandler */}
      {/* Poster thumbnail: persists until first frame renders, eliminates black flash on swipe */}
      {item.image_url && !videoStarted && (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
          <ExpoImage
            source={{ uri: item.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            priority="high"
          />
        </View>
      )}

      {showBuffering && isActive && (
        <View style={vStyles.centerOverlay} pointerEvents="none">
          <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
        </View>
      )}
      {paused && !buffering && (
        <View style={vStyles.centerOverlay} pointerEvents="none">
          <View style={vStyles.pauseCircle}>
            <Ionicons name="play" size={32} color="#fff" style={{ marginLeft: 3 }} />
          </View>
        </View>
      )}

      {/* Double-tap like burst */}
      <Animated.View
        style={[vStyles.centerOverlay, { opacity: doubleTapOpacity, transform: [{ scale: doubleTapScale }] }]}
        pointerEvents="none"
      >
        <Ionicons name="heart" size={90} color="#FF3B30" />
      </Animated.View>

      {/* Gradients */}
      <GradientOverlay position="top" height={130} />
      <GradientOverlay position="bottom" height={380} />

      {/* Bottom info — author + caption */}
      <View style={[vStyles.bottomArea, { bottom: insets.bottom + 56 }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id, init_name: item.profile.display_name, init_handle: item.profile.handle, init_avatar: item.profile.avatar_url ?? "" } })}
          style={vStyles.authorRow} activeOpacity={0.8}
        >
          <View style={[vStyles.avatarWrap, { borderColor: accent }]}>
            <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={40} />
          </View>
          <View style={vStyles.authorInfo}>
            <Text style={vStyles.authorHandle}>@{item.profile.handle}</Text>
            <Text style={vStyles.authorName}>{item.profile.display_name}</Text>
          </View>
          {!isSelf && (
            <TouchableOpacity
              onPress={() => onFollow(item.author_id, isFollowing)}
              style={[vStyles.inlineFollow, isFollowing && vStyles.inlineFollowActive]}
              activeOpacity={0.8}
            >
              <Text style={vStyles.inlineFollowText}>
                {isFollowing ? "Following" : "Follow"}
              </Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {!!item.content && (
          <TouchableOpacity
            activeOpacity={showExpand ? 0.75 : 1}
            onPress={() => showExpand && setExpanded((e) => !e)}
            disabled={!showExpand}
            style={vStyles.captionWrap}
          >
            <RichText style={vStyles.caption} numberOfLines={expanded ? undefined : 2} linkColor="#00BCD4">
              {item.content}
            </RichText>
            {showExpand && !expanded && (
              <Text style={vStyles.captionMore}>
                <Text style={vStyles.captionEllipsis}>... </Text>
                <Text style={vStyles.captionMoreLink}>more</Text>
              </Text>
            )}
          </TouchableOpacity>
        )}

        {item.view_count > 0 && (
          <View style={vStyles.viewRow}>
            <Ionicons name="eye-outline" size={12} color="rgba(255,255,255,0.4)" />
            <Text style={vStyles.viewText}>{formatCount(item.view_count)} views</Text>
          </View>
        )}
      </View>

      {/* Right action rail */}
      <View style={[vStyles.rightCol, { bottom: insets.bottom + 32 }]} pointerEvents="box-none">
        {/* Like */}
        <View style={vStyles.actionItem}>
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <TouchableOpacity onPress={handleLike} hitSlop={10} activeOpacity={0.8}>
              <Ionicons name={item.liked ? "heart" : "heart-outline"} size={30} color={item.liked ? "#FF3B30" : "#fff"} />
            </TouchableOpacity>
          </Animated.View>
          <Text style={vStyles.actionLabel}>{formatCount(item.likeCount)}</Text>
        </View>

        {/* Comment */}
        <View style={vStyles.actionItem}>
          <TouchableOpacity onPress={() => onOpenComments(item.id)} hitSlop={10} activeOpacity={0.8}>
            <Ionicons name="chatbubble-ellipses" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={vStyles.actionLabel}>{formatCount(item.replyCount)}</Text>
        </View>

        {/* Bookmark */}
        <View style={vStyles.actionItem}>
          <TouchableOpacity onPress={() => onBookmark(item.id, item.bookmarked)} hitSlop={10} activeOpacity={0.8}>
            <Ionicons name={item.bookmarked ? "bookmark" : "bookmark-outline"} size={28} color={item.bookmarked ? accent : "#fff"} />
          </TouchableOpacity>
        </View>

        {/* Share */}
        <View style={vStyles.actionItem}>
          <TouchableOpacity onPress={() => onShare(item)} hitSlop={10} activeOpacity={0.8}>
            <Ionicons name="share-social-outline" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* More */}
        <View style={vStyles.actionItem}>
          <TouchableOpacity onPress={() => onOpenMenu(item)} hitSlop={10} activeOpacity={0.8}>
            <Ionicons name="ellipsis-horizontal" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress bar */}
      <TouchableOpacity
        activeOpacity={1}
        style={[vStyles.progressBar, { bottom: insets.bottom > 0 ? insets.bottom : 0 }]}
        onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
        onPress={(e) => handleProgressBarPress(e.nativeEvent.locationX)}
        hitSlop={{ top: 10, bottom: 10 }}
      >
        <View style={[vStyles.progressFill, { width: `${progress * 100}%` as any }]} />
        <View style={[vStyles.progressThumb, { left: `${progress * 100}%` as any }]} />
      </TouchableOpacity>
    </View>
  );
}); // React.memo

const vStyles = StyleSheet.create({
  item: { backgroundColor: "#000", overflow: "hidden" },
  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  pauseCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 2, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  gradientBase: { position: "absolute", left: 0, right: 0 },
  bottomArea: { position: "absolute", left: 16, right: 76, gap: 8 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  avatarWrap: { borderWidth: 2, borderRadius: 23, padding: 1 },
  authorInfo: { flex: 1 },
  authorHandle: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  authorName: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  inlineFollow: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.5)", backgroundColor: "rgba(255,255,255,0.1)" },
  inlineFollowActive: { borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.06)" },
  inlineFollowText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  captionWrap: { marginTop: 2 },
  caption: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  captionMore: { marginTop: 1, fontSize: 13, lineHeight: 19 },
  captionEllipsis: { color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular" },
  captionMoreLink: { color: "#00BCD4", fontFamily: "Inter_600SemiBold" },
  viewRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  viewText: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "Inter_400Regular" },
  rightCol: { position: "absolute", right: 12, gap: 20, alignItems: "center" },
  actionItem: { alignItems: "center", gap: 3 },
  actionLabel: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  progressBar: { position: "absolute", left: 0, right: 0, height: 3, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center" },
  progressFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 2 },
  progressThumb: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: "#fff", top: -3, marginLeft: -5, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 3, elevation: 3 },
});

// ─── VideoPlayerScreen ────────────────────────────────────────────────────────

export default function VideoPlayerScreen() {
  const { accent } = useAppAccent();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId && !isUuid(rawId) ? decodeId(rawId) : rawId;
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();

  const [videoTab, setVideoTab] = useState<"for_you" | "following">("for_you");
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [menuItem, setMenuItem] = useState<VideoPost | null>(null);
  const [shareSheetItem, setShareSheetItem] = useState<VideoPost | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  const listRef = useRef<FlatList>(null);
  const webScrollRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  const videoTabRef = useRef(videoTab);
  const activeIndexRef = useRef(activeIndex);
  const videosLenRef = useRef(videos.length);
  // Stable ref for user — lets fetchVideos read the current user without
  // having it as a dep, so auth-context refreshes never reset the feed.
  const userRef = useRef(user);
  // Stable ref for videos — lets interaction callbacks (like/bookmark) always
  // read the latest videos array without being in every useCallback dep list.
  const videosRef = useRef(videos);
  // Tab indicator is driven purely by videoTab state — no Animated needed.

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { videoTabRef.current = videoTab; }, [videoTab]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { videosLenRef.current = videos.length; videosRef.current = videos; }, [videos]);
  useEffect(() => { userRef.current = user; }, [user]);

  // Web: hide scrollbar CSS
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const style = document.createElement("style");
    style.textContent = "#vf-web-scroll::-webkit-scrollbar { display: none; }";
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Web: lock page scroll
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchVideos = useCallback(async (tab: "for_you" | "following", cursor?: string | null) => {
    const isLoadMore = !!cursor;
    if (isLoadMore) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      setLoading(true); setVideos([]); cursorRef.current = null; setHasMore(true);
    }

    const currentUser = userRef.current;
    let followingIds: string[] = [];
    if (tab === "following" && currentUser) {
      const { data: followData } = await supabase.from("follows").select("following_id").eq("follower_id", currentUser.id);
      followingIds = (followData || []).map((f: any) => f.following_id);
      if (followingIds.length === 0) {
        setVideos([]); setLoading(false); loadingMoreRef.current = false; setLoadingMore(false); return;
      }
    }

    let query = supabase
      .from("posts")
      .select(`id, author_id, content, video_url, image_url, created_at, audio_name, profiles!posts_author_id_fkey(display_name, handle, avatar_url)`)
      .not("video_url", "is", null)
      .or("post_type.eq.video,post_type.is.null")
      .order("created_at", { ascending: false }).limit(VIDEO_PAGE_SIZE);

    if (tab === "following" && followingIds.length > 0) {
      query = query.in("author_id", followingIds).or("visibility.eq.public,visibility.eq.followers,visibility.is.null");
    } else {
      query = query.or("visibility.eq.public,visibility.is.null");
    }
    if (cursor) query = query.lt("created_at", cursor);

    const { data, error: qErr } = await query;
    if (qErr) console.error("[VideoFeed] query error:", qErr.message, qErr.details);

    if (data && data.length > 0) {
      const postIds = data.map((p: any) => p.id);
      const authorIds = [...new Set(data.map((p: any) => p.author_id))] as string[];

      const [
        { data: likesData }, { data: repliesData }, { data: viewsData },
        { data: myLikes }, { data: myBookmarks }, { data: myFollows },
      ] = await Promise.all([
        supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
        supabase.from("post_replies").select("post_id").in("post_id", postIds),
        supabase.from("post_views").select("post_id").in("post_id", postIds),
        currentUser ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", currentUser.id) : { data: [] },
        currentUser ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", currentUser.id) : { data: [] },
        currentUser ? supabase.from("follows").select("following_id").eq("follower_id", currentUser.id).in("following_id", authorIds) : { data: [] },
      ]);

      setFollowingSet(new Set((myFollows || []).map((f: any) => f.following_id)));

      const likeMap: Record<string, number> = {};
      for (const l of (likesData || [])) likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1;
      const replyMap: Record<string, number> = {};
      for (const r of (repliesData || [])) replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1;
      const viewMap: Record<string, number> = {};
      for (const v of (viewsData || [])) viewMap[v.post_id] = (viewMap[v.post_id] || 0) + 1;
      const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
      const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id));
      const followedSet = new Set((myFollows || []).map((f: any) => f.following_id as string));

      const mapped: VideoPost[] = data.map((p: any) => ({
        id: p.id, author_id: p.author_id, content: p.content || "",
        video_url: p.video_url, image_url: p.image_url || null, created_at: p.created_at,
        view_count: viewMap[p.id] || 0, audio_name: p.audio_name || null,
        profile: { display_name: p.profiles?.display_name || "User", handle: p.profiles?.handle || "user", avatar_url: p.profiles?.avatar_url || null },
        liked: myLikeSet.has(p.id), bookmarked: myBookmarkSet.has(p.id),
        likeCount: likeMap[p.id] || 0, replyCount: replyMap[p.id] || 0,
      }));

      // ── Rank by quality algorithm ───────────────────────────────────────────
      const learnedWeights = await getLearnedInterestBoosts();
      const now = Date.now();

      // Count how many times each author appears in this page (for diversity penalty)
      const authorPageCount: Record<string, number> = {};
      for (const v of mapped) authorPageCount[v.author_id] = (authorPageCount[v.author_id] || 0) + 1;

      let diversified: VideoPost[];

      if (tab === "for_you") {
        // Full quality algorithm: freshness tiers + engagement velocity + interest matching
        const scored = mapped.map((v) => {
          const interestMatches = matchInterestsWeighted(v.content, [], learnedWeights);
          const signals: FeedSignals = {
            likeCount: v.likeCount,
            replyCount: v.replyCount,
            viewCount: v.view_count,
            createdAt: v.created_at,
            interestMatches,
            isFollowing: followedSet.has(v.author_id),
            authorInteractionCount: v.liked ? 3 : 0,
            isVerified: false,
            isOrgVerified: false,
            hasImages: !!v.image_url,
            sameCountry: false,
            authorPostCountInFeed: authorPageCount[v.author_id] || 1,
            contentLength: v.content?.length || 0,
          };
          let score = computeFeedScore(signals);
          // Penalise already-liked videos so users see fresh content
          if (v.liked) score -= 30;
          return { id: v.id, author_id: v.author_id, score, video: v };
        });

        // diversifyFeed ensures no creator dominates consecutive slots
        const diversifiedScored = diversifyFeed(scored);
        diversified = diversifiedScored.map((s) => (s as any).video as VideoPost);
      } else {
        // Following tab: newest-first with a light engagement velocity boost.
        // Users follow specific creators and expect chronological recency,
        // not algorithmic reordering.
        const scored = mapped.map((v) => {
          const ageHours = (now - new Date(v.created_at).getTime()) / 3600000;
          // Smooth recency decay: full score < 6h, half score at ~24h
          const recency = Math.max(0, 100 - ageHours * 1.5);
          // Light velocity bonus so genuinely popular posts surface slightly higher
          const velocity = Math.min((v.likeCount + v.replyCount * 2) / Math.max(ageHours, 0.5) * 6, 20);
          const score = recency + velocity + Math.random() * 4;
          return { id: v.id, author_id: v.author_id, score, video: v };
        });
        scored.sort((a, b) => b.score - a.score);
        diversified = scored.map((s) => s.video);
      }

      let newVideos = diversified;
      cursorRef.current = data[data.length - 1].created_at;
      setHasMore(data.length === VIDEO_PAGE_SIZE);

      if (isLoadMore) {
        setVideos((prev) => {
          const seen = new Set(prev.map((v) => v.id));
          return [...prev, ...newVideos.filter((v) => !seen.has(v.id))];
        });
      } else {
        // Bubble up the requested video ID to position 0
        if (id) {
          const existingIdx = newVideos.findIndex((v) => v.id === id);
          if (existingIdx > 0) {
            const [target] = newVideos.splice(existingIdx, 1);
            newVideos = [target, ...newVideos];
          } else if (existingIdx === -1) {
            const { data: tRow } = await supabase
              .from("posts")
              .select(`id, author_id, content, video_url, image_url, created_at, audio_name, profiles!posts_author_id_fkey(display_name, handle, avatar_url)`)
              .eq("id", id).not("video_url", "is", null).maybeSingle();
            if (tRow) {
              newVideos = [{
                id: tRow.id, author_id: tRow.author_id, content: tRow.content || "",
                video_url: tRow.video_url, image_url: tRow.image_url || null, created_at: tRow.created_at,
                view_count: 0, audio_name: tRow.audio_name || null,
                profile: { display_name: (tRow.profiles as any)?.display_name || "User", handle: (tRow.profiles as any)?.handle || "user", avatar_url: (tRow.profiles as any)?.avatar_url || null },
                liked: false, bookmarked: false, likeCount: 0, replyCount: 0,
              }, ...newVideos];
            }
          }
        }
        setVideos(newVideos);
      }
    } else {
      setHasMore(false);
      if (!isLoadMore) setVideos([]);
    }

    if (isLoadMore) { loadingMoreRef.current = false; setLoadingMore(false); }
    else setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // user intentionally omitted — read via userRef so auth refreshes never reset the feed

  useEffect(() => {
    // videoTab is the only thing that should trigger a full reset (user switched tabs).
    // fetchVideos intentionally omitted — it's stable (dep is only `id`).
    fetchVideos(videoTab).catch(() => { setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoTab]);

  // Realtime like/reply count updates
  useEffect(() => {
    const channel = supabase.channel("video-feed-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "post_acknowledgments" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        supabase.from("post_acknowledgments").select("id", { count: "exact", head: true }).eq("post_id", postId)
          .then(({ count }) => { setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, likeCount: count || 0 } : v)); });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_replies" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        supabase.from("post_replies").select("id", { count: "exact", head: true }).eq("post_id", postId)
          .then(({ count }) => { setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, replyCount: count || 0 } : v)); });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── FlatList config ────────────────────────────────────────────────────────

  // Stable ref — never changes identity so FlatList never re-wires the handler
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      const idx = viewableItems[0].index;
      setActiveIndex(idx);
      activeIndexRef.current = idx;
      // Preload more when 3 from end
      if (idx >= videosLenRef.current - 3 && !loadingMoreRef.current && hasMoreRef.current && cursorRef.current) {
        fetchVideos(videoTabRef.current, cursorRef.current);
      }
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: SCREEN_H, offset: SCREEN_H * index, index,
  }), [SCREEN_H]);

  // ── Interactions ───────────────────────────────────────────────────────────

  const handleLike = useCallback(async (postId: string, currentlyLiked: boolean) => {
    const currentUser = userRef.current;
    if (!currentUser) { setShowSignInPrompt(true); return; }

    // Optimistic update — update UI immediately before any await
    if (currentlyLiked) {
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: false, likeCount: Math.max(0, v.likeCount - 1) } : v));
    } else {
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: true, likeCount: v.likeCount + 1 } : v));
    }

    if (currentlyLiked) {
      const { error } = await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", currentUser.id);
      if (error) {
        // Rollback on failure
        setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: true, likeCount: v.likeCount + 1 } : v));
      }
    } else {
      const { error } = await supabase.from("post_acknowledgments").upsert(
        { post_id: postId, user_id: currentUser.id },
        { onConflict: "post_id,user_id", ignoreDuplicates: true }
      );
      if (error) {
        // Rollback on failure
        setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: false, likeCount: Math.max(0, v.likeCount - 1) } : v));
      } else {
        // Fire notification after confirmed DB write — use latest videos ref
        const post = videosRef.current.find((v) => v.id === postId);
        if (post && post.author_id !== currentUser.id) {
          notifyPostLike({ postAuthorId: post.author_id, likerName: profile?.display_name || "Someone", likerUserId: currentUser.id, postId });
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBookmark = useCallback(async (postId: string, currentlyBookmarked: boolean) => {
    const currentUser = userRef.current;
    if (!currentUser) { setShowSignInPrompt(true); return; }
    // Optimistic update first
    setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, bookmarked: !currentlyBookmarked } : v));
    if (currentlyBookmarked) {
      const { error } = await supabase.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", currentUser.id);
      if (error) setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, bookmarked: true } : v));
    } else {
      const { error } = await supabase.from("post_bookmarks").upsert({ post_id: postId, user_id: currentUser.id }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
      if (error) setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, bookmarked: false } : v));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFollow = useCallback(async (authorId: string, isFollowing: boolean) => {
    const currentUser = userRef.current;
    if (!currentUser) { setShowSignInPrompt(true); return; }
    // Optimistic update first
    setFollowingSet((prev) => { const next = new Set(prev); if (isFollowing) next.delete(authorId); else next.add(authorId); return next; });
    if (isFollowing) {
      const { error } = await supabase.from("follows").delete().eq("follower_id", currentUser.id).eq("following_id", authorId);
      if (error) setFollowingSet((prev) => { const next = new Set(prev); next.add(authorId); return next; });
    } else {
      const { error } = await supabase.from("follows").upsert({ follower_id: currentUser.id, following_id: authorId }, { onConflict: "follower_id,following_id", ignoreDuplicates: true });
      if (error) setFollowingSet((prev) => { const next = new Set(prev); next.delete(authorId); return next; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleReplyCountChange(postId: string, delta: number) {
    setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, replyCount: v.replyCount + delta } : v));
  }

  const recordedViews = useRef(new Set<string>());
  const handleRecordView = useCallback(async (postId: string) => {
    if (!user || recordedViews.current.has(postId)) return;
    recordedViews.current.add(postId);
    supabase.from("post_views").upsert({ post_id: postId, viewer_id: user.id }, { onConflict: "post_id,viewer_id" }).then(null, () => {});
    setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, view_count: v.view_count + 1 } : v));
  }, [user]);

  function getVideoUrl(item: VideoPost): string {
    const shortId = encodeId(item.id);
    return Platform.OS === "web" && typeof window !== "undefined"
      ? `${window.location.origin}/video/${shortId}`
      : `https://afuchat.com/video/${shortId}`;
  }

  function showToast(msg: string, durationMs = 2500) {
    setDownloadToast(msg);
    setTimeout(() => setDownloadToast(null), durationMs);
  }

  async function handleDownload(item: VideoPost) {
    if (downloading) return;

    // Resolve the best public MP4 URL via the manifest (same as playback).
    // Falls back to item.video_url if the manifest isn't available yet.
    async function resolveDownloadUrl(): Promise<string> {
      try {
        const manifest = await getPostVideoManifest(item.id);
        if (manifest) {
          // Prefer H.264 for broadest device compatibility when saving.
          const h264 = manifest.sources.find(
            (s) => s.codec === "h264" && s.url,
          );
          if (h264?.url) return h264.url;
          // Fall back to any ready source.
          const best = pickBestSource(manifest, { targetHeight: 1080 });
          if (best.url) return best.url;
          // Last resort: manifest's fallback_url (the original upload).
          if (manifest.fallback_url) return manifest.fallback_url;
        }
      } catch {
        // ignore — use raw video_url below
      }
      return item.video_url;
    }

    if (Platform.OS === "web") {
      try {
        const url = await resolveDownloadUrl();
        const a = document.createElement("a");
        a.href = url; a.download = `afuchat_${item.id}.mp4`; a.target = "_blank"; a.rel = "noopener";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showToast("Download started");
      } catch { showToast("Could not start download"); }
      return;
    }

    setDownloading(true); showToast("Saving to device…", 30000);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        setDownloading(false); setDownloadToast(null);
        Alert.alert("Permission needed", "Please allow media library access in Settings to save videos.");
        return;
      }
      const url = await resolveDownloadUrl();
      const dest = `${FileSystem.cacheDirectory ?? ""}afuchat_dl_${item.id}.mp4`;
      const { uri, status: dlStatus } = await FileSystem.downloadAsync(url, dest);
      if (!uri || (dlStatus !== undefined && (dlStatus < 200 || dlStatus >= 400))) throw new Error(`HTTP ${dlStatus}`);
      await MediaLibrary.createAssetAsync(uri);
      await FileSystem.deleteAsync(uri, { idempotent: true });
      setDownloading(false); showToast("Saved to your device");
    } catch (err) {
      setDownloading(false); setDownloadToast(null);
      console.error("[download]", err);
      Alert.alert("Download failed", "Could not save the video. If the issue persists, check the Status page under Settings → Help & About.");
    }
  }

  async function handleRepost(item: VideoPost) {
    const url = getVideoUrl(item);
    try { await Share.share({ message: `Reposting: ${item.profile.display_name} on AfuChat\n${url}`, url, title: "Repost from AfuChat" }); } catch {}
  }

  function handleCopyLink(item: VideoPost) { Clipboard.setStringAsync(getVideoUrl(item)); showToast("Link copied"); }
  function handleNotInterested(item: VideoPost) { setVideos((prev) => prev.filter((v) => v.id !== item.id)); showToast("Removed from feed"); }
  function handleReport(item: VideoPost) {
    Alert.alert("Report video", "Why are you reporting this?", [
      { text: "Spam", onPress: () => showToast("Report submitted — thanks") },
      { text: "Inappropriate", onPress: () => showToast("Report submitted — thanks") },
      { text: "Misinformation", onPress: () => showToast("Report submitted — thanks") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function switchTab(tab: "for_you" | "following") {
    if (tab === videoTab) return;
    if (tab === "following" && !user) { router.push("/(auth)/login"); return; }
    setActiveIndex(0);
    setVideoTab(tab);
  }

  // Web scroll logic
  const scrollSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleWebScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const scrollTop = el.scrollTop;
    // Immediately update active index so the current video pauses the instant
    // the next snap point is crossed — no perceptible delay for the user.
    const index = Math.round(scrollTop / SCREEN_H);
    if (index !== activeIndexRef.current) {
      setActiveIndex(index);
      activeIndexRef.current = index;
    }

    // Debounce only the "load more" check to avoid triggering fetch on every
    // scroll event during a fast swipe.
    if (scrollSettleRef.current) clearTimeout(scrollSettleRef.current);
    scrollSettleRef.current = setTimeout(() => {
      const idx = Math.round(el.scrollTop / SCREEN_H);
      if (idx >= videosLenRef.current - 3 && !loadingMoreRef.current && hasMoreRef.current && cursorRef.current) {
        fetchVideos(videoTabRef.current, cursorRef.current);
      }
    }, 150);
  }

  // ── Derived callbacks — must be declared before any early return ───────────

  const onShare = useCallback((item: VideoPost) => setShareSheetItem(item), []);
  const onOpenMenu = useCallback((item: VideoPost) => setMenuItem(item), []);

  const videoItemProps = React.useMemo(() => ({
    screenH: SCREEN_H, screenW: SCREEN_W,
    onLike: handleLike, onBookmark: handleBookmark,
    onOpenComments: setCommentPostId,
    onShare,
    onFollow: handleFollow,
    onRecordView: handleRecordView,
    onOpenMenu,
  }), [SCREEN_H, SCREEN_W, handleLike, handleBookmark, handleFollow, handleRecordView, onShare, onOpenMenu]);

  const renderItem = useCallback(({ item, index }: { item: VideoPost; index: number }) => (
    <VideoItem
      item={item}
      isActive={index === activeIndex}
      isNearActive={Math.abs(index - activeIndex) <= 2}
      isFollowing={followingSet.has(item.author_id)}
      isSelf={user?.id === item.author_id}
      {...videoItemProps}
    />
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [activeIndex, followingSet, user?.id, videoItemProps]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={mStyles.root}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ShortsFeedSkeleton dark />
        {/* Render the real header on top so navigation chrome is visible during load */}
        <View style={[mStyles.headerRow, { paddingTop: insets.top + 6 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={mStyles.headerSide}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={mStyles.tabRow}>
            <TouchableOpacity
              onPress={() => switchTab("for_you")}
              style={[mStyles.tabBtn, videoTab === "for_you" && mStyles.tabBtnActive]}
            >
              <Text style={[mStyles.tabText, videoTab === "for_you" && mStyles.tabTextActive]}>For You</Text>
            </TouchableOpacity>
            <View style={mStyles.tabDivider} />
            <TouchableOpacity
              onPress={() => switchTab("following")}
              style={[mStyles.tabBtn, videoTab === "following" && mStyles.tabBtnActive]}
            >
              <Text style={[mStyles.tabText, videoTab === "following" && mStyles.tabTextActive]}>Following</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity hitSlop={12} style={mStyles.headerSide} onPress={() => router.push("/search" as any)}>
            <Ionicons name="search-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={mStyles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Fixed header */}
      <View style={[mStyles.headerRow, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={mStyles.headerSide}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={mStyles.tabRow}>
          <TouchableOpacity
            onPress={() => switchTab("for_you")}
            style={[mStyles.tabBtn, videoTab === "for_you" && mStyles.tabBtnActive]}
          >
            <Text style={[mStyles.tabText, videoTab === "for_you" && mStyles.tabTextActive]}>For You</Text>
          </TouchableOpacity>
          <View style={mStyles.tabDivider} />
          <TouchableOpacity
            onPress={() => switchTab("following")}
            style={[mStyles.tabBtn, videoTab === "following" && mStyles.tabBtnActive]}
          >
            <Text style={[mStyles.tabText, videoTab === "following" && mStyles.tabTextActive]}>Following</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity hitSlop={12} style={mStyles.headerSide} onPress={() => router.push("/search" as any)}>
          <Ionicons name="search-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {videos.length === 0 ? (
        <View style={mStyles.emptyState}>
          <View style={mStyles.emptyIcon}>
            <Ionicons name="videocam-outline" size={44} color="rgba(255,255,255,0.25)" />
          </View>
          <Text style={mStyles.emptyTitle}>No videos yet</Text>
          <Text style={mStyles.emptySubtitle}>
            {videoTab === "following" ? "Follow creators to see their videos here" : "Videos will appear here soon"}
          </Text>
        </View>
      ) : Platform.OS === "web" ? (
        // Web: native scroll-snap div — no RN FlatList on web needed
        <div
          ref={webScrollRef}
          id="vf-web-scroll"
          onScroll={handleWebScroll}
          style={{
            height: SCREEN_H, width: SCREEN_W,
            overflowY: "scroll", scrollSnapType: "y mandatory",
            scrollbarWidth: "none", backgroundColor: "#000",
            touchAction: "pan-y",
          } as React.CSSProperties}
        >
          {videos.map((item, index) => (
            <div
              key={item.id}
              style={{
                height: SCREEN_H, width: SCREEN_W,
                scrollSnapAlign: "start",
                scrollSnapStop: "always",
                flexShrink: 0, overflow: "hidden", position: "relative",
              } as React.CSSProperties}
            >
              <VideoItem
                item={item}
                isActive={index === activeIndex}
                isNearActive={Math.abs(index - activeIndex) <= 2}
                isFollowing={followingSet.has(item.author_id)}
                isSelf={user?.id === item.author_id}
                {...videoItemProps}
              />
            </div>
          ))}
          {loadingMore && (
            <div style={{ height: SCREEN_H, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#000", scrollSnapAlign: "start" } as React.CSSProperties}>
              <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
            </div>
          )}
        </div>
      ) : (
        // Native: FlatList with pagingEnabled — simplest, most reliable
        <FlatList
          ref={listRef}
          data={videos}
          keyExtractor={(v) => v.id}
          renderItem={renderItem}
          // Core scroll config
          pagingEnabled
          showsVerticalScrollIndicator={false}
          // Viewability
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          // Performance
          getItemLayout={getItemLayout}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={3}
          removeClippedSubviews={false}
          // End-reached
          onEndReached={() => {
            if (!loadingMoreRef.current && hasMore && cursorRef.current) {
              fetchVideos(videoTab, cursorRef.current);
            }
          }}
          onEndReachedThreshold={2}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: false }), 300);
          }}
          // Misc
          decelerationRate="fast"
          style={{ flex: 1, backgroundColor: "#000" }}
          ListFooterComponent={loadingMore ? (
            <View style={{ width: SCREEN_W, height: SCREEN_H, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
              <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
            </View>
          ) : null}
        />
      )}

      <CommentsSheet
        visible={!!commentPostId} onClose={() => setCommentPostId(null)}
        postId={commentPostId || ""}
        postAuthorId={videos.find((v) => v.id === commentPostId)?.author_id || ""}
        onReplyCountChange={handleReplyCountChange}
      />

      <VideoContextMenu
        visible={!!menuItem} item={menuItem} onClose={() => setMenuItem(null)}
        onShare={() => menuItem && setShareSheetItem(menuItem)}
        onRepost={() => menuItem && handleRepost(menuItem)}
        onDownload={() => menuItem && handleDownload(menuItem)}
        onCopyLink={() => menuItem && handleCopyLink(menuItem)}
        onNotInterested={() => { if (menuItem) { setMenuItem(null); handleNotInterested(menuItem); } }}
        onReport={() => menuItem && handleReport(menuItem)}
      />

      <SocialShareSheet
        visible={!!shareSheetItem} onClose={() => setShareSheetItem(null)}
        url={shareSheetItem ? getVideoUrl(shareSheetItem) : ""}
        title={shareSheetItem ? `${shareSheetItem.profile.display_name} on AfuChat` : ""}
      />

      {!!downloadToast && (
        <View style={mStyles.toast} pointerEvents="none">
          <Text style={mStyles.toastText}>{downloadToast}</Text>
        </View>
      )}

      <SignInPromptModal visible={showSignInPrompt} onDismiss={() => setShowSignInPrompt(false)} />
    </View>
  );
}

const mStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    ...(Platform.OS === "web" ? { position: "absolute" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 } : {}),
  } as any,
  headerRow: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 30, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 10 },
  headerSide: { width: 36, alignItems: "center" },
  tabRow: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center" },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 3, borderBottomColor: "transparent" },
  tabBtnActive: { borderBottomColor: "#fff" },
  tabDivider: { width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.2)" },
  tabText: { color: "rgba(255,255,255,0.5)", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  tabTextActive: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { color: "rgba(255,255,255,0.6)", fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySubtitle: { color: "rgba(255,255,255,0.3)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  toast: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center" },
  toastText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium", backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 22, overflow: "hidden" },

});
