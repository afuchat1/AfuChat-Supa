/**
 * VideoFeed — TikTok-style vertical paging feed, rebuilt from scratch.
 *
 * Smoothness decisions:
 *  1. snapToInterval + disableIntervalMomentum — more reliable snap than
 *     pagingEnabled, especially on Android where pagingEnabled can produce
 *     erratic deceleration on fast flings.
 *  2. decelerationRate="fast" — snaps quickly, feels native.
 *  3. Reanimated 4 (useSharedValue + useAnimatedStyle) for ALL animations —
 *     heart burst, like scale, and progress bar run on the UI thread without
 *     touching the JS event loop.
 *  4. GestureDetector (RNGH) for exclusive double-tap / single-tap — UI-
 *     thread gesture recogniser, never races with the scroll gesture.
 *  5. React.memo + deep custom equality — only the 3 items around the active
 *     index ever re-render on a swipe; everything else is frozen.
 *  6. viewabilityConfig with NO minimumViewTime — activeIndex updates the
 *     instant the item crosses 50 % visibility, so video plays immediately.
 *  7. windowSize=3, removeClippedSubviews=false — keeps ±1 items mounted.
 *     removeClippedSubviews=true + snapToInterval causes blank frames on
 *     Android when scrolling back.
 *  8. expo-image thumbnails — disk-cached, eliminates the black-frame flash
 *     before video starts.
 *  9. cacheVideo preload (500 ms delayed) — next/prev items download in
 *     background so they start instantly when scrolled to.
 * 10. Buffering spinner delayed 400 ms — fast swipes never flash it.
 * 11. Progress bar driven by a Reanimated shared value — zero JS-thread cost.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
} from "react-native-reanimated";
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

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── GradientOverlay ──────────────────────────────────────────────────────────

function GradientOverlay() {
  if (Platform.OS === "web") {
    return (
      <View
        style={[
          styles.gradient,
          {
            background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 100%)",
          } as any,
        ]}
        pointerEvents="none"
      />
    );
  }
  return (
    <LinearGradient
      colors={["transparent", "rgba(0,0,0,0.92)"]}
      locations={[0, 1]}
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

    // ── UI state (minimal — heavy work stays in refs) ──────────────────────
    const [paused, setPaused] = useState(false);
    const [showBuffering, setShowBuffering] = useState(false);
    const [videoStarted, setVideoStarted] = useState(false);
    const [cachedUri, setCachedUri] = useState<string | null>(null);
    const [videoError, setVideoError] = useState(false);

    // ── Reanimated shared values — run on UI thread ────────────────────────
    const heartScale = useSharedValue(1);
    const dtOpacity = useSharedValue(0);
    const dtScale = useSharedValue(0.3);
    const progressFill = useSharedValue(0);

    // ── Performance refs — avoid setState per frame ────────────────────────
    const bufferingRef = useRef(false);
    const bufferingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const videoStartedRef = useRef(false);
    const lastProgressTs = useRef(0);
    const viewRecorded = useRef(false);
    const cacheAttempted = useRef(false);
    const cacheDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const watchSaved = useRef(false);

    // ── Network-aware source resolution ───────────────────────────────────
    const resolved = useResolvedVideoSource(item.id, item.video_url, {
      targetHeight: getPreferredVideoHeight(),
    });
    const playUri = videoError
      ? item.video_url
      : (cachedUri ?? resolved.uri ?? item.video_url);

    // ── Preload into local cache once item enters the ±1 window ───────────
    useEffect(() => {
      if (!isNearActive || cacheAttempted.current || !item.video_url) return;
      cacheAttempted.current = true;
      cacheDelayTimer.current = setTimeout(() => {
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
        if (cacheDelayTimer.current) {
          clearTimeout(cacheDelayTimer.current);
          cacheDelayTimer.current = null;
        }
      };
    }, [isNearActive, item.video_url]);

    // ── Reset when scrolled away; record view on arrival ──────────────────
    useEffect(() => {
      if (!isActive) {
        setPaused(false);
        setVideoStarted(false);
        setShowBuffering(false);
        progressFill.value = 0;
        videoError && setVideoError(false);
        bufferingRef.current = false;
        videoStartedRef.current = false;
        lastProgressTs.current = 0;
        watchSaved.current = false;
        if (bufferingTimer.current) {
          clearTimeout(bufferingTimer.current);
          bufferingTimer.current = null;
        }
      } else {
        if (!viewRecorded.current) {
          viewRecorded.current = true;
          onView(item.id);
        }
        if (!watchSaved.current) {
          watchSaved.current = true;
          markVideoWatched(item.id, item.video_url, {
            title: `${item.profile.display_name}${item.content ? `: ${item.content.slice(0, 60)}` : ""}`,
            thumbnail: item.image_url,
          }).catch(() => { watchSaved.current = false; });
        }
      }
    }, [isActive]);

    // ── Stop video when far from viewport ─────────────────────────────────
    useEffect(() => {
      if (!isNearActive && videoRef.current) {
        videoRef.current.stopAsync().catch(() => {});
      }
    }, [isNearActive]);

    // ── Animated styles ───────────────────────────────────────────────────
    const heartAnimStyle = useAnimatedStyle(() => ({
      transform: [{ scale: heartScale.value }],
    }));
    const dtAnimStyle = useAnimatedStyle(() => ({
      opacity: dtOpacity.value,
      transform: [{ scale: dtScale.value }],
    }));
    const progressBarStyle = useAnimatedStyle(() => ({
      width: `${progressFill.value * 100}%` as any,
    }));

    // ── Gesture handlers — UI thread, never races with scroll ─────────────
    function triggerLike() {
      onLike(item.id, item.liked);
    }
    function triggerPause() {
      setPaused((p) => !p);
    }

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(250)
      .maxDistance(12)
      .onEnd(() => {
        "worklet";
        if (!item.liked) runOnJS(triggerLike)();
        // Heart burst animation — UI thread
        dtOpacity.value = withSequence(
          withTiming(1, { duration: 80 }),
          withDelay(450, withTiming(0, { duration: 220 })),
        );
        dtScale.value = withSequence(
          withSpring(1, { damping: 10, stiffness: 280 }),
          withDelay(450, withTiming(0.3, { duration: 220 })),
        );
      });

    const singleTap = Gesture.Tap()
      .maxDuration(300)
      .maxDistance(12)
      .onEnd(() => {
        "worklet";
        runOnJS(triggerPause)();
      });

    // Exclusive: double-tap wins; single-tap waits to confirm no second tap
    const composed = Gesture.Exclusive(doubleTap, singleTap);

    // ── Like button press ─────────────────────────────────────────────────
    function handleLikeTap() {
      heartScale.value = withSequence(
        withTiming(0.62, { duration: 75 }),
        withSpring(1, { damping: 8, stiffness: 320 }),
      );
      onLike(item.id, item.liked);
    }

    // ── Playback status ────────────────────────────────────────────────────
    function onPlaybackStatus(status: AVPlaybackStatus) {
      if (!status.isLoaded) return;

      // Buffering — gate behind ref to skip redundant setState calls
      const buffering = status.isBuffering;
      if (buffering !== bufferingRef.current) {
        bufferingRef.current = buffering;
        if (buffering) {
          if (!bufferingTimer.current) {
            bufferingTimer.current = setTimeout(() => {
              setShowBuffering(true);
              bufferingTimer.current = null;
            }, 400);
          }
        } else {
          if (bufferingTimer.current) {
            clearTimeout(bufferingTimer.current);
            bufferingTimer.current = null;
          }
          setShowBuffering(false);
        }
      }

      // Started
      if (status.isPlaying && !videoStartedRef.current) {
        videoStartedRef.current = true;
        setVideoStarted(true);
      }

      // Progress — throttle to ≤4 fps; drive shared value, not state
      if (status.durationMillis && status.durationMillis > 0) {
        const now = Date.now();
        if (now - lastProgressTs.current >= 250) {
          lastProgressTs.current = now;
          progressFill.value = status.positionMillis / status.durationMillis;
        }
      }
    }

    const isOwn = currentUserId === item.author_id;

    return (
      <View style={[styles.item, { width: screenW, height: screenH }]}>

        {/* Thumbnail poster — no black flash before video starts */}
        {item.image_url && !videoStarted ? (
          <ExpoImage
            source={{ uri: item.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            priority="high"
          />
        ) : null}

        {/* Video — native */}
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
              if (!videoError) { setCachedUri(null); setVideoError(true); }
            }}
          />
        )}

        {/* Video — web */}
        {isNearActive && Platform.OS === "web" && (
          // @ts-ignore
          <video
            src={playUri}
            autoPlay={isActive && !paused}
            loop
            playsInline
            style={{
              position: "absolute", top: 0, left: 0,
              width: "100%", height: "100%",
              objectFit: "cover", backgroundColor: "#000",
            }}
            onPlaying={() => { videoStartedRef.current = true; setVideoStarted(true); setShowBuffering(false); }}
            onWaiting={() => setShowBuffering(true)}
            onCanPlay={() => setShowBuffering(false)}
          />
        )}

        {/* Gesture handler — UI thread, sits above video */}
        <GestureDetector gesture={composed}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>

        {/* Double-tap heart burst */}
        <Animated.View
          style={[styles.centerOverlay, dtAnimStyle]}
          pointerEvents="none"
        >
          <Ionicons name="heart" size={96} color="#FF2D55" />
        </Animated.View>

        {/* Pause indicator */}
        {paused && isActive && (
          <View style={styles.centerOverlay} pointerEvents="none">
            <View style={styles.pauseCircle}>
              <Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 3 }} />
            </View>
          </View>
        )}

        {/* Buffering — delayed 400 ms */}
        {showBuffering && isActive && !paused && (
          <View style={styles.centerOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="rgba(255,255,255,0.8)" />
          </View>
        )}

        {/* Bottom gradient */}
        <GradientOverlay />

        {/* Author row + caption */}
        <View style={styles.bottomArea} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id, init_name: item.profile.display_name, init_handle: item.profile.handle, init_avatar: item.profile.avatar_url ?? "" } })}
            style={styles.authorRow}
            activeOpacity={0.8}
          >
            <View style={[styles.avatarRing, { borderColor: accent }]}>
              <Avatar
                uri={item.profile.avatar_url}
                name={item.profile.display_name}
                size={40}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.handle}>@{item.profile.handle}</Text>
              <Text style={styles.displayName} numberOfLines={1}>{item.profile.display_name}</Text>
            </View>
            {!isOwn && !item.following && (
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
            <Text style={styles.caption} numberOfLines={2}>{item.content}</Text>
          ) : null}

          {item.view_count > 0 && (
            <View style={styles.viewRow}>
              <Ionicons name="eye-outline" size={11} color="rgba(255,255,255,0.4)" />
              <Text style={styles.viewText}>{fmt(item.view_count)} views</Text>
            </View>
          )}
        </View>

        {/* Right action rail */}
        <View style={styles.rightCol} pointerEvents="box-none">
          {/* Like */}
          <View style={styles.actionItem}>
            <Animated.View style={heartAnimStyle}>
              <TouchableOpacity onPress={handleLikeTap} hitSlop={12} activeOpacity={0.8}>
                <Ionicons
                  name={item.liked ? "heart" : "heart-outline"}
                  size={32}
                  color={item.liked ? "#FF2D55" : "#fff"}
                />
              </TouchableOpacity>
            </Animated.View>
            <Text style={styles.actionLabel}>{fmt(item.likeCount)}</Text>
          </View>

          {/* Comment */}
          <View style={styles.actionItem}>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/video/[id]", params: { id: item.id } })}
              hitSlop={12}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubble-ellipses" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.actionLabel}>{fmt(item.replyCount)}</Text>
          </View>

          {/* Share */}
          <View style={styles.actionItem}>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/video/[id]", params: { id: item.id } })}
              hitSlop={12}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-redo-outline" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress bar — driven by Reanimated shared value */}
        <View style={styles.progressTrack} pointerEvents="none">
          <Animated.View style={[styles.progressFill, progressBarStyle]} />
        </View>
      </View>
    );
  },
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
    prev.item.view_count === next.item.view_count,
);

