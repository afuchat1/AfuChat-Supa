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
import { useDataMode } from "@/context/DataModeContext";
import { getCachedVideoUri, cacheVideo } from "@/lib/videoCache";
import { useResolvedVideoSource } from "@/hooks/useResolvedVideoSource";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { useAppAccent } from "@/context/AppAccentContext";
import { notifyPostLike, notifyPostReply } from "@/lib/notifyUser";
import { RichText } from "@/components/ui/RichText";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { BlurView } from "expo-blur";

const USE_NATIVE = Platform.OS !== "web";

/**
 * Lightweight HTML5 video player used on web only.
 *
 * The expo-av <Video> component on web wraps a native <video> behind a heavy
 * abstraction that adds noticeable startup latency (~700ms-1.2s before the
 * first frame paints). Switching to a raw <video> element on web brings the
 * /video/[id] page to parity with the Shorts feed (which already does this).
 *
 * Native (iOS / Android) keeps using expo-av — there is no <video> element on
 * native and expo-av is well-tuned for those platforms.
 */
function WebVideoPlayer({
  src,
  poster,
  active,
  paused,
  preloadOnly,
  onTogglePause,
  onDoubleTap,
  onProgress,
  onBuffering,
  externalRef,
}: {
  src: string;
  poster?: string | null;
  active: boolean;
  paused: boolean;
  preloadOnly: boolean;
  onTogglePause: () => void;
  onDoubleTap?: () => void;
  onProgress: (positionMs: number, durationMs: number) => void;
  onBuffering: (buffering: boolean) => void;
  externalRef?: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const innerRef = useRef<HTMLVideoElement | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setRef(el: HTMLVideoElement | null) {
    innerRef.current = el;
    if (externalRef) externalRef.current = el;
  }

  // Drive playback from React state.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    if (active && !paused && !preloadOnly) {
      const p = el.play();
      if (p && typeof (p as any).catch === "function") {
        (p as any).catch(() => { /* autoplay blocked — user must tap */ });
      }
    } else {
      el.pause();
    }
  }, [active, paused, src, preloadOnly]);

  // Reset to start when becoming inactive so re-entry plays from the top.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    if (!active) {
      try { el.currentTime = 0; } catch { /* ignore */ }
    }
  }, [active]);

  useEffect(() => () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
  }, []);

  // Pause/play click handler with click-vs-double-click disambiguation so a
  // double-tap-to-like doesn't also flip the paused state twice (which made
  // it appear that pause/play didn't work).
  function handleClick(e: any) {
    if (preloadOnly) return;
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    if (onDoubleTap) {
      clickTimer.current = setTimeout(() => {
        onTogglePause();
        clickTimer.current = null;
      }, 220);
    } else {
      onTogglePause();
    }
  }

  function handleDblClick(e: any) {
    if (preloadOnly || !onDoubleTap) return;
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    onDoubleTap();
  }

  return (
    // @ts-expect-error react-native-web exposes raw HTML elements via createElement
    <video
      ref={setRef}
      src={src}
      poster={poster || undefined}
      playsInline
      loop
      preload="auto"
      onClick={handleClick}
      onDoubleClick={handleDblClick}
      onTimeUpdate={(e: any) => {
        const v = e.currentTarget as HTMLVideoElement;
        if (v.duration) onProgress(v.currentTime * 1000, v.duration * 1000);
      }}
      onWaiting={() => onBuffering(true)}
      onPlaying={() => onBuffering(false)}
      onCanPlay={() => onBuffering(false)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        backgroundColor: "#000",
        cursor: preloadOnly ? "default" : "pointer",
      }}
    />
  );
}

type VideoPost = {
  id: string;
  author_id: string;
  content: string;
  video_url: string;
  image_url: string | null;
  created_at: string;
  view_count: number;
  audio_name: string | null;
  profile: { display_name: string; handle: string; avatar_url: string | null };
  liked: boolean;
  bookmarked: boolean;
  likeCount: number;
  replyCount: number;
};

type Reply = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  parent_reply_id: string | null;
  profile: { display_name: string; handle: string; avatar_url: string | null };
  children?: Reply[];
};

