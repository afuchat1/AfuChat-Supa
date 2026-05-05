/**
 * VideoFeed — TikTok-style vertical paging feed.
 *
 * Core design decisions that make scroll work reliably:
 *  1. Use `pagingEnabled` (not snapToInterval) — simplest, most reliable.
 *  2. Item height = full window height, measured ONCE at mount, never from layout.
 *  3. Tap detection via the Responder system (NOT Pressable) so the FlatList
 *     always wins the scroll gesture.
 *  4. `onViewableItemsChanged` stored in a ref so it never changes identity.
 *  5. `getItemLayout` is always consistent — no dependency on dynamic state.
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import { useAppAccent } from "@/context/AppAccentContext";
import { notifyPostLike, notifyNewFollow } from "@/lib/notifyUser";
import { VideoFeedSkeleton } from "@/components/ui/Skeleton";
import { LinearGradient } from "expo-linear-gradient";

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const PAGE_SIZE = 20;
const USE_NATIVE = Platform.OS !== "web";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── TapHandler ───────────────────────────────────────────────────────────────
/**
 * A transparent view that detects taps using the Responder system.
 * `onResponderTerminationRequest={() => true}` is the critical line —
 * it lets the parent FlatList claim the gesture for scrolling, so the
 * feed always scrolls even when the user touches the video surface.
 */
function TapHandler({
  onTap,
  onDoubleTap,
}: {
  onTap: () => void;
  onDoubleTap?: () => void;
}) {
  const touchRef = useRef<{ y: number; t: number } | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);

  return (
    <View
      style={StyleSheet.absoluteFill}
      onStartShouldSetResponder={() => true}
      onResponderTerminationRequest={() => true}
      onResponderGrant={(e) => {
        touchRef.current = { y: e.nativeEvent.pageY, t: Date.now() };
      }}
      onResponderMove={(e) => {
        if (!touchRef.current) return;
        if (Math.abs(e.nativeEvent.pageY - touchRef.current.y) > 10) {
          touchRef.current = null;
        }
      }}
      onResponderRelease={(e) => {
        const start = touchRef.current;
        touchRef.current = null;
        if (!start) return;
        const dy = Math.abs(e.nativeEvent.pageY - start.y);
        const dt = Date.now() - start.t;
        if (dy > 10 || dt > 400) return;

        const now = Date.now();
        if (onDoubleTap && now - lastTapRef.current < 300) {
          if (tapTimerRef.current) {
            clearTimeout(tapTimerRef.current);
            tapTimerRef.current = null;
          }
          lastTapRef.current = 0;
          onDoubleTap();
        } else {
          lastTapRef.current = now;
          tapTimerRef.current = setTimeout(() => {
            tapTimerRef.current = null;
            onTap();
          }, 250);
        }
      }}
      onResponderTerminate={() => {
        touchRef.current = null;
        if (tapTimerRef.current) {
          clearTimeout(tapTimerRef.current);
          tapTimerRef.current = null;
        }
      }}
    />
  );
}

// ─── GradientOverlay ──────────────────────────────────────────────────────────

function GradientOverlay() {
  if (Platform.OS === "web") {
    return (
      <View
        style={styles.webGradient}
        pointerEvents="none"
      />
    );
  }
  return (
    <LinearGradient
      colors={["transparent", "rgba(0,0,0,0.85)"]}
      style={styles.gradient}
      pointerEvents="none"
    />
  );
}

// ─── VideoItem ────────────────────────────────────────────────────────────────