// ─── VideoFeed ────────────────────────────────────────────────────────────────

type Props = { tabBarHeight?: number };

export default function VideoFeed({ tabBarHeight = 52 }: Props) {
  const { user, profile } = useAuth();
  const { accent } = useAppAccent();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();

  const ITEM_H = SCREEN_H - tabBarHeight;

  const [posts, setPosts] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const postsLenRef = useRef(0);
  const activeIndexRef = useRef(0);

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { postsLenRef.current = posts.length; }, [posts.length]);

  // ── Data ──────────────────────────────────────────────────────────────────

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
          ? supabase.from("post_acknowledgments").select("post_id")
              .in("post_id", postIds).eq("user_id", user.id)
          : Promise.resolve({ data: [] }),
        user
          ? supabase.from("follows").select("following_id")
              .eq("follower_id", user.id).in("following_id", authorIds)
          : Promise.resolve({ data: [] }),
      ]);

      const likeMap: Record<string, number> = {};
      for (const l of likesData || []) likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1;
      const replyMap: Record<string, number> = {};
      for (const r of repliesData || []) replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1;
      const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
      const followSet = new Set((myFollows || []).map((f: any) => f.following_id));

      return rawPosts.map((p: any) => ({
        id: p.id,
        author_id: p.author_id,
        content: p.content || "",
        video_url: p.video_url,
        image_url: p.image_url,
        created_at: p.created_at,
        view_count: p.view_count || 0,
        profile: p.profiles ?? { display_name: "User", handle: "user", avatar_url: null },
        liked: myLikeSet.has(p.id),
        likeCount: likeMap[p.id] || 0,
        replyCount: replyMap[p.id] || 0,
        following: followSet.has(p.author_id),
      }));
    },
    [user],
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
        .select(`id, author_id, content, video_url, image_url, created_at, view_count,
                 profiles!posts_author_id_fkey(display_name, handle, avatar_url)`)
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
        const more = data.length === PAGE_SIZE;
        setHasMore(more);
        hasMoreRef.current = more;
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
    [enrichPosts],
  );

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  // ── Interactions ──────────────────────────────────────────────────────────

  const handleLike = useCallback(
    async (postId: string, currentlyLiked: boolean) => {
      if (!user) { router.push("/(auth)/login" as any); return; }
      const post = posts.find((p) => p.id === postId);
      if (!post) return;

      if (currentlyLiked) {
        await supabase.from("post_acknowledgments").delete()
          .eq("post_id", postId).eq("user_id", user.id);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p
          )
        );
      } else {
        await supabase.from("post_acknowledgments").insert({ post_id: postId, user_id: user.id });
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
    [user, profile, posts],
  );

  const handleFollow = useCallback(
    async (authorId: string) => {
      if (!user) { router.push("/(auth)/login" as any); return; }
      setPosts((prev) =>
        prev.map((p) => (p.author_id === authorId ? { ...p, following: true } : p))
      );
      await supabase.from("follows").insert({ follower_id: user.id, following_id: authorId });
      try {
        notifyNewFollow({ targetUserId: authorId, followerName: profile?.display_name || "Someone", followerUserId: user.id });
      } catch (_) {}
      try {
        const { rewardXp } = await import("../lib/rewardXp");
        rewardXp("follow_user");
      } catch (_) {}
    },
    [user, profile],
  );

  const recordedViews = useRef(new Set<string>());
  const handleView = useCallback(
    async (postId: string) => {
      if (!user || recordedViews.current.has(postId)) return;
      recordedViews.current.add(postId);
      supabase.from("post_views")
        .upsert({ post_id: postId, viewer_id: user.id }, { onConflict: "post_id,viewer_id" })
        .then(null, () => {});
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, view_count: p.view_count + 1 } : p))
      );
    },
    [user],
  );

  // ── FlatList config ───────────────────────────────────────────────────────

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        const idx = viewableItems[0].index;
        activeIndexRef.current = idx;
        setActiveIndex(idx);

        // Pre-fetch next page when 3 from the end
        if (
          idx >= postsLenRef.current - 3 &&
          !loadingMoreRef.current &&
          hasMoreRef.current &&
          cursorRef.current
        ) {
          // call handled in onEndReached
        }
      }
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: ITEM_H, offset: ITEM_H * index, index }),
    [ITEM_H],
  );

  const stableOnLike = useCallback(handleLike, [handleLike]);
  const stableOnFollow = useCallback(handleFollow, [handleFollow]);
  const stableOnView = useCallback(handleView, [handleView]);

  const renderItem = useCallback(
    ({ item, index }: { item: VideoPost; index: number }) => (
      <VideoItem
        item={item}
        isActive={index === activeIndexRef.current}
        isNearActive={Math.abs(index - activeIndexRef.current) <= 1}
        screenW={SCREEN_W}
        screenH={ITEM_H}
        onLike={stableOnLike}
        onFollow={stableOnFollow}
        onView={stableOnView}
        currentUserId={user?.id}
      />
    ),
    // activeIndex intentionally omitted — read from ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_W, ITEM_H, stableOnLike, stableOnFollow, stableOnView, user?.id],
  );

  const onEndReached = useCallback(() => {
    if (!loadingMoreRef.current && hasMore && cursorRef.current) {
      fetchVideos(cursorRef.current);
    }
  }, [hasMore, fetchVideos]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <VideoFeedSkeleton />;

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
      extraData={activeIndex}
      // ── Snap config — more reliable than pagingEnabled on Android ────────
      snapToInterval={ITEM_H}
      snapToAlignment="start"
      disableIntervalMomentum
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      // ── Viewability ───────────────────────────────────────────────────────
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      // ── Performance ───────────────────────────────────────────────────────
      getItemLayout={getItemLayout}
      windowSize={3}
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews={false}
      // ── Pagination ────────────────────────────────────────────────────────
      onEndReached={onEndReached}
      onEndReachedThreshold={2}
      // ── Style ─────────────────────────────────────────────────────────────
      style={{ flex: 1, backgroundColor: "#000" }}
      contentContainerStyle={{ backgroundColor: "#000" }}
      ListFooterComponent={
        loadingMore ? (
          <View style={[styles.center, { height: ITEM_H, backgroundColor: "#000" }]}>
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
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
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
  pauseCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  gradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 380,
  },
  bottomArea: {
    position: "absolute",
    bottom: 70,
    left: 16,
    right: 82,
    gap: 6,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarRing: {
    borderWidth: 2,
    borderRadius: 24,
    padding: 1,
  },
  handle: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  displayName: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1.2,
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  followBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  caption: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  viewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  viewText: {
    color: "rgba(255,255,255,0.38)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  rightCol: {
    position: "absolute",
    bottom: 82,
    right: 12,
    gap: 24,
    alignItems: "center",
  },
  actionItem: {
    alignItems: "center",
    gap: 4,
  },
  actionLabel: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderRadius: 1,
  },
});
