import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { notifyPostLike } from "@/lib/notifyUser";

type VideoPost = {
  id: string;
  author_id: string;
  content: string;
  video_url: string;
  created_at: string;
  view_count: number;
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
  profile: { display_name: string; handle: string; avatar_url: string | null };
};

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
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!visible || !postId) return;
    setLoading(true);
    supabase
      .from("post_replies")
      .select("id, author_id, content, created_at, profiles!post_replies_author_id_fkey(display_name, handle, avatar_url)")
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
  }, [visible, postId]);

  async function sendReply() {
    if (!user || !text.trim()) return;
    setSending(true);
    const { data, error } = await supabase
      .from("post_replies")
      .insert({ post_id: postId, author_id: user.id, content: text.trim() })
      .select("id, author_id, content, created_at")
      .single();
    if (!error && data) {
      const newReply: Reply = {
        id: data.id,
        author_id: data.author_id,
        content: data.content,
        created_at: data.created_at,
        profile: {
          display_name: profile?.display_name || "You",
          handle: profile?.handle || "you",
          avatar_url: profile?.avatar_url || null,
        },
      };
      setReplies((prev) => [...prev, newReply]);
      onReplyCountChange(postId, 1);
      setText("");
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
    setSending(false);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={cs.overlay} activeOpacity={1} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={cs.keyboard}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={[cs.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <View style={cs.handle} />
              <View style={cs.header}>
                <View style={{ width: 28 }} />
                <Text style={cs.title}>Comments</Text>
                <TouchableOpacity onPress={onClose} hitSlop={12}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
              </View>

              {loading ? (
                <View style={cs.center}><ActivityIndicator color={Colors.brand} /></View>
              ) : replies.length === 0 ? (
                <View style={cs.center}>
                  <Ionicons name="chatbubble-outline" size={36} color="rgba(255,255,255,0.15)" />
                  <Text style={cs.emptyText}>No comments yet</Text>
                  <Text style={cs.emptySubtext}>Start the conversation</Text>
                </View>
              ) : (
                <FlatList
                  ref={listRef}
                  data={replies}
                  keyExtractor={(r) => r.id}
                  style={cs.list}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item: r }) => (
                    <View style={cs.replyRow}>
                      <Avatar uri={r.profile.avatar_url} name={r.profile.display_name} size={34} />
                      <View style={cs.replyBody}>
                        <View style={cs.replyMeta}>
                          <Text style={cs.replyName}>{r.profile.display_name}</Text>
                          <Text style={cs.replyTime}>{formatRelative(r.created_at)}</Text>
                        </View>
                        <Text style={cs.replyContent}>{r.content}</Text>
                      </View>
                    </View>
                  )}
                />
              )}

              {user ? (
                <View style={cs.inputRow}>
                  <Avatar uri={profile?.avatar_url} name={profile?.display_name || "You"} size={30} />
                  <View style={cs.inputWrap}>
                    <TextInput
                      style={cs.input}
                      placeholder="Add a comment..."
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
                    style={[cs.sendBtn, text.trim() ? cs.sendBtnActive : null]}
                  >
                    {sending ? (
                      <ActivityIndicator size={16} color="#fff" />
                    ) : (
                      <Ionicons name="arrow-up" size={18} color={text.trim() ? "#fff" : "rgba(255,255,255,0.3)"} />
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={cs.signIn} onPress={() => { onClose(); router.push("/(auth)/login"); }}>
                  <Text style={cs.signInText}>Sign in to comment</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

const cs = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  keyboard: { justifyContent: "flex-end" },
  container: {
    backgroundColor: "#1a1a1d",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "60%",
    minHeight: 340,
    paddingHorizontal: 16,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginTop: 10, marginBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)" },
  title: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },
  center: { paddingVertical: 48, alignItems: "center", gap: 8 },
  emptyText: { color: "rgba(255,255,255,0.45)", fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  emptySubtext: { color: "rgba(255,255,255,0.25)", fontSize: 13, fontFamily: "Inter_400Regular" },
  list: { flex: 1, marginTop: 4 },
  replyRow: { flexDirection: "row", gap: 12, paddingVertical: 12 },
  replyBody: { flex: 1 },
  replyMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  replyName: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyTime: { color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "Inter_400Regular" },
  replyContent: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
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
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
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
  sendBtnActive: { backgroundColor: Colors.brand },
  signIn: { paddingVertical: 16, alignItems: "center" },
  signInText: { color: Colors.brand, fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

function VideoItem({
  item,
  isActive,
  screenH,
  screenW,
  isFollowing,
  isSelf,
  onLike,
  onBookmark,
  onOpenComments,
  onShare,
  onFollow,
}: {
  item: VideoPost;
  isActive: boolean;
  screenH: number;
  screenW: number;
  isFollowing: boolean;
  isSelf: boolean;
  onLike: (id: string, liked: boolean) => void;
  onBookmark: (id: string, bookmarked: boolean) => void;
  onOpenComments: (id: string) => void;
  onShare: (item: VideoPost) => void;
  onFollow: (authorId: string, isFollowing: boolean) => void;
}) {
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const doubleTapHeart = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);

  function onPlaybackStatus(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;
    setBuffering(status.isBuffering);
    if (status.durationMillis && status.durationMillis > 0) {
      setProgress(status.positionMillis / status.durationMillis);
    }
  }

  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!item.liked) {
        onLike(item.id, false);
      }
      Animated.sequence([
        Animated.timing(doubleTapHeart, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.delay(600),
        Animated.timing(doubleTapHeart, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
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

  function handleLike() {
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 0.6, duration: 80, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 7, useNativeDriver: true }),
    ]).start();
    onLike(item.id, item.liked);
  }

  const captionLines = item.content ? item.content.split("\n").length : 0;
  const showExpand = captionLines > 2 || (item.content && item.content.length > 100);

  return (
    <View style={[vs.item, { width: screenW, height: screenH }]}>
      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={StyleSheet.absoluteFill}>
          <Video
            ref={videoRef}
            source={{ uri: item.video_url }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={isActive && !paused}
            isLooping
            isMuted={muted}
            onPlaybackStatusUpdate={onPlaybackStatus}
          />
        </View>
      </TouchableWithoutFeedback>

      {buffering && isActive && (
        <View style={vs.bufferOverlay} pointerEvents="none">
          <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
        </View>
      )}

      {paused && !buffering && (
        <View style={vs.pauseOverlay} pointerEvents="none">
          <View style={vs.pauseCircle}>
            <Ionicons name="play" size={32} color="#fff" style={{ marginLeft: 3 }} />
          </View>
        </View>
      )}

      <Animated.View
        style={[vs.doubleTapHeart, {
          opacity: doubleTapHeart,
          transform: [{
            scale: doubleTapHeart.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1.3, 1] }),
          }],
        }]}
        pointerEvents="none"
      >
        <Ionicons name="heart" size={90} color="#FF3B30" />
      </Animated.View>

      <View style={vs.gradientBottom} pointerEvents="none" />
      <View style={vs.gradientTop} pointerEvents="none" />

      <View style={[vs.bottomArea, { bottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}
          style={vs.authorRow}
        >
          <View style={vs.avatarWrap}>
            <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={40} />
          </View>
          <View style={vs.authorInfo}>
            <Text style={vs.authorHandle}>@{item.profile.handle}</Text>
            <Text style={vs.authorName}>{item.profile.display_name}</Text>
          </View>
        </TouchableOpacity>

        {!!item.content && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => showExpand && setExpanded((e) => !e)}
            disabled={!showExpand}
          >
            <Text style={vs.caption} numberOfLines={expanded ? undefined : 2}>
              {item.content}
            </Text>
            {showExpand && !expanded && (
              <Text style={vs.seeMore}>more</Text>
            )}
          </TouchableOpacity>
        )}

        {item.view_count > 0 && (
          <View style={vs.viewRow}>
            <Ionicons name="eye-outline" size={13} color="rgba(255,255,255,0.4)" />
            <Text style={vs.viewText}>{formatCount(item.view_count)} views</Text>
          </View>
        )}
      </View>

      <View style={[vs.rightCol, { bottom: insets.bottom + 28 }]}>
        <View style={vs.rightAvatarContainer}>
          <View style={vs.rightAvatarWrap}>
            <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}>
              <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={44} />
            </TouchableOpacity>
          </View>
          {!isSelf && (
            <TouchableOpacity
              style={[vs.followBadge, isFollowing && vs.followBadgeActive]}
              onPress={() => onFollow(item.author_id, isFollowing)}
              hitSlop={6}
            >
              <Ionicons name={isFollowing ? "checkmark" : "add"} size={14} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <Animated.View style={[vs.actionItem, { transform: [{ scale: heartScale }] }]}>
          <TouchableOpacity onPress={handleLike} hitSlop={10} style={vs.actionBtn}>
            <Ionicons
              name={item.liked ? "heart" : "heart-outline"}
              size={28}
              color={item.liked ? "#FF3B30" : "#fff"}
            />
          </TouchableOpacity>
          <Text style={vs.actionLabel}>{formatCount(item.likeCount)}</Text>
        </Animated.View>

        <View style={vs.actionItem}>
          <TouchableOpacity onPress={() => onOpenComments(item.id)} hitSlop={10} style={vs.actionBtn}>
            <Ionicons name="chatbubble-ellipses" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={vs.actionLabel}>{formatCount(item.replyCount)}</Text>
        </View>

        <View style={vs.actionItem}>
          <TouchableOpacity onPress={() => onBookmark(item.id, item.bookmarked)} hitSlop={10} style={vs.actionBtn}>
            <Ionicons
              name={item.bookmarked ? "bookmark" : "bookmark-outline"}
              size={26}
              color={item.bookmarked ? Colors.brand : "#fff"}
            />
          </TouchableOpacity>
        </View>

        <View style={vs.actionItem}>
          <TouchableOpacity onPress={() => onShare(item)} hitSlop={10} style={vs.actionBtn}>
            <Ionicons name="share-social-outline" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => setMuted((m) => !m)} hitSlop={10} style={vs.muteBtn}>
          <Ionicons name={muted ? "volume-mute" : "volume-high-outline"} size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[vs.progressBar, { bottom: insets.bottom > 0 ? insets.bottom : 0 }]}>
        <View style={[vs.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const vs = StyleSheet.create({
  item: { backgroundColor: "#000" },

  gradientBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 360,
    ...(Platform.OS === "web"
      ? { backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 40%, transparent 100%)" }
      : { backgroundColor: "transparent" }),
  } as any,
  gradientTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    ...(Platform.OS === "web"
      ? { backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)" }
      : { backgroundColor: "transparent" }),
  } as any,

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
    borderColor: Colors.brand,
    borderRadius: 22,
    padding: 1,
  },
  authorInfo: { flex: 1 },
  authorHandle: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    ...(Platform.OS === "web" ? { textShadow: "0 1px 4px rgba(0,0,0,0.5)" } : {}),
  } as any,
  authorName: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
    ...(Platform.OS === "web" ? { textShadow: "0 1px 3px rgba(0,0,0,0.5)" } : {}),
  } as any,
  caption: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    ...(Platform.OS === "web" ? { textShadow: "0 1px 3px rgba(0,0,0,0.4)" } : {}),
  } as any,
  seeMore: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
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
    backgroundColor: Colors.brand,
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
    ...(Platform.OS === "web" ? { textShadow: "0 1px 2px rgba(0,0,0,0.5)" } : {}),
  } as any,

  muteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  progressBar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 1,
  },
});