function buildVideoReplyTree(flatReplies: Reply[]): Reply[] {
  const map = new Map<string, Reply>();
  const roots: Reply[] = [];
  for (const r of flatReplies) { map.set(r.id, { ...r, children: [] }); }
  for (const r of flatReplies) {
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
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
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

function VideoReplyItem({ reply: r, depth, onReplyTo }: { reply: Reply; depth: number; onReplyTo: (r: Reply) => void }) {
  const indent = Math.min(depth, 4) * 18;
  const [liked, setLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const threadColor = VID_THREAD_COLORS[depth % VID_THREAD_COLORS.length];
  const hasChildren = (r.children?.length ?? 0) > 0;
  const isTop = depth === 0;

  function handleLike() {
    const next = !liked;
    setLiked(next);
    setLocalLikes((c) => (next ? c + 1 : Math.max(0, c - 1)));
  }

  return (
    <>
      <View style={{ flexDirection: "row", paddingLeft: indent, paddingTop: isTop ? 14 : 8, paddingBottom: 2, paddingRight: 0, position: "relative" }}>
        {depth > 0 && (
          <View style={{
            position: "absolute",
            left: indent - 10,
            top: 0,
            bottom: 0,
            width: 2,
            borderRadius: 1,
            backgroundColor: threadColor + "40",
          }} />
        )}
        <View style={{ marginRight: 10, marginTop: 1 }}>
          <Avatar uri={r.profile.avatar_url} name={r.profile.display_name} size={isTop ? 34 : 26} />
        </View>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
            <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: "Inter_700Bold" }}>
              {r.profile.display_name}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>@{r.profile.handle}</Text>
            <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>· {formatRelative(r.created_at)}</Text>
          </View>
          <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 }}>
            {r.content}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 7, marginBottom: 2 }}>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }} onPress={handleLike} activeOpacity={0.7}>
              <Ionicons name={liked ? "heart" : "heart-outline"} size={13} color={liked ? "#FF2D55" : "rgba(255,255,255,0.35)"} />
              {localLikes > 0 && (
                <Text style={{ color: liked ? "#FF2D55" : "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {localLikes}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => onReplyTo(r)} activeOpacity={0.7}>
              <Ionicons name="arrow-undo-outline" size={13} color="rgba(255,255,255,0.35)" />
              <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Reply</Text>
            </TouchableOpacity>
            {hasChildren && (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                onPress={() => setCollapsed((c) => !c)}
                activeOpacity={0.7}
              >
                <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={12} color={threadColor} />
                <Text style={{ color: threadColor, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
                  {collapsed ? `${r.children!.length} ${r.children!.length === 1 ? "reply" : "replies"}` : "Hide"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
      {isTop && !hasChildren && (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.06)", marginLeft: indent + 44, marginRight: 0, marginTop: 4 }} />
      )}
      {!collapsed && r.children?.map((child) => (
        <VideoReplyItem key={child.id} reply={child} depth={depth + 1} onReplyTo={onReplyTo} />
      ))}
      {isTop && hasChildren && !collapsed && (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.06)", marginTop: 6, marginBottom: 2 }} />
      )}
    </>
  );
}

function CommentsSheet({
  visible,
  onClose,
  postId,
  onReplyCountChange,
}: {
  visible: boolean;
  onClose: () => void;
  postId: string;
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
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

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
          setReplies(
            data.map((r: any) => ({
              id: r.id,
              author_id: r.author_id,
              content: r.content || "",
              created_at: r.created_at,
              parent_reply_id: r.parent_reply_id || null,
              profile: {
                display_name: r.profiles?.display_name || "User",
                handle: r.profiles?.handle || "user",
                avatar_url: r.profiles?.avatar_url || null,
              },
            }))
          );
        }
        setLoading(false);
      });
  }, [postId]);

  useEffect(() => {
    if (!visible || !postId) return;
    setReplies([]);
    setLoading(true);
    setText("");
    setReplyingTo(null);
    loadReplies();
  }, [visible, postId, loadReplies]);

  useEffect(() => {
    if (!visible || !postId) return;
    const channel = supabase
      .channel(`video-comments:${postId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_replies", filter: `post_id=eq.${postId}` }, () => {
        loadReplies();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "post_replies", filter: `post_id=eq.${postId}` }, () => {
        loadReplies();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [visible, postId, loadReplies]);

  function handleReplyTo(reply: Reply) {
    setReplyingTo(reply);
    setText("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function sendReply() {
    if (!user || !text.trim()) return;
    setSending(true);
    const insertData: any = { post_id: postId, author_id: user.id, content: text.trim() };
    if (replyingTo) insertData.parent_reply_id = replyingTo.id;
    const { data, error } = await supabase
      .from("post_replies")
      .insert(insertData)
      .select("id, author_id, content, created_at, parent_reply_id")
      .single();
    if (!error && data) {
      const newReply: Reply = {
        id: data.id,
        author_id: data.author_id,
        content: data.content,
        created_at: data.created_at,
        parent_reply_id: data.parent_reply_id || null,
        profile: {
          display_name: profile?.display_name || "You",
          handle: profile?.handle || "you",
          avatar_url: profile?.avatar_url || null,
        },
      };
      setReplies((prev) => [...prev, newReply]);
      onReplyCountChange(postId, 1);
      if (replyingTo && replyingTo.author_id !== user.id) {
        notifyPostReply({
          postAuthorId: replyingTo.author_id,
          replierName: profile?.display_name || "Someone",
          replierUserId: user.id,
          postId,
          replyPreview: data.content,
        });
      }
      const wasThreaded = !!replyingTo;
      setText("");
      setReplyingTo(null);
      if (!wasThreaded) {
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    }
    setSending(false);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={cStyles.kavFull}>
        <Pressable style={cStyles.overlay} onPress={onClose}>
          <Pressable onPress={() => {}} style={[cStyles.container, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: "transparent" }]}>
            {Platform.OS === "ios" ? (
              <BlurView intensity={90} tint="dark" style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 18, borderTopRightRadius: 18 }]} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "#141418", borderTopLeftRadius: 18, borderTopRightRadius: 18 }]} />
            )}
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)" }} pointerEvents="none" />
            <View style={cStyles.handle} />
            <View style={cStyles.header}>
              <View style={{ width: 28 }} />
              <Text style={cStyles.title}>Comments</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>

            <View style={cStyles.middle}>
              {loading ? (
                <View style={cStyles.center}><ActivityIndicator color={accent} /></View>
              ) : replies.length === 0 ? (
                <View style={cStyles.center}>
                  <Ionicons name="chatbubble-outline" size={36} color="rgba(255,255,255,0.15)" />
                  <Text style={cStyles.emptyText}>No comments yet</Text>
                  <Text style={cStyles.emptySubtext}>Start the conversation</Text>
                </View>
              ) : (
                <FlatList
                  ref={listRef}
                  data={buildVideoReplyTree(replies)}
                  keyExtractor={(r) => r.id}
                  style={cStyles.list}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item: r }) => (
                    <VideoReplyItem reply={r} depth={0} onReplyTo={handleReplyTo} />
                  )}
                />
              )}
            </View>

            {user ? (
              <View>
                {replyingTo && (
                  <View style={cStyles.replyingBanner}>
                    <Text style={cStyles.replyingText}>
                      Replying to <Text style={{ color: accent }}>@{replyingTo.profile.handle}</Text>
                    </Text>
                    <TouchableOpacity onPress={() => { setReplyingTo(null); setText(""); }} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.35)" />
                    </TouchableOpacity>
                  </View>
                )}
                <View style={cStyles.inputRow}>
                  <Avatar uri={profile?.avatar_url} name={profile?.display_name || "You"} size={30} />
                  <View style={cStyles.inputWrap}>
                    <TextInput
                      ref={inputRef}
                      style={cStyles.input}
                      placeholder={replyingTo ? `Reply to @${replyingTo.profile.handle}...` : "Add a comment..."}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={text}
                      onChangeText={setText}
                      multiline
                      maxLength={500}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={sendReply}
                    disabled={!text.trim() || sending}
                    style={[cStyles.sendBtn, text.trim() ? [cStyles.sendBtnActive, { backgroundColor: accent }] : null]}
                  >
                    {sending ? (
                      <ActivityIndicator size={16} color="#fff" />
                    ) : (
                      <Ionicons name="arrow-up" size={18} color={text.trim() ? "#fff" : "rgba(255,255,255,0.3)"} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={cStyles.signIn} onPress={() => { onClose(); router.push("/(auth)/login"); }}>
                <Text style={[cStyles.signInText, { color: accent }]}>Sign in to comment</Text>
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
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  container: {
    backgroundColor: "#1a1a1d",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "70%",
    minHeight: 360,
    paddingHorizontal: 16,
    flexDirection: "column",
  },
  middle: { flex: 1 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginTop: 10, marginBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)" },
  title: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { color: "rgba(255,255,255,0.45)", fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  emptySubtext: { color: "rgba(255,255,255,0.25)", fontSize: 13, fontFamily: "Inter_400Regular" },
  list: { flex: 1, marginTop: 4 },
  replyRow: { flexDirection: "row", gap: 12, paddingVertical: 12 },
  replyBody: { flex: 1 },
  replyMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  replyName: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyTime: { color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "Inter_400Regular" },
  replyContent: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  replyToBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start" },
  replyToBtnText: { color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  replyingBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.08)" },
  replyingText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Inter_400Regular" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingTop: 12,
  },
  inputWrap: { flex: 1 },
  input: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 22,
    maxHeight: 88,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendBtnActive: {},
  signIn: { paddingVertical: 16, alignItems: "center" },
  signInText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

function GradientOverlay({ position, height: h }: { position: "top" | "bottom"; height: number }) {
  if (Platform.OS === "web") {
    const bg = position === "bottom"
      ? "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 40%, transparent 100%)"
      : "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)";
    return <View style={[{ position: "absolute", left: 0, right: 0, height: h, [position]: 0, pointerEvents: "none" as any }, { backgroundImage: bg } as any]} />;
  }
  const colors = position === "bottom"
    ? ["transparent", "rgba(0,0,0,0.3)", "rgba(0,0,0,0.75)"]
    : ["rgba(0,0,0,0.5)", "transparent"];
  return (
    <LinearGradient
      colors={colors}
      style={{ position: "absolute", left: 0, right: 0, height: h, [position]: 0, pointerEvents: "none" as any }}
    />
  );
}

function VideoItem({
  item,
  isActive,
  isNearActive,
  isLowData,
  screenH,
  screenW,
  isFollowing,
  isSelf,
  onLike,
  onBookmark,
  onOpenComments,
  onShare,
  onFollow,
  onRecordView,
  onOpenMenu,
  onOpenSound,
  activeToggleRef,
}: {
  item: VideoPost;
  isActive: boolean;
  isNearActive: boolean;
  isLowData: boolean;
  screenH: number;
  screenW: number;
  isFollowing: boolean;
  isSelf: boolean;
  onLike: (id: string, liked: boolean) => void;
  onBookmark: (id: string, bookmarked: boolean) => void;
  onOpenComments: (id: string) => void;
  onShare: (item: VideoPost) => void;
  onFollow: (authorId: string, isFollowing: boolean) => void;
  onRecordView: (postId: string) => void;
  onOpenMenu: (item: VideoPost) => void;
  onOpenSound: (item: VideoPost, albumArtUrl: string | null, trackArtist: string | null) => void;
  activeToggleRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const { accent } = useAppAccent();
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [progress, setProgress] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [cachedUri, setCachedUri] = useState<string | null>(null);
  const [manualPlay, setManualPlay] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null);
  const [trackArtist, setTrackArtist] = useState<string | null>(null);
  const heartScale = useRef(new Animated.Value(1)).current;
  const doubleTapHeart = useRef(new Animated.Value(0)).current;
  const watermarkSpin = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const cacheAttempted = useRef(false);

  // Desktop "card" layout (YouTube-Shorts-style centered video). On mobile and
  // small viewports we keep the existing edge-to-edge fullscreen experience.
  const isDesktop = Platform.OS === "web" && screenW >= 768;
  // 9:16 card sized to fit the visible area minus the header.
  const cardHeight = isDesktop
    ? Math.max(420, Math.min(screenH - 80, 880))
    : screenH;
  const cardWidth = isDesktop
    ? Math.min(Math.round(cardHeight * (9 / 16)), screenW - 240)
    : screenW;

  const isOriginalAudio = !item.audio_name || item.audio_name.toLowerCase().startsWith("original audio");
  const resolved = useResolvedVideoSource(item.id, item.video_url, { targetHeight: 720 });
  const playbackUri = cachedUri || resolved.uri || item.video_url;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(watermarkSpin, { toValue: 1, duration: 4000, useNativeDriver: USE_NATIVE })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    if (isOriginalAudio || !item.audio_name || albumArtUrl) return;
    fetch(`https://api.deezer.com/search?q=${encodeURIComponent(item.audio_name)}&limit=1`)
      .then((r) => r.json())
      .then((data) => {
        const track = data?.data?.[0];
        if (track) {
          setAlbumArtUrl(track.album?.cover_small || track.album?.cover || null);
          setTrackArtist(track.artist?.name || null);
        }
      })
      .catch(() => {});
  }, [item.audio_name, isOriginalAudio]);

  const viewRecorded = useRef(false);

  useEffect(() => {
    if (!isActive) {
      setPaused(false);
      setProgress(0);
      setExpanded(false);
      if (!cachedUri) {
        videoRef.current?.unloadAsync().catch(() => {});
      }
    } else {
      if (!viewRecorded.current) {
        viewRecorded.current = true;
        onRecordView(item.id);
      }
      if (!cacheAttempted.current && item.video_url) {
        cacheAttempted.current = true;
        getCachedVideoUri(item.video_url).then((existing) => {
          if (existing) {
            setCachedUri(existing);
          } else if (!isLowData) {
            cacheVideo(item.video_url).then((local) => {
              if (local) setCachedUri(local);
            });
          }
        });
      }
    }
  }, [isActive]);

  function onPlaybackStatus(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;
    setBuffering(status.isBuffering);
    if (status.durationMillis && status.durationMillis > 0) {
      setDurationMs(status.durationMillis);
      setProgress(status.positionMillis / status.durationMillis);
    }
  }

  async function seekToPercent(percent: number) {
    if (!durationMs || !videoRef.current) return;
    const targetMs = Math.max(0, Math.min(durationMs, durationMs * percent));
    await videoRef.current.setPositionAsync(targetMs).catch(() => {});
  }

  function handleProgressBarPress(locationX: number) {
    if (!progressBarWidth || progressBarWidth <= 0) return;
    const pct = Math.max(0, Math.min(1, locationX / progressBarWidth));
    seekToPercent(pct);
  }

  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      triggerLikeBurst();
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      setTimeout(() => {
        if (lastTap.current === now) {
          setPaused((p) => !p);
        }
      }, 300);
    }
  }

  function triggerLikeBurst() {
    if (!item.liked) {
      onLike(item.id, false);
    }
    Animated.sequence([
      Animated.timing(doubleTapHeart, { toValue: 1, duration: 150, useNativeDriver: USE_NATIVE }),
      Animated.delay(600),
      Animated.timing(doubleTapHeart, { toValue: 0, duration: 250, useNativeDriver: USE_NATIVE }),
    ]).start();
  }

  // When this card is the active one on web, register its pause toggle so the
  // page-level Space-key handler can reach it.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!isActive) return;
    if (!activeToggleRef) return;
    activeToggleRef.current = () => setPaused((p) => !p);
    return () => {
      if (activeToggleRef.current) activeToggleRef.current = null;
    };
  }, [isActive, activeToggleRef]);

  function handleLike() {
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 0.6, duration: 80, useNativeDriver: USE_NATIVE }),
      Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 7, useNativeDriver: USE_NATIVE }),
    ]).start();
    onLike(item.id, item.liked);
  }

  const showExpand = !!item.content && (item.content.split("\n").length > 2 || item.content.length > 120);

  const watermarkRotate = watermarkSpin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  // Mount the video for the active item AND its 2 neighbours so swipes feel
  // instant — neighbours preload metadata silently in the background. This
  // mirrors the ShortsFeed behaviour and is the main reason the Shorts tab
  // currently feels faster than this screen.
  const preloadOnly = !isActive && isNearActive;
  const shouldMountVideo = isActive || isNearActive;
  const canPlay = isActive && !paused && (!isLowData || !!cachedUri || manualPlay);

  return (
    <View
      style={[
        vStyles.item,
        {
          width: screenW,
          height: screenH,
          alignItems: isDesktop ? "center" : "stretch",
          justifyContent: isDesktop ? "center" : "flex-start",
        },
      ]}
    >
      <View
        style={[
          {
            width: cardWidth,
            height: cardHeight,
            backgroundColor: "#000",
            position: "relative",
            overflow: "hidden",
            borderRadius: isDesktop ? 16 : 0,
          },
        ]}
      >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={Platform.OS === "web" ? undefined : handleTap}
        onLongPress={() => onOpenMenu(item)}
        delayLongPress={380}
      >
        {shouldMountVideo ? (
          Platform.OS === "web" ? (
            <WebVideoPlayer
              src={playbackUri}
              poster={item.image_url}
              active={isActive}
              paused={paused || (isLowData && !cachedUri && !manualPlay)}
              preloadOnly={preloadOnly}
              onTogglePause={() => setPaused((p) => !p)}
              onDoubleTap={triggerLikeBurst}
              onProgress={(pos, dur) => {
                if (!dur) return;
                setDurationMs(dur);
                setProgress(pos / dur);
              }}
              onBuffering={setBuffering}
              externalRef={webVideoRef}
            />
          ) : (
            <Video
              ref={videoRef}
              source={{ uri: playbackUri }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={canPlay && !preloadOnly}
              isLooping
              isMuted={false}
              posterSource={item.image_url ? { uri: item.image_url } : undefined}
              usePosterImage={!!item.image_url}
              onPlaybackStatusUpdate={onPlaybackStatus}
            />
          )
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />
        )}
      </Pressable>

      {isActive && isLowData && !cachedUri && !manualPlay && (
        <TouchableOpacity
          style={vStyles.dataSaverGate}
          onPress={() => setManualPlay(true)}
          activeOpacity={0.85}
        >
          <View style={vStyles.dataSaverCircle}>
            <Ionicons name="play" size={36} color="#fff" style={{ marginLeft: 4 }} />
          </View>
          <Text style={vStyles.dataSaverLabel}>Tap to play</Text>
          <Text style={vStyles.dataSaverSub}>Data saver is on</Text>
        </TouchableOpacity>
      )}

      {buffering && isActive && (!isLowData || !!cachedUri || manualPlay) && (
        <View style={[vStyles.bufferOverlay, { pointerEvents: "none" as any }]}>
          <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
        </View>
      )}

      {paused && !buffering && (!isLowData || !!cachedUri || manualPlay) && (
        <View style={[vStyles.pauseOverlay, { pointerEvents: "none" as any }]}>
          <View style={vStyles.pauseCircle}>
            <Ionicons name="play" size={32} color="#fff" style={{ marginLeft: 3 }} />
          </View>
        </View>
      )}

      <Animated.View
        style={[vStyles.doubleTapHeart, {
          pointerEvents: "none" as any,
          opacity: doubleTapHeart,
          transform: [{
            scale: doubleTapHeart.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1.3, 1] }),
          }],
        }]}
      >
        <Ionicons name="heart" size={90} color="#FF3B30" />
      </Animated.View>

      <GradientOverlay position="bottom" height={360} />
      <GradientOverlay position="top" height={120} />

      <View style={[vStyles.bottomArea, { bottom: insets.bottom + 52 }]}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}
          style={vStyles.authorRow}
        >
          <View style={[vStyles.avatarWrap, { borderColor: accent }]}>
            <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={40} />
          </View>
          <View style={vStyles.authorInfo}>
            <Text style={vStyles.authorHandle}>@{item.profile.handle}</Text>
            <Text style={vStyles.authorName}>{item.profile.display_name}</Text>
          </View>
        </TouchableOpacity>

        {!!item.content && (
          <TouchableOpacity
            activeOpacity={showExpand ? 0.75 : 1}
            onPress={() => showExpand && setExpanded((e) => !e)}
            disabled={!showExpand}
            style={vStyles.captionWrap}
          >
            <RichText
              style={vStyles.caption}
              numberOfLines={expanded ? undefined : 2}
              linkColor="#00BCD4"
            >
              {item.content}
            </RichText>
            {showExpand && !expanded && (
              <Text style={vStyles.captionMore}>
                <Text style={vStyles.captionEllipsis}>... </Text>
                <Text style={vStyles.captionMoreLink}>more</Text>
              </Text>
            )}
            {showExpand && expanded && (
              <Text style={vStyles.captionLessLink}>less</Text>
            )}
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
            <TouchableOpacity
              style={[vStyles.followBadge, { backgroundColor: accent }, isFollowing && vStyles.followBadgeActive]}
              onPress={() => onFollow(item.author_id, isFollowing)}
              hitSlop={6}
            >
              <Ionicons name={isFollowing ? "checkmark" : "add"} size={14} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <Animated.View style={[vStyles.actionItem, { transform: [{ scale: heartScale }] }]}>
          <TouchableOpacity onPress={handleLike} hitSlop={10} style={vStyles.actionBtn}>
            <Ionicons
              name={item.liked ? "heart" : "heart-outline"}
              size={28}
              color={item.liked ? "#FF3B30" : "#fff"}
            />
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
            <Ionicons
              name={item.bookmarked ? "bookmark" : "bookmark-outline"}
              size={26}
              color={item.bookmarked ? accent : "#fff"}
            />
          </TouchableOpacity>
        </View>

        <View style={vStyles.actionItem}>
          <TouchableOpacity onPress={() => onShare(item)} hitSlop={10} style={vStyles.actionBtn}>
            <Ionicons name="share-social-outline" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

      </View>

      <TouchableOpacity
        activeOpacity={0.75}
        style={[vStyles.musicRow, { bottom: (insets.bottom > 0 ? insets.bottom : 0) + 6 }]}
        onPress={() => onOpenSound(item, albumArtUrl, trackArtist)}
      >
        <Animated.View style={[vStyles.watermarkDisc, { transform: [{ rotate: watermarkRotate }] }]}>
          {albumArtUrl ? (
            <ExpoImage source={{ uri: albumArtUrl }} style={vStyles.watermarkAlbumArt} contentFit="cover" />
          ) : (
            <View style={vStyles.watermarkInner}>
              <ExpoImage
                source={require("../../assets/images/afu-symbol.png")}
                style={vStyles.watermarkLogo}
                contentFit="contain"
              />
            </View>
          )}
        </Animated.View>
        <View style={vStyles.musicMarquee}>
          <Text style={vStyles.musicText} numberOfLines={1}>
            <Ionicons name="musical-note" size={11} color="rgba(255,255,255,0.75)" />
            {" "}{item.audio_name || `Original audio · ${item.profile.display_name}`}
          </Text>
          {trackArtist && (
            <Text style={vStyles.musicArtist} numberOfLines={1}>{trackArtist}</Text>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={1}
        style={[vStyles.progressBar, { bottom: insets.bottom > 0 ? insets.bottom : 0 }]}
        onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
        onPress={(e) => handleProgressBarPress(e.nativeEvent.locationX)}
        hitSlop={{ top: 10, bottom: 10 }}
      >
        <View style={[vStyles.progressFill, { width: `${progress * 100}%` }]} />
        <View style={[vStyles.progressThumb, { left: `${progress * 100}%` as any }]} />
      </TouchableOpacity>
      </View>
    </View>
  );
}

const vStyles = StyleSheet.create({
  item: { backgroundColor: "#000" },

  dataSaverGate: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    gap: 8,
  },
  dataSaverCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  dataSaverLabel: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  dataSaverSub: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: "Inter_400Regular" },
  bufferOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  pauseCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  doubleTapHeart: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  bottomArea: { position: "absolute", left: 16, right: 76, gap: 8 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  avatarWrap: {
    borderWidth: 2,
    borderRadius: 22,
    padding: 1,
  },
  authorInfo: { flex: 1 },
  authorHandle: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  authorName: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  captionWrap: {
    marginTop: 2,
  },
  caption: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  captionMore: {
    marginTop: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  captionEllipsis: {
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Inter_400Regular",
  },
  captionMoreLink: {
    color: "#00BCD4",
    fontFamily: "Inter_600SemiBold",
  },
  captionLessLink: {
    color: "#00BCD4",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    marginTop: 4,
  },
  viewRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  viewText: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "Inter_400Regular" },

  rightCol: { position: "absolute", right: 10, gap: 18, alignItems: "center" },
  rightAvatarContainer: { alignItems: "center", marginBottom: 6 },
  rightAvatarWrap: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 24,
    padding: 1,
  },
  followBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -11,
    borderWidth: 2,
    borderColor: "#000",
  },
  followBadgeActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  actionItem: { alignItems: "center", gap: 2 },
  actionBtn: { padding: 2 },
  actionLabel: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },

  musicRow: {
    position: "absolute",
    left: 16,
    right: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  musicMarquee: { flex: 1, overflow: "hidden" },
  musicText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },

  watermarkDisc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(0,188,212,0.5)",
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  watermarkInner: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  watermarkLogo: {
    width: 16,
    height: 16,
    tintColor: "#00BCD4",
  },
  watermarkAlbumArt: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  musicArtist: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },

  progressBar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 2,
  },
  progressThumb: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#fff",
    top: -4,
    marginLeft: -6,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 3,
  },
});

