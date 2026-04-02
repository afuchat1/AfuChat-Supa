import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
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
  return `${Math.floor(diff / 86400000)}d`;
}

function CommentsSheet({
  visible,
  onClose,
  postId,
  replyCount,
  onReplyCountChange,
}: {
  visible: boolean;
  onClose: () => void;
  postId: string;
  replyCount: number;
  onReplyCountChange: (postId: string, delta: number) => void;
}) {
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible || !postId) return;
    setLoading(true);
    supabase
      .from("post_replies")
      .select("id, author_id, content, created_at, profiles!post_replies_author_id_fkey(display_name, handle, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .limit(100)
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
      setReplies((prev) => [
        ...prev,
        {
          id: data.id,
          author_id: data.author_id,
          content: data.content,
          created_at: data.created_at,
          profile: {
            display_name: profile?.display_name || "You",
            handle: profile?.handle || "you",
            avatar_url: profile?.avatar_url || null,
          },
        },
      ]);
      onReplyCountChange(postId, 1);
      setText("");
    }
    setSending(false);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={s.sheetKeyboard}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={[s.sheetContainer, { paddingBottom: insets.bottom || 12 }]}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>Comments</Text>
                <TouchableOpacity onPress={onClose} hitSlop={12}>
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
              </View>

              {loading ? (
                <View style={s.sheetLoading}>
                  <ActivityIndicator color={Colors.brand} />
                </View>
              ) : replies.length === 0 ? (
                <View style={s.sheetEmpty}>
                  <Text style={s.sheetEmptyText}>No comments yet. Be the first!</Text>
                </View>
              ) : (
                <FlatList
                  data={replies}
                  keyExtractor={(r) => r.id}
                  style={s.sheetList}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item: r }) => (
                    <View style={s.replyRow}>
                      <Avatar uri={r.profile.avatar_url} name={r.profile.display_name} size={32} />
                      <View style={s.replyBody}>
                        <View style={s.replyMeta}>
                          <Text style={s.replyHandle}>@{r.profile.handle}</Text>
                          <Text style={s.replyTime}>{formatRelative(r.created_at)}</Text>
                        </View>
                        <Text style={s.replyContent}>{r.content}</Text>
                      </View>
                    </View>
                  )}
                />
              )}

              {user ? (
                <View style={s.sheetInputRow}>
                  <Avatar uri={profile?.avatar_url} name={profile?.display_name || "You"} size={28} />
                  <TextInput
                    style={s.sheetInput}
                    placeholder="Add a comment…"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={text}
                    onChangeText={setText}
                    multiline
                    maxLength={500}
                  />
                  <TouchableOpacity
                    onPress={sendReply}
                    disabled={!text.trim() || sending}
                    hitSlop={8}
                  >
                    {sending ? (
                      <ActivityIndicator size={18} color={Colors.brand} />
                    ) : (
                      <Ionicons
                        name="send"
                        size={20}
                        color={text.trim() ? Colors.brand : "rgba(255,255,255,0.25)"}
                      />
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.sheetSignIn} onPress={() => { onClose(); router.push("/(auth)/login"); }}>
                  <Text style={s.sheetSignInText}>Sign in to comment</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

function VideoItem({
  item,
  isActive,
  screenH,
  screenW,
  onLike,
  onOpenComments,
}: {
  item: VideoPost;
  isActive: boolean;
  screenH: number;
  screenW: number;
  onLike: (id: string, liked: boolean) => void;
  onOpenComments: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();

  function handleLike() {
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 0.65, duration: 80, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 7, useNativeDriver: true }),
    ]).start();
    onLike(item.id, item.liked);
  }

  return (
    <View style={[s.item, { width: screenW, height: screenH }]}>
      <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={() => setPaused((p) => !p)}>
        <Video
          source={{ uri: item.video_url }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={isActive && !paused}
          isLooping
          isMuted={muted}
        />
      </TouchableOpacity>

      {paused && (
        <View style={s.pauseOverlay} pointerEvents="none">
          <View style={s.pauseCircle}>
            <Ionicons name="play" size={28} color="#fff" />
          </View>
        </View>
      )}

      <View style={s.overlay} pointerEvents="none" />

      <View style={[s.bottomArea, { bottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}
          style={s.authorRow}
        >
          <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={36} />
          <View>
            <Text style={s.authorHandle}>@{item.profile.handle}</Text>
            <Text style={s.authorName}>{item.profile.display_name}</Text>
          </View>
        </TouchableOpacity>
        {!!item.content && (
          <Text style={s.caption} numberOfLines={3}>{item.content}</Text>
        )}
      </View>

      <View style={[s.rightCol, { bottom: insets.bottom + 24 }]}>
        <Animated.View style={[s.actionItem, { transform: [{ scale: heartScale }] }]}>
          <TouchableOpacity onPress={handleLike} hitSlop={10}>
            <Ionicons
              name={item.liked ? "heart" : "heart-outline"}
              size={30}
              color={item.liked ? "#FF3B30" : "#fff"}
            />
          </TouchableOpacity>
          <Text style={s.actionLabel}>{formatCount(item.likeCount)}</Text>
        </Animated.View>

        <TouchableOpacity style={s.actionItem} onPress={() => onOpenComments(item.id)} hitSlop={10}>
          <Ionicons name="chatbubble-ellipses-outline" size={28} color="#fff" />
          <Text style={s.actionLabel}>{formatCount(item.replyCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.actionItem} onPress={() => setMuted((m) => !m)} hitSlop={10}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

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
  const listRef = useRef<FlatList>(null);
  const initialScrollDone = useRef(false);

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
      const [{ data: likesData }, { data: repliesData }, { data: myLikes }] = await Promise.all([
        supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
        supabase.from("post_replies").select("post_id").in("post_id", postIds),
        user
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id)
          : { data: [] },
      ]);

      const likeMap: Record<string, number> = {};
      for (const l of (likesData || [])) likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1;
      const replyMap: Record<string, number> = {};
      for (const r of (repliesData || [])) replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1;
      const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));

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

  function handleReplyCountChange(postId: string, delta: number) {
    setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, replyCount: v.replyCount + delta } : v));
  }

  if (loading) {
    return (
      <View style={s.center}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ActivityIndicator color={Colors.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <View style={[s.headerRow, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={s.headerBack}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={s.tabRow}>
          <TouchableOpacity onPress={() => setVideoTab("for_you")} style={s.tabBtn}>
            <Text style={[s.tabText, videoTab === "for_you" && s.tabTextActive]}>For You</Text>
            {videoTab === "for_you" && <View style={s.tabIndicator} />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!user) { router.push("/(auth)/login"); return; }
              setVideoTab("following");
            }}
            style={s.tabBtn}
          >
            <Text style={[s.tabText, videoTab === "following" && s.tabTextActive]}>Following</Text>
            {videoTab === "following" && <View style={s.tabIndicator} />}
          </TouchableOpacity>
        </View>

        <View style={{ width: 32 }} />
      </View>

      {videos.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="videocam-off-outline" size={52} color="rgba(255,255,255,0.35)" />
          <Text style={s.emptyText}>No videos yet</Text>
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
              onLike={handleLike}
              onOpenComments={setCommentPostId}
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
        replyCount={videos.find((v) => v.id === commentPostId)?.replyCount || 0}
        onReplyCountChange={handleReplyCountChange}
      />
    </View>
  );
}

const s = StyleSheet.create({
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
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  headerBack: { width: 32, alignItems: "flex-start" },
  tabRow: { flex: 1, flexDirection: "row", justifyContent: "center", gap: 24 },
  tabBtn: { alignItems: "center", paddingVertical: 6 },
  tabText: { color: "rgba(255,255,255,0.55)", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  tabTextActive: { color: "#fff" },
  tabIndicator: { width: 24, height: 3, borderRadius: 1.5, backgroundColor: "#fff", marginTop: 4 },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  emptyText: { color: "rgba(255,255,255,0.5)", fontSize: 16, fontFamily: "Inter_500Medium" },

  item: { backgroundColor: "#000" },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 280,
    ...(Platform.OS === "web"
      ? { backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.70) 0%, transparent 100%)" }
      : { backgroundColor: "transparent" }),
  } as any,
  pauseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  pauseCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },

  bottomArea: { position: "absolute", left: 14, right: 72, gap: 8 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  authorHandle: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  authorName: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular" },
  caption: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },

  rightCol: { position: "absolute", right: 10, gap: 20, alignItems: "center" },
  actionItem: { alignItems: "center", gap: 3 },
  actionLabel: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },

  sheetOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheetKeyboard: { justifyContent: "flex-end" },
  sheetContainer: {
    backgroundColor: "#1c1c1e",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "65%",
    minHeight: 320,
    paddingHorizontal: 14,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginTop: 10, marginBottom: 8 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.1)" },
  sheetTitle: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sheetLoading: { paddingVertical: 40, alignItems: "center" },
  sheetEmpty: { paddingVertical: 40, alignItems: "center" },
  sheetEmptyText: { color: "rgba(255,255,255,0.45)", fontSize: 14, fontFamily: "Inter_400Regular" },
  sheetList: { flex: 1, marginTop: 8 },

  replyRow: { flexDirection: "row", gap: 10, paddingVertical: 10 },
  replyBody: { flex: 1 },
  replyMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  replyHandle: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  replyTime: { color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Inter_400Regular" },
  replyContent: { color: "#fff", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },

  sheetInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  sheetInput: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    maxHeight: 80,
  },
  sheetSignIn: { paddingVertical: 14, alignItems: "center" },
  sheetSignInText: { color: Colors.brand, fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