export default function VideoPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();

  const [videoTab, setVideoTab] = useState<"for_you" | "following">("for_you");
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const listRef = useRef<FlatList>(null);
  const initialScrollDone = useRef(false);
  const tabAnim = useRef(new Animated.Value(0)).current;

  function switchTab(tab: "for_you" | "following") {
    if (tab === "following" && !user) {
      router.push("/(auth)/login");
      return;
    }
    Animated.timing(tabAnim, { toValue: tab === "following" ? 1 : 0, duration: 200, useNativeDriver: false }).start();
    setVideoTab(tab);
  }

  const fetchVideos = useCallback(async (tab: "for_you" | "following") => {
    setLoading(true);
    setVideos([]);

    let query = supabase
      .from("posts")
      .select(`
        id, author_id, content, video_url, created_at, view_count,
        profiles!posts_author_id_fkey(display_name, handle, avatar_url)
      `)
      .eq("post_type", "video")
      .eq("is_blocked", false)
      .not("video_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

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
      const authorIds = [...new Set(data.map((p: any) => p.author_id))];
      const [{ data: likesData }, { data: repliesData }, { data: myLikes }, { data: myBookmarks }, { data: myFollows }] = await Promise.all([
        supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
        supabase.from("post_replies").select("post_id").in("post_id", postIds),
        user
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id)
          : { data: [] },
        user
          ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id)
          : { data: [] },
        user
          ? supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", authorIds)
          : { data: [] },
      ]);
      setFollowingSet(new Set((myFollows || []).map((f: any) => f.following_id)));

      const likeMap: Record<string, number> = {};
      for (const l of (likesData || [])) likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1;
      const replyMap: Record<string, number> = {};
      for (const r of (repliesData || [])) replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1;
      const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
      const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id));

      const mapped: VideoPost[] = data.map((p: any) => ({
        id: p.id,
        author_id: p.author_id,
        content: p.content || "",
        video_url: p.video_url,
        created_at: p.created_at,
        view_count: p.view_count || 0,
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
      setVideos(mapped);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchVideos(videoTab); }, [fetchVideos, videoTab]);

  useEffect(() => {
    if (!loading && videos.length > 0 && id && !initialScrollDone.current) {
      const idx = videos.findIndex((v) => v.id === id);
      if (idx > 0) {
        setActiveIndex(idx);
        setTimeout(() => {
          listRef.current?.scrollToIndex({ index: idx, animated: false });
        }, 50);
      }
      initialScrollDone.current = true;
    }
  }, [loading, videos, id]);

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

  async function handleShare(item: VideoPost) {
    const postUrl = Platform.OS === "web" && typeof window !== "undefined"
      ? `${window.location.origin}/video/${item.id}`
      : `https://afuchat.com/video/${item.id}`;
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: `${item.profile.display_name} on AfuChat`, url: postUrl });
      } else {
        await Share.share({
          message: `Check out this video by ${item.profile.display_name} on AfuChat ${postUrl}`,
          url: postUrl,
          title: `${item.profile.display_name} on AfuChat`,
        });
      }
    } catch {}
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

  if (loading) {
    return (
      <View style={ms.center}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <View style={ms.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <View style={[ms.headerRow, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={ms.headerSide}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={ms.tabRow}>
          <TouchableOpacity onPress={() => switchTab("for_you")} style={ms.tabBtn}>
            <Text style={[ms.tabText, videoTab === "for_you" && ms.tabTextActive]}>For You</Text>
          </TouchableOpacity>
          <View style={ms.tabDivider} />
          <TouchableOpacity onPress={() => switchTab("following")} style={ms.tabBtn}>
            <Text style={[ms.tabText, videoTab === "following" && ms.tabTextActive]}>Following</Text>
          </TouchableOpacity>
          <Animated.View style={[ms.tabIndicator, { left: indicatorLeft, transform: [{ translateX: -14 }] }]} />
        </View>

        <TouchableOpacity hitSlop={12} style={ms.headerSide} onPress={() => router.push("/search" as any)}>
          <Ionicons name="search-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {videos.length === 0 ? (
        <View style={ms.emptyState}>
          <View style={ms.emptyIcon}>
            <Ionicons name="videocam-outline" size={44} color="rgba(255,255,255,0.25)" />
          </View>
          <Text style={ms.emptyTitle}>No videos yet</Text>
          <Text style={ms.emptySubtitle}>
            {videoTab === "following" ? "Follow creators to see their videos here" : "Videos will appear here soon"}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={videos}
          keyExtractor={(v) => v.id}
          renderItem={({ item, index }) => (
            <VideoItem
              item={item}
              isActive={index === activeIndex}
              screenH={SCREEN_H}
              screenW={SCREEN_W}
              isFollowing={followingSet.has(item.author_id)}
              isSelf={user?.id === item.author_id}
              onLike={handleLike}
              onBookmark={handleBookmark}
              onOpenComments={setCommentPostId}
              onShare={handleShare}
              onFollow={handleFollow}
            />
          )}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({ length: SCREEN_H, offset: SCREEN_H * index, index })}
          decelerationRate="fast"
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
    </View>
  );
}

const ms = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },

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
  tabText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    ...(Platform.OS === "web" ? { textShadow: "0 1px 3px rgba(0,0,0,0.5)" } : {}),
  } as any,
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
});
