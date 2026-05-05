import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Clipboard,
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
import { Image as ExpoImage } from "expo-image";
import { getCachedVideoUri, cacheVideo } from "@/lib/videoCache";
import { useResolvedVideoSource } from "@/hooks/useResolvedVideoSource";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import { useAppAccent } from "@/context/AppAccentContext";
import { notifyPostLike, notifyPostReply } from "@/lib/notifyUser";
import { RichText } from "@/components/ui/RichText";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useTheme } from "@/hooks/useTheme";
import { encodeId, decodeId, isUuid } from "@/lib/shortId";
import { saveVideoProgress, clearVideoProgress } from "@/lib/videoProgress";
import { ChatBubbleSkeleton, ShortsFeedSkeleton } from "@/components/ui/Skeleton";
import SignInPromptModal from "@/components/ui/SignInPromptModal";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ═══ Platform constant ═══════════════════════════════════════════════════════
const USE_NATIVE = Platform.OS !== "web";

// ═══ Swipe hint ══════════════════════════════════════════════════════════════
const SWIPE_HINT_KEY = "afu_video_swipe_hint_seen";

function useSwipeHint() {
  const [visible, setVisible] = useState(false);
  const dismissedRef = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(SWIPE_HINT_KEY).then((v) => { if (!v) setVisible(true); }).catch(() => {});
  }, []);
  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setVisible(false);
    AsyncStorage.setItem(SWIPE_HINT_KEY, "1").catch(() => {});
  }, []);
  return { visible, dismiss };
}

function SwipeHintOverlay({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const loop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.sequence([Animated.delay(900), Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: USE_NATIVE })]).start();
      loop.current = Animated.loop(Animated.sequence([
        Animated.delay(300),
        Animated.timing(translateY, { toValue: -14, duration: 520, useNativeDriver: USE_NATIVE }),
        Animated.timing(translateY, { toValue: 0, duration: 520, useNativeDriver: USE_NATIVE }),
      ]));
      loop.current.start();
    } else {
      loop.current?.stop();
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: USE_NATIVE }).start();
    }
    return () => { loop.current?.stop(); };
  }, [visible]);

  return (
    <Animated.View style={{ position: "absolute", bottom: 160, left: 0, right: 0, alignItems: "center", opacity, zIndex: 20, pointerEvents: "none" as any }}>
      <Animated.View style={{ alignItems: "center", transform: [{ translateY }] }}>
        <Ionicons name="chevron-up" size={30} color="rgba(255,255,255,0.95)" />
        <Ionicons name="chevron-up" size={30} color="rgba(255,255,255,0.45)" style={{ marginTop: -15 }} />
      </Animated.View>
      <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 6, letterSpacing: 0.5 }}>Swipe up</Text>
    </Animated.View>
  );
}

// ═══ Web-only HTML5 video player ══════════════════════════════════════════════
function WebVideoPlayer({
  src, poster, active, paused, preloadOnly,
  onTogglePause, onDoubleTap, onLongPress, onProgress, onBuffering, externalRef,
}: {
  src: string; poster?: string | null; active: boolean; paused: boolean; preloadOnly: boolean;
  onTogglePause: () => void; onDoubleTap?: () => void; onLongPress?: () => void;
  onProgress: (posMs: number, durMs: number) => void; onBuffering: (b: boolean) => void;
  externalRef?: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const innerRef = useRef<HTMLVideoElement | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerMoved = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  function setRef(el: HTMLVideoElement | null) {
    innerRef.current = el;
    if (externalRef) externalRef.current = el;
  }

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    if (active && !paused && !preloadOnly) {
      const p = el.play();
      if (p && typeof (p as any).catch === "function") (p as any).catch(() => {});
    } else {
      el.pause();
    }
  }, [active, paused, src, preloadOnly]);

  useEffect(() => {
    const el = innerRef.current;
    if (!el || active) return;
    try { el.currentTime = 0; } catch {}
  }, [active]);

  useEffect(() => () => { if (clickTimer.current) clearTimeout(clickTimer.current); }, []);

  function handleClick(e: any) {
    if (preloadOnly) return;
    e?.stopPropagation?.();
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
    if (onDoubleTap) {
      clickTimer.current = setTimeout(() => { onTogglePause(); clickTimer.current = null; }, 220);
    } else {
      onTogglePause();
    }
  }

  function handleDblClick(e: any) {
    if (preloadOnly || !onDoubleTap) return;
    e?.stopPropagation?.();
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
    onDoubleTap();
  }

  function handlePointerDown(e: any) {
    pointerMoved.current = false;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null;
        if (!pointerMoved.current) onLongPress?.();
      }, 380);
    }
  }

  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    pointerStart.current = null;
  }

  function handlePointerMove(e: any) {
    if (pointerStart.current) {
      const dx = Math.abs(e.clientX - pointerStart.current.x);
      const dy = Math.abs(e.clientY - pointerStart.current.y);
      if (dx > 8 || dy > 8) { pointerMoved.current = true; cancelLongPress(); }
    }
  }

  return (
    <>
      {/* @ts-ignore */}
      <video
        ref={setRef}
        src={src}
        poster={poster || undefined}
        playsInline loop preload="auto"
        onTimeUpdate={(e: any) => {
          const v = e.currentTarget as HTMLVideoElement;
          if (v.duration) onProgress(v.currentTime * 1000, v.duration * 1000);
        }}
        onWaiting={() => onBuffering(true)}
        onPlaying={() => onBuffering(false)}
        onCanPlay={() => onBuffering(false)}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000", pointerEvents: "none" }}
      />
      {/* @ts-ignore */}
      <div
        onClick={handleClick}
        onDoubleClick={handleDblClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, cursor: preloadOnly ? "default" : "pointer", touchAction: "pan-y" }}
      />
    </>
  );
}

// ═══ Types ════════════════════════════════════════════════════════════════════
type VideoPost = {
  id: string; author_id: string; content: string; video_url: string;
  image_url: string | null; created_at: string; view_count: number;
  audio_name: string | null; duet_of_post_id: string | null;
  profile: { display_name: string; handle: string; avatar_url: string | null };
  liked: boolean; bookmarked: boolean; likeCount: number; replyCount: number;
};

type Reply = {
  id: string; author_id: string; content: string; created_at: string;
  parent_reply_id: string | null; like_count: number;
  profile: { display_name: string; handle: string; avatar_url: string | null };
  children?: Reply[];
};

