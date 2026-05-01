/**
 * ShortsFeed — vertical short-video feed (TikTok / YouTube Shorts style).
 *
 *   • Two layouts:
 *       - "fullscreen" (mobile): edge-to-edge video, action rail overlaid on
 *         the right, author + caption + audio overlaid on the bottom-left,
 *         with the host (`discover.tsx`) hiding the bottom tab bar so the
 *         experience is fully immersive like TikTok.
 *       - "card" (desktop): a 9:16 card centered in the column with the
 *         action rail living *next* to the player, not on top of it.
 *   • Real play/pause: tap the player to toggle.
 *   • Mute toggle, like, comment, bookmark, share, in-rail follow CTA.
 *   • On web we use a native <video> element for the lowest-latency start-up;
 *     on native we use <Video /> from expo-av.
 *   • The active card and its two neighbours are mounted so swiping feels
 *     instant — neighbours preload metadata silently in the background.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { useResolvedVideoSource } from "@/hooks/useResolvedVideoSource";
import { sharePost } from "@/lib/share";

type ShortPost = {
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
  bookmarked: boolean;
  following: boolean;
};

export type ShortsFilter = "for_you" | "following";
export type ShortsLayout = "fullscreen" | "card";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                       Web-only HTML5 video player                       */
/* ─────────────────────────────────────────────────────────────────────── */

function WebShortsPlayer({
  src,
  active,
  paused,
  muted,
  preloadOnly,
  onTogglePause,
  onEnded,
}: {
  src: string;
  active: boolean;
  paused: boolean;
  muted: boolean;
  preloadOnly: boolean;
  onTogglePause: () => void;
  onEnded: () => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [showControls, setShowControls] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drive playback from React state.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active && !paused && !preloadOnly) {
      const playPromise = el.play();
      if (playPromise && typeof (playPromise as any).catch === "function") {
        (playPromise as any).catch(() => { /* autoplay blocked — user must tap */ });
      }
    } else {
      el.pause();
    }
  }, [active, paused, src, preloadOnly]);

  // Reset to start when becoming inactive so re-entry plays from the top.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) {
      try { el.currentTime = 0; } catch { /* ignore */ }
    }
  }, [active]);

  // Keep mute in sync.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = muted;
  }, [muted]);

  function handlePointer() {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 1500);
  }

  // Stop click bubbling so the parent layout can never end up double-handling
  // the same press (which previously made pause/play look stuck).
  function handleClick(e: any) {
    if (preloadOnly) return;
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    onTogglePause();
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* @ts-expect-error react-native-web exposes raw HTML elements via createElement */}
      <video
        ref={ref}
        src={src}
        playsInline
        loop
        muted={muted}
        preload="auto"
        onClick={handleClick}
        onMouseMove={preloadOnly ? undefined : handlePointer}
        onEnded={onEnded}
        style={{
          width: "100%",
          height: "100%",
          // Show the video in its original aspect ratio with no cropping —
          // matches YouTube Shorts desktop behaviour and the /video/[id] page.
          objectFit: "contain",
          backgroundColor: "#000",
          cursor: preloadOnly ? "default" : "pointer",
        }}
      />
      {!preloadOnly && (paused || showControls) && (
        <Pressable
          onPress={onTogglePause}
          style={styles.centerPlayBtn}
          pointerEvents="box-only"
        >
          <View style={styles.centerPlayCircle}>
            <Ionicons name={paused ? "play" : "pause"} size={36} color="#fff" />
          </View>
        </Pressable>
      )}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                          Native expo-av player                          */
/* ─────────────────────────────────────────────────────────────────────── */

