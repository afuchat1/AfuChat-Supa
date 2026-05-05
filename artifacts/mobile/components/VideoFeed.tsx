import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import { useAppAccent } from "@/context/AppAccentContext";
import { notifyPostLike, notifyNewFollow } from "@/lib/notifyUser";
import { useResolvedVideoSource } from "@/hooks/useResolvedVideoSource";
import { VideoFeedSkeleton } from "@/components/ui/Skeleton";

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");
const PAGE_SIZE = 20;

export type VideoPost = {
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
  following: boolean;
};

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function VideoItem({
  item,
  isActive,
  onLike,
  onFollow,
  currentUserId,
}: {
  item: VideoPost;
  isActive: boolean;
  onLike: (postId: string, liked: boolean) => void;
  onFollow: (authorId: string) => void;
  currentUserId?: string;
}) {
  const { accent } = useAppAccent();
  const videoRef = useRef<Video>(null);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const followScale = useRef(new Animated.Value(1)).current;

  function handleLike() {
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 0.7, duration: 80, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 8, useNativeDriver: true }),
    ]).start();
    onLike(item.id, item.liked);
  }

  function handleFollow() {
    Animated.sequence([
      Animated.timing(followScale, { toValue: 0.8, duration: 80, useNativeDriver: true }),
      Animated.spring(followScale, { toValue: 1, tension: 300, friction: 8, useNativeDriver: true }),
    ]).start();
    onFollow(item.author_id);
  }

  const isOwnVideo = currentUserId === item.author_id;
  const showFollowButton = !isOwnVideo && !item.following;
  const resolved = useResolvedVideoSource(item.id, item.video_url, { targetHeight: 720 });

  const videoTouchRef = useRef<{ y: number; t: number } | null>(null);

  return (
    <View style={styles.videoItem}>
      {/* Video — always auto-plays when active */}
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => true}
        onResponderGrant={(e) => {
          videoTouchRef.current = { y: e.nativeEvent.pageY, t: Date.now() };
        }}
        onResponderRelease={(e) => {
          const start = videoTouchRef.current;
          videoTouchRef.current = null;
          if (!start) return;
          const dy = Math.abs(e.nativeEvent.pageY - start.y);
          const dt = Date.now() - start.t;
          if (dy < 12 && dt < 350) setPaused((p) => !p);
        }}
        onResponderTerminate={() => { videoTouchRef.current = null; }}
      >
        <Video
          ref={videoRef}
          source={{ uri: resolved.uri || item.video_url }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive && !paused}
          isLooping
          isMuted={muted}
        />
        {paused && isActive && (
          <View style={styles.pauseOverlay}>
            <Ionicons name="play" size={52} color="rgba(255,255,255,0.85)" />
          </View>
        )}
      </View>

      {/* Gradient overlay */}
      <View style={styles.gradient} pointerEvents="none" />

      {/* Bottom info */}
      <View style={styles.bottomInfo}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}
          style={styles.authorRow}
        >
          <View style={styles.avatarWrapper}>
            <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={40} />
            {showFollowButton && (
              <Animated.View style={[styles.followPlusBadge, { backgroundColor: accent, transform: [{ scale: followScale }] }]}>
                <TouchableOpacity onPress={handleFollow} hitSlop={6}>
                  <Ionicons name="add" size={14} color="#fff" />
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
          <View>
            <Text style={styles.authorName}>@{item.profile.handle}</Text>
            <Text style={styles.authorDisplay}>{item.profile.display_name}</Text>
          </View>
        </TouchableOpacity>

        {item.content ? (
          <Text style={styles.caption} numberOfLines={3}>{item.content}</Text>
        ) : null}
      </View>

      {/* Right actions */}
      <View style={styles.rightActions}>
        <View style={styles.actionItem}>
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <TouchableOpacity onPress={handleLike} hitSlop={8}>
              <Ionicons name={item.liked ? "heart" : "heart-outline"} size={30} color={item.liked ? "#FF3B30" : "#fff"} />
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.actionCount}>{formatCount(item.likeCount)}</Text>
        </View>

        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
        >
          <Ionicons name="chatbubble-outline" size={28} color="#fff" />
          <Text style={styles.actionCount}>{formatCount(item.replyCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => setMuted((m) => !m)}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

type Props = {
  tabBarHeight?: number;
};

export default function VideoFeed({ tabBarHeight = 52 }: Props) {
  const { accent } = useAppAccent();
  const { user, profile } = useAuth();

  const [posts, setPosts] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);

  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  const enrichPosts = useCallback(async (rawPosts: any[]) => {
    if (!rawPosts.length) return [];
    const postIds = rawPosts.map((p: any) => p.id);
    const authorIds = [...new Set(rawPosts.map((p: any) => p.author_id as string))];

    const [{ data: likesData }, { data: repliesData }, { data: myLikes }, { data: myFollows }] = await Promise.all([
      supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
      supabase.from("post_replies").select("post_id").in("post_id", postIds),
      user ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id) : Promise.resolve({ data: [] }),
      user ? supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", authorIds) : Promise.resolve({ data: [] }),
    ]);

    const likeMap: Record<string, number> = {};
    for (const l of (likesData || [])) likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1;
    const replyMap: Record<string, number> = {};
    for (const r of (repliesData || [])) replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1;
    const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
    const followingSet = new Set((myFollows || []).map((f: any) => f.following_id as string));

    return rawPosts.map((p: any) => ({
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
      following: followingSet.has(p.author_id),
    }));
  }, [user]);

  const fetchVideos = useCallback(async (cursor?: string | null) => {
    if (cursor) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      setLoading(true);
      cursorRef.current = null;
    }

    let query = supabase
      .from("posts")
      .select(`
        id, author_id, content, video_url, created_at, view_count,
        profiles!posts_author_id_fkey(display_name, handle, avatar_url)
      `)
      .eq("post_type", "video")
      .eq("visibility", "public")
      .not("video_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data } = await query;

    if (data && data.length > 0) {
      const enriched = await enrichPosts(data);
      cursorRef.current = data[data.length - 1].created_at;
      setHasMore(data.length === PAGE_SIZE);
      if (cursor) {
        setPosts((prev) => [...prev, ...enriched]);
      } else {
        setPosts(enriched);
      }
    } else {
      setHasMore(false);
      if (!cursor) setPosts([]);
    }

    if (cursor) {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    } else {
      setLoading(false);
    }
  }, [enrichPosts]);

  React.useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const onEndReached = useCallback(() => {
    if (!loadingMoreRef.current && hasMore && cursorRef.current) {
      fetchVideos(cursorRef.current);
    }
  }, [hasMore, fetchVideos]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  async function handleLike(postId: string, currentlyLiked: boolean) {
    if (!user) { router.push("/(auth)/login"); return; }
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (currentlyLiked) {
      await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p));
    } else {
      await supabase.from("post_acknowledgments").insert({ post_id: postId, user_id: user.id });
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p));
      if (post.author_id !== user.id) {
        notifyPostLike({ postAuthorId: post.author_id, likerName: profile?.display_name || "Someone", likerUserId: user.id, postId });
      }
    }
  }

  async function handleFollow(authorId: string) {
    if (!user) { router.push("/(auth)/login"); return; }
    setPosts((prev) => prev.map((p) => p.author_id === authorId ? { ...p, following: true } : p));
    await supabase.from("follows").insert({ follower_id: user.id, following_id: authorId });
    try {
      notifyNewFollow({ targetUserId: authorId, followerName: profile?.display_name || "Someone", followerUserId: user.id });
    } catch (_) {}
    try {
      const { rewardXp } = await import("../lib/rewardXp");
      rewardXp("follow_user");
    } catch (_) {}
  }

  if (loading) {
    return <VideoFeedSkeleton />;
  }

  if (posts.length === 0) {
    return (
      <View style={[styles.center, { height: SCREEN_H, backgroundColor: "#000" }]}>
        <Ionicons name="videocam-outline" size={56} color="rgba(255,255,255,0.4)" />
        <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 16, fontFamily: "Inter_500Medium", marginTop: 16, textAlign: "center" }}>
          No videos yet.{"\n"}Be the first to post!
        </Text>
        {user && (
          <TouchableOpacity
            style={{ marginTop: 24, backgroundColor: accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 }}
            onPress={() => router.push("/moments/create-video")}
          >
            <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Post a Video</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(p) => p.id}
      renderItem={({ item, index }) => (
        <VideoItem
          item={item}
          isActive={index === activeIndex}
          onLike={handleLike}
          onFollow={handleFollow}
          currentUserId={user?.id}
        />
      )}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      getItemLayout={(_, index) => ({ length: SCREEN_H, offset: SCREEN_H * index, index })}
      decelerationRate="fast"
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        loadingMore ? (
          <View style={[styles.center, { height: SCREEN_H, backgroundColor: "#000" }]}>
            <VideoFeedSkeleton />
          </View>
        ) : null
      }
      style={{ flex: 1, backgroundColor: "#000" }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  videoItem: { width: SCREEN_W, height: SCREEN_H, backgroundColor: "#000" },
  gradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 320,
    ...(Platform.OS === "web" ? { background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)" } : {}),
  } as any,
  pauseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  bottomInfo: { position: "absolute", bottom: 100, left: 16, right: 80 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  avatarWrapper: { position: "relative" },
  followPlusBadge: {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#000",
  },
  authorName: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  authorDisplay: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular" },
  caption: { color: "#fff", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  rightActions: { position: "absolute", right: 14, bottom: 110, gap: 20, alignItems: "center" },
  actionItem: { alignItems: "center", gap: 4 },
  actionCount: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