function VideoItem({
  item,
  isActive,
  itemHeight,
  onLike,
  onFollow,
  currentUserId,
}: {
  item: VideoPost;
  isActive: boolean;
  itemHeight: number;
  onLike: (postId: string, liked: boolean) => void;
  onFollow: (authorId: string) => void;
  currentUserId?: string;
}) {
  const { accent } = useAppAccent();
  const videoRef = useRef<Video>(null);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const doubleTapHeartOpacity = useRef(new Animated.Value(0)).current;
  const doubleTapHeartScale = useRef(new Animated.Value(0.3)).current;
  const followScale = useRef(new Animated.Value(1)).current;

  // Reset state when item leaves the viewport
  useEffect(() => {
    if (!isActive) {
      setPaused(false);
      setBuffering(false);
    }
  }, [isActive]);

  // Unload video when scrolled far away to free resources
  useEffect(() => {
    if (!isActive && videoRef.current) {
      videoRef.current.stopAsync().catch(() => {});
    }
  }, [isActive]);

  function handleTap() {
    setPaused((p) => !p);
  }

  function handleDoubleTap() {
    if (!item.liked) onLike(item.id, false);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(doubleTapHeartOpacity, { toValue: 1, duration: 100, useNativeDriver: USE_NATIVE }),
        Animated.spring(doubleTapHeartScale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: USE_NATIVE }),
      ]),
      Animated.delay(500),
      Animated.parallel([
        Animated.timing(doubleTapHeartOpacity, { toValue: 0, duration: 300, useNativeDriver: USE_NATIVE }),
        Animated.timing(doubleTapHeartScale, { toValue: 0.3, duration: 300, useNativeDriver: USE_NATIVE }),
      ]),
    ]).start();
  }

  function handleLike() {
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 0.7, duration: 80, useNativeDriver: USE_NATIVE }),
      Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 8, useNativeDriver: USE_NATIVE }),
    ]).start();
    onLike(item.id, item.liked);
  }

  function handleFollow() {
    Animated.sequence([
      Animated.timing(followScale, { toValue: 0.8, duration: 80, useNativeDriver: USE_NATIVE }),
      Animated.spring(followScale, { toValue: 1, tension: 300, friction: 8, useNativeDriver: USE_NATIVE }),
    ]).start();
    onFollow(item.author_id);
  }

  function onPlaybackStatus(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;
    setBuffering(status.isBuffering);
  }

  const isOwnVideo = currentUserId === item.author_id;
  const showFollowButton = !isOwnVideo && !item.following;

  return (
    <View style={[styles.itemContainer, { height: itemHeight, width: SCREEN_W }]}>
      {/* Video */}
      {Platform.OS === "web" ? (
        // @ts-ignore
        <video
          src={item.video_url}
          autoPlay={isActive && !paused}
          loop
          muted={false}
          playsInline
          style={styles.webVideo as any}
        />
      ) : (
        <Video
          ref={videoRef}
          source={{ uri: item.video_url }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive && !paused}
          isLooping
          isMuted={false}
          onPlaybackStatusUpdate={onPlaybackStatus}
        />
      )}

      {/* Tap handler — MUST come after video so touches reach it */}
      <TapHandler onTap={handleTap} onDoubleTap={handleDoubleTap} />

      {/* Double-tap heart burst */}
      <Animated.View
        style={[
          styles.doubleTapHeart,
          { opacity: doubleTapHeartOpacity, transform: [{ scale: doubleTapHeartScale }] },
        ]}
        pointerEvents="none"
      >
        <Ionicons name="heart" size={90} color="#FF3B30" />
      </Animated.View>

      {/* Pause indicator */}
      {paused && isActive && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <View style={styles.pauseCircle}>
            <Ionicons name="play" size={32} color="#fff" style={{ marginLeft: 3 }} />
          </View>
        </View>
      )}

      {/* Buffering indicator */}
      {buffering && isActive && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <Ionicons name="reload" size={28} color="rgba(255,255,255,0.7)" />
        </View>
      )}

      {/* Bottom gradient */}
      <GradientOverlay />

      {/* Bottom info */}
      <View style={styles.bottomInfo} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() =>
            router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })
          }
          style={styles.authorRow}
          activeOpacity={0.8}
        >
          <View style={styles.avatarWrapper}>
            <Avatar
              uri={item.profile.avatar_url}
              name={item.profile.display_name}
              size={42}
            />
            {showFollowButton && (
              <Animated.View
                style={[
                  styles.followBadge,
                  { backgroundColor: accent, transform: [{ scale: followScale }] },
                ]}
              >
                <TouchableOpacity onPress={handleFollow} hitSlop={8}>
                  <Ionicons name="add" size={14} color="#fff" />
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.handle}>@{item.profile.handle}</Text>
            <Text style={styles.displayName}>{item.profile.display_name}</Text>
          </View>
        </TouchableOpacity>

        {item.content ? (
          <Text style={styles.caption} numberOfLines={3}>
            {item.content}
          </Text>
        ) : null}
      </View>

      {/* Right actions — each with its own hit area */}
      <View style={styles.rightActions} pointerEvents="box-none">
        <View style={styles.actionItem}>
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <TouchableOpacity onPress={handleLike} hitSlop={10} activeOpacity={0.8}>
              <Ionicons
                name={item.liked ? "heart" : "heart-outline"}
                size={30}
                color={item.liked ? "#FF3B30" : "#fff"}
              />
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.actionCount}>{formatCount(item.likeCount)}</Text>
        </View>

        <View style={styles.actionItem}>
          <TouchableOpacity
            onPress={() =>
              router.push({ pathname: "/post/[id]", params: { id: item.id } })
            }
            hitSlop={10}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-ellipses" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.actionCount}>{formatCount(item.replyCount)}</Text>
        </View>

        <View style={styles.actionItem}>
          <TouchableOpacity
            onPress={() =>
              router.push({ pathname: "/video/[id]", params: { id: item.id } })
            }
            hitSlop={10}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-redo" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── VideoFeed ────────────────────────────────────────────────────────────────

