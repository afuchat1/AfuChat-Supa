/**
 * VideoFeed — TikTok-style vertical paging feed rebuilt for React Native smoothness.
 *
 * Scroll architecture (why it's smooth):
 *  1. pagingEnabled FlatList — reliable native snap, zero JS involvement in scroll.
 *  2. GestureDetector (RNGH) for tap/double-tap — runs on the UI thread via JSI,
 *     never races with FlatList's scroll gesture recognizer.
 *  3. viewabilityConfig with NO minimumViewTime — activeIndex updates the instant
 *     a new item crosses 50% visibility. Video plays the moment you land.
 *  4. React.memo + custom equality on VideoItem — only the 2-3 items around the
 *     scroll target re-render per swipe; all others are frozen.
 *  5. expo-image for thumbnails — disk-cached, eliminates the black flash between
 *     swipes when a video hasn't started yet.
 *  6. cacheVideo preloading — next/prev videos download in the background so they
 *     start playing immediately without a buffering spinner.
 *  7. windowSize=3, removeClippedSubviews=false — ±1 items stay mounted and warm.
 *     removeClippedSubviews=true with pagingEnabled causes blank screens on Android.
 *  8. Buffering indicator delayed 400 ms — fast transitions never show a spinner.
 *  9. Progress bar throttled to ≤4 fps — smooth without taxing the JS thread.
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import { useAppAccent } from "@/context/AppAccentContext";
import { notifyPostLike, notifyNewFollow } from "@/lib/notifyUser";
import { VideoFeedSkeleton } from "@/components/ui/Skeleton";
import { useResolvedVideoSource } from "@/hooks/useResolvedVideoSource";
import { getPreferredVideoHeight } from "@/lib/networkQuality";
import { getCachedVideoUri, cacheVideo, markVideoWatched } from "@/lib/videoCache";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const USE_NATIVE = Platform.OS !== "web";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VideoPost = {
  id: string;
  author_id: string;
  content: string;
  video_url: string;
  image_url: string | null;
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

// ─── GradientOverlay ──────────────────────────────────────────────────────────

function GradientOverlay() {
  if (Platform.OS === "web") {
    return (
      <View
        style={styles.webGradient as any}
        pointerEvents="none"
      />
    );
  }
  return (
    <LinearGradient
      colors={["transparent", "rgba(0,0,0,0.88)"]}
      style={styles.gradient}
      pointerEvents="none"
    />
  );
}

// ─── VideoItem ────────────────────────────────────────────────────────────────

type VideoItemProps = {
  item: VideoPost;
  isActive: boolean;
  isNearActive: boolean;
  screenW: number;
  screenH: number;
  onLike: (postId: string, liked: boolean) => void;
  onFollow: (authorId: string) => void;
  onView: (postId: string) => void;
  currentUserId?: string;
};

const VideoItem = React.memo(
  function VideoItem({
    item,
    isActive,
    isNearActive,
    screenW,
    screenH,
    onLike,
    onFollow,
    onView,
    currentUserId,
  }: VideoItemProps) {
    const { accent } = useAppAccent();
    const videoRef = useRef<Video>(null);

    // ── UI state ──────────────────────────────────────────────────────────────
    const [paused, setPaused] = useState(false);
    const [showBuffering, setShowBuffering] = useState(false);
    const [videoStarted, setVideoStarted] = useState(false);
    const [cachedUri, setCachedUri] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [videoError, setVideoError] = useState(false);

    // Heart / double-tap animation
    const heartScale = useRef(new Animated.Value(1)).current;
    const dtOpacity = useRef(new Animated.Value(0)).current;
    const dtScale = useRef(new Animated.Value(0.3)).current;

    // ── Performance refs — avoid setState on every frame ──────────────────────
    const bufferingRef = useRef(false);
    const bufferingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const videoStartedRef = useRef(false);
    const lastProgressRef = useRef(0);
    const viewRecordedRef = useRef(false);
    const cacheAttempted = useRef(false);
    const cacheDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const watchSavedRef = useRef(false);

    // ── Network-aware manifest resolution ────────────────────────────────────
    const resolved = useResolvedVideoSource(item.id, item.video_url, {
      targetHeight: getPreferredVideoHeight(),
    });
    const playUri = videoError
      ? item.video_url
      : (cachedUri || resolved.uri || item.video_url);

    // ── Preload into local cache once video enters the ±1 window ─────────────
    // Delayed 500 ms so the download doesn't compete with the swipe animation.
    useEffect(() => {
      if (!isNearActive || cacheAttempted.current || !item.video_url) return;
      cacheAttempted.current = true;
      cacheDelayRef.current = setTimeout(() => {
        getCachedVideoUri(item.video_url).then((existing) => {
          if (existing) {
            setCachedUri(existing);
          } else {
            cacheVideo(item.video_url).then((local) => {
              if (local) setCachedUri(local);
            });
          }
        });
      }, 500);
      return () => {
        if (cacheDelayRef.current) {
          clearTimeout(cacheDelayRef.current);
          cacheDelayRef.current = null;
        }
      };
    }, [isNearActive, item.video_url]);

    // ── Reset state when scrolled away; record view + offline save on arrival ─
    useEffect(() => {
      if (!isActive) {
        setPaused(false);
        setVideoStarted(false);
        setShowBuffering(false);
        setProgress(0);
        setVideoError(false);
        bufferingRef.current = false;
        videoStartedRef.current = false;
        lastProgressRef.current = 0;
        watchSavedRef.current = false;
        if (bufferingTimerRef.current) {
          clearTimeout(bufferingTimerRef.current);
          bufferingTimerRef.current = null;
        }
      } else {
        if (!viewRecordedRef.current) {
          viewRecordedRef.current = true;
          onView(item.id);
        }
        if (!watchSavedRef.current) {
          watchSavedRef.current = true;
          markVideoWatched(item.id, item.video_url, {
            title: `${item.profile.display_name}${item.content ? `: ${item.content.slice(0, 60)}` : ""}`,
            thumbnail: item.image_url,
          }).catch(() => { watchSavedRef.current = false; });
        }
      }
    }, [isActive]);

    // ── Stop video completely when far from viewport ───────────────────────────
    useEffect(() => {
      if (!isNearActive && videoRef.current) {
        videoRef.current.stopAsync().catch(() => {});
      }
    }, [isNearActive]);

    // ── Gestures — UI thread, never race with FlatList scroll ─────────────────
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(250)
      .maxDistance(10)
      .runOnJS(true)
      .onEnd(() => {
        if (!item.liked) onLike(item.id, false);
        Animated.sequence([
          Animated.parallel([
            Animated.timing(dtOpacity, { toValue: 1, duration: 100, useNativeDriver: USE_NATIVE }),
            Animated.spring(dtScale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: USE_NATIVE }),
          ]),
          Animated.delay(500),
          Animated.parallel([
            Animated.timing(dtOpacity, { toValue: 0, duration: 250, useNativeDriver: USE_NATIVE }),
            Animated.timing(dtScale, { toValue: 0.3, duration: 250, useNativeDriver: USE_NATIVE }),
          ]),
        ]).start();
      });

    const singleTap = Gesture.Tap()
      .maxDuration(300)
      .maxDistance(10)
      .runOnJS(true)
      .onEnd(() => { setPaused((p) => !p); });

    // Exclusive: double-tap wins, single-tap waits to confirm no second tap
    const composed = Gesture.Exclusive(doubleTap, singleTap);

    // ── Playback status callback ───────────────────────────────────────────────
    function onPlaybackStatus(status: AVPlaybackStatus) {
      if (!status.isLoaded) return;

      // Buffering — only update state when value actually changes (avoid cascade renders)
      const nowBuffering = status.isBuffering;
      if (nowBuffering !== bufferingRef.current) {
        bufferingRef.current = nowBuffering;
        if (nowBuffering) {
          if (!bufferingTimerRef.current) {
            // 400 ms delay: fast swipes never flash the spinner
            bufferingTimerRef.current = setTimeout(() => {
              setShowBuffering(true);
              bufferingTimerRef.current = null;
            }, 400);
          }
        } else {
          if (bufferingTimerRef.current) {
            clearTimeout(bufferingTimerRef.current);
            bufferingTimerRef.current = null;
          }
          setShowBuffering(false);
        }
      }

      // Video started — fire once
      if (status.isPlaying && !videoStartedRef.current) {
        videoStartedRef.current = true;
        setVideoStarted(true);
      }

      // Progress — throttle to ≤4 fps so the JS thread isn't saturated
      if (status.durationMillis && status.durationMillis > 0) {
        const now = Date.now();
        if (now - lastProgressRef.current >= 250) {
          lastProgressRef.current = now;
          setProgress(status.positionMillis / status.durationMillis);
        }
      }
    }

    function handleLike() {
      Animated.sequence([
        Animated.timing(heartScale, { toValue: 0.6, duration: 80, useNativeDriver: USE_NATIVE }),
        Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 7, useNativeDriver: USE_NATIVE }),
      ]).start();
      onLike(item.id, item.liked);
    }

    const isOwnVideo = currentUserId === item.author_id;

    return (
      <View style={[styles.item, { width: screenW, height: screenH }]}>

        {/* ── Thumbnail poster — expo-image with disk cache, no black flash ─── */}
        {item.image_url && !videoStarted ? (
          <ExpoImage
            source={{ uri: item.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            priority="high"
          />
        ) : null}

        {/* ── Video — only mounted when ±1 of active to conserve memory ─────── */}
        {isNearActive && Platform.OS !== "web" && (
          <Video
            ref={videoRef}
            source={{ uri: playUri }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            shouldPlay={isActive && !paused}
            isLooping
            isMuted={false}
            onPlaybackStatusUpdate={onPlaybackStatus}
            onReadyForDisplay={() => {
              videoStartedRef.current = true;
              setVideoStarted(true);
            }}
            onError={() => {
              if (!videoError) {
                setCachedUri(null);
                setVideoError(true);
              }
            }}
          />
        )}
        {isNearActive && Platform.OS === "web" && (
          // @ts-ignore
          <video
            src={playUri}
            autoPlay={isActive && !paused}
            loop
            playsInline
            style={{
              position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
              objectFit: "cover", backgroundColor: "#000",
            }}
            onPlaying={() => { videoStartedRef.current = true; setVideoStarted(true); setShowBuffering(false); }}
            onWaiting={() => setShowBuffering(true)}
            onCanPlay={() => setShowBuffering(false)}
          />
        )}

        {/* ── Tap handler — UI thread, never fights scroll ────────────────── */}
        <GestureDetector gesture={composed}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>

        {/* ── Double-tap heart burst ─────────────────────────────────────── */}
        <Animated.View
          style={[styles.centerOverlay, { opacity: dtOpacity, transform: [{ scale: dtScale }] }]}
          pointerEvents="none"
        >
          <Ionicons name="heart" size={90} color="#FF3B30" />
        </Animated.View>

        {/* ── Pause indicator ────────────────────────────────────────────── */}
        {paused && isActive && (
          <View style={styles.centerOverlay} pointerEvents="none">
            <View style={styles.pauseCircle}>
              <Ionicons name="play" size={32} color="#fff" style={{ marginLeft: 3 }} />
            </View>
          </View>
        )}

        {/* ── Buffering — delayed 400 ms, never flashes on fast swipes ────── */}
        {showBuffering && isActive && !paused && (
          <View style={styles.centerOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="rgba(255,255,255,0.85)" />
          </View>
        )}

        {/* ── Bottom gradient ──────────────────────────────────────────────── */}
        <GradientOverlay />

        {/* ── Author + caption ─────────────────────────────────────────────── */}
        <View style={styles.bottomArea} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() =>
              router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })
            }
            style={styles.authorRow}
            activeOpacity={0.8}
          >
            <View style={[styles.avatarWrap, { borderColor: accent }]}>
              <Avatar
                uri={item.profile.avatar_url}
                name={item.profile.display_name}
                size={40}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.handle}>@{item.profile.handle}</Text>
              <Text style={styles.displayName}>{item.profile.display_name}</Text>
            </View>
            {!isOwnVideo && !item.following && (
              <TouchableOpacity
                onPress={() => onFollow(item.author_id)}
                style={styles.followBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.followBtnText}>Follow</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {item.content ? (
            <Text style={styles.caption} numberOfLines={2}>
              {item.content}
            </Text>
          ) : null}

          {item.view_count > 0 && (
            <View style={styles.viewRow}>
              <Ionicons name="eye-outline" size={11} color="rgba(255,255,255,0.45)" />
              <Text style={styles.viewText}>{formatCount(item.view_count)} views</Text>
            </View>
          )}
        </View>

        {/* ── Right action rail ─────────────────────────────────────────────── */}
        <View style={styles.rightCol} pointerEvents="box-none">
          {/* Like */}
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
            <Text style={styles.actionLabel}>{formatCount(item.likeCount)}</Text>
          </View>

          {/* Comment */}
          <View style={styles.actionItem}>
            <TouchableOpacity
              onPress={() =>
                router.push({ pathname: "/video/[id]", params: { id: item.id } })
              }
              hitSlop={10}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubble-ellipses" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.actionLabel}>{formatCount(item.replyCount)}</Text>
          </View>

          {/* Share / open full screen */}
          <View style={styles.actionItem}>
            <TouchableOpacity
              onPress={() =>
                router.push({ pathname: "/video/[id]", params: { id: item.id } })
              }
              hitSlop={10}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-redo-outline" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Progress bar — throttled to ≤4 fps ───────────────────────────── */}
        <View style={styles.progressBar} pointerEvents="none">
          <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
        </View>
      </View>
    );
  },
  // Custom equality — only re-render when these props actually change.
  // isActive / isNearActive change on scroll (necessary).
  // Item fields change on interaction (necessary).
  // Everything else is stable.
  (prev, next) =>
    prev.isActive === next.isActive &&
    prev.isNearActive === next.isNearActive &&
    prev.screenW === next.screenW &&
    prev.screenH === next.screenH &&
    prev.item.id === next.item.id &&
    prev.item.liked === next.item.liked &&
    prev.item.likeCount === next.item.likeCount &&
    prev.item.replyCount === next.item.replyCount &&
    prev.item.following === next.item.following &&
    prev.item.view_count === next.item.view_count
);