function NativeShortsPlayer({
  src,
  active,
  paused,
  muted,
  preloadOnly,
  onTogglePause,
}: {
  src: string;
  active: boolean;
  paused: boolean;
  muted: boolean;
  preloadOnly: boolean;
  onTogglePause: () => void;
}) {
  const ref = useRef<Video>(null);
  return (
    <TouchableOpacity
      activeOpacity={1}
      style={StyleSheet.absoluteFill}
      onPress={preloadOnly ? undefined : onTogglePause}
    >
      <Video
        ref={ref}
        source={{ uri: src }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={active && !paused && !preloadOnly}
        isLooping
        isMuted={muted}
      />
      {!preloadOnly && paused && (
        <View style={styles.centerPlayBtn} pointerEvents="none">
          <View style={styles.centerPlayCircle}>
            <Ionicons name="play" size={36} color="#fff" />
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                          Single Short card                              */
/* ─────────────────────────────────────────────────────────────────────── */

function ShortCard({
  item,
  active,
  preloadOnly,
  layout,
  cardWidth,
  cardHeight,
  bottomInset,
  globalMuted,
  onToggleGlobalMuted,
  onLike,
  onBookmark,
  onFollow,
  currentUserId,
  activeToggleRef,
}: {
  item: ShortPost;
  active: boolean;
  preloadOnly: boolean;
  layout: ShortsLayout;
  cardWidth: number;
  cardHeight: number;
  bottomInset: number;
  globalMuted: boolean;
  onToggleGlobalMuted: () => void;
  onLike: (postId: string, liked: boolean) => void;
  onBookmark: (postId: string, bookmarked: boolean) => void;
  onFollow: (authorId: string) => void;
  currentUserId?: string;
  activeToggleRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const { colors } = useTheme();
  const [paused, setPaused] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  // Mobile fullscreen aims for 480p so the first frame arrives quickly;
  // desktop card asks for 720p since the surface is larger.
  const targetHeight = layout === "fullscreen" ? 480 : 720;
  const resolved = useResolvedVideoSource(item.id, item.video_url, { targetHeight });
  const src = resolved.uri || item.video_url;
  const isFullscreen = layout === "fullscreen";

  function handleTogglePause() {
    setPaused((p) => !p);
  }

  function handleLike() {
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 0.7, duration: 80, useNativeDriver: Platform.OS !== "web" }),
      Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 8, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
    onLike(item.id, item.liked);
  }

  // Reset paused state when the card becomes active again.
  useEffect(() => {
    if (active) setPaused(false);
  }, [active]);

  // Register/unregister the pause toggle for the page-level keyboard handler.
  useEffect(() => {
    if (Platform.OS !== "web" || !activeToggleRef || !active) return;
    activeToggleRef.current = () => setPaused((p) => !p);
    return () => {
      if (activeToggleRef.current) activeToggleRef.current = null;
    };
  }, [active, activeToggleRef]);

  const isOwnVideo = currentUserId === item.author_id;
  const showFollowBtn = !isOwnVideo && !item.following;

  // ─── Fullscreen (mobile) ────────────────────────────────────────────
  if (isFullscreen) {
    return (
      <View style={[styles.fullCard, { width: cardWidth, height: cardHeight, backgroundColor: "#000" }]}>
        {Platform.OS === "web" ? (
          <WebShortsPlayer
            src={src}
            active={active}
            paused={paused}
            preloadOnly={preloadOnly}
            muted={globalMuted}
            onTogglePause={handleTogglePause}
            onEnded={() => { /* loop handled natively */ }}
          />
        ) : (
          <NativeShortsPlayer
            src={src}
            active={active}
            paused={paused}
            preloadOnly={preloadOnly}
            muted={globalMuted}
            onTogglePause={handleTogglePause}
          />
        )}

        {/* TikTok-style right-side action rail, overlaid on the video */}
        <View style={[styles.fullRail, { bottom: bottomInset + 90 }]} pointerEvents="box-none">
          <Pressable
            onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } } as any)}
            style={styles.fullAvatarWrap}
          >
            <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={44} />
            {showFollowBtn ? (
              <View style={styles.fullFollowBadge}>
                <Ionicons name="add" size={14} color="#fff" />
              </View>
            ) : null}
          </Pressable>

          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Pressable onPress={handleLike} style={styles.fullActionBtn} hitSlop={6}>
              <Ionicons
                name={item.liked ? "heart" : "heart-outline"}
                size={32}
                color={item.liked ? "#FF3B30" : "#fff"}
              />
              <Text style={styles.fullActionLabel}>{formatCount(item.likeCount)}</Text>
            </Pressable>
          </Animated.View>

          <Pressable
            onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } } as any)}
            style={styles.fullActionBtn}
            hitSlop={6}
          >
            <Ionicons name="chatbubble-ellipses" size={30} color="#fff" />
            <Text style={styles.fullActionLabel}>{formatCount(item.replyCount)}</Text>
          </Pressable>

          <Pressable
            onPress={() => onBookmark(item.id, item.bookmarked)}
            style={styles.fullActionBtn}
            hitSlop={6}
          >
            <Ionicons
              name={item.bookmarked ? "bookmark" : "bookmark-outline"}
              size={28}
              color={item.bookmarked ? "#FFD60A" : "#fff"}
            />
          </Pressable>

          <Pressable
            onPress={() => sharePost({
              postId: item.id,
              authorName: item.profile.display_name,
              content: item.content,
            })}
            style={styles.fullActionBtn}
            hitSlop={6}
          >
            <Ionicons name="arrow-redo" size={30} color="#fff" />
          </Pressable>
        </View>

        {/* Bottom-left: author + caption + audio source */}
        <View style={[styles.fullBottomInfo, { bottom: bottomInset + 14 }]} pointerEvents="box-none">
          <Pressable
            onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } } as any)}
            style={styles.fullAuthorRow}
          >
            <Text style={styles.fullHandle} numberOfLines={1}>@{item.profile.handle}</Text>
          </Pressable>
          {item.content ? (
            <Text style={styles.fullCaption} numberOfLines={2}>{item.content}</Text>
          ) : null}
          <View style={styles.fullAudioRow}>
            <Ionicons name="musical-notes" size={12} color="#fff" />
            <Text style={styles.fullAudioText} numberOfLines={1}>
              Original audio · {item.profile.display_name}
            </Text>
          </View>
        </View>

        {/* Top-right mute (subtle) */}
        <Pressable
          onPress={onToggleGlobalMuted}
          style={[styles.muteBtn, { top: 60 }]}
          hitSlop={8}
        >
          <Ionicons name={globalMuted ? "volume-mute" : "volume-high"} size={18} color="#fff" />
        </Pressable>
      </View>
    );
  }

  // ─── Card (desktop) ────────────────────────────────────────────────
  return (
    <View style={[styles.cardOuter, { height: cardHeight }]}>
      <View style={[styles.cardInner, { width: cardWidth, height: cardHeight, backgroundColor: "#000" }]}>
        {Platform.OS === "web" ? (
          <WebShortsPlayer
            src={src}
            active={active}
            paused={paused}
            preloadOnly={preloadOnly}
            muted={globalMuted}
            onTogglePause={handleTogglePause}
            onEnded={() => { /* loop handled natively */ }}
          />
        ) : (
          <NativeShortsPlayer
            src={src}
            active={active}
            paused={paused}
            preloadOnly={preloadOnly}
            muted={globalMuted}
            onTogglePause={handleTogglePause}
          />
        )}

        {/* Bottom info overlay */}
        <View style={styles.bottomInfo} pointerEvents="box-none">
          <Pressable
            onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } } as any)}
            style={styles.authorRow}
          >
            <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.authorHandle} numberOfLines={1}>@{item.profile.handle}</Text>
              <Text style={styles.authorName} numberOfLines={1}>{item.profile.display_name}</Text>
            </View>
            {showFollowBtn ? (
              <Pressable
                onPress={() => onFollow(item.author_id)}
                style={({ hovered }: any) => [
                  styles.followInline,
                  { backgroundColor: hovered ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)" },
                ]}
              >
                <Text style={styles.followInlineText}>Follow</Text>
              </Pressable>
            ) : null}
          </Pressable>
          {item.content ? (
            <Text style={styles.caption} numberOfLines={3}>{item.content}</Text>
          ) : null}
        </View>

        {/* Top-right mute */}
        <Pressable
          onPress={onToggleGlobalMuted}
          style={styles.muteBtn}
          hitSlop={8}
        >
          <Ionicons name={globalMuted ? "volume-mute" : "volume-high"} size={18} color="#fff" />
        </Pressable>
      </View>

      {/* Right-side action rail (sits next to the 9:16 player on desktop) */}
      <View style={styles.rightRail} pointerEvents="box-none">
        <View style={styles.actionItem}>
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Pressable onPress={handleLike} style={({ hovered }: any) => [
              styles.actionBubble,
              { backgroundColor: hovered ? colors.backgroundTertiary : colors.surface },
            ]}>
              <Ionicons
                name={item.liked ? "heart" : "heart-outline"}
                size={26}
                color={item.liked ? "#FF3B30" : colors.text}
              />
            </Pressable>
          </Animated.View>
          <Text style={[styles.actionLabel, { color: colors.text }]}>{formatCount(item.likeCount)}</Text>
        </View>
        <View style={styles.actionItem}>
          <Pressable
            onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } } as any)}
            style={({ hovered }: any) => [
              styles.actionBubble,
              { backgroundColor: hovered ? colors.backgroundTertiary : colors.surface },
            ]}
          >
            <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.actionLabel, { color: colors.text }]}>{formatCount(item.replyCount)}</Text>
        </View>
        <View style={styles.actionItem}>
          <Pressable
            onPress={() => onBookmark(item.id, item.bookmarked)}
            style={({ hovered }: any) => [
              styles.actionBubble,
              { backgroundColor: hovered ? colors.backgroundTertiary : colors.surface },
            ]}
          >
            <Ionicons
              name={item.bookmarked ? "bookmark" : "bookmark-outline"}
              size={22}
              color={item.bookmarked ? "#FFD60A" : colors.text}
            />
          </Pressable>
        </View>
        <View style={styles.actionItem}>
          <Pressable
            onPress={() => sharePost({
              postId: item.id,
              authorName: item.profile.display_name,
              content: item.content,
            })}
            style={({ hovered }: any) => [
              styles.actionBubble,
              { backgroundColor: hovered ? colors.backgroundTertiary : colors.surface },
            ]}
          >
            <Ionicons name="arrow-redo-outline" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.actionLabel, { color: colors.text }]}>Share</Text>
        </View>
      </View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Feed list                                  */