// ═══ Utilities ════════════════════════════════════════════════════════════════
function buildVideoReplyTree(flat: Reply[]): Reply[] {
  const map = new Map<string, Reply>();
  const roots: Reply[] = [];
  for (const r of flat) map.set(r.id, { ...r, children: [] });
  for (const r of flat) {
    const node = map.get(r.id)!;
    if (r.parent_reply_id && map.has(r.parent_reply_id)) map.get(r.parent_reply_id)!.children!.push(node);
    else roots.push(node);
  }
  return roots;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d`;
  return `${Math.floor(diff / 2592000000)}mo`;
}

const VID_THREAD_COLORS = ["#00BCD4", "#5C6BC0", "#26A69A", "#EF6C00", "#8E24AA"];
const QUICK_EMOJIS = ["🔥", "❤️", "😂", "😮", "👏", "💯", "🙌", "😍"];

function parseCommentText(text: string, accent: string): React.ReactNode {
  return text.split(/(@\w[\w.]*|#\w+)/g).map((p, i) => {
    if (/^@\w/.test(p)) return <Text key={i} style={{ color: accent, fontFamily: "Inter_600SemiBold" }}>{p}</Text>;
    if (/^#\w/.test(p)) return <Text key={i} style={{ color: accent + "BB" }}>{p}</Text>;
    return <Text key={i}>{p}</Text>;
  });
}

// ═══ VideoReplyItem ═══════════════════════════════════════════════════════════
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
                <Text style={{ color: accent, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.3 }}>Author</Text>
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
      {isTop && hasChildren && !collapsed && (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.05)", marginTop: 6, marginBottom: 2 }} />
      )}
    </Animated.View>
  );
}

// ═══ CommentsSheet ════════════════════════════════════════════════════════════
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
            id: r.id,
            author_id: r.author_id,
            content: r.content || "",
            created_at: r.created_at,
            parent_reply_id: r.parent_reply_id || null,
            like_count: 0,
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
    const tree = buildVideoReplyTree(replies);
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
    if (Platform.OS !== "web") {
      import("expo-haptics").then(({ default: H }) => { H.impactAsync(H.ImpactFeedbackStyle.Light); });
    }
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
    }
    setSending(false);
  }

  const sortedTree = getSortedTree();
  const charLeft = 500 - text.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={cStyles.kavFull}>
        <Pressable style={cStyles.overlay} onPress={onClose}>
          <Pressable onPress={() => {}} style={[cStyles.container, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {Platform.OS === "ios" ? (
              <BlurView intensity={95} tint="dark" style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 20, borderTopRightRadius: 20 }]} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111115", borderTopLeftRadius: 20, borderTopRightRadius: 20 }]} />
            )}
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)" }} pointerEvents="none" />

            <View style={cStyles.handle} />

            <View style={cStyles.header}>
              <View style={{ flex: 1 }}>
                <Text style={cStyles.title}>
                  Comments{replies.length > 0 ? <Text style={cStyles.titleCount}> {formatCount(replies.length)}</Text> : null}
                </Text>
              </View>
              <View style={cStyles.sortRow}>
                {(["recent", "top"] as const).map((mode) => (
                  <TouchableOpacity key={mode} onPress={() => setSortMode(mode)} activeOpacity={0.7}
                    style={[cStyles.sortTab, sortMode === mode && { backgroundColor: accent + "22", borderColor: accent + "55" }]}>
                    <Text style={[cStyles.sortTabText, sortMode === mode && { color: accent }]}>
                      {mode === "recent" ? "Recent" : "Top"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={12} style={{ marginLeft: 8 }}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>

            <View style={cStyles.middle}>
              {loading ? (
                <View style={{ padding: 12, gap: 6 }}>
                  {[1, 2, 3].map((i) => <ChatBubbleSkeleton key={i} align={i % 2 === 0 ? "right" : "left"} />)}
                </View>
              ) : replies.length === 0 ? (
                <View style={cStyles.center}>
                  <View style={cStyles.emptyIcon}>
                    <Ionicons name="chatbubbles-outline" size={32} color={accent + "80"} />
                  </View>
                  <Text style={cStyles.emptyText}>No comments yet</Text>
                  <Text style={cStyles.emptySubtext}>Be the first to start the conversation</Text>
                </View>
              ) : (
                <FlatList
                  ref={listRef}
                  data={sortedTree}
                  keyExtractor={(r) => r.id}
                  style={cStyles.list}
                  contentContainerStyle={{ paddingBottom: 8 }}
                  showsVerticalScrollIndicator={false}
                  onRefresh={loadReplies}
                  refreshing={loading}
                  renderItem={({ item: r }) => (
                    <VideoReplyItem
                      reply={r} depth={0} onReplyTo={handleReplyTo}
                      isCreator={r.author_id === postAuthorId}
                      isNew={newCommentIds.has(r.id)} accent={accent}
                    />
                  )}
                />
              )}
            </View>

            {user ? (
              <View>
                {replyingTo && (
                  <View style={cStyles.replyingBanner}>
                    <Ionicons name="arrow-undo-outline" size={13} color={accent} style={{ marginRight: 5 }} />
                    <Text style={cStyles.replyingText} numberOfLines={1}>
                      Replying to <Text style={{ color: accent, fontFamily: "Inter_600SemiBold" }}>@{replyingTo.profile.handle}</Text>
                    </Text>
                    <TouchableOpacity onPress={() => { setReplyingTo(null); setText(""); }} hitSlop={8} style={{ marginLeft: "auto" as any }}>
                      <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.3)" />
                    </TouchableOpacity>
                  </View>
                )}
                <View style={cStyles.emojiBar}>
                  {QUICK_EMOJIS.map((e) => (
                    <TouchableOpacity key={e} style={cStyles.emojiBtn} onPress={() => setText((t) => t + e)} activeOpacity={0.6}>
                      <Text style={cStyles.emojiText}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={cStyles.inputRow}>
                  <Avatar uri={profile?.avatar_url} name={profile?.display_name || "You"} size={32} />
                  <View style={cStyles.inputWrap}>
                    <TextInput
                      ref={inputRef}
                      style={cStyles.input}
                      placeholder={replyingTo ? `Reply to @${replyingTo.profile.handle}...` : "Add a comment..."}
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      value={text}
                      onChangeText={setText}
                      multiline
                      maxLength={500}
                    />
                    {text.length > 400 && (
                      <Text style={[cStyles.charCounter, charLeft < 20 && { color: "#FF2D55" }]}>{charLeft}</Text>
                    )}
                  </View>
                  <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                    <TouchableOpacity onPress={sendReply} disabled={!text.trim() || sending}
                      style={[cStyles.sendBtn, text.trim() ? { backgroundColor: accent } : null]} activeOpacity={0.75}>
                      {sending ? <ActivityIndicator size={14} color="#fff" /> : <Ionicons name="arrow-up" size={18} color={text.trim() ? "#fff" : "rgba(255,255,255,0.25)"} />}
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={cStyles.signIn} onPress={() => { onClose(); router.push("/(auth)/login"); }}>
                <View style={[cStyles.signInPill, { backgroundColor: accent + "18", borderColor: accent + "50" }]}>
                  <Ionicons name="person-circle-outline" size={16} color={accent} />
                  <Text style={[cStyles.signInText, { color: accent }]}>Sign in to comment</Text>
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
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.62)" },
  container: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "78%", minHeight: 380, paddingHorizontal: 16, flexDirection: "column", overflow: "hidden" },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "center", marginTop: 10, marginBottom: 8 },
  header: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.07)", gap: 8 },
  title: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  titleCount: { color: "rgba(255,255,255,0.35)", fontSize: 14, fontFamily: "Inter_400Regular" },
  sortRow: { flexDirection: "row", gap: 4 },
  sortTab: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  sortTabText: { color: "rgba(255,255,255,0.38)", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  middle: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center" },
  emptyText: { color: "rgba(255,255,255,0.55)", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySubtext: { color: "rgba(255,255,255,0.25)", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  list: { flex: 1, marginTop: 2 },
  replyingBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.03)" },
  replyingText: { color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  emojiBar: { flexDirection: "row", paddingHorizontal: 2, paddingVertical: 7, gap: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.07)" },
  emojiBtn: { flex: 1, alignItems: "center", paddingVertical: 2 },
  emojiText: { fontSize: 21 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingTop: 10 },
  inputWrap: { flex: 1, position: "relative" },
  input: { color: "#fff", fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 10, paddingHorizontal: 14, paddingRight: 38, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)", maxHeight: 88 },
  charCounter: { position: "absolute", right: 10, bottom: 12, color: "rgba(255,255,255,0.28)", fontSize: 11, fontFamily: "Inter_400Regular" },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 1 },
  signIn: { paddingVertical: 14, alignItems: "center" },
  signInPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  signInText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

// ═══ GradientOverlay ══════════════════════════════════════════════════════════
function GradientOverlay({ position, height: h }: { position: "top" | "bottom"; height: number }) {
  if (Platform.OS === "web") {
    const bg = position === "bottom"
      ? "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 40%, transparent 100%)"
      : "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)";
    return <View style={[{ position: "absolute", left: 0, right: 0, height: h, [position]: 0, pointerEvents: "none" as any }, { backgroundImage: bg } as any]} />;
  }
  const colors = position === "bottom" ? ["transparent", "rgba(0,0,0,0.3)", "rgba(0,0,0,0.75)"] : ["rgba(0,0,0,0.5)", "transparent"];
  return <LinearGradient colors={colors} style={{ position: "absolute", left: 0, right: 0, height: h, [position]: 0, pointerEvents: "none" as any }} />;
}

// ═══ VideoItem ════════════════════════════════════════════════════════════════
function VideoItem({
  item, isActive, isNearActive, screenH, screenW, isFollowing, isSelf,
  onLike, onBookmark, onOpenComments, onShare, onFollow, onRecordView, onOpenMenu, onOpenSound, activeToggleRef,
}: {
  item: VideoPost; isActive: boolean; isNearActive: boolean; screenH: number; screenW: number;
  isFollowing: boolean; isSelf: boolean;
  onLike: (id: string, liked: boolean) => void; onBookmark: (id: string, bookmarked: boolean) => void;
  onOpenComments: (id: string) => void; onShare: (item: VideoPost) => void;
  onFollow: (authorId: string, isFollowing: boolean) => void; onRecordView: (postId: string) => void;
  onOpenMenu: (item: VideoPost) => void;
  onOpenSound: (item: VideoPost, albumArtUrl: string | null, trackArtist: string | null, trackLabel: string | null) => void;
  activeToggleRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const { accent } = useAppAccent();
  const { colors } = useTheme();
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [progress, setProgress] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [cachedUri, setCachedUri] = useState<string | null>(null);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null);
  const [trackArtist, setTrackArtist] = useState<string | null>(null);
  const [trackLabel, setTrackLabel] = useState<string | null>(null);
  const heartScale = useRef(new Animated.Value(1)).current;
  const doubleTapHeart = useRef(new Animated.Value(0)).current;
  const watermarkSpin = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const cacheAttempted = useRef(false);
  const viewRecorded = useRef(false);

  const isDesktop = Platform.OS === "web" && screenW >= 768;
  const cardHeight = isDesktop ? Math.max(420, Math.min(screenH - 80, 880)) : screenH;
  const cardWidth = isDesktop ? Math.min(Math.round(cardHeight * (9 / 16)), screenW - 40) : screenW;
  const isOriginalAudio = !item.audio_name || item.audio_name.toLowerCase().startsWith("original audio");
  const resolved = useResolvedVideoSource(item.id, item.video_url, { targetHeight: 720 });
  const playbackUri = cachedUri || resolved.uri || item.video_url;
  const preloadOnly = !isActive && isNearActive;
  const shouldMountVideo = isActive || isNearActive;
  const canPlay = isActive && !paused;
  const showExpand = !!item.content && (item.content.split("\n").length > 2 || item.content.length > 120);

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(watermarkSpin, { toValue: 1, duration: 4000, useNativeDriver: USE_NATIVE }));
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    if (isOriginalAudio || !item.audio_name || albumArtUrl) return;
    fetch(`https://api.deezer.com/search?q=${encodeURIComponent(item.audio_name)}&limit=1`)
      .then((r) => r.json())
      .then(async (data) => {
        const track = data?.data?.[0];
        if (track) {
          setAlbumArtUrl(track.album?.cover_small || track.album?.cover || null);
          setTrackArtist(track.artist?.name || null);
          if (track.album?.id) {
            try {
              const res = await fetch(`https://api.deezer.com/album/${track.album.id}`);
              const d = await res.json();
              if (d?.label) setTrackLabel(d.label);
            } catch {}
          }
        }
      })
      .catch(() => {});
  }, [item.audio_name, isOriginalAudio]);

  useEffect(() => {
    if (!isActive) {
      setPaused(false); setProgress(0); setExpanded(false);
      if (!cachedUri) videoRef.current?.unloadAsync().catch(() => {});
    } else {
      if (!viewRecorded.current) { viewRecorded.current = true; onRecordView(item.id); }
      if (!cacheAttempted.current && item.video_url) {
        cacheAttempted.current = true;
        getCachedVideoUri(item.video_url).then((ex) => {
          if (ex) { setCachedUri(ex); }
          else cacheVideo(item.video_url).then((l) => { if (l) setCachedUri(l); });
        });
      }
    }
  }, [isActive]);

  useEffect(() => {
    if (Platform.OS !== "web" || !isActive || !activeToggleRef) return;
    activeToggleRef.current = () => setPaused((p) => !p);
    return () => { if (activeToggleRef.current) activeToggleRef.current = null; };
  }, [isActive, activeToggleRef]);

  function onPlaybackStatus(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;
    setBuffering(status.isBuffering);
    if (status.durationMillis && status.durationMillis > 0) {
      setDurationMs(status.durationMillis);
      setProgress(status.positionMillis / status.durationMillis);
    }
  }

  async function seekToPercent(pct: number) {
    if (!durationMs || !videoRef.current) return;
    await videoRef.current.setPositionAsync(Math.max(0, Math.min(durationMs, durationMs * pct))).catch(() => {});
  }

  function handleProgressBarPress(locationX: number) {
    if (!progressBarWidth || progressBarWidth <= 0) return;
    seekToPercent(Math.max(0, Math.min(1, locationX / progressBarWidth)));
  }

  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) { triggerLikeBurst(); lastTap.current = 0; }
    else {
      lastTap.current = now;
      setTimeout(() => { if (lastTap.current === now) setPaused((p) => !p); }, 300);
    }
  }

  function triggerLikeBurst() {
    if (!item.liked) onLike(item.id, false);
    Animated.sequence([
      Animated.timing(doubleTapHeart, { toValue: 1, duration: 150, useNativeDriver: USE_NATIVE }),
      Animated.delay(600),
      Animated.timing(doubleTapHeart, { toValue: 0, duration: 250, useNativeDriver: USE_NATIVE }),
    ]).start();
  }

  function handleLike() {
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 0.6, duration: 80, useNativeDriver: USE_NATIVE }),
      Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 7, useNativeDriver: USE_NATIVE }),
    ]).start();
    onLike(item.id, item.liked);
  }

  const watermarkRotate = watermarkSpin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const videoPlayer = Platform.OS === "web" ? (
    <View style={StyleSheet.absoluteFill}>
      {shouldMountVideo ? (
        <WebVideoPlayer
          src={playbackUri} poster={item.image_url} active={isActive} paused={paused} preloadOnly={preloadOnly}
          onTogglePause={() => setPaused((p) => !p)} onDoubleTap={triggerLikeBurst} onLongPress={() => onOpenMenu(item)}
          onProgress={(pos, dur) => {
            if (!dur) return;
            setDurationMs(dur);
            const frac = pos / dur;
            setProgress(frac);
            if (frac >= 0.97) clearVideoProgress(item.id); else saveVideoProgress(item.id, frac);
          }}
          onBuffering={setBuffering} externalRef={webVideoRef}
        />
      ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />}
    </View>
  ) : (
    <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} onLongPress={() => onOpenMenu(item)} delayLongPress={380}>
      {shouldMountVideo ? (
        <Video ref={videoRef} source={{ uri: playbackUri }} style={StyleSheet.absoluteFill} resizeMode={ResizeMode.CONTAIN}
          shouldPlay={canPlay && !preloadOnly} isLooping isMuted={false}
          posterSource={item.image_url ? { uri: item.image_url } : undefined} usePosterImage={!!item.image_url}
          onPlaybackStatusUpdate={onPlaybackStatus} />
      ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />}
    </Pressable>
  );

  const overlays = (
    <>
      {buffering && isActive && (
        <View style={[vStyles.bufferOverlay, { pointerEvents: "none" as any }]}>
          <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
        </View>
      )}
      {paused && !buffering && (
        <View style={[vStyles.pauseOverlay, { pointerEvents: "none" as any }]}>
          <View style={vStyles.pauseCircle}>
            <Ionicons name="play" size={32} color="#fff" style={{ marginLeft: 3 }} />
          </View>
        </View>
      )}
      <Animated.View style={[vStyles.doubleTapHeart, { pointerEvents: "none" as any, opacity: doubleTapHeart, transform: [{ scale: doubleTapHeart.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1.3, 1] }) }] }]}>
        <Ionicons name="heart" size={90} color="#FF3B30" />
      </Animated.View>
    </>
  );

  if (isDesktop) {
    return (
      <View style={{ width: screenW, height: screenH, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#000", gap: 24 }}>
        <View style={{ flexDirection: "column" }}>
          <View style={{ width: cardWidth, height: cardHeight, backgroundColor: "#000", borderRadius: 14, overflow: "hidden", position: "relative" }}>
            {videoPlayer}
            {overlays}
            <GradientOverlay position="top" height={80} />
            <TouchableOpacity activeOpacity={1} style={[vStyles.progressBar, { bottom: 0 }]}
              onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
              onPress={(e) => handleProgressBarPress(e.nativeEvent.locationX)} hitSlop={{ top: 10, bottom: 10 }}>
              <View style={[vStyles.progressFill, { width: `${progress * 100}%` as any }]} />
              <View style={[vStyles.progressThumb, { left: `${progress * 100}%` as any }]} />
            </TouchableOpacity>
          </View>
          <View style={{ width: cardWidth, paddingTop: 12, paddingHorizontal: 2, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}>
                <View style={[vStyles.avatarWrap, { borderColor: accent }]}>
                  <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={34} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}>
                <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" }}>@{item.profile.handle}</Text>
              </TouchableOpacity>
              {!isSelf && (
                <Pressable onPress={() => onFollow(item.author_id, isFollowing)}
                  style={({ hovered }: any) => ({ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: isFollowing ? (hovered ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.1)") : (hovered ? accent + "dd" : accent), borderWidth: 1, borderColor: isFollowing ? "rgba(255,255,255,0.2)" : accent })}>
                  <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{isFollowing ? "Following" : "Follow"}</Text>
                </Pressable>
              )}
            </View>
            {!!item.content && (
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 }} numberOfLines={3}>{item.content}</Text>
            )}
          </View>
        </View>

        <View style={{ flexDirection: "column", alignItems: "center", gap: 22, paddingBottom: 16 }}>
          <View style={{ alignItems: "center" }}>
            <Pressable onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}
              style={{ width: 50, height: 50, borderRadius: 25, overflow: "hidden", borderWidth: 2, borderColor: accent }}>
              <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={50} />
            </Pressable>
            {!isSelf && (
              <Pressable onPress={() => onFollow(item.author_id, isFollowing)}
                style={({ hovered }: any) => ({ marginTop: -10, width: 22, height: 22, borderRadius: 11, backgroundColor: isFollowing ? (hovered ? colors.backgroundTertiary : colors.surface) : accent, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.background })}>
                <Ionicons name={isFollowing ? "checkmark" : "add"} size={13} color="#fff" />
              </Pressable>
            )}
          </View>

          {[
            { icon: item.liked ? "heart" : "heart-outline", color: item.liked ? "#FF3B30" : "#fff", label: formatCount(item.likeCount), onPress: handleLike },
            { icon: "chatbubble-ellipses", color: "#fff", label: formatCount(item.replyCount), onPress: () => onOpenComments(item.id) },
            { icon: item.bookmarked ? "bookmark" : "bookmark-outline", color: item.bookmarked ? accent : "#fff", label: null, onPress: () => onBookmark(item.id, item.bookmarked) },
            { icon: "share-social-outline", color: "#fff", label: null, onPress: () => onShare(item) },
          ].map((btn, i) => (
            <View key={i} style={{ alignItems: "center", gap: 4 }}>
              <Pressable onPress={btn.onPress as any}
                style={({ hovered }: any) => ({ width: 50, height: 50, borderRadius: 25, backgroundColor: hovered ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" })}>
                <Ionicons name={btn.icon as any} size={i === 0 ? 28 : 26} color={btn.color} />
              </Pressable>
              {btn.label !== null && <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{btn.label}</Text>}
            </View>
          ))}
        </View>
      </View>
    );
  }

  // Mobile fullscreen layout
  return (
    <View style={[vStyles.item, { width: screenW, height: screenH }]}>
      <View style={{ width: cardWidth, height: cardHeight, backgroundColor: "#000", position: "relative", overflow: "hidden" }}>
        {videoPlayer}
        {overlays}
        <GradientOverlay position="bottom" height={360} />
        <GradientOverlay position="top" height={120} />

        <View style={[vStyles.bottomArea, { bottom: insets.bottom + 52 }]}>
          <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })} style={vStyles.authorRow}>
            <View style={[vStyles.avatarWrap, { borderColor: accent }]}>
              <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={40} />
            </View>
            <View style={vStyles.authorInfo}>
              <Text style={vStyles.authorHandle}>@{item.profile.handle}</Text>
              <Text style={vStyles.authorName}>{item.profile.display_name}</Text>
            </View>
          </TouchableOpacity>

          {!!item.content && (
            <TouchableOpacity activeOpacity={showExpand ? 0.75 : 1} onPress={() => showExpand && setExpanded((e) => !e)} disabled={!showExpand} style={vStyles.captionWrap}>
              <RichText style={vStyles.caption} numberOfLines={expanded ? undefined : 2} linkColor="#00BCD4">{item.content}</RichText>
              {showExpand && !expanded && <Text style={vStyles.captionMore}><Text style={vStyles.captionEllipsis}>... </Text><Text style={vStyles.captionMoreLink}>more</Text></Text>}
              {showExpand && expanded && <Text style={vStyles.captionLessLink}>less</Text>}
            </TouchableOpacity>
          )}

          {item.view_count > 0 && (
            <View style={vStyles.viewRow}>
              <Ionicons name="eye-outline" size={13} color="rgba(255,255,255,0.4)" />
              <Text style={vStyles.viewText}>{formatCount(item.view_count)} views</Text>
            </View>
          )}
        </View>

        <View style={[vStyles.rightCol, { bottom: insets.bottom + 28 }]}>
          <View style={vStyles.rightAvatarContainer}>
            <View style={vStyles.rightAvatarWrap}>
              <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}>
                <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={44} />
              </TouchableOpacity>
            </View>
            {!isSelf && (
              <TouchableOpacity style={[vStyles.followBadge, { backgroundColor: accent }, isFollowing && vStyles.followBadgeActive]} onPress={() => onFollow(item.author_id, isFollowing)} hitSlop={6}>
                <Ionicons name={isFollowing ? "checkmark" : "add"} size={14} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          <Animated.View style={[vStyles.actionItem, { transform: [{ scale: heartScale }] }]}>
            <TouchableOpacity onPress={handleLike} hitSlop={10} style={vStyles.actionBtn}>
              <Ionicons name={item.liked ? "heart" : "heart-outline"} size={28} color={item.liked ? "#FF3B30" : "#fff"} />
            </TouchableOpacity>
            <Text style={vStyles.actionLabel}>{formatCount(item.likeCount)}</Text>
          </Animated.View>

          <View style={vStyles.actionItem}>
            <TouchableOpacity onPress={() => onOpenComments(item.id)} hitSlop={10} style={vStyles.actionBtn}>
              <Ionicons name="chatbubble-ellipses" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={vStyles.actionLabel}>{formatCount(item.replyCount)}</Text>
          </View>

          <View style={vStyles.actionItem}>
            <TouchableOpacity onPress={() => onBookmark(item.id, item.bookmarked)} hitSlop={10} style={vStyles.actionBtn}>
              <Ionicons name={item.bookmarked ? "bookmark" : "bookmark-outline"} size={26} color={item.bookmarked ? accent : "#fff"} />
            </TouchableOpacity>
          </View>

          <View style={vStyles.actionItem}>
            <TouchableOpacity onPress={() => onShare(item)} hitSlop={10} style={vStyles.actionBtn}>
              <Ionicons name="share-social-outline" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity activeOpacity={0.75} style={[vStyles.musicRow, { bottom: (insets.bottom > 0 ? insets.bottom : 0) + 6 }]} onPress={() => onOpenSound(item, albumArtUrl, trackArtist, trackLabel)}>
          <Animated.View style={[vStyles.watermarkDisc, { transform: [{ rotate: watermarkRotate }] }]}>
            {albumArtUrl ? (
              <ExpoImage source={{ uri: albumArtUrl }} style={vStyles.watermarkAlbumArt} contentFit="cover" />
            ) : (
              <View style={vStyles.watermarkInner}>
                <ExpoImage source={require("../../assets/images/afu-symbol.png")} style={vStyles.watermarkLogo} contentFit="contain" />
              </View>
            )}
          </Animated.View>
          <View style={vStyles.musicMarquee}>
            <Text style={vStyles.musicText} numberOfLines={1}>
              {trackArtist ? <Text style={vStyles.copyrightIcon}>© </Text> : <Ionicons name="musical-note" size={11} color="rgba(255,255,255,0.75)" />}
              {" "}{item.audio_name || `Original audio · ${item.profile.display_name}`}
            </Text>
            {trackArtist && <Text style={vStyles.musicArtist} numberOfLines={1}>{trackArtist}{trackLabel ? ` · ${trackLabel}` : ""}</Text>}
          </View>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={1} style={[vStyles.progressBar, { bottom: insets.bottom > 0 ? insets.bottom : 0 }]}
          onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
          onPress={(e) => handleProgressBarPress(e.nativeEvent.locationX)} hitSlop={{ top: 10, bottom: 10 }}>
          <View style={[vStyles.progressFill, { width: `${progress * 100}%` as any }]} />
          <View style={[vStyles.progressThumb, { left: `${progress * 100}%` as any }]} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const vStyles = StyleSheet.create({
  item: { backgroundColor: "#000" },
  bufferOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  pauseCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 2, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  doubleTapHeart: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  bottomArea: { position: "absolute", left: 16, right: 76, gap: 8 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  avatarWrap: { borderWidth: 2, borderRadius: 22, padding: 1 },
  authorInfo: { flex: 1 },
  authorHandle: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  authorName: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  captionWrap: { marginTop: 2 },
  caption: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  captionMore: { marginTop: 1, fontSize: 13, lineHeight: 19 },
  captionEllipsis: { color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular" },
  captionMoreLink: { color: "#00BCD4", fontFamily: "Inter_600SemiBold" },
  captionLessLink: { color: "#00BCD4", fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 4 },
  viewRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  viewText: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "Inter_400Regular" },
  rightCol: { position: "absolute", right: 10, gap: 18, alignItems: "center" },
  rightAvatarContainer: { alignItems: "center", marginBottom: 6 },
  rightAvatarWrap: { borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", borderRadius: 24, padding: 1 },
  followBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: -11, borderWidth: 2, borderColor: "#000" },
  followBadgeActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  actionItem: { alignItems: "center", gap: 2 },
  actionBtn: { padding: 2 },
  actionLabel: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  musicRow: { position: "absolute", left: 16, right: 76, flexDirection: "row", alignItems: "center", gap: 8 },
  musicMarquee: { flex: 1, overflow: "hidden" },
  musicText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_500Medium" },
  watermarkDisc: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "rgba(0,188,212,0.5)", backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  watermarkInner: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  watermarkLogo: { width: 16, height: 16, tintColor: "#00BCD4" },
  watermarkAlbumArt: { width: 28, height: 28, borderRadius: 14 },
  musicArtist: { color: "rgba(255,255,255,0.45)", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  copyrightIcon: { color: "rgba(255,200,0,0.85)", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  progressBar: { position: "absolute", left: 0, right: 0, height: 4, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center" },
  progressFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 2 },
  progressThumb: { position: "absolute", width: 12, height: 12, borderRadius: 6, backgroundColor: "#fff", top: -4, marginLeft: -6, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 3, elevation: 3 },
});

// ═══ SoundSheet ═══════════════════════════════════════════════════════════════
function SoundSheet({ visible, item, albumArtUrl, trackArtist, trackLabel, onClose, onUseSound }: {
  visible: boolean; item: VideoPost | null; albumArtUrl: string | null;
  trackArtist: string | null; trackLabel: string | null; onClose: () => void; onUseSound: () => void;
}) {
  if (!visible || !item) return null;
  const isOriginal = !item.audio_name || item.audio_name.toLowerCase().startsWith("original audio");
  const isCopyrighted = !isOriginal && !!trackArtist;
  const displayName = item.audio_name || `Original audio · ${item.profile.display_name}`;
  const artistLine = trackArtist || (isOriginal ? item.profile.display_name : null);
  const copyrightOwner = trackLabel || trackArtist;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={soundStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={soundStyles.sheet}>
        <View style={soundStyles.handle} />
        <View style={soundStyles.artRow}>
          <View style={soundStyles.artWrap}>
            {albumArtUrl ? (
              <ExpoImage source={{ uri: albumArtUrl }} style={soundStyles.art} contentFit="cover" />
            ) : (
              <View style={[soundStyles.art, soundStyles.artFallback]}>
                <Ionicons name="musical-notes" size={36} color="#00BCD4" />
              </View>
            )}
          </View>
          <View style={soundStyles.trackInfo}>
            <Text style={soundStyles.trackName} numberOfLines={2}>{displayName}</Text>
            {artistLine && <Text style={soundStyles.trackArtist}>{isCopyrighted ? "© " : ""}{artistLine}</Text>}
            {trackLabel && <Text style={soundStyles.trackLabelText} numberOfLines={1}>{trackLabel}</Text>}
            {isCopyrighted ? (
              <View style={soundStyles.copyrightBadge}>
                <Ionicons name="shield-checkmark" size={11} color="#FFC107" />
                <Text style={soundStyles.copyrightBadgeText}>Copyright © {copyrightOwner}</Text>
              </View>
            ) : isOriginal ? null : (
              <View style={soundStyles.knownBadge}><Text style={soundStyles.knownBadgeText}>🎵 Identified track</Text></View>
            )}
          </View>
        </View>
        <View style={soundStyles.statsRow}>
          <Ionicons name="videocam-outline" size={14} color="rgba(255,255,255,0.45)" />
          <Text style={soundStyles.statsText}>Used in this video by @{item.profile.handle}</Text>
        </View>
        <TouchableOpacity style={soundStyles.useBtn} onPress={() => { onClose(); setTimeout(onUseSound, 200); }}>
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={soundStyles.useBtnText}>Use this sound</Text>
        </TouchableOpacity>
        <TouchableOpacity style={soundStyles.cancelBtn} onPress={onClose}>
          <Text style={soundStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const soundStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#1a1a1a", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 20 },
  artRow: { flexDirection: "row", gap: 16, alignItems: "flex-start", marginBottom: 16 },
  artWrap: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  art: { width: 84, height: 84, borderRadius: 10 },
  artFallback: { backgroundColor: "rgba(0,188,212,0.12)", borderWidth: 1, borderColor: "rgba(0,188,212,0.25)", alignItems: "center", justifyContent: "center" },
  trackInfo: { flex: 1, justifyContent: "center", gap: 4 },
  trackName: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 20 },
  trackArtist: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontFamily: "Inter_400Regular" },
  trackLabelText: { color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Inter_400Regular" },
  knownBadge: { alignSelf: "flex-start", backgroundColor: "rgba(0,188,212,0.15)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2, borderWidth: 1, borderColor: "rgba(0,188,212,0.25)" },
  knownBadgeText: { color: "#00BCD4", fontSize: 11, fontFamily: "Inter_500Medium" },
  copyrightBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: "rgba(255,193,7,0.12)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2, borderWidth: 1, borderColor: "rgba(255,193,7,0.3)", gap: 4 },
  copyrightBadgeText: { color: "#FFC107", fontSize: 11, fontFamily: "Inter_500Medium" },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
  statsText: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular" },
  useBtn: { backgroundColor: "#00BCD4", borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 },
  useBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  cancelBtn: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  cancelText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

// ═══ SocialShareSheet ═════════════════════════════════════════════════════════
const SOCIAL_PLATFORMS = [
  { id: "whatsapp",  label: "WhatsApp",  icon: "logo-whatsapp",  color: "#25D366", scheme: (url: string) => `https://wa.me/?text=${encodeURIComponent(url)}` },
  { id: "telegram",  label: "Telegram",  icon: "paper-plane",    color: "#0088CC", scheme: (url: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}` },
  { id: "twitter",   label: "X",         icon: "logo-twitter",   color: "#000",    scheme: (url: string) => `https://x.com/intent/tweet?text=${encodeURIComponent(url)}` },
  { id: "facebook",  label: "Facebook",  icon: "logo-facebook",  color: "#1877F2", scheme: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  { id: "instagram", label: "Instagram", icon: "logo-instagram", color: "#E1306C", scheme: (_: string) => `instagram://app` },
  { id: "tiktok",    label: "TikTok",    icon: "musical-notes",  color: "#010101", scheme: (_: string) => `tiktok://` },
  { id: "copy",      label: "Copy link", icon: "link-outline",   color: "#555",    scheme: null },
  { id: "more",      label: "More",      icon: "share-social",   color: "#00BCD4", scheme: null },
];

function SocialShareSheet({ visible, onClose, url, title }: { visible: boolean; onClose: () => void; url: string; title: string }) {
  if (!visible) return null;

  async function handlePlatform(p: typeof SOCIAL_PLATFORMS[number]) {
    if (p.id === "copy") { Clipboard.setString(url); onClose(); return; }
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

// ═══ VideoContextMenu ═════════════════════════════════════════════════════════
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

// ═══ VideoPlayerScreen ════════════════════════════════════════════════════════
export default function VideoPlayerScreen() {
  const { accent } = useAppAccent();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId && !isUuid(rawId) ? decodeId(rawId) : rawId;
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const EFF_W = SCREEN_W;
  const EFF_H = SCREEN_H;

  const [videoTab, setVideoTab] = useState<"for_you" | "following">("for_you");
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [menuItem, setMenuItem] = useState<VideoPost | null>(null);
  const [shareSheetItem, setShareSheetItem] = useState<VideoPost | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const [soundSheetData, setSoundSheetData] = useState<{ item: VideoPost; albumArtUrl: string | null; trackArtist: string | null; trackLabel: string | null } | null>(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  const swipeHint = useSwipeHint();
  const listRef = useRef<FlatList>(null);
  const webScrollRef = useRef<HTMLDivElement | null>(null);
  const initialScrollDone = useRef(false);
  const scrollSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webDragRef = useRef<{ startY: number; startScrollTop: number; lastY: number; velocity: number } | null>(null);
  const hasMoreRef = useRef(hasMore);
  const videoTabRef = useRef(videoTab);
  const activeIndexRef = useRef(activeIndex);
  const videosLenRef = useRef(videos.length);
  const effHRef = useRef(EFF_H);
  const activeToggleRef = useRef<(() => void) | null>(null);
  const tabAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { videoTabRef.current = videoTab; }, [videoTab]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { videosLenRef.current = videos.length; }, [videos.length]);
  useEffect(() => { effHRef.current = EFF_H; }, [EFF_H]);

  // Web: hide scrollbar via CSS injection
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
    return () => { document.body.style.overflow = prevBody; document.documentElement.style.overflow = prevHtml; };
  }, []);

  // Web: keyboard navigation
  useEffect(() => {
    if (Platform.OS !== "web") return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t as any).isContentEditable) return;
      }
      if (e.code === "Space" || e.key === " ") {
        if (activeToggleRef.current) { e.preventDefault(); activeToggleRef.current(); }
        return;
      }
      const cur = activeIndexRef.current;
      const len = videosLenRef.current;
      if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); const next = Math.min(cur + 1, Math.max(len - 1, 0)); if (next !== cur) scrollFeedTo(next); }
      else if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); const prev = Math.max(cur - 1, 0); if (prev !== cur) scrollFeedTo(prev); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Web: mouse wheel handler
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = webScrollRef.current;
    if (!el) return;
    let cooldown = false;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (cooldown) return;
      cooldown = true;
      setTimeout(() => { cooldown = false; }, 600);
      const h = effHRef.current;
      if (!h) return;
      const len = videosLenRef.current;
      const current = Math.round(el!.scrollTop / h);
      const delta = Math.sign(e.deltaY);
      const next = Math.max(0, Math.min(len - 1, current + delta));
      if (next !== current) {
        el!.scrollTo({ top: next * h, behavior: "smooth" });
        setActiveIndex(next); activeIndexRef.current = next;
        if (next >= len - 3 && !loadingMoreRef.current && hasMoreRef.current && cursorRef.current) fetchVideos(videoTabRef.current, cursorRef.current);
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [!loading && videos.length > 0]);

  function handleWebScroll(e: React.UIEvent<HTMLDivElement>) {
    if (webDragRef.current) return;
    const scrollTop = e.currentTarget.scrollTop;
    if (scrollTop > 40) swipeHint.dismiss();
    if (scrollSettleRef.current) clearTimeout(scrollSettleRef.current);
    scrollSettleRef.current = setTimeout(() => {
      const index = Math.round(scrollTop / effHRef.current);
      if (index !== activeIndexRef.current) {
        setActiveIndex(index); activeIndexRef.current = index;
        if (index >= videosLenRef.current - 3 && !loadingMoreRef.current && hasMoreRef.current && cursorRef.current) fetchVideos(videoTabRef.current, cursorRef.current);
      }
    }, 100);
  }

  function handleWebPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch") return;
    const el = webScrollRef.current;
    if (!el) return;
    webDragRef.current = { startY: e.clientY, startScrollTop: el.scrollTop, lastY: e.clientY, velocity: 0 };
    (el.style as any).scrollSnapType = "none";
    function safetyRelease() {
      document.removeEventListener("pointerup", safetyRelease);
      document.removeEventListener("pointercancel", safetyRelease);
      if (webDragRef.current) {
        webDragRef.current = null;
        const scrollEl = webScrollRef.current;
        if (scrollEl) {
          (scrollEl.style as any).scrollSnapType = "y mandatory";
          const h = effHRef.current;
          if (h) { const cur = Math.round(scrollEl.scrollTop / h); scrollEl.scrollTo({ top: cur * h, behavior: "smooth" }); }
        }
      }
    }
    document.addEventListener("pointerup", safetyRelease, { once: true });
    document.addEventListener("pointercancel", safetyRelease, { once: true });
  }

  function handleWebPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = webDragRef.current;
    if (!drag) return;
    drag.velocity = e.clientY - drag.lastY; drag.lastY = e.clientY;
    const el = webScrollRef.current;
    if (el) el.scrollTop = drag.startScrollTop - (e.clientY - drag.startY);
  }

  function handleWebPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = webDragRef.current;
    if (!drag) return;
    webDragRef.current = null;
    const el = webScrollRef.current;
    if (!el) return;
    (el.style as any).scrollSnapType = "y mandatory";
    const h = effHRef.current;
    if (!h) return;
    const len = videosLenRef.current;
    const dy = e.clientY - drag.startY;
    const cur = Math.round(drag.startScrollTop / h);
    let next = cur;
    if ((dy < -(h * 0.1) || drag.velocity < -4) && cur < len - 1) next = cur + 1;
    else if ((dy > (h * 0.1) || drag.velocity > 4) && cur > 0) next = cur - 1;
    else next = Math.round(el.scrollTop / h);
    const clamped = Math.max(0, Math.min(len - 1, next));
    el.scrollTo({ top: clamped * h, behavior: "smooth" });
    setActiveIndex(clamped); activeIndexRef.current = clamped;
    if (clamped >= len - 3 && !loadingMoreRef.current && hasMoreRef.current && cursorRef.current) fetchVideos(videoTabRef.current, cursorRef.current);
  }

  function handleWebPointerCancel() {
    const drag = webDragRef.current;
    if (!drag) return;
    webDragRef.current = null;
    const el = webScrollRef.current;
    if (!el) return;
    (el.style as any).scrollSnapType = "y mandatory";
    const h = effHRef.current;
    if (!h) return;
    const cur = Math.round(drag.startScrollTop / h);
    el.scrollTo({ top: cur * h, behavior: "smooth" });
  }

  function scrollFeedTo(index: number) {
    if (Platform.OS !== "web") { listRef.current?.scrollToIndex({ index, animated: true }); return; }
    const el = webScrollRef.current;
    if (el) el.scrollTo({ top: index * effHRef.current, behavior: "smooth" });
    setActiveIndex(index); activeIndexRef.current = index;
  }

  function switchTab(tab: "for_you" | "following") {
    if (tab === videoTab) return;
    if (tab === "following" && !user) { router.push("/(auth)/login"); return; }
    Animated.timing(tabAnim, { toValue: tab === "following" ? 1 : 0, duration: 200, useNativeDriver: false }).start();
    initialScrollDone.current = false;
    if (Platform.OS === "web" && webScrollRef.current) webScrollRef.current.scrollTop = 0;
    setActiveIndex(0);
    setVideoTab(tab);
  }

  const VIDEO_PAGE_SIZE = 50;

  const fetchVideos = useCallback(async (tab: "for_you" | "following", cursor?: string | null) => {
    const isLoadMore = !!cursor;
    if (isLoadMore) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      setLoading(true); setVideos([]); cursorRef.current = null; setHasMore(true);
    }

    let followingIds: string[] = [];
    if (tab === "following" && user) {
      const { data: followData } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
      followingIds = (followData || []).map((f: any) => f.following_id);
      if (followingIds.length === 0) {
        setVideos([]); setLoading(false); loadingMoreRef.current = false; setLoadingMore(false); return;
      }
    }

    let query = supabase
      .from("posts")
      .select(`id, author_id, content, video_url, image_url, created_at, audio_name, duet_of_post_id, profiles!posts_author_id_fkey(display_name, handle, avatar_url)`)
      .eq("post_type", "video").not("video_url", "is", null)
      .order("created_at", { ascending: false }).limit(VIDEO_PAGE_SIZE);

    if (tab === "following" && followingIds.length > 0) query = query.in("author_id", followingIds).in("visibility", ["public", "followers"]);
    else query = query.eq("visibility", "public");
    if (cursor) query = query.lt("created_at", cursor);

    const { data } = await query;

    if (data && data.length > 0) {
      const postIds = data.map((p: any) => p.id);
      const authorIds = [...new Set(data.map((p: any) => p.author_id))] as string[];

      const [
        { data: likesData }, { data: repliesData }, { data: viewsData },
        { data: myLikes }, { data: myBookmarks }, { data: myFollows }, { data: myRecentLikes },
      ] = await Promise.all([
        supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
        supabase.from("post_replies").select("post_id").in("post_id", postIds),
        supabase.from("post_views").select("post_id").in("post_id", postIds),
        user ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id) : { data: [] },
        user ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id) : { data: [] },
        user ? supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", authorIds) : { data: [] },
        user ? supabase.from("post_acknowledgments").select("post_id").eq("user_id", user.id).gte("created_at", new Date(Date.now() - 30 * 24 * 3600000).toISOString()).limit(300) : { data: [] },
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
      const myRecentLikeSet = new Set((myRecentLikes || []).map((l: any) => l.post_id));
      const likedAuthorIds = new Set(data.filter((p: any) => myRecentLikeSet.has(p.id)).map((p: any) => p.author_id as string));
      const followedSet = new Set((myFollows || []).map((f: any) => f.following_id as string));

      const mapped: VideoPost[] = data.map((p: any) => ({
        id: p.id, author_id: p.author_id, content: p.content || "",
        video_url: p.video_url, image_url: p.image_url || null, created_at: p.created_at,
        view_count: viewMap[p.id] || 0, audio_name: p.audio_name || null, duet_of_post_id: p.duet_of_post_id || null,
        profile: { display_name: p.profiles?.display_name || "User", handle: p.profiles?.handle || "user", avatar_url: p.profiles?.avatar_url || null },
        liked: myLikeSet.has(p.id), bookmarked: myBookmarkSet.has(p.id),
        likeCount: likeMap[p.id] || 0, replyCount: replyMap[p.id] || 0,
      }));

      const now = Date.now();
      const creatorSeenCount: Record<string, number> = {};
      const scored = mapped.map((v) => {
        const ageHours = (now - new Date(v.created_at).getTime()) / 3600000;
        const engagement = v.likeCount * 3 + v.replyCount * 2 + v.view_count * 0.3;
        let score = Math.log1p(engagement) * 20;
        score += Math.max(0, 1 - ageHours / 336) * 40;
        if (likedAuthorIds.has(v.author_id)) score += 30;
        if (followedSet.has(v.author_id)) score += 20;
        if (v.liked) score -= 15;
        if (v.bookmarked) score -= 8;
        score += Math.random() * 60;
        return { video: v, score };
      });
      scored.sort((a, b) => b.score - a.score);

      const diversified: typeof scored = [];
      const deferred: typeof scored = [];
      for (const entry of scored) {
        const authorId = entry.video.author_id;
        const seen = creatorSeenCount[authorId] || 0;
        if (seen < 2) { diversified.push(entry); creatorSeenCount[authorId] = seen + 1; }
        else deferred.push(entry);
      }
      diversified.push(...deferred);

      let newVideos = diversified.map((s) => s.video);
      cursorRef.current = data[data.length - 1].created_at;
      setHasMore(data.length === VIDEO_PAGE_SIZE);

      if (isLoadMore) {
        setVideos((prev) => { const seen = new Set(prev.map((v) => v.id)); return [...prev, ...newVideos.filter((v) => !seen.has(v.id))]; });
      } else {
        if (id) {
          const existingIdx = newVideos.findIndex((v) => v.id === id);
          if (existingIdx > 0) { const [target] = newVideos.splice(existingIdx, 1); newVideos = [target, ...newVideos]; }
          else if (existingIdx === -1) {
            const { data: tRow } = await supabase.from("posts")
              .select(`id, author_id, content, video_url, image_url, created_at, audio_name, profiles!posts_author_id_fkey(display_name, handle, avatar_url)`)
              .eq("id", id).not("video_url", "is", null).maybeSingle();
            if (tRow) {
              const tId = tRow.id as string;
              const [{ data: tL }, { data: tR }, { data: tV }, { data: tML }, { data: tMB }] = await Promise.all([
                supabase.from("post_acknowledgments").select("post_id").eq("post_id", tId),
                supabase.from("post_replies").select("post_id").eq("post_id", tId),
                supabase.from("post_views").select("post_id").eq("post_id", tId),
                user ? supabase.from("post_acknowledgments").select("post_id").eq("post_id", tId).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
                user ? supabase.from("post_bookmarks").select("post_id").eq("post_id", tId).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
              ]);
              const targetVideo: VideoPost = {
                id: tRow.id, author_id: tRow.author_id, content: tRow.content || "",
                video_url: tRow.video_url, image_url: tRow.image_url || null, created_at: tRow.created_at,
                view_count: (tV || []).length, audio_name: tRow.audio_name || null, duet_of_post_id: null,
                profile: { display_name: (tRow.profiles as any)?.display_name || "User", handle: (tRow.profiles as any)?.handle || "user", avatar_url: (tRow.profiles as any)?.avatar_url || null },
                liked: !!(tML as any), bookmarked: !!(tMB as any),
                likeCount: (tL || []).length, replyCount: (tR || []).length,
              };
              newVideos = [targetVideo, ...newVideos];
            }
          }
        }
        setVideos(newVideos);
      }
    } else {
      setHasMore(false);
      if (!isLoadMore && id) {
        const { data: tRow } = await supabase.from("posts")
          .select(`id, author_id, content, video_url, image_url, created_at, audio_name, profiles!posts_author_id_fkey(display_name, handle, avatar_url)`)
          .eq("id", id).not("video_url", "is", null).maybeSingle();
        if (tRow) {
          const tId = tRow.id as string;
          const [{ data: tL }, { data: tR }, { data: tV }, { data: tML }, { data: tMB }] = await Promise.all([
            supabase.from("post_acknowledgments").select("post_id").eq("post_id", tId),
            supabase.from("post_replies").select("post_id").eq("post_id", tId),
            supabase.from("post_views").select("post_id").eq("post_id", tId),
            user ? supabase.from("post_acknowledgments").select("post_id").eq("post_id", tId).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
            user ? supabase.from("post_bookmarks").select("post_id").eq("post_id", tId).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
          ]);
          setVideos([{
            id: tRow.id, author_id: tRow.author_id, content: tRow.content || "",
            video_url: tRow.video_url, image_url: tRow.image_url || null, created_at: tRow.created_at,
            view_count: (tV || []).length, audio_name: tRow.audio_name || null, duet_of_post_id: null,
            profile: { display_name: (tRow.profiles as any)?.display_name || "User", handle: (tRow.profiles as any)?.handle || "user", avatar_url: (tRow.profiles as any)?.avatar_url || null },
            liked: !!(tML as any), bookmarked: !!(tMB as any),
            likeCount: (tL || []).length, replyCount: (tR || []).length,
          }]);
        }
      }
    }

    if (isLoadMore) { loadingMoreRef.current = false; setLoadingMore(false); }
    else setLoading(false);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    fetchVideos(videoTab).catch((err) => {
      if (cancelled) return;
      console.error("[VideoFeed] fetchVideos error:", err);
      loadingMoreRef.current = false; setLoadingMore(false); setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchVideos, videoTab]);

  useEffect(() => {
    if (!loading && videos.length > 0 && !initialScrollDone.current) initialScrollDone.current = true;
  }, [loading, videos]);

  // Realtime like/comment count updates
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

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const swipeHintDismissRef = useRef(swipeHint.dismiss);
  useEffect(() => { swipeHintDismissRef.current = swipeHint.dismiss; }, [swipeHint.dismiss]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      const idx = viewableItems[0].index;
      setActiveIndex(idx);
      if (idx > 0) swipeHintDismissRef.current();
    }
  }, []);

  async function handleLike(postId: string, currentlyLiked: boolean) {
    if (!user) { setShowSignInPrompt(true); return; }
    const post = videos.find((v) => v.id === postId);
    if (!post) return;
    if (currentlyLiked) {
      await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: false, likeCount: Math.max(0, v.likeCount - 1) } : v));
    } else {
      await supabase.from("post_acknowledgments").insert({ post_id: postId, user_id: user.id });
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: true, likeCount: v.likeCount + 1 } : v));
      if (post.author_id !== user.id) notifyPostLike({ postAuthorId: post.author_id, likerName: profile?.display_name || "Someone", likerUserId: user.id, postId });
    }
  }

  async function handleBookmark(postId: string, currentlyBookmarked: boolean) {
    if (!user) { setShowSignInPrompt(true); return; }
    if (currentlyBookmarked) {
      await supabase.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", user.id);
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, bookmarked: false } : v));
    } else {
      await supabase.from("post_bookmarks").upsert({ post_id: postId, user_id: user.id }, { onConflict: "post_id,user_id" });
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, bookmarked: true } : v));
    }
  }

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
    if (Platform.OS === "web") {
      try {
        const ext = item.video_url.split("?")[0].split(".").pop()?.toLowerCase() || "mp4";
        const a = document.createElement("a");
        a.href = item.video_url; a.download = `afuchat_${item.id}.${ext}`; a.target = "_blank"; a.rel = "noopener";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showToast("⬇ Download started");
      } catch { showToast("Couldn't start download"); }
      return;
    }
    setDownloading(true); showToast("⬇ Saving to device…", 30000);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        setDownloading(false); setDownloadToast(null);
        Alert.alert("Permission needed", "Please allow photo/media library access in Settings to save videos.", [{ text: "OK" }]);
        return;
      }
      const ext = item.video_url.split("?")[0].split(".").pop()?.toLowerCase() || "mp4";
      const dest = (FileSystem.cacheDirectory ?? "") + `afuchat_dl_${item.id}.${ext}`;
      const { uri } = await FileSystem.downloadAsync(item.video_url, dest);
      await MediaLibrary.createAssetAsync(uri);
      await FileSystem.deleteAsync(uri, { idempotent: true });
      setDownloading(false); showToast("✓ Saved to your device");
    } catch {
      setDownloading(false); setDownloadToast(null);
      Alert.alert("Download failed", "Could not save the video. Please try again.", [{ text: "OK" }]);
    }
  }

  async function handleRepost(item: VideoPost) {
    const postUrl = getVideoUrl(item);
    try { await Share.share({ message: `🔁 Reposting: ${item.profile.display_name} on AfuChat\n${postUrl}`, url: postUrl, title: `Repost from AfuChat` }); } catch {}
  }

  function handleCopyLink(item: VideoPost) { Clipboard.setString(getVideoUrl(item)); showToast("Link copied to clipboard"); }
  function handleNotInterested(item: VideoPost) { setVideos((prev) => prev.filter((v) => v.id !== item.id)); showToast("Video removed from feed"); }
  function handleReport(item: VideoPost) {
    Alert.alert("Report video", "Why are you reporting this video?", [
      { text: "Spam", onPress: () => showToast("Report submitted — thanks") },
      { text: "Inappropriate content", onPress: () => showToast("Report submitted — thanks") },
      { text: "Misinformation", onPress: () => showToast("Report submitted — thanks") },
      { text: "Cancel", style: "cancel" },
    ]);
  }
  function handleUseSound(item: VideoPost, albumArtUrl: string | null) {
    const soundName = item.audio_name || `Original audio · ${item.profile.display_name}`;
    const params: Record<string, string> = { soundName };
    if (albumArtUrl) params.soundAlbumArt = albumArtUrl;
    params.remixPostId = item.id;
    router.push({ pathname: "/moments/create-video", params });
  }
  async function handleFollow(authorId: string, isFollowing: boolean) {
    if (!user) { setShowSignInPrompt(true); return; }
    if (isFollowing) await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", authorId);
    else await supabase.from("follows").insert({ follower_id: user.id, following_id: authorId });
    setFollowingSet((prev) => { const next = new Set(prev); if (isFollowing) next.delete(authorId); else next.add(authorId); return next; });
  }
  function handleReplyCountChange(postId: string, delta: number) {
    setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, replyCount: v.replyCount + delta } : v));
  }

  const recordedViews = useRef(new Set<string>());
  const handleRecordView = useCallback(async (postId: string) => {
    if (!user || recordedViews.current.has(postId)) return;
    recordedViews.current.add(postId);
    const { error } = await supabase.from("post_views").upsert({ post_id: postId, viewer_id: user.id }, { onConflict: "post_id,viewer_id" });
    if (!error) setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, view_count: v.view_count + 1 } : v));
  }, [user]);

  const indicatorLeft = tabAnim.interpolate({ inputRange: [0, 1], outputRange: ["25%", "75%"] });

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", ...(Platform.OS === "web" ? { position: "absolute" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 } : {}) }}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ShortsFeedSkeleton dark />
      </View>
    );
  }

  const videoItemProps = {
    screenH: EFF_H, screenW: EFF_W,
    onLike: handleLike, onBookmark: handleBookmark, onOpenComments: setCommentPostId,
    onShare: (item: VideoPost) => setShareSheetItem(item),
    onFollow: handleFollow, onRecordView: handleRecordView,
    onOpenMenu: (item: VideoPost) => setMenuItem(item),
    onOpenSound: (item: VideoPost, art: string | null, artist: string | null, label: string | null) => setSoundSheetData({ item, albumArtUrl: art, trackArtist: artist, trackLabel: label }),
    activeToggleRef,
  };

  return (
    <View style={mStyles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <View style={[mStyles.headerRow, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={mStyles.headerSide}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={mStyles.tabRow}>
          <TouchableOpacity onPress={() => switchTab("for_you")} style={mStyles.tabBtn}>
            <Text style={[mStyles.tabText, videoTab === "for_you" && mStyles.tabTextActive]}>For You</Text>
          </TouchableOpacity>
          <View style={mStyles.tabDivider} />
          <TouchableOpacity onPress={() => switchTab("following")} style={mStyles.tabBtn}>
            <Text style={[mStyles.tabText, videoTab === "following" && mStyles.tabTextActive]}>Following</Text>
          </TouchableOpacity>
          <Animated.View style={[mStyles.tabIndicator, { left: indicatorLeft, transform: [{ translateX: -14 }] }]} />
        </View>
        <TouchableOpacity hitSlop={12} style={mStyles.headerSide} onPress={() => router.push("/search" as any)}>
          <Ionicons name="search-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {videos.length === 0 ? (
        <View style={mStyles.emptyState}>
          <View style={mStyles.emptyIcon}><Ionicons name="videocam-outline" size={44} color="rgba(255,255,255,0.25)" /></View>
          <Text style={mStyles.emptyTitle}>No videos yet</Text>
          <Text style={mStyles.emptySubtitle}>{videoTab === "following" ? "Follow creators to see their videos here" : "Videos will appear here soon"}</Text>
        </View>
      ) : Platform.OS === "web" ? (
        <div
          ref={webScrollRef}
          id="vf-web-scroll"
          onScroll={handleWebScroll}
          onPointerDown={handleWebPointerDown}
          onPointerMove={handleWebPointerMove}
          onPointerUp={handleWebPointerUp}
          onPointerCancel={handleWebPointerCancel}
          style={{ height: EFF_H, width: EFF_W, overflowY: "scroll", scrollSnapType: "y mandatory", scrollbarWidth: "none", backgroundColor: "#000", cursor: "grab", userSelect: "none", touchAction: "pan-y" } as React.CSSProperties}
        >
          {videos.map((item, index) => {
            const isActive = index === activeIndex;
            const isNearActive = Math.abs(index - activeIndex) <= 2;
            return (
              <div key={item.id} style={{ height: EFF_H, width: EFF_W, scrollSnapAlign: "start", flexShrink: 0, overflow: "hidden", position: "relative" } as React.CSSProperties}>
                <VideoItem item={item} isActive={isActive} isNearActive={isNearActive} isFollowing={followingSet.has(item.author_id)} isSelf={user?.id === item.author_id} {...videoItemProps} />
              </div>
            );
          })}
          {loadingMore && (
            <div style={{ height: EFF_H, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#000", scrollSnapAlign: "start" } as React.CSSProperties}>
              <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
            </div>
          )}
        </div>
      ) : (
        <FlatList
          ref={listRef}
          data={videos}
          keyExtractor={(v) => v.id}
          renderItem={({ item, index }) => (
            <VideoItem item={item} isActive={index === activeIndex} isNearActive={Math.abs(index - activeIndex) <= 2}
              isFollowing={followingSet.has(item.author_id)} isSelf={user?.id === item.author_id} {...videoItemProps} />
          )}
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({ length: EFF_H, offset: EFF_H * index, index })}
          snapToInterval={EFF_H}
          snapToAlignment="start"
          disableIntervalMomentum
          decelerationRate="fast"
          scrollEnabled
          style={{ flex: 1, backgroundColor: "#000" }}
          windowSize={5}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          removeClippedSubviews={false}
          onScrollToIndexFailed={(info) => { setTimeout(() => { listRef.current?.scrollToIndex({ index: info.index, animated: false }); }, 300); }}
          onEndReached={() => { if (!loadingMoreRef.current && hasMore && cursorRef.current) fetchVideos(videoTab, cursorRef.current); }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? (
            <View style={{ width: EFF_W, height: EFF_H, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
              <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
            </View>
          ) : null}
        />
      )}

      <SwipeHintOverlay visible={swipeHint.visible} />

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

      <SoundSheet
        visible={!!soundSheetData} item={soundSheetData?.item ?? null}
        albumArtUrl={soundSheetData?.albumArtUrl ?? null} trackArtist={soundSheetData?.trackArtist ?? null}
        trackLabel={soundSheetData?.trackLabel ?? null} onClose={() => setSoundSheetData(null)}
        onUseSound={() => { if (soundSheetData) handleUseSound(soundSheetData.item, soundSheetData.albumArtUrl); }}
      />

      {!!downloadToast && (
        <View style={mStyles.downloadToast} pointerEvents="none" accessibilityElementsHidden>
          <Text style={mStyles.downloadToastText}>{downloadToast}</Text>
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
  tabRow: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", position: "relative" },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  tabDivider: { width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.2)" },
  tabText: { color: "rgba(255,255,255,0.5)", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  tabTextActive: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  tabIndicator: { position: "absolute", bottom: 0, width: 28, height: 3, borderRadius: 1.5, backgroundColor: "#fff" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { color: "rgba(255,255,255,0.6)", fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySubtitle: { color: "rgba(255,255,255,0.3)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  downloadToast: { position: "absolute", bottom: 80, left: 0, right: 0, alignItems: "center", justifyContent: "center" },
  downloadToastText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium", backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, overflow: "hidden" },
});