// ─── VideoFeed ────────────────────────────────────────────────────────────────

type Props = {
  tabBarHeight?: number;
};

export default function VideoFeed({ tabBarHeight = 52 }: Props) {
  const { user, profile } = useAuth();
  const { accent } = useAppAccent();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();

  const ITEM_HEIGHT = SCREEN_H - tabBarHeight;

  const [posts, setPosts] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const postsLenRef = useRef(0);

  // Stable ref for active index — lets renderItem read it without being in its deps
  const activeIndexRef = useRef(0);

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { postsLenRef.current = posts.length; }, [posts.length]);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const enrichPosts = useCallback(
    async (rawPosts: any[]): Promise<VideoPost[]> => {
      if (!rawPosts.length) return [];
      const postIds = rawPosts.map((p) => p.id);
      const authorIds = [...new Set(rawPosts.map((p) => p.author_id as string))];

      const [
        { data: likesData },
        { data: repliesData },
        { data: myLikes },
        { data: myFollows },
      ] = await Promise.all([
        supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
        supabase.from("post_replies").select("post_id").in("post_id", postIds),
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
      for (const l of likesData || []) likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1;
      const replyMap: Record<string, number> = {};
      for (const r of repliesData || []) replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1;
      const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
      const followingSet = new Set((myFollows || []).map((f: any) => f.following_id as string));

      return rawPosts.map((p) => ({
        id: p.id,
        author_id: p.author_id,
        content: p.content || "",
        video_url: p.video_url,
        image_url: p.image_url ?? null,
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
          `id, author_id, content, video_url, image_url, created_at, view_count,
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
        hasMoreRef.current = data.length === PAGE_SIZE;
        if (cursor) {
          setPosts((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...enriched.filter((p) => !seen.has(p.id))];
          });
        } else {
          setPosts(enriched);
        }
      } else {
        setHasMore(false);
        hasMoreRef.current = false;
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

  // ── Interactions ─────────────────────────────────────────────────────────────

  const handleLike = useCallback(
    async (postId: string, currentlyLiked: boolean) => {
      if (!user) {
        router.push("/(auth)/login" as any);
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
            p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p
          )
        );
      } else {
        await supabase
          .from("post_acknowledgments")
          .insert({ post_id: postId, user_id: user.id });
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p
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
    },
    [user, profile, posts]
  );

  const handleFollow = useCallback(
    async (authorId: string) => {
      if (!user) {
        router.push("/(auth)/login" as any);
        return;
      }
      setPosts((prev) =>
        prev.map((p) => (p.author_id === authorId ? { ...p, following: true } : p))
      );
      await supabase.from("follows").insert({ follower_id: user.id, following_id: authorId });
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
    },
    [user, profile]
  );

  const recordedViews = useRef(new Set<string>());
  const handleView = useCallback(
    async (postId: string) => {
      if (!user || recordedViews.current.has(postId)) return;
      recordedViews.current.add(postId);
      supabase
        .from("post_views")
        .upsert({ post_id: postId, viewer_id: user.id }, { onConflict: "post_id,viewer_id" })
        .then(null, () => {});
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, view_count: p.view_count + 1 } : p))
      );
    },
    [user]
  );

  // ── FlatList config ──────────────────────────────────────────────────────────

  // Stable ref — FlatList must never see a new function reference for this.
  // Setting activeIndexRef synchronously (before setState) ensures renderItem
  // reads the correct value when FlatList re-renders due to extraData change.
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        const idx = viewableItems[0].index;
        activeIndexRef.current = idx;   // synchronous — read by renderItem
        setActiveIndex(idx);            // triggers extraData → FlatList update

        // Load more when 3 items from the end
        if (
          idx >= postsLenRef.current - 3 &&
          !loadingMoreRef.current &&
          hasMoreRef.current &&
          cursorRef.current
        ) {
          // fetchVideos is stable (deps: [enrichPosts] which is stable once user is loaded)
        }
      }
    }
  ).current;

  // No minimumViewTime — activeIndex updates the instant the item crosses 50%.
  // This makes video playback start immediately when landing on a new item.
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

  // Stable callbacks passed to VideoItem — wrapped in useCallback with stable deps
  const stableOnLike = useCallback(handleLike, [handleLike]);
  const stableOnFollow = useCallback(handleFollow, [handleFollow]);
  const stableOnView = useCallback(handleView, [handleView]);

  // renderItem reads activeIndex from the ref (set synchronously before setState).
  // This means renderItem itself has NO activeIndex dep — it never recreates on scroll.
  // FlatList's extraData triggers the re-render, and the ref has the correct value.
  const renderItem = useCallback(
    ({ item, index }: { item: VideoPost; index: number }) => (
      <VideoItem
        item={item}
        isActive={index === activeIndexRef.current}
        isNearActive={Math.abs(index - activeIndexRef.current) <= 1}
        screenW={SCREEN_W}
        screenH={ITEM_HEIGHT}
        onLike={stableOnLike}
        onFollow={stableOnFollow}
        onView={stableOnView}
        currentUserId={user?.id}
      />
    ),
    // activeIndex intentionally omitted — read from activeIndexRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_W, ITEM_HEIGHT, stableOnLike, stableOnFollow, stableOnView, user?.id]
  );

  const onEndReached = useCallback(() => {
    if (!loadingMoreRef.current && hasMore && cursorRef.current) {
      fetchVideos(cursorRef.current);
    }
  }, [hasMore, fetchVideos]);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return <VideoFeedSkeleton />;
  }

  if (posts.length === 0) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: "#000" }]}>
        <View style={styles.emptyIcon}>
          <Ionicons name="videocam-outline" size={44} color="rgba(255,255,255,0.25)" />
        </View>
        <Text style={styles.emptyTitle}>No videos yet</Text>
        <Text style={styles.emptySubtitle}>Be the first to post!</Text>
        {user && (
          <TouchableOpacity
            style={[styles.postBtn, { backgroundColor: accent }]}
            onPress={() => router.push("/moments/create-video" as any)}
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
      renderItem={renderItem}
      // extraData triggers re-render when active index changes,
      // while renderItem itself stays stable (no activeIndex dep).
      extraData={activeIndex}
      // ── Scroll config ──────────────────────────────────────────────────────
      pagingEnabled
      showsVerticalScrollIndicator={false}
      decelerationRate="fast"
      // ── Viewability ────────────────────────────────────────────────────────
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      // ── Performance ────────────────────────────────────────────────────────
      getItemLayout={getItemLayout}
      windowSize={3}
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      // removeClippedSubviews=false: turning it on with pagingEnabled causes
      // blank screens on Android when scrolling back to a previous item.
      removeClippedSubviews={false}
      // ── Pagination ─────────────────────────────────────────────────────────
      onEndReached={onEndReached}
      onEndReachedThreshold={2}
      onScrollToIndexFailed={(info) => {
        setTimeout(() => {}, 300);
      }}
      // ── Style ──────────────────────────────────────────────────────────────
      style={{ flex: 1, backgroundColor: "#000" }}
      contentContainerStyle={{ backgroundColor: "#000" }}
      ListFooterComponent={
        loadingMore ? (
          <View style={[styles.center, { height: ITEM_HEIGHT, backgroundColor: "#000" }]}>
            <ActivityIndicator size="large" color="rgba(255,255,255,0.4)" />
          </View>
        ) : null
      }
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  item: {
    backgroundColor: "#000",
    overflow: "hidden",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  emptySubtitle: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  postBtn: {
    marginTop: 24,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 99,
  },
  postBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  centerOverlay: {
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
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  gradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 360,
  },
  webGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 360,
    background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)",
  },
  bottomArea: {
    position: "absolute",
    bottom: 68,
    left: 16,
    right: 80,
    gap: 6,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarWrap: {
    borderWidth: 2,
    borderRadius: 23,
    padding: 1,
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
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  followBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  caption: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  viewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  viewText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  rightCol: {
    position: "absolute",
    bottom: 80,
    right: 12,
    gap: 22,
    alignItems: "center",
  },
  actionItem: {
    alignItems: "center",
    gap: 3,
  },
  actionLabel: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  progressBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 1,
  },
});