/* ─────────────────────────────────────────────────────────────────────── */

export default function ShortsFeed({
  topInset = 0,
  bottomInset = 0,
  layout = "card",
  filter = "for_you",
}: {
  topInset?: number;
  bottomInset?: number;
  layout?: ShortsLayout;
  filter?: ShortsFilter;
}) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const [posts, setPosts] = useState<ShortPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [globalMuted, setGlobalMuted] = useState(true);

  const isFullscreen = layout === "fullscreen";

  const cardHeight = useMemo(() => {
    if (isFullscreen) return Math.max(360, winH);
    const usable = winH - topInset;
    return Math.max(360, usable);
  }, [winH, topInset, isFullscreen]);

  const cardWidth = useMemo(() => {
    if (isFullscreen) return winW;
    const target = (cardHeight - 32) * (9 / 16);
    const maxByCol = Math.min(420, winW - 200);
    return Math.min(maxByCol, Math.max(280, target));
  }, [cardHeight, winW, isFullscreen]);

  const load = useCallback(async () => {
    setLoading(true);

    // For Following filter we narrow to the user's follow set.
    let followingAuthorIds: string[] | null = null;
    if (filter === "following" && user) {
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);
      followingAuthorIds = (follows || []).map((r: any) => r.following_id as string);
      if (followingAuthorIds.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }
    }

    let query = supabase
      .from("posts")
      .select(`
        id, author_id, content, video_url, created_at, view_count,
        profiles!posts_author_id_fkey(display_name, handle, avatar_url)
      `)
      .eq("post_type", "video")
      .eq("visibility", "public")
      .eq("is_blocked", false)
      .not("video_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(30);

    if (followingAuthorIds) {
      query = query.in("author_id", followingAuthorIds);
    }

    const { data } = await query;

    if (!data || data.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const postIds = data.map((p: any) => p.id);
    const authorIds = [...new Set(data.map((p: any) => p.author_id as string))];

    const [
      { data: likesData },
      { data: repliesData },
      { data: myLikes },
      { data: myFollows },
      { data: myBookmarks },
    ] = await Promise.all([
      supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
      supabase.from("post_replies").select("post_id").in("post_id", postIds),
      user
        ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id)
        : Promise.resolve({ data: [] as any[] }),
      user
        ? supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", authorIds)
        : Promise.resolve({ data: [] as any[] }),
      user
        ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const likeMap: Record<string, number> = {};
    for (const l of likesData || []) likeMap[(l as any).post_id] = (likeMap[(l as any).post_id] || 0) + 1;
    const replyMap: Record<string, number> = {};
    for (const r of repliesData || []) replyMap[(r as any).post_id] = (replyMap[(r as any).post_id] || 0) + 1;
    const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
    const followingSet = new Set((myFollows || []).map((f: any) => f.following_id as string));
    const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id));

    setPosts(
      data.map((p: any) => ({
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
        bookmarked: myBookmarkSet.has(p.id),
        following: followingSet.has(p.author_id),
      })),
    );
    setLoading(false);
  }, [user, filter]);

  useEffect(() => { load(); }, [load]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first && typeof first.index === "number") {
      setActiveIndex(first.index);
    }
  }).current;

  const listRef = useRef<FlatList>(null);
  // Pause toggle exposed by the active card so the page-level Space key
  // listener can drive it without prop-drilling.
  const activeToggleRef = useRef<(() => void) | null>(null);

  // Web keyboard controls: Space → pause/play, ArrowUp/Down → prev/next.
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
        const next = Math.min(activeIndex + 1, Math.max(posts.length - 1, 0));
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
  }, [activeIndex, posts.length]);

  async function toggleLike(postId: string, currentlyLiked: boolean) {
    if (!user) { router.push("/(auth)/login" as any); return; }
    if (currentlyLiked) {
      await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
    } else {
      await supabase.from("post_acknowledgments").insert({ post_id: postId, user_id: user.id });
    }
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, liked: !currentlyLiked, likeCount: Math.max(0, p.likeCount + (currentlyLiked ? -1 : 1)) }
          : p,
      ),
    );
  }

  async function toggleBookmark(postId: string, currentlyBookmarked: boolean) {
    if (!user) { router.push("/(auth)/login" as any); return; }
    if (currentlyBookmarked) {
      await supabase.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", user.id);
    } else {
      await supabase.from("post_bookmarks").upsert(
        { post_id: postId, user_id: user.id },
        { onConflict: "post_id,user_id" },
      );
    }
    setPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, bookmarked: !currentlyBookmarked } : p,
    ));
  }

  async function toggleFollow(authorId: string) {
    if (!user) { router.push("/(auth)/login" as any); return; }
    await supabase
      .from("follows")
      .upsert({ follower_id: user.id, following_id: authorId }, { onConflict: "follower_id,following_id" });
    setPosts((prev) => prev.map((p) => p.author_id === authorId ? { ...p, following: true } : p));
  }

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: isFullscreen ? "#000" : colors.background }]}>
        <ActivityIndicator color={isFullscreen ? "#fff" : colors.accent} />
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={[styles.loading, { backgroundColor: isFullscreen ? "#000" : colors.background }]}>
        <Ionicons name="videocam-outline" size={48} color={isFullscreen ? "rgba(255,255,255,0.6)" : colors.textMuted} />
        <Text style={{
          color: isFullscreen ? "#fff" : colors.text,
          fontFamily: "Inter_600SemiBold", fontSize: 16, marginTop: 12,
        }}>
          {filter === "following" ? "No shorts from people you follow" : "No shorts yet"}
        </Text>
        <Text style={{
          color: isFullscreen ? "rgba(255,255,255,0.6)" : colors.textMuted,
          fontFamily: "Inter_400Regular", fontSize: 13,
          marginTop: 4, textAlign: "center", paddingHorizontal: 32,
        }}>
          {filter === "following" ? "Follow creators to see their shorts here." : "Be the first to post a short video."}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      data={posts}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => {
        // Mount the active card and its 2 neighbours so swipes feel instant —
        // neighbours render hidden but with preload="auto" so the first frame
        // is ready by the time the user gets there.
        const distance = Math.abs(index - activeIndex);
        const preloadOnly = distance > 0 && distance <= 2;
        return (
          <ShortCard
            item={item}
            active={index === activeIndex}
            preloadOnly={preloadOnly}
            layout={layout}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            bottomInset={bottomInset}
            globalMuted={globalMuted}
            onToggleGlobalMuted={() => setGlobalMuted((m) => !m)}
            onLike={toggleLike}
            onBookmark={toggleBookmark}
            onFollow={toggleFollow}
            currentUserId={user?.id}
            activeToggleRef={activeToggleRef}
          />
        );
      }}
      pagingEnabled
      snapToAlignment="start"
      snapToInterval={cardHeight}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      getItemLayout={(_, index) => ({ length: cardHeight, offset: cardHeight * index, index })}
      windowSize={5}
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      style={{ backgroundColor: isFullscreen ? "#000" : colors.background }}
    />
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  /* ── Desktop card layout ────────────────────────────────────────── */
  cardOuter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 12,
  },
  cardInner: {
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  bottomInfo: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 16,
    gap: 8,
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  authorHandle: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  authorName: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_400Regular" },
  caption: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  followInline: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
  followInlineText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  muteBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  centerPlayBtn: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  centerPlayCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  rightRail: {
    flexDirection: "column",
    alignItems: "center",
    gap: 18,
    paddingTop: 60,
  },
  actionItem: { alignItems: "center", gap: 4 },
  actionBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  actionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  /* ── Fullscreen (mobile) layout ─────────────────────────────────── */
  fullCard: {
    position: "relative",
    overflow: "hidden",
  },
  fullRail: {
    position: "absolute",
    right: 10,
    alignItems: "center",
    gap: 18,
  },
  fullAvatarWrap: {
    position: "relative",
    marginBottom: 4,
  },
  fullFollowBadge: {
    position: "absolute",
    bottom: -6,
    left: "50%",
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  fullActionBtn: {
    alignItems: "center",
    gap: 2,
    minWidth: 48,
  },
  fullActionLabel: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  fullBottomInfo: {
    position: "absolute",
    left: 14,
    right: 80,
    gap: 6,
  },
  fullAuthorRow: { flexDirection: "row", alignItems: "center" },
  fullHandle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  fullCaption: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  fullAudioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  fullAudioText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