function SoundSheet({
  visible,
  item,
  albumArtUrl,
  trackArtist,
  onClose,
  onUseSound,
}: {
  visible: boolean;
  item: VideoPost | null;
  albumArtUrl: string | null;
  trackArtist: string | null;
  onClose: () => void;
  onUseSound: () => void;
}) {
  if (!visible || !item) return null;
  const isOriginal = !item.audio_name || item.audio_name.toLowerCase().startsWith("original audio");
  const displayName = item.audio_name || `Original audio · ${item.profile.display_name}`;
  const artistLine = trackArtist || (isOriginal ? item.profile.display_name : null);

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
            {artistLine && <Text style={soundStyles.trackArtist}>{artistLine}</Text>}
            {!isOriginal && <View style={soundStyles.knownBadge}><Text style={soundStyles.knownBadgeText}>🎵 Identified track</Text></View>}
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
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 20 },
  artRow: { flexDirection: "row", gap: 16, alignItems: "flex-start", marginBottom: 16 },
  artWrap: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  art: { width: 84, height: 84, borderRadius: 10 },
  artFallback: { backgroundColor: "rgba(0,188,212,0.12)", borderWidth: 1, borderColor: "rgba(0,188,212,0.25)", alignItems: "center", justifyContent: "center" },
  trackInfo: { flex: 1, justifyContent: "center", gap: 4 },
  trackName: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 20 },
  trackArtist: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontFamily: "Inter_400Regular" },
  knownBadge: { alignSelf: "flex-start", backgroundColor: "rgba(0,188,212,0.15)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2, borderWidth: 1, borderColor: "rgba(0,188,212,0.25)" },
  knownBadgeText: { color: "#00BCD4", fontSize: 11, fontFamily: "Inter_500Medium" },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
  statsText: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular" },
  useBtn: {
    backgroundColor: "#00BCD4",
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  useBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  cancelBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

const SOCIAL_PLATFORMS = [
  { id: "whatsapp",  label: "WhatsApp",  icon: "logo-whatsapp",   color: "#25D366", scheme: (url: string) => `https://wa.me/?text=${encodeURIComponent(url)}` },
  { id: "telegram",  label: "Telegram",  icon: "paper-plane",     color: "#0088CC", scheme: (url: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}` },
  { id: "twitter",   label: "X",         icon: "logo-twitter",    color: "#000",    scheme: (url: string) => `https://x.com/intent/tweet?text=${encodeURIComponent(url)}` },
  { id: "facebook",  label: "Facebook",  icon: "logo-facebook",   color: "#1877F2", scheme: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  { id: "instagram", label: "Instagram", icon: "logo-instagram",  color: "#E1306C", scheme: (_: string) => `instagram://app` },
  { id: "tiktok",    label: "TikTok",    icon: "musical-notes",   color: "#010101", scheme: (_: string) => `tiktok://` },
  { id: "copy",      label: "Copy link", icon: "link-outline",    color: "#555",    scheme: null },
  { id: "more",      label: "More",      icon: "share-social",    color: "#00BCD4", scheme: null },
];

function SocialShareSheet({ visible, onClose, url, title }: { visible: boolean; onClose: () => void; url: string; title: string }) {
  if (!visible) return null;

  async function handlePlatform(p: typeof SOCIAL_PLATFORMS[number]) {
    if (p.id === "copy") {
      Clipboard.setString(url);
      onClose();
      return;
    }
    if (p.id === "more") {
      onClose();
      setTimeout(async () => {
        await Share.share({ message: `${title} ${url}`, url, title });
      }, 300);
      return;
    }
    onClose();
    const deepUrl = p.scheme!(url);
    const canOpen = await Linking.canOpenURL(deepUrl).catch(() => false);
    if (canOpen) {
      await Linking.openURL(deepUrl).catch(() => {});
    } else {
      await Share.share({ message: `${title} ${url}`, url, title });
    }
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
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 14 },
  title: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center", marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  cell: { width: 72, alignItems: "center", gap: 6 },
  iconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  cellLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  cancelBtn: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

function VideoContextMenu({
  visible,
  item,
  onClose,
  onShare,
  onRepost,
  onDownload,
  onCopyLink,
  onNotInterested,
  onReport,
}: {
  visible: boolean;
  item: VideoPost | null;
  onClose: () => void;
  onShare: () => void;
  onRepost: () => void;
  onDownload: () => void;
  onCopyLink: () => void;
  onNotInterested: () => void;
  onReport: () => void;
}) {
  if (!visible || !item) return null;

  const OPTIONS = [
    { id: "download",       label: "Save to device",   icon: "download-outline",        action: onDownload,       color: "#fff" },
    { id: "share",          label: "Share to...",      icon: "share-social-outline",    action: onShare,          color: "#fff" },
    { id: "repost",         label: "Repost",           icon: "repeat-outline",          action: onRepost,         color: "#fff" },
    { id: "copylink",       label: "Copy link",        icon: "link-outline",            action: onCopyLink,       color: "#fff" },
    { id: "notinterested",  label: "Not interested",   icon: "eye-off-outline",         action: onNotInterested,  color: "rgba(255,255,255,0.65)" },
    { id: "report",         label: "Report",           icon: "flag-outline",            action: onReport,         color: "#FF453A" },
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
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 14 },
  authorPreview: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  previewHandle: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  previewCaption: { color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 14,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, color: "#fff", fontSize: 15, fontFamily: "Inter_500Medium" },
  cancelBtn: {
    marginTop: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

export default function VideoPlayerScreen() {
  const { accent } = useAppAccent();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  const { isLowData } = useDataMode();

  const [videoTab, setVideoTab] = useState<"for_you" | "following">("for_you");
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [menuItem, setMenuItem] = useState<VideoPost | null>(null);
  const [shareSheetItem, setShareSheetItem] = useState<VideoPost | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const [soundSheetData, setSoundSheetData] = useState<{ item: VideoPost; albumArtUrl: string | null; trackArtist: string | null } | null>(null);
  const listRef = useRef<FlatList>(null);
  const initialScrollDone = useRef(false);
  const tabAnim = useRef(new Animated.Value(0)).current;
  // Pause toggle exposed by the *currently active* card so keyboard handlers
  // (Space) can drive it without prop-drilling through the card tree.
  const activeToggleRef = useRef<(() => void) | null>(null);

  // Web-only keyboard controls:
  //   • Space  → toggle pause/play on the active video (and prevent the
  //              browser's default page-scroll behaviour).
  //   • ArrowDown / ArrowUp / PageDown / PageUp / Home / End fall through to
  //     the FlatList so the existing snap-scroll behaviour acts as the
  //     "scroll" the user expects.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t as any).isContentEditable) {
          return;
        }
      }
      if (e.code === "Space" || e.key === " ") {
        if (activeToggleRef.current) {
          e.preventDefault();
          activeToggleRef.current();
        }
        return;
      }
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        const next = Math.min(activeIndex + 1, Math.max(videos.length - 1, 0));
        if (next !== activeIndex) {
          listRef.current?.scrollToIndex({ index: next, animated: true });
        }
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        const prev = Math.max(activeIndex - 1, 0);
        if (prev !== activeIndex) {
          listRef.current?.scrollToIndex({ index: prev, animated: true });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, videos.length]);

  function switchTab(tab: "for_you" | "following") {
    if (tab === videoTab) return;
    if (tab === "following" && !user) {
      router.push("/(auth)/login");
      return;
    }
    Animated.timing(tabAnim, { toValue: tab === "following" ? 1 : 0, duration: 200, useNativeDriver: false }).start();
    initialScrollDone.current = false;
    setActiveIndex(0);
    setVideoTab(tab);
  }

  const fetchVideos = useCallback(async (tab: "for_you" | "following") => {
    setLoading(true);
    setVideos([]);

    let query = supabase
      .from("posts")
      .select(`
        id, author_id, content, video_url, image_url, created_at, audio_name,
        profiles!posts_author_id_fkey(display_name, handle, avatar_url)
      `)
      .eq("post_type", "video")
      .eq("is_blocked", false)
      .not("video_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (tab === "following" && user) {
      const { data: followData } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);
      const followingIds = (followData || []).map((f: any) => f.following_id);
      if (followingIds.length === 0) {
        setVideos([]);
        setLoading(false);
        return;
      }
      query = query.in("author_id", followingIds).in("visibility", ["public", "followers"]);
    } else {
      query = query.eq("visibility", "public");
    }

    const { data } = await query;

    if (data && data.length > 0) {
      const postIds = data.map((p: any) => p.id);
      const authorIds = [...new Set(data.map((p: any) => p.author_id))] as string[];

      const [
        { data: likesData },
        { data: repliesData },
        { data: viewsData },
        { data: myLikes },
        { data: myBookmarks },
        { data: myFollows },
        { data: myRecentLikes },
      ] = await Promise.all([
        supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
        supabase.from("post_replies").select("post_id").in("post_id", postIds),
        supabase.from("post_views").select("post_id").in("post_id", postIds),
        user
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id)
          : { data: [] },
        user
          ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id)
          : { data: [] },
        user
          ? supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", authorIds)
          : { data: [] },
        user
          ? supabase.from("post_acknowledgments")
              .select("post_id")
              .eq("user_id", user.id)
              .gte("created_at", new Date(Date.now() - 30 * 24 * 3600000).toISOString())
              .limit(300)
          : { data: [] },
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

      // Build preferred author affinity: authors whose content in the feed the user previously liked
      const likedAuthorIds = new Set(
        data
          .filter((p: any) => myRecentLikeSet.has(p.id))
          .map((p: any) => p.author_id as string)
      );
      const followedSet = new Set((myFollows || []).map((f: any) => f.following_id as string));

      const mapped: VideoPost[] = data.map((p: any) => ({
        id: p.id,
        author_id: p.author_id,
        content: p.content || "",
        video_url: p.video_url,
        image_url: p.image_url || null,
        created_at: p.created_at,
        view_count: viewMap[p.id] || 0,
        audio_name: p.audio_name || null,
        profile: {
          display_name: p.profiles?.display_name || "User",
          handle: p.profiles?.handle || "user",
          avatar_url: p.profiles?.avatar_url || null,
        },
        liked: myLikeSet.has(p.id),
        bookmarked: myBookmarkSet.has(p.id),
        likeCount: likeMap[p.id] || 0,
        replyCount: replyMap[p.id] || 0,
      }));

      // ── Personalised ranking algorithm ──────────────────────────────────
      const now = Date.now();
      const scored = mapped.map((v) => {
        const ageHours = (now - new Date(v.created_at).getTime()) / 3600000;
        const engagement = v.likeCount * 3 + v.replyCount * 2 + v.view_count * 0.3;

        // Engagement quality (log scale to avoid viral monopoly)
        let score = Math.log1p(engagement) * 25;

        // Recency: content under 24h gets a big boost, decays over 7 days
        const recency = Math.max(0, 1 - ageHours / 168);
        score += recency * 45;

        // Personalisation: author the user has liked before
        if (likedAuthorIds.has(v.author_id)) score += 55;

        // Following boost (strong signal)
        if (followedSet.has(v.author_id)) score += 40;

        // Already liked by user: slight de-rank (seen, engaged, move on)
        if (v.liked) score -= 10;

        // Bookmarked: user saved it, don't re-show as much
        if (v.bookmarked) score -= 5;

        // Add a tiny random factor so feed feels fresh on every load
        score += Math.random() * 8;

        return { video: v, score };
      });

      scored.sort((a, b) => b.score - a.score);
      setVideos(scored.map((s) => s.video));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchVideos(videoTab); }, [fetchVideos, videoTab]);

  useEffect(() => {
    if (!loading && videos.length > 0 && id && !initialScrollDone.current) {
      const idx = videos.findIndex((v) => v.id === id);
      if (idx > 0) {
        // Slice the list so the tapped video is always at index 0 — no
        // "unplayed" videos appear above it.  Newer posts (idx 0..idx-1) are
        // discarded; the user can load a fresh feed when they come back.
        setVideos((prev) => prev.slice(idx));
        setActiveIndex(0);
        // No scrollToIndex needed — position 0 is the default.
      }
      initialScrollDone.current = true;
    }
  }, [loading, videos, id]);

  useEffect(() => {
    const channel = supabase
      .channel("video-feed-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "post_acknowledgments" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        supabase.from("post_acknowledgments").select("id", { count: "exact", head: true }).eq("post_id", postId)
          .then(({ count }) => {
            setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, likeCount: count || 0 } : v));
          });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_replies" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        supabase.from("post_replies").select("id", { count: "exact", head: true }).eq("post_id", postId)
          .then(({ count }) => {
            setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, replyCount: count || 0 } : v));
          });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setActiveIndex(viewableItems[0].index);
    }
  }, []);

  async function handleLike(postId: string, currentlyLiked: boolean) {
    if (!user) { router.push("/(auth)/login"); return; }
    const post = videos.find((v) => v.id === postId);
    if (!post) return;
    if (currentlyLiked) {
      await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: false, likeCount: Math.max(0, v.likeCount - 1) } : v));
    } else {
      await supabase.from("post_acknowledgments").insert({ post_id: postId, user_id: user.id });
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: true, likeCount: v.likeCount + 1 } : v));
      if (post.author_id !== user.id) {
        notifyPostLike({ postAuthorId: post.author_id, likerName: profile?.display_name || "Someone", likerUserId: user.id, postId });
      }
    }
  }

  async function handleBookmark(postId: string, currentlyBookmarked: boolean) {
    if (!user) { router.push("/(auth)/login"); return; }
    if (currentlyBookmarked) {
      await supabase.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", user.id);
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, bookmarked: false } : v));
    } else {
      await supabase.from("post_bookmarks").upsert({ post_id: postId, user_id: user.id }, { onConflict: "post_id,user_id" });
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, bookmarked: true } : v));
    }
  }

  function getVideoUrl(item: VideoPost): string {
    return Platform.OS === "web" && typeof window !== "undefined"
      ? `${window.location.origin}/video/${item.id}`
      : `https://afuchat.com/video/${item.id}`;
  }

  async function handleShare(item: VideoPost) {
    setShareSheetItem(item);
  }

  async function handleRepost(item: VideoPost) {
    const postUrl = getVideoUrl(item);
    try {
      await Share.share({
        message: `🔁 Reposting: ${item.profile.display_name} on AfuChat\n${postUrl}`,
        url: postUrl,
        title: `Repost from AfuChat`,
      });
    } catch {}
  }

  function showToast(msg: string, durationMs = 2500) {
    setDownloadToast(msg);
    setTimeout(() => setDownloadToast(null), durationMs);
  }

  async function handleDownload(item: VideoPost) {
    if (downloading) return;
    if (Platform.OS === "web") {
      // Browser-native download — let the URL stream straight to the user's
      // Downloads folder via an anchor with the `download` attribute.
      try {
        const ext =
          item.video_url.split("?")[0].split(".").pop()?.toLowerCase() || "mp4";
        const a = document.createElement("a");
        a.href = item.video_url;
        a.download = `afuchat_${item.id}.${ext}`;
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast("⬇ Download started");
      } catch {
        showToast("Couldn't start download");
      }
      return;
    }
    setDownloading(true);
    showToast("⬇ Saving to device…", 30000);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        setDownloading(false);
        setDownloadToast(null);
        Alert.alert(
          "Permission needed",
          "Please allow photo/media library access in Settings to save videos.",
          [{ text: "OK" }]
        );
        return;
      }
      const ext = item.video_url.split("?")[0].split(".").pop()?.toLowerCase() || "mp4";
      const dest = (FileSystem.cacheDirectory ?? "") + `afuchat_dl_${item.id}.${ext}`;
      const { uri } = await FileSystem.downloadAsync(item.video_url, dest);
      await MediaLibrary.createAssetAsync(uri);
      await FileSystem.deleteAsync(uri, { idempotent: true });
      setDownloading(false);
      showToast("✓ Saved to your device");
    } catch {
      setDownloading(false);
      setDownloadToast(null);
      Alert.alert("Download failed", "Could not save the video. Please try again.", [{ text: "OK" }]);
    }
  }

  function handleCopyLink(item: VideoPost) {
    const url = getVideoUrl(item);
    Clipboard.setString(url);
    showToast("Link copied to clipboard");
  }

  function handleNotInterested(item: VideoPost) {
    setVideos((prev) => prev.filter((v) => v.id !== item.id));
    showToast("Video removed from feed");
  }

  function handleReport(item: VideoPost) {
    Alert.alert(
      "Report video",
      "Why are you reporting this video?",
      [
        { text: "Spam", onPress: () => showToast("Report submitted — thanks") },
        { text: "Inappropriate content", onPress: () => showToast("Report submitted — thanks") },
        { text: "Misinformation", onPress: () => showToast("Report submitted — thanks") },
        { text: "Cancel", style: "cancel" },
      ]
    );
  }

  function handleOpenMenu(item: VideoPost) {
    setMenuItem(item);
  }

  function handleOpenSound(item: VideoPost, albumArtUrl: string | null, trackArtist: string | null) {
    setSoundSheetData({ item, albumArtUrl, trackArtist });
  }

  function handleUseSound(item: VideoPost, albumArtUrl: string | null) {
    const soundName = item.audio_name || `Original audio · ${item.profile.display_name}`;
    const params: Record<string, string> = { soundName };
    if (albumArtUrl) params.soundAlbumArt = albumArtUrl;
    params.remixPostId = item.id;
    router.push({ pathname: "/moments/create-video", params });
  }

  async function handleFollow(authorId: string, isFollowing: boolean) {
    if (!user) { router.push("/(auth)/login"); return; }
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", authorId);
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: authorId });
    }
    setFollowingSet((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(authorId);
      else next.add(authorId);
      return next;
    });
  }

  function handleReplyCountChange(postId: string, delta: number) {
    setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, replyCount: v.replyCount + delta } : v));
  }

  const indicatorLeft = tabAnim.interpolate({ inputRange: [0, 1], outputRange: ["25%", "75%"] });

  const recordedViews = useRef(new Set<string>());

  const handleRecordView = useCallback(async (postId: string) => {
    if (!user || recordedViews.current.has(postId)) return;
    recordedViews.current.add(postId);
    const { error } = await supabase.from("post_views").insert(
      { post_id: postId, viewer_id: user.id }
    );
    if (!error) {
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, view_count: v.view_count + 1 } : v));
    }
  }, [user]);

  if (loading) {
    return (
      <View style={mStyles.center}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

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
          <View style={mStyles.emptyIcon}>
            <Ionicons name="videocam-outline" size={44} color="rgba(255,255,255,0.25)" />
          </View>
          <Text style={mStyles.emptyTitle}>No videos yet</Text>
          <Text style={mStyles.emptySubtitle}>
            {videoTab === "following" ? "Follow creators to see their videos here" : "Videos will appear here soon"}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={videos}
          keyExtractor={(v) => v.id}
          renderItem={({ item, index }) => {
            const isActive = index === activeIndex;
            // On cellular: only mount Video for the active item.
            // On Wi-Fi: also preload BOTH neighbours (prev + next) so swipes
            // in either direction feel instant — this matches the ShortsFeed
            // behaviour and is critical for the perceived speed.
            const distance = Math.abs(index - activeIndex);
            const isNearActive = isLowData ? isActive : distance <= 2;
            return (
              <VideoItem
                item={item}
                isActive={isActive}
                isNearActive={isNearActive}
                isLowData={isLowData}
                screenH={SCREEN_H}
                screenW={SCREEN_W}
                isFollowing={followingSet.has(item.author_id)}
                isSelf={user?.id === item.author_id}
                onLike={handleLike}
                onBookmark={handleBookmark}
                onOpenComments={setCommentPostId}
                onShare={handleShare}
                onFollow={handleFollow}
                onRecordView={handleRecordView}
                onOpenMenu={handleOpenMenu}
                onOpenSound={handleOpenSound}
                activeToggleRef={activeToggleRef}
              />
            );
          }}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({ length: SCREEN_H, offset: SCREEN_H * index, index })}
          decelerationRate="fast"
          snapToAlignment="start"
          snapToInterval={SCREEN_H}
          windowSize={5}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index: info.index, animated: false });
            }, 300);
          }}
        />
      )}

      <CommentsSheet
        visible={!!commentPostId}
        onClose={() => setCommentPostId(null)}
        postId={commentPostId || ""}
        onReplyCountChange={handleReplyCountChange}
      />

      <VideoContextMenu
        visible={!!menuItem}
        item={menuItem}
        onClose={() => setMenuItem(null)}
        onShare={() => menuItem && setShareSheetItem(menuItem)}
        onRepost={() => menuItem && handleRepost(menuItem)}
        onDownload={() => menuItem && handleDownload(menuItem)}
        onCopyLink={() => menuItem && handleCopyLink(menuItem)}
        onNotInterested={() => { if (menuItem) { setMenuItem(null); handleNotInterested(menuItem); } }}
        onReport={() => menuItem && handleReport(menuItem)}
      />

      <SocialShareSheet
        visible={!!shareSheetItem}
        onClose={() => setShareSheetItem(null)}
        url={shareSheetItem ? getVideoUrl(shareSheetItem) : ""}
        title={shareSheetItem ? `${shareSheetItem.profile.display_name} on AfuChat` : ""}
      />

      <SoundSheet
        visible={!!soundSheetData}
        item={soundSheetData?.item ?? null}
        albumArtUrl={soundSheetData?.albumArtUrl ?? null}
        trackArtist={soundSheetData?.trackArtist ?? null}
        onClose={() => setSoundSheetData(null)}
        onUseSound={() => {
          if (soundSheetData) handleUseSound(soundSheetData.item, soundSheetData.albumArtUrl);
        }}
      />

      {!!downloadToast && (
        <View style={mStyles.downloadToast} pointerEvents="none" accessibilityElementsHidden>
          <Text style={mStyles.downloadToastText}>{downloadToast}</Text>
        </View>
      )}
    </View>
  );
}

const mStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    ...(Platform.OS === "web" ? { position: "absolute" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 } : {}),
  } as any,
  center: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { position: "absolute" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 } : {}),
  } as any,

  headerRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  headerSide: { width: 36, alignItems: "center" },
  tabRow: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", position: "relative" },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  tabDivider: { width: 1, height: 14, backgroundColor: "rgba(255,255,255,0.2)" },
  tabText: { color: "rgba(255,255,255,0.5)", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  tabTextActive: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#fff",
  },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: { color: "rgba(255,255,255,0.6)", fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySubtitle: { color: "rgba(255,255,255,0.3)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  downloadToast: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  downloadToastText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: "hidden",
  },
});
