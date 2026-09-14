import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { router, useLocalSearchParams } from "expo-router";
import { navigateToProfile } from "@/lib/navigateToProfile";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { shareStory } from "@/lib/share";
import { hydrateViewedUsers, markStoriesViewed } from "@/lib/storyViewedStore";
import { safePause, safePlay } from "@/lib/safeMedia";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCachedStoryMedia } from "@/lib/storyMediaCache";

const STORY_DURATION = 5000;
const STORY_LIST_CACHE_PREFIX = "@afuchat:story_list:";
const DISCOVER_STORY_CACHE_KEY = "@afuchat:discover_story_list";

type Story = {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  view_count: number;
  like_count: number;
  user_id: string;
  profile: {
    display_name: string;
    avatar_url: string | null;
    handle: string;
    is_verified?: boolean;
    is_organization_verified?: boolean;
  };
};

type Viewer = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  handle: string;
  viewed_at: string;
  is_verified?: boolean;
  is_organization_verified?: boolean;
};

export default function ViewStoryScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  const [stories, setStories] = useState<Story[]>([]);
  const [storiesLoaded, setStoriesLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaDownloading, setMediaDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  // expo-video's web replace() calls HTMLMediaElement.play() without
  // handling its promise. Give web a new player with the resolved source
  // instead of replacing a currently loading source; native keeps the
  // existing player/replacement lifecycle below.
  const storyVideoPlayer = useVideoPlayer(
    Platform.OS === "web" && mediaUri ? { uri: mediaUri } : null,
    (p) => { p.loop = false; p.muted = false; },
  );
  const storyVideoRef = useRef<VideoView>(null);
  const [inPip, setInPip] = useState(false);
  const videoFinishedRef = React.useRef(false);

  // Keyboard height — needed because bottomRow is position:absolute so
  // KeyboardAvoidingView cannot lift it; we track manually on both platforms.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0),
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Viewers sheet
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Share sheet
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [chatList, setChatList] = useState<{ id: string; name: string; avatar_url: string | null }[]>([]);

  // Comment
  const [commentText, setCommentText] = useState("");
  const [sendingComment, setSendingComment] = useState(false);

  // Like state — per story id: { liked: boolean, count: number }
  const [likeState, setLikeState] = useState<Record<string, { liked: boolean; count: number }>>({});
  const likeInFlight = useRef(new Set<string>());

  // Progress animation
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Always compute panelH/translateY before any early return.
  // useMemo keeps the Animated.AnimatedInterpolation stable between renders
  // (preventing _validateTransforms flicker) while still updating when
  // screenH changes (e.g. orientation flip).
  const panelH = (screenH || 812) * 0.52;
  const translateY = useMemo(
    () => slideAnim.interpolate({ inputRange: [0, 1], outputRange: [panelH, 0] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelH]
  );

  const isOwner = user?.id === userId;

  // ── Load stories ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    setStoriesLoaded(false);
    let cancelled = false;
    const applyStories = (rows: any[]) => {
      if (cancelled) return;
      const visible = rows.filter((s: any) => {
        if (s.user_id !== userId) return false;
        if (!s.expires_at || new Date(s.expires_at).getTime() <= Date.now()) return false;
        const p = s.privacy || "everyone";
        if (p === "only_me" && s.user_id !== user?.id) return false;
        if (p === "close_friends" && s.user_id !== user?.id) return false;
        return true;
      });
      const mapped = visible.map((s: any) => ({ ...s, profile: s.profiles ?? s.profile, like_count: 0 }));
      setStories(mapped);
      const storyIds = mapped.map((s: any) => s.id);
      if (storyIds.length > 0) loadLikeState(storyIds);
    };
    (async () => {
      await hydrateViewedUsers();
      // Show cached story metadata immediately. The media cache resolves the
      // actual image/video locally, so reopening a downloaded story works
      // without a network request.
      const cached = await AsyncStorage.getItem(`${STORY_LIST_CACHE_PREFIX}${userId}`)
        .catch(() => null)
        .then(async (value) => value ?? AsyncStorage.getItem(DISCOVER_STORY_CACHE_KEY).catch(() => null));
      if (cached) {
        try { applyStories(JSON.parse(cached)); } catch {}
      }
      try {
        const { data } = await supabase
          .from("stories")
          .select("id, media_url, media_type, caption, privacy, created_at, expires_at, view_count, user_id, profiles!stories_user_id_fkey(display_name, avatar_url, handle, is_verified, is_organization_verified)")
          .eq("user_id", userId)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: true });
        if (data && data.length > 0) {
          applyStories(data);
          AsyncStorage.setItem(`${STORY_LIST_CACHE_PREFIX}${userId}`, JSON.stringify(data)).catch(() => {});
        } else if (data && data.length === 0) {
          AsyncStorage.removeItem(`${STORY_LIST_CACHE_PREFIX}${userId}`).catch(() => {});
        }
      } catch {
        // Offline: retain the cached list and let getCachedStoryMedia serve it.
      } finally {
        if (!cancelled) setStoriesLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // ── Fetch like counts + my likes for all stories ────────────────────────────
  async function loadLikeState(storyIds: string[]) {
    try {
      const [{ data: counts }, { data: myLikes }] = await Promise.all([
        supabase
          .from("story_likes")
          .select("story_id")
          .in("story_id", storyIds),
        user
          ? supabase
              .from("story_likes")
              .select("story_id")
              .in("story_id", storyIds)
              .eq("user_id", user.id)
          : Promise.resolve({ data: [] }),
      ]);

      const countMap: Record<string, number> = {};
      for (const l of counts || []) {
        countMap[l.story_id] = (countMap[l.story_id] || 0) + 1;
      }
      const likedSet = new Set((myLikes || []).map((l: any) => l.story_id));

      const next: Record<string, { liked: boolean; count: number }> = {};
      for (const id of storyIds) {
        next[id] = { liked: likedSet.has(id), count: countMap[id] || 0 };
      }
      setLikeState(next);
    } catch {
      // story_likes table may not exist yet — graceful no-op
    }
  }

  // ── Realtime — live new stories, view counts, and like counts ───────────────
  useEffect(() => {
    if (!userId || !storiesLoaded) return;

    const storyIds = stories.map((s) => s.id);

    const channel = supabase
      .channel(`story-viewer-rt-${userId}`)
      // New story posted by this user while viewer is open → append it
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stories", filter: `user_id=eq.${userId}` },
        (payload) => {
          const s = payload.new as any;
          const p = s.privacy || "everyone";
          if (p === "only_me" && s.user_id !== user?.id) return;
          if (p === "close_friends" && s.user_id !== user?.id) return;
          const profile = stories[0]?.profile;
          if (!profile) return;
          setStories((prev) => {
            if (prev.find((x) => x.id === s.id)) return prev;
            return [...prev, { ...s, profile, like_count: 0 }];
          });
        },
      )
      // view_count updated (another user viewed this story) → keep owner's counter live
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "stories" },
        (payload) => {
          const updated = payload.new as any;
          setStories((prev) =>
            prev.map((s) =>
              s.id === updated.id
                ? { ...s, view_count: updated.view_count ?? s.view_count }
                : s,
            ),
          );
        },
      )
      // Like added
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "story_likes" },
        (payload) => {
          const { story_id, user_id: liker } = payload.new as any;
          if (!storyIds.includes(story_id)) return;
          setLikeState((prev) => {
            const curr = prev[story_id];
            if (!curr) return prev;
            // Don't double-count our own optimistic update
            if (liker === user?.id) return prev;
            return { ...prev, [story_id]: { ...curr, count: curr.count + 1 } };
          });
        },
      )
      // Like removed (story_likes has REPLICA IDENTITY FULL so old row is included)
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "story_likes" },
        (payload) => {
          const { story_id, user_id: unliker } = (payload.old ?? {}) as any;
          if (!story_id || !storyIds.includes(story_id)) return;
          setLikeState((prev) => {
            const curr = prev[story_id];
            if (!curr) return prev;
            if (unliker === user?.id) return prev; // own optimistic update already applied
            return { ...prev, [story_id]: { ...curr, count: Math.max(0, curr.count - 1) } };
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // Re-subscribe when stories first load or userId changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, storiesLoaded]);

  // ── Navigation (must be declared BEFORE effects that reference them) ──────────
  const story = stories[index];
  const isVideoStory = story?.media_type === "video";

  // Resolve every story to permanent local storage before starting playback.
  // A cached file is reused immediately, including when the device is offline.
  useEffect(() => {
    if (!story?.id || !story.media_url) return;
    let cancelled = false;
    setMediaUri(null);
    setMediaReady(false);
      setMediaError(false);
    setMediaDownloading(true);
    setDownloadProgress(0);
    getCachedStoryMedia(story.id, story.media_url, story.media_type, (p) => {
      if (!cancelled) setDownloadProgress(p);
    })
      .then((uri) => {
        if (!cancelled) {
          setMediaUri(uri);
          setMediaDownloading(false);
        }
      })
      .catch(() => {
        // A remote fallback still allows already-cached platform media to play.
        if (!cancelled) {
          setMediaUri(story.media_url);
          setMediaDownloading(false);
        }
      });
    return () => { cancelled = true; };
  }, [story?.id, story?.media_url, story?.media_type]);

  const goNext = useCallback(() => {
    if (index < stories.length - 1) {
      setIndex((i) => i + 1);
    } else {
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/discover" as any);
    }
  }, [index, stories.length]);

  const goPrev = useCallback(() => {
    if (index > 0) setIndex((i) => i - 1);
  }, [index]);

  // ── Video player: update source + play/pause when story changes ──────────────
  useEffect(() => {
    videoFinishedRef.current = false;
    if (!isVideoStory || !mediaUri) { safePause(storyVideoPlayer); return; }

    if (Platform.OS === "web") {
      setMediaReady(true);
      if (!paused) safePlay(storyVideoPlayer);
      return;
    }

    let cancelled = false;
    storyVideoPlayer.replaceAsync({ uri: mediaUri })
      .then(() => { if (!paused) safePlay(storyVideoPlayer); if (!cancelled) setMediaReady(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaUri, isVideoStory]);

  useEffect(() => {
    if (!isVideoStory || !mediaReady) return;
    if (paused) safePause(storyVideoPlayer); else safePlay(storyVideoPlayer);
  }, [paused, isVideoStory]);

  // ── Video progress + finish detection (100 ms poll) ──────────────────────────
  useEffect(() => {
    if (!isVideoStory || !mediaReady) return;
    const timer = setInterval(() => {
      const dur = storyVideoPlayer.duration;
      const pos = storyVideoPlayer.currentTime;
      if (dur > 0) progressAnim.setValue(pos / dur);
      if (!videoFinishedRef.current && dur > 0 && !storyVideoPlayer.playing && pos >= dur - 0.3) {
        videoFinishedRef.current = true;
        goNext();
      }
    }, 100);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideoStory, mediaReady, goNext]);

  // ── Progress bar animation ───────────────────────────────────────────────────
  useEffect(() => {
    if (stories.length === 0 || paused || isVideoStory || showViewers || !mediaReady || mediaDownloading) return;

    progressAnim.setValue(0);
    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) goNext();
    });
    return () => anim.stop();
  }, [index, stories.length, paused, isVideoStory, showViewers, mediaReady, mediaDownloading, goNext, progressAnim]);

  // ── Record view ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = stories[index];
    if (!s) return;

    if (user && s.user_id !== user.id) {
      supabase
        .from("story_views")
        .select("id")
        .eq("story_id", s.id)
        .eq("viewer_id", user.id)
        .maybeSingle()
        .then(({ data: existing }) => {
          if (!existing) {
            supabase.from("story_views").insert({ story_id: s.id, viewer_id: user.id }).then(() => {
              supabase.from("stories").update({ view_count: (s.view_count || 0) + 1 }).eq("id", s.id);
              setStories((prev) =>
                prev.map((st) =>
                  st.id === s.id ? { ...st, view_count: (st.view_count || 0) + 1 } : st
                )
              );
              import("../../lib/rewardXp").then(({ rewardXp }) => rewardXp("story_viewed")).catch(() => {});
            });
          }
        });
      markStoriesViewed(s.user_id);
    }
    if (user && s.user_id === user.id) {
      markStoriesViewed(s.user_id);
    }
  }, [index, stories.length]);

  // ── Like a story ────────────────────────────────────────────────────────────
  const handleLike = useCallback(async () => {
    if (!user || !story) {
      if (!user) router.push("/(auth)/login" as any);
      return;
    }
    const storyId = story.id;
    if (likeInFlight.current.has(storyId)) return;
    likeInFlight.current.add(storyId);

    const current = likeState[storyId] ?? { liked: false, count: 0 };
    const nextLiked = !current.liked;
    const nextCount = nextLiked
      ? current.count + 1
      : Math.max(0, current.count - 1);

    // Optimistic update
    setLikeState((prev) => ({
      ...prev,
      [storyId]: { liked: nextLiked, count: nextCount },
    }));

    try {
      if (nextLiked) {
        await supabase
          .from("story_likes")
          .insert({ story_id: storyId, user_id: user.id });
      } else {
        await supabase
          .from("story_likes")
          .delete()
          .eq("story_id", storyId)
          .eq("user_id", user.id);
      }
    } catch {
      // Revert on failure
      setLikeState((prev) => ({
        ...prev,
        [storyId]: current,
      }));
    } finally {
      likeInFlight.current.delete(storyId);
    }
  }, [user, story, likeState]);

  // ── Comment ─────────────────────────────────────────────────────────────────
  const sendComment = useCallback(async () => {
    const s = stories[index];
    if (!s || !user || !commentText.trim()) return;
    setSendingComment(true);
    setPaused(true);
    try {
      const trimmed = commentText.trim();
      await supabase.from("story_replies").insert({
        story_id: s.id,
        user_id: user.id,
        content: trimmed,
      });

      if (s.user_id !== user.id) {
        const { data: chatId } = await supabase.rpc("get_or_create_direct_chat", {
          other_user_id: s.user_id,
        });
        if (chatId) {
          await supabase.from("messages").insert({
            chat_id: chatId,
            sender_id: user.id,
            encrypted_content: `storyUserId:${s.user_id}|${trimmed}`,
            attachment_url: s.media_url,
            attachment_type: "story_reply",
          });
        }
      }
      setCommentText("");
    } catch {
      // comment send failed — silently recover, keep text in input
    } finally {
      setSendingComment(false);
      setPaused(false);
    }
  }, [index, stories, user, commentText]);

  // ── Share sheet ─────────────────────────────────────────────────────────────
  const openShareSheet = useCallback(async () => {
    if (!story) return;
    setPaused(true);
    setShowShareSheet(true);
    try {
      const { data } = await supabase
        .from("chats")
        .select("id, is_group, is_channel, name, chat_members!inner(user_id, profiles!chat_members_user_id_fkey(display_name, avatar_url))")
        .eq("is_channel", false)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (data) {
        const items = (data as any[]).map((c) => {
          if (c.is_group) return { id: c.id, name: c.name || "Group", avatar_url: null };
          const other = (c.chat_members || []).find((m: any) => m.user_id !== user?.id);
          return {
            id: c.id,
            name: other?.profiles?.display_name || c.name || "Chat",
            avatar_url: other?.profiles?.avatar_url || null,
          };
        });
        setChatList(items);
      }
    } catch {
      // failed to load chats — sheet still shows, just empty
    }
  }, [story, user]);

  const closeShareSheet = useCallback(() => {
    setShowShareSheet(false);
    setPaused(false);
  }, []);

  const sendStoryToChat = useCallback(async (chatId: string) => {
    if (!story || !user) return;
    closeShareSheet();
    try {
      const caption = story.caption ? `"${story.caption}"` : "Shared a story";
      await supabase.from("messages").insert({
        chat_id: chatId,
        sender_id: user.id,
        encrypted_content: `storyUserId:${story.user_id}|${caption}`,
        attachment_url: story.media_url,
        attachment_type: "story_reply",
      });
    } catch {
      // send failed — already navigated away, nothing to revert
    }
  }, [story, user, closeShareSheet]);

  // ── Viewers sheet ────────────────────────────────────────────────────────────
  const openViewers = useCallback(async () => {
    if (!story || !isOwner) return;
    setPaused(true);
    setShowViewers(true);
    setLoadingViewers(true);
    Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, friction: 10 }).start();
    try {
      const { data } = await supabase
        .from("story_views")
        .select("viewed_at, profiles!story_views_viewer_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)")
        .eq("story_id", story.id)
        .order("viewed_at", { ascending: false });

      const list: Viewer[] = (data || []).map((v: any) => ({
        id: v.profiles?.id || "",
        display_name: v.profiles?.display_name || "User",
        avatar_url: v.profiles?.avatar_url || null,
        handle: v.profiles?.handle || "",
        viewed_at: v.viewed_at,
        is_verified: v.profiles?.is_verified,
        is_organization_verified: v.profiles?.is_organization_verified,
      }));
      setViewers(list);
    } catch {
      setViewers([]);
    } finally {
      setLoadingViewers(false);
    }
  }, [story, isOwner, slideAnim]);

  const closeViewers = useCallback(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 10 }).start(() => {
      setShowViewers(false);
      setPaused(false);
    });
  }, [slideAnim]);

  // Auto-navigate back when stories list finishes loading but is empty
  // Navigate back deterministically once the fetch resolves with no visible stories
  useEffect(() => {
    if (!storiesLoaded) return;
    if (stories.length === 0) {
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/discover" as any);
    }
  }, [storiesLoaded, stories.length]);

  if (!story) {
    return (
      <View style={[styles.root, styles.loadingScreen]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingLabel}>
          {storiesLoaded ? "No stories available" : "Loading stories…"}
        </Text>
      </View>
    );
  }

  const elapsed = Math.floor((Date.now() - new Date(story.created_at).getTime()) / 3600000);
  const timeLabel = elapsed < 1 ? "just now" : `${elapsed}h ago`;

  const storyLike = likeState[story.id] ?? { liked: false, count: 0 };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.root, { backgroundColor: "#0D0D0D" }]}
    >
      {/* ── Media ─────────────────────────────────────────────────────────── */}
      {isVideoStory ? (
        <VideoView
          ref={storyVideoRef}
          player={storyVideoPlayer}
          style={styles.media}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture
          onPictureInPictureStart={() => setInPip(true)}
          onPictureInPictureStop={() => setInPip(false)}
        />
      ) : (
        <Image
          source={mediaUri ? { uri: mediaUri } : undefined}
          style={styles.media}
          resizeMode="contain"
          onLoad={() => setMediaReady(true)}
          onError={() => { setMediaError(true); setMediaReady(true); }}
        />
      )}

      {/* Never advance the story while its media is still downloading/loading. */}
      {(!mediaReady || mediaDownloading) && (
        <View style={[styles.downloadOverlay, { pointerEvents: "none" }]}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.downloadText}>
            {mediaDownloading
              ? `Downloading${downloadProgress > 0 ? ` ${Math.round(downloadProgress * 100)}%` : "…"}`
              : "Loading media…"}
          </Text>
        </View>
      )}
      {mediaError && (
        <View style={styles.mediaErrorOverlay}>
          <Ionicons name="cloud-offline-outline" size={34} color="#fff" />
          <Text style={styles.downloadText}>This story is not downloaded on this device</Text>
          <TouchableOpacity style={styles.mediaErrorButton} onPress={() => router.back()}>
            <Text style={styles.mediaErrorButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Progress segments ────────────────────────────────────────────── */}
      <View style={[styles.progressBar, { top: insets.top + 8 }]}>
        {stories.map((_, i) => (
          <View key={i} style={styles.progressSegment}>
            <View style={styles.progressBg} />
            <Animated.View
              style={[
                styles.progressFill,
                i < index
                  ? { width: "100%" }
                  : i === index
                  ? {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0%", "100%"],
                      }),
                    }
                  : { width: "0%" },
              ]}
            />
          </View>
        ))}
      </View>

      {/* ── Top bar — avatar, name, time, share, close ───────────────────── */}
      <View style={[styles.topBar, { top: insets.top + 20 }]}>
        <TouchableOpacity
          onPress={() => navigateToProfile(story.profile.handle, true).catch(() => {})}
          activeOpacity={0.8}
        >
          <Avatar uri={story.profile.avatar_url} name={story.profile.display_name} size={36} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={styles.storyName}>{story.profile.display_name}</Text>
            <VerifiedBadge
              isVerified={story.profile.is_verified}
              isOrganizationVerified={story.profile.is_organization_verified}
              size={14}
            />
          </View>
          <Text style={styles.storyTime}>{timeLabel}</Text>
        </View>
        {isVideoStory && (
          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => { try { inPip ? storyVideoRef.current?.stopPictureInPicture() : storyVideoRef.current?.startPictureInPicture(); } catch {} }}
            activeOpacity={0.8}
          >
            <Ionicons name={inPip ? "contract" : "expand"} size={20} color={inPip ? "#1018D8" : "#fff"} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.topBtn} onPress={openShareSheet} activeOpacity={0.8}>
          <Ionicons name="share-social" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Tap zones — prev / next ──────────────────────────────────────── */}
      {!showViewers && (
        <View style={styles.tapZones}>
          <TouchableOpacity
            style={styles.tapLeft}
            onPress={goPrev}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            activeOpacity={1}
          />
          <TouchableOpacity
            style={styles.tapRight}
            onPress={goNext}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            activeOpacity={1}
          />
        </View>
      )}

      {/* ── Caption ──────────────────────────────────────────────────────── */}
      {story.caption ? (
        <View style={styles.captionBar}>
          <Text style={styles.captionText}>{story.caption}</Text>
        </View>
      ) : null}

      {/* ── Bottom action row — always visible ───────────────────────────── */}
      {!showViewers && !showShareSheet && (
        <View style={[styles.bottomRow, {
          bottom: keyboardHeight,
          paddingBottom: keyboardHeight > 0 ? 12 : insets.bottom + 12,
        }]}>

          {/* Owner: viewer pill + count (tappable to open sheet) */}
          {isOwner ? (
            <TouchableOpacity
              style={styles.viewerPill}
              onPress={openViewers}
              activeOpacity={0.75}
            >
              <Ionicons name="eye" size={15} color="rgba(255,255,255,0.85)" />
              <Text style={styles.viewerPillCount}>{story.view_count || 0}</Text>
              {storyLike.count > 0 && (
                <>
                  <View style={styles.pillDivider} />
                  <Ionicons name="heart" size={13} color="#FF2D55" />
                  <Text style={styles.viewerPillCount}>{storyLike.count}</Text>
                </>
              )}
              <Ionicons name="chevron-up" size={13} color="rgba(255,255,255,0.45)" />
            </TouchableOpacity>
          ) : (
            /* Non-owner: viewer count display (read-only) */
            <View style={[styles.viewerPill, { pointerEvents: "none" }]}>
              <Ionicons name="eye" size={15} color="rgba(255,255,255,0.65)" />
              <Text style={styles.viewerPillCount}>{story.view_count || 0}</Text>
            </View>
          )}

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* Like button — all users (owner can like their own story too) */}
          <TouchableOpacity
            style={[styles.actionBtn, storyLike.liked && styles.actionBtnActive]}
            onPress={handleLike}
            activeOpacity={0.75}
          >
            <Ionicons
              name={storyLike.liked ? "heart" : "heart"}
              size={22}
              color={storyLike.liked ? "#FF2D55" : "#fff"}
            />
            {storyLike.count > 0 && (
              <Text style={[styles.actionBtnLabel, storyLike.liked && { color: "#FF2D55" }]}>
                {storyLike.count}
              </Text>
            )}
          </TouchableOpacity>

          {/* Comment input — non-owners only */}
          {!isOwner && (
            <>
              <View style={styles.commentInputWrap}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Reply…"
                  placeholderTextColor="rgba(255,255,255,0.38)"
                  value={commentText}
                  onChangeText={setCommentText}
                  onFocus={() => setPaused(true)}
                  onBlur={() => { if (!commentText.trim()) setPaused(false); }}
                  returnKeyType="send"
                  onSubmitEditing={sendComment}
                  maxLength={500}
                />
              </View>
              {commentText.trim() ? (
                <TouchableOpacity
                  onPress={sendComment}
                  disabled={sendingComment}
                  style={[styles.actionBtn, { opacity: sendingComment ? 0.4 : 1 }]}
                >
                  <Ionicons name="send" size={20} color="#fff" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.actionBtn} onPress={openShareSheet} activeOpacity={0.8}>
                  <Ionicons name="share-social" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}

      {/* ── Share sheet ──────────────────────────────────────────────────── */}
      {showShareSheet && (
        <>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeShareSheet} />
          <View style={[styles.panel, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.panelHandle} />
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Share Story</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={closeShareSheet}>
                <Ionicons name="close-circle" size={26} color="rgba(255,255,255,0.45)" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.shareOptionRow}
              activeOpacity={0.75}
              onPress={() => {
                closeShareSheet();
                shareStory({ userName: story.profile.display_name, userId: story.user_id });
              }}
            >
              <View style={[styles.shareOptionIcon, { backgroundColor: "#0088FF22" }]}>
                <Ionicons name="link" size={20} color="#0088FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareOptionLabel}>Share Link</Text>
                <Text style={styles.shareOptionSub}>Copy or send via any app</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>

            {chatList.length > 0 && (
              <>
                <Text style={styles.shareContactsLabel}>Send to a contact</Text>
                <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                  {chatList.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.shareContactRow}
                      activeOpacity={0.75}
                      onPress={() => sendStoryToChat(c.id)}
                    >
                      <Avatar uri={c.avatar_url} name={c.name} size={40} />
                      <Text style={styles.shareContactName} numberOfLines={1}>{c.name}</Text>
                      <View style={styles.shareContactSend}>
                        <Ionicons name="send" size={14} color="#fff" />
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </>
      )}

      {/* ── Viewers sheet — owner only ────────────────────────────────────── */}
      {showViewers && (
        <>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeViewers} />
          <Animated.View
            style={[
              styles.viewersPanel,
              { height: panelH, paddingBottom: insets.bottom, transform: [{ translateY }] },
            ]}
          >
            <View style={styles.panelHandle} />
            <View style={styles.panelHeader}>
              <Ionicons name="eye" size={18} color="rgba(255,255,255,0.7)" />
              <Text style={styles.panelTitle}>
                Viewers · {story.view_count || 0}
              </Text>
              {storyLike.count > 0 && (
                <>
                  <View style={styles.pillDivider} />
                  <Ionicons name="heart" size={15} color="#FF2D55" />
                  <Text style={[styles.panelTitle, { color: "#FF2D55" }]}>
                    {storyLike.count}
                  </Text>
                </>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={closeViewers}>
                <Ionicons name="close-circle" size={26} color="rgba(255,255,255,0.45)" />
              </TouchableOpacity>
            </View>

            {loadingViewers ? (
              <View style={styles.centeredMsg}>
                <Text style={styles.mutedText}>Loading…</Text>
              </View>
            ) : viewers.length === 0 ? (
              <View style={styles.centeredMsg}>
                <Ionicons name="eye-off" size={36} color="rgba(255,255,255,0.2)" />
                <Text style={[styles.mutedText, { marginTop: 8 }]}>No viewers yet</Text>
              </View>
            ) : (
              <FlatList
                data={viewers}
                keyExtractor={(v) => v.id}
                contentContainerStyle={{ paddingHorizontal: 16 }}
                renderItem={({ item }) => {
                  const ago = Math.floor((Date.now() - new Date(item.viewed_at).getTime()) / 60000);
                  const label = ago < 1 ? "just now" : ago < 60 ? `${ago}m ago` : `${Math.floor(ago / 60)}h ago`;
                  return (
                    <View style={styles.viewerRow}>
                      <Avatar uri={item.avatar_url} name={item.display_name} size={40} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Text style={styles.viewerName}>{item.display_name}</Text>
                          <VerifiedBadge
                            isVerified={item.is_verified}
                            isOrganizationVerified={item.is_organization_verified}
                            size={13}
                          />
                        </View>
                        <Text style={styles.viewerHandle}>@{item.handle}</Text>
                      </View>
                      <Text style={styles.viewerTime}>{label}</Text>
                    </View>
                  );
                }}
              />
            )}
          </Animated.View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingScreen: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#0D0D0D",
  },
  loadingLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  media: { ...StyleSheet.absoluteFill },
  downloadOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(13,13,13,0.42)",
  },
  downloadText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  mediaErrorOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 36,
    backgroundColor: "rgba(13,13,13,0.9)",
  },
  mediaErrorButton: {
    marginTop: 4,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  mediaErrorButtonText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },

  // Progress
  progressBar: {
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 8,
    position: "absolute",
    left: 0,
    right: 0,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    overflow: "hidden",
  },
  progressBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255,255,255,0.28)",
    borderRadius: 1.5,
  },
  progressFill: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderRadius: 1.5,
  },

  // Top bar
  topBar: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  storyName: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  storyTime: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  topBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Tap zones
  tapZones: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
  },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2 },

  // Caption
  captionBar: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.42)",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  captionText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },

  // Bottom action row — always visible
  bottomRow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },

  // Viewer pill — inline count visible without opening sheet
  viewerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  viewerPillCount: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  pillDivider: {
    width: 1,
    height: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginHorizontal: 2,
  },

  // Action buttons (like, send, share)
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    gap: 4,
  },
  actionBtnActive: {
    borderColor: "rgba(255,45,85,0.4)",
    backgroundColor: "rgba(255,45,85,0.12)",
  },
  actionBtnLabel: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },

  // Comment input
  commentInputWrap: {
    flex: 1,
    height: 40,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.28)",
    justifyContent: "center",
    paddingHorizontal: 14,
    ...Platform.select({
      web: { boxShadow: "0 2px 14px rgba(0,0,0,0.28)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
    }),
  },
  commentInput: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  // Shared panel styles
  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(20,20,20,0.97)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  viewersPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(20,20,20,0.97)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  panelHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.28)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  panelTitle: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },

  // Viewers
  viewerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  viewerName: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  viewerHandle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  viewerTime: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  centeredMsg: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mutedText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  // Share sheet
  shareOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  shareOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  shareOptionLabel: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  shareOptionSub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  shareContactsLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  shareContactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  shareContactName: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  shareContactSend: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
});