type Props = {
  tabBarHeight?: number;
};

export default function VideoFeed({ tabBarHeight = 52 }: Props) {
  const { user, profile } = useAuth();
  const { accent } = useAppAccent();

  // Use a stable height that never changes — critical for getItemLayout
  const ITEM_HEIGHT = SCREEN_H - tabBarHeight;

  const [posts, setPosts] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const enrichPosts = useCallback(
    async (rawPosts: any[]) => {
      if (!rawPosts.length) return [];
      const postIds = rawPosts.map((p: any) => p.id);
      const authorIds = [
        ...new Set(rawPosts.map((p: any) => p.author_id as string)),
      ];

      const [
        { data: likesData },
        { data: repliesData },
        { data: myLikes },
        { data: myFollows },
      ] = await Promise.all([
        supabase
          .from("post_acknowledgments")
          .select("post_id")
          .in("post_id", postIds),
        supabase
          .from("post_replies")
          .select("post_id")
          .in("post_id", postIds),
        user
          ? supabase
              .from("post_acknowledgments")
              .select("post_id")
              .in("post_id", postIds)
              .eq("user_id", user.id)
          : Promise.resolve({ data: [] }),
        user
          ? supabase
              .from("follows")
              .select("following_id")
              .eq("follower_id", user.id)
              .in("following_id", authorIds)
          : Promise.resolve({ data: [] }),
      ]);

      const likeMap: Record<string, number> = {};
      for (const l of likesData || [])
        likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1;
      const replyMap: Record<string, number> = {};
      for (const r of repliesData || [])
        replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1;
      const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
      const followingSet = new Set(
        (myFollows || []).map((f: any) => f.following_id as string)
      );

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
    },
    [user]
  );

  const fetchVideos = useCallback(
    async (cursor?: string | null) => {
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
        .select(
          `id, author_id, content, video_url, created_at, view_count,
           profiles!posts_author_id_fkey(display_name, handle, avatar_url)`
        )
        .eq("post_type", "video")
        .eq("visibility", "public")
        .not("video_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (cursor) query = query.lt("created_at", cursor);

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
    },
    [enrichPosts]
  );

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // ── Interactions ───────────────────────────────────────────────────────────

  async function handleLike(postId: string, currentlyLiked: boolean) {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (currentlyLiked) {
      await supabase
        .from("post_acknowledgments")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) }
            : p
        )
      );
    } else {
      await supabase
        .from("post_acknowledgments")
        .insert({ post_id: postId, user_id: user.id });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, liked: true, likeCount: p.likeCount + 1 }
            : p
        )
      );
      if (post.author_id !== user.id) {
        notifyPostLike({
          postAuthorId: post.author_id,
          likerName: profile?.display_name || "Someone",
          likerUserId: user.id,
          postId,
        });
      }
    }
  }

  async function handleFollow(authorId: string) {
    if (!user) {
      router.push("/(auth)/login");
      return;
    }
    setPosts((prev) =>
      prev.map((p) =>
        p.author_id === authorId ? { ...p, following: true } : p
      )
    );
    await supabase
      .from("follows")
      .insert({ follower_id: user.id, following_id: authorId });
    try {
      notifyNewFollow({
        targetUserId: authorId,
        followerName: profile?.display_name || "Someone",
        followerUserId: user.id,
      });
    } catch (_) {}
    try {
      const { rewardXp } = await import("../lib/rewardXp");
      rewardXp("follow_user");
    } catch (_) {}
  }

  // ── FlatList config ────────────────────────────────────────────────────────

  // Stable ref — never recreated, so FlatList never gets confused
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    [ITEM_HEIGHT]
  );

  const onEndReached = useCallback(() => {
    if (!loadingMoreRef.current && hasMore && cursorRef.current) {
      fetchVideos(cursorRef.current);
    }
  }, [hasMore, fetchVideos]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <VideoFeedSkeleton />;
  }

  if (posts.length === 0) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: "#000" }]}>
        <Ionicons
          name="videocam-outline"
          size={56}
          color="rgba(255,255,255,0.4)"
        />
        <Text style={styles.emptyText}>
          No videos yet.{"\n"}Be the first to post!
        </Text>
        {user && (
          <TouchableOpacity
            style={[styles.postBtn, { backgroundColor: accent }]}
            onPress={() => router.push("/moments/create-video")}
          >
            <Text style={styles.postBtnText}>Post a Video</Text>
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
          itemHeight={ITEM_HEIGHT}
          onLike={handleLike}
          onFollow={handleFollow}
          currentUserId={user?.id}
        />
      )}
      // pagingEnabled is the most reliable way to get TikTok-style snapping
      pagingEnabled
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      getItemLayout={getItemLayout}
      decelerationRate="fast"
      onEndReached={onEndReached}
      onEndReachedThreshold={2}
      windowSize={5}
      initialNumToRender={2}
      maxToRenderPerBatch={3}
      removeClippedSubviews={false}
      style={{ flex: 1, backgroundColor: "#000" }}
      ListFooterComponent={
        loadingMore ? (
          <View
            style={[
              styles.center,
              { height: ITEM_HEIGHT, backgroundColor: "#000" },
            ]}
          >
            <VideoFeedSkeleton />
          </View>
        ) : null
      }
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  emptyText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    marginTop: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  postBtn: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  postBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  itemContainer: {
    backgroundColor: "#000",
    overflow: "hidden",
  },
  webVideo: {
    position: "absolute" as any,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    backgroundColor: "#000",
  },
  gradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 340,
  },
  webGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 340,
    background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
  } as any,
  doubleTapHeart: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  pauseCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomInfo: {
    position: "absolute",
    bottom: 100,
    left: 16,
    right: 86,
    gap: 8,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarWrapper: {
    position: "relative",
  },
  followBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  handle: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  displayName: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  caption: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  rightActions: {
    position: "absolute",
    right: 12,
    bottom: 110,
    alignItems: "center",
    gap: 22,
  },
  actionItem: {
    alignItems: "center",
    gap: 4,
  },
  actionCount: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
