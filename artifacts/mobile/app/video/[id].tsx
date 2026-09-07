/**
 * VideoPlayerScreen — TikTok-style vertical video feed.
 *
 * Scroll architecture (why it works):
 *  1. pagingEnabled on FlatList — simplest, most reliable native snap.
 *  2. TapHandler uses react-native-gesture-handler's native Gesture API
 *     (GestureDetector + Gesture.Tap/LongPress). Running on the UI thread
 *     via JSI means zero JS negotiation — FlatList scroll starts the instant
 *     the finger moves, no "hard push" needed.
 *  3. getItemLayout uses stable window dimensions — never dynamic state.
 *  4. onViewableItemsChanged stored in a stable ref — FlatList never re-wires.
 *  5. windowSize=3, removeClippedSubviews=false so neighbours preload smoothly.
 */
import { showAlert } from "@/lib/alert";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  AppState,
  Animated,
  FlatList,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { navigateToProfile } from "@/lib/navigateToProfile";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import { SmartSheet } from "@/components/ui/SmartSheet";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import UserName from "@/components/ui/UserName";
import { useAppAccent } from "@/context/AppAccentContext";
import { useTheme } from "@/hooks/useTheme";
import { RichText } from "@/components/ui/RichText";
import { encodeId, decodeId, isUuid } from "@/lib/shortId";
import { getCachedVideoUri, cacheVideo, markVideoWatched, getOfflineVideos } from "@/lib/videoCache";
import { storage } from "@/lib/storage/mmkv";
import { recordWatchHistory } from "@/lib/watchHistory";
import { onShortsRefresh } from "@/lib/shortsRefresh";
import { getLocalFeedPost } from "@/lib/storage/localFeed";
import { showActionToast as globalShowActionToast } from "@/lib/toast";
import { trackEvent } from "@/lib/activityTracker";
import { saveVideoProgress, clearVideoProgress } from "@/lib/videoProgress";
import { useResolvedVideoSource } from "@/hooks/useResolvedVideoSource";
import { getPostVideoManifest, pickBestSource } from "@/lib/videoApi";
import { getPreferredVideoHeight, isOffline as checkIsOffline, subscribeToNetworkChanges } from "@/lib/networkQuality";
import { safePause, safePlay } from "@/lib/safeMedia";
import { ChatBubbleSkeleton, ShortsFeedSkeleton } from "@/components/ui/Skeleton";
import SignInPromptModal from "@/components/ui/SignInPromptModal";
import {
  computeFeedScore,
  detectTopicsInContent,
  getLearnedInterestBoosts,
  getNotInterestedSignals,
  markNotInterested,
  matchInterestsWeighted,
  diversifyFeed,
  getSeenVideoMap,
  markVideosSeen,
  undoNotInterested,
  weightedSample,
  extractHashtags,
  type FeedSignals,
} from "../../lib/feedAlgorithm";
import * as Haptics from "@/lib/haptics";
import { VideoCommentsSheet } from "@/components/ui/VideoCommentsSheet";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

// ─── Constants ────────────────────────────────────────────────────────────────

const USE_NATIVE = true;
const VIDEO_PAGE_SIZE = 50;
const VID_THREAD_COLORS = ["#1018D8", "#5C6BC0", "#26A69A", "#EF6C00", "#8E24AA"];
const QUICK_EMOJIS = ["🔥", "❤️", "😂", "😮", "👏", "💯", "🙌", "😍"];
const SOCIAL_PLATFORMS = [
  { id: "whatsapp",  label: "WhatsApp",  icon: "logo-whatsapp",      color: "#25D366", scheme: (u: string) => `https://wa.me/?text=${encodeURIComponent(u)}` },
  { id: "telegram",  label: "Telegram",  icon: "paper-plane", color: "#0088CC", scheme: (u: string) => `https://t.me/share/url?url=${encodeURIComponent(u)}` },
  { id: "twitter",   label: "X",         icon: "logo-twitter",        color: "#111",    scheme: (u: string) => `https://x.com/intent/tweet?text=${encodeURIComponent(u)}` },
  { id: "facebook",  label: "Facebook",  icon: "logo-facebook",       color: "#1877F2", scheme: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { id: "instagram", label: "Instagram", icon: "logo-instagram",      color: "#E1306C", scheme: (_: string) => `instagram://app` },
  { id: "copy",      label: "Copy link", icon: "link",                color: "#007AFF", scheme: null },
  { id: "more",      label: "More",      icon: "share-social",        color: "#FF9500", scheme: null },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type VideoPost = {
  id: string; author_id: string; content: string; video_url: string;
  image_url: string | null; created_at: string; view_count: number;
  audio_name: string | null;
  profile: { display_name: string; handle: string; avatar_url: string | null; is_verified: boolean; is_organization_verified: boolean };
  liked: boolean; bookmarked: boolean; likeCount: number; replyCount: number;
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── GradientOverlay ──────────────────────────────────────────────────────────

const GRADIENT_BASE: any = { position: "absolute", left: 0, right: 0 };

function GradientOverlay({
  position,
  height,
}: {
  position: "top" | "bottom";
  height: number;
}) {
  const posStyle = position === "bottom" ? { bottom: 0 } : { top: 0 };
  return (
    <LinearGradient
      colors={
        position === "bottom"
          ? ["transparent", "rgba(0,0,0,0.88)"]
          : ["rgba(0,0,0,0.55)", "transparent"]
      }
      style={[GRADIENT_BASE, posStyle, { height, pointerEvents: "none" } as any]}
    />
  );
}

// ─── TapHandler ───────────────────────────────────────────────────────────────
/**
 * Transparent layer that detects taps/double-taps/long-presses using
 * react-native-gesture-handler's native Gesture API.
 *
 * Running on the UI thread via JSI means this NEVER competes with the
 * FlatList's scroll gesture — the scroll starts the instant the finger
 * moves, with zero JS-thread negotiation delay.
 */
function TapHandler({
  onTap,
  onDoubleTap,
  onLongPress,
}: {
  onTap: () => void;
  onDoubleTap?: (x: number, y: number) => void;
  onLongPress?: () => void;
}) {
  const singleTap = Gesture.Tap()
    .maxDuration(300)
    .maxDistance(10)
    .runOnJS(true)
    .onEnd(() => { onTap(); });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .maxDistance(10)
    .runOnJS(true)
    .onEnd((event) => { onDoubleTap?.(event.x, event.y); });

  const longPress = Gesture.LongPress()
    .minDuration(500)
    .runOnJS(true)
    .onStart(() => { onLongPress?.(); });

  // Exclusive: double-tap wins over single-tap (waits to confirm no second tap)
  // Race: long-press fires as soon as threshold met, cancels tap
  const composed = Gesture.Race(
    longPress,
    Gesture.Exclusive(doubleTap, singleTap),
  );

  return (
    <GestureDetector gesture={composed}>
      {/* Exclude the right 80 px where the action-rail buttons live.
          On Android the GestureDetector claims the entire touch area of its
          child view, which would swallow taps on Like / Comment / etc. */}
      <View style={[StyleSheet.absoluteFill, { right: 80 }]} />
    </GestureDetector>
  );
}

// ─── SocialShareSheet ─────────────────────────────────────────────────────────

function SocialShareSheet({ visible, onClose, url, title }: { visible: boolean; onClose: () => void; url: string; title: string }) {
  if (!visible) return null;
  async function handlePlatform(p: typeof SOCIAL_PLATFORMS[number]) {
    if (p.id === "copy") { Clipboard.setStringAsync(url); onClose(); return; }
    if (p.id === "more") { onClose(); setTimeout(async () => { try { await Share.share({ message: `${title} ${url}`, url, title }); } catch (_) {} }, 300); return; }
    onClose();
    const deepUrl = p.scheme!(url);
    const canOpen = await Linking.canOpenURL(deepUrl).catch(() => false);
    if (canOpen) await Linking.openURL(deepUrl).catch(() => {});
    else await Share.share({ message: `${title} ${url}`, url, title });
  }
  return (
    <SmartSheet visible={visible} onClose={onClose} peekFraction={0.36}>
      <View style={ssStyles.header}>
        <Ionicons name="search" size={20} color="#bbb" />
        <Text style={ssStyles.title}>Send to</Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={22} color="#555" />
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={ssStyles.scrollRow}
      >
        {SOCIAL_PLATFORMS.map((p) => (
          <TouchableOpacity key={p.id} style={ssStyles.cell} onPress={() => handlePlatform(p)}>
            <View style={[ssStyles.iconCircle, { backgroundColor: p.color }]}>
              <Ionicons name={p.icon as any} size={22} color="#fff" />
            </View>
            <Text style={ssStyles.cellLabel}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SmartSheet>
  );
}
const ssStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18, paddingHorizontal: 20 },
  title: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#111", textAlign: "center" },
  scrollRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingBottom: 12, gap: 4 },
  cell: { width: 72, alignItems: "center", gap: 7, paddingVertical: 8 },
  iconCircle: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  cellLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#444", textAlign: "center" },
});

// ─── VideoContextMenu ─────────────────────────────────────────────────────────

function VideoContextMenu({ visible, item, onClose, onShare, onRepost, onDownload, onCopyLink, onNotInterested, onReport, autoScroll, onToggleAutoScroll }: {
  visible: boolean; item: VideoPost | null; onClose: () => void;
  onShare: () => void; onRepost: () => void; onDownload: () => void;
  onCopyLink: () => void; onNotInterested: () => void; onReport: () => void;
  autoScroll: boolean; onToggleAutoScroll: () => void;
}) {
  if (!visible || !item) return null;

  function tap(fn: () => void) { onClose(); setTimeout(fn, 180); }

  return (
    <SmartSheet visible={visible} onClose={onClose} peekFraction={0.55} backgroundColor="#fff">
      <View style={cmStyles.sep} />

      {/* Group 1 — sharing actions */}
      <TouchableOpacity style={cmStyles.row} onPress={() => tap(onRepost)} activeOpacity={0.65}>
        <Ionicons name="repeat" size={24} color="#111" style={cmStyles.rowIcon} />
        <Text style={cmStyles.rowLabel}>Repost</Text>
      </TouchableOpacity>
      <TouchableOpacity style={cmStyles.row} onPress={() => tap(onShare)} activeOpacity={0.65}>
        <Ionicons name="arrow-redo" size={24} color="#111" style={cmStyles.rowIcon} />
        <Text style={cmStyles.rowLabel}>Share to</Text>
      </TouchableOpacity>
      <TouchableOpacity style={cmStyles.row} onPress={() => tap(onCopyLink)} activeOpacity={0.65}>
        <Ionicons name="link" size={24} color="#111" style={cmStyles.rowIcon} />
        <Text style={cmStyles.rowLabel}>Copy link</Text>
      </TouchableOpacity>
      <TouchableOpacity style={cmStyles.row} onPress={() => tap(onDownload)} activeOpacity={0.65}>
        <Ionicons name="download" size={24} color="#111" style={cmStyles.rowIcon} />
        <Text style={cmStyles.rowLabel}>Save</Text>
      </TouchableOpacity>

      <View style={cmStyles.sep} />

      {/* Group 2 — playback controls */}
      <View style={cmStyles.row}>
        <Ionicons name="infinite" size={24} color="#111" style={cmStyles.rowIcon} />
        <Text style={cmStyles.rowLabel}>Auto scroll</Text>
        <Switch
          value={autoScroll}
          onValueChange={() => { onToggleAutoScroll(); }}
          trackColor={{ false: "#ddd", true: "#111" }}
          thumbColor="#fff"
          style={cmStyles.toggle}
        />
      </View>

      <View style={cmStyles.sep} />

      {/* Group 3 — negative actions */}
      <TouchableOpacity style={cmStyles.row} onPress={() => tap(onNotInterested)} activeOpacity={0.65}>
        <Ionicons name="eye-off" size={24} color="#111" style={cmStyles.rowIcon} />
        <Text style={cmStyles.rowLabel}>Not interested</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[cmStyles.row, cmStyles.rowLast]} onPress={() => tap(onReport)} activeOpacity={0.65}>
        <Ionicons name="flag" size={24} color="#FF3B30" style={cmStyles.rowIcon} />
        <Text style={[cmStyles.rowLabel, { color: "#FF3B30" }]}>Report</Text>
      </TouchableOpacity>
    </SmartSheet>
  );
}
const cmStyles = StyleSheet.create({
  sep:       { height: StyleSheet.hairlineWidth, backgroundColor: "#e8e8e8", marginVertical: 2 },
  row:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, minHeight: 56 },
  rowLast:   { marginBottom: 8 },
  rowIcon:   { marginRight: 18, width: 24, textAlign: "center" },
  rowLabel:  { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold", color: "#111" },
  toggle:    { marginLeft: "auto" },
});

// ─── VideoItem ────────────────────────────────────────────────────────────────

const BOTTOM_BAR_H = 64; // height of the WeChat-style horizontal action bar

const VideoItem = React.memo(function VideoItem({
  item, isActive, isNearActive, screenH, screenW, isFollowing, isSelf,
  onLike, onBookmark, onOpenComments, onShare, onFollow, onRecordView, onOpenMenu,
  navOffset = 0, tabFocused = true, onVideoEnd, commentsOpen = false, squeezedH = 0,
}: {
  item: VideoPost; isActive: boolean; isNearActive: boolean; screenH: number; screenW: number;
  isFollowing: boolean; isSelf: boolean;
  onLike: (id: string, liked: boolean) => void; onBookmark: (id: string, bookmarked: boolean) => void;
  onOpenComments: (id: string) => void; onShare: (item: VideoPost) => void;
  onFollow: (authorId: string, isFollowing: boolean) => void; onRecordView: (postId: string) => void;
  onOpenMenu: (item: VideoPost) => void;
  navOffset?: number; tabFocused?: boolean; onVideoEnd?: () => void;
  commentsOpen?: boolean; squeezedH?: number;
}) {
  const { accent } = useAppAccent();
  const insets = useSafeAreaInsets();
  // On web, create the player with its final stable source. expo-video's web
  // replace() calls HTMLMediaElement.play() without handling the returned
  // promise, so replacing the fallback URL with a resolved/cache URL can
  // produce a global "interrupted by a new load request" error. Native
  // players still start empty and use replaceAsync below because that path
  // supports the native player lifecycle.
  const player = useVideoPlayer(
    Platform.OS === "web" ? { uri: item.video_url } : null,
    (p) => { p.loop = true; p.muted = false; },
  );
  const videoViewRef = useRef<VideoView>(null);
  const videoEndFiredRef = useRef(false);
  const [inPip, setInPip] = useState(false);
  // Stable refs — let effects and callbacks always read current values
  // without being listed as deps (avoids stale closures on the hot path).
  const inPipRef = useRef(false);
  const pausedRef = useRef(false);
  // Mirror of the tabFocused prop — read by the AppState handler so it
  // never resumes playback while the Shorts tab is not the active tab.
  const tabFocusedRef = useRef(tabFocused);
  // Set to true when PiP stops so the tabFocused effect skips the poster
  // reset until the app has fully returned to the foreground.
  const justExitedPipRef = useRef(false);
  // True while the PiP→fullscreen resize animation is running (~400 ms).
  // We draw an opaque black cover during this window so the user never sees
  // the VideoView at PiP dimensions before it resizes to fill the screen.
  const [pipExiting, setPipExiting] = useState(false);
  const pipExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [showBuffering, setShowBuffering] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [hasMoreLines, setHasMoreLines] = useState(false);
  const [cachedUri, setCachedUri] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  // ── Seek bar visibility ─────────────────────────────────────────────────
  const barOpacity = useRef(new Animated.Value(0)).current;
  const barVisibleRef = useRef(false);
  const barHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingBarRef = useRef(false);

  function _showBar() {
    barVisibleRef.current = true;
    Animated.timing(barOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    _resetBarTimer();
  }
  function _hideBar() {
    barVisibleRef.current = false;
    Animated.timing(barOpacity, { toValue: 0, duration: 280, useNativeDriver: true }).start();
  }
  function _resetBarTimer() {
    if (barHideTimerRef.current) clearTimeout(barHideTimerRef.current);
    if (!isDraggingBarRef.current) {
      barHideTimerRef.current = setTimeout(_hideBar, 3000);
    }
  }
  const heartScale = useRef(new Animated.Value(1)).current;
  const doubleTapOpacity = useRef(new Animated.Value(0)).current;
  const doubleTapScale = useRef(new Animated.Value(0.3)).current;
  const [doubleTapPoint, setDoubleTapPoint] = useState({
    x: screenW / 2,
    y: (screenH - BOTTOM_BAR_H) / 2,
  });
  const videoAreaAnim = useRef(new Animated.Value(screenH - BOTTOM_BAR_H)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const viewRecorded = useRef(false);
  const offlineSaved = useRef(false);
  const cacheAttempted = useRef(false);
  const bufferingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Perf refs — avoid setState on every video frame
  const bufferingRef = useRef(false);
  const videoStartedRef = useRef(false);
  const lastProgressFrameRef = useRef(0);   // timestamp of last setProgress call
  const lastSavedProgressRef = useRef(0);   // timestamp of last AsyncStorage save
  const cacheDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolved = useResolvedVideoSource(item.id, item.video_url, { targetHeight: getPreferredVideoHeight() });
  // When an error occurs fall back directly to the raw video_url, bypassing cache/manifest
  const playbackUri = videoError ? item.video_url : (cachedUri || resolved.uri || item.video_url);
  const shouldMountVideo = isActive || isNearActive;
  const sourceReadyRef = useRef(Platform.OS === "web" && !!item.video_url);
  const preloadOnly = !isActive && isNearActive;
  const showExpand = !!item.content && (item.content.split("\n").length > 2 || item.content.length > 120);

  // Start pre-caching once the video enters the preload window.
  // Delay by 500 ms so the download does NOT compete with the swipe animation.
  useEffect(() => {
    if (!isNearActive || cacheAttempted.current || !item.video_url) return;
    cacheAttempted.current = true;
    cacheDelayRef.current = setTimeout(() => {
      getCachedVideoUri(item.video_url).then((ex) => {
        if (ex) setCachedUri(ex);
        else cacheVideo(item.video_url).then((l) => { if (l) setCachedUri(l); }).catch(() => {});
      }).catch(() => {});
    }, 500);
    return () => { if (cacheDelayRef.current) { clearTimeout(cacheDelayRef.current); cacheDelayRef.current = null; } };
  }, [isNearActive]);

  // Cleanup PiP-exit cover timer on unmount
  useEffect(() => {
    return () => { if (pipExitTimerRef.current) { clearTimeout(pipExitTimerRef.current); pipExitTimerRef.current = null; } };
  }, []);

  // Squeeze video up when comments open (TikTok/Shorts style)
  useEffect(() => {
    const targetH = commentsOpen ? (squeezedH || screenH * 0.38) : (screenH - BOTTOM_BAR_H);
    Animated.parallel([
      Animated.timing(videoAreaAnim, { toValue: targetH, duration: 320, useNativeDriver: false }),
      Animated.timing(overlayOpacity, { toValue: commentsOpen ? 0 : 1, duration: commentsOpen ? 180 : 300, useNativeDriver: USE_NATIVE }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentsOpen]);

  // Immediately sync video area height when the container height changes.
  // videoAreaAnim is initialized with SCREEN_H - BOTTOM_BAR_H, but after
  // the FlatList measures its actual height (SCREEN_H - tabOffset), screenH
  // updates to a smaller value. Without this sync the video area overflows
  // the item container and the action bar gets clipped off-screen.
  useEffect(() => {
    if (!commentsOpen) {
      videoAreaAnim.setValue(screenH - BOTTOM_BAR_H);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenH]);

  // Pause and show poster when app/tab loses focus; resume seamlessly on return.
  // Skip this when PiP is active — the video should keep playing in the PiP window.
  useEffect(() => {
    if (!tabFocused) {
      // Skip the poster reset while PiP is active OR while the app is still
      // animating back from PiP — otherwise `inPip` flipping to false before
      // `tabFocused` flips to true would show a black frame / restart the video.
      if (inPip || justExitedPipRef.current) return;
      setVideoStarted(false);
      videoStartedRef.current = false;
    } else {
      // App fully regained focus — the PiP-exit bridge is no longer needed.
      justExitedPipRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFocused, inPip]);

  // Reset when leaving viewport; record view when becoming active
  useEffect(() => {
    if (!isActive) {
      setPaused(false);
      setProgress(0);
      setExpanded(false);
      setVideoStarted(false);
      setShowBuffering(false);
      setVideoError(false);
      if (bufferingTimerRef.current) { clearTimeout(bufferingTimerRef.current); bufferingTimerRef.current = null; }
      // Hide seek bar immediately when scrolling away
      if (barHideTimerRef.current) { clearTimeout(barHideTimerRef.current); barHideTimerRef.current = null; }
      _hideBar();
      // Do NOT call unloadAsync() here — it fires on first mount too (isActive=false
      // while preloading) and permanently breaks the underlying AVPlayer before it
      // has a chance to buffer. The Video component is unmounted automatically by
      // the shouldMountVideo gate when the item leaves the ±2 nearActive window,
      // which is the correct place to free native resources.
      // Reset per-frame perf refs when leaving viewport
      bufferingRef.current = false;
      videoStartedRef.current = false;
      videoEndFiredRef.current = false;
      lastProgressFrameRef.current = 0;
      lastSavedProgressRef.current = 0;
      // Reset offline-save flag so it retries on next view if the save failed
      offlineSaved.current = false;
    } else {
      // Always restart from the beginning — never resume mid-video
      try { player.currentTime = 0; } catch {}
      setProgress(0);
      if (!viewRecorded.current) {
        viewRecorded.current = true;
        onRecordView(item.id);
      }
      if (!offlineSaved.current) {
        offlineSaved.current = true;
        const title = (item.profile?.display_name ?? "") +
          (item.content ? `: ${item.content.slice(0, 60)}` : "");
        markVideoWatched(item.id, item.video_url, {
          title,
          thumbnail: item.image_url ?? null,
          authorId: item.author_id,
          authorHandle: item.profile?.handle,
          authorName: item.profile?.display_name,
          authorAvatar: item.profile?.avatar_url,
        }).catch(() => {
          offlineSaved.current = false;
        });
        recordWatchHistory(item.id, {
          title,
          thumbnail: item.image_url ?? null,
          videoUrl:  item.video_url,
        }).catch(() => {});
      }
    }
  }, [isActive]);

  // ── Mute non-active (preloaded) players ─────────────────────────────────
  // Prevents any audio bleed from the 1-2 near-active buffered videos when
  // the active video plays or enters PiP.
  useEffect(() => {
    try { player.muted = !isActive; } catch {}
  }, [isActive]);

  // ── AppState: resume on foreground return ───────────────────────────────
  // useFocusEffect fires only on navigation events, NOT the home button, so
  // this listener is the only place to catch app→foreground transitions and
  // resume the video after the user returns (from PiP or from background).
  // IMPORTANT: tabFocusedRef.current MUST be true — if the user navigated
  // away from the Shorts tab before backgrounding, we must NOT resume here
  // (the play/pause effect already paused the player; without this guard
  // any foreground AppState event would restart audio behind other screens).
  const safelyPlay = () => {
    safePlay(player);
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (
        nextState === "active" &&
        isActive &&
        tabFocusedRef.current &&
        !inPipRef.current &&
        !pausedRef.current
      ) {
        // Brief delay so the PiP-window closing animation fully completes
        // before we call play — avoids a stutter on the returning frame.
        setTimeout(() => {
          if (!inPipRef.current && tabFocusedRef.current) safelyPlay();
        }, 100);
      }
    });
    return () => sub.remove();
  }, [isActive]);

  // ── Player source update ───────────────────────────────────────────────
  useEffect(() => {
    if (!playbackUri || !shouldMountVideo) {
      sourceReadyRef.current = false;
      return;
    }

    // The web player already received item.video_url in useVideoPlayer().
    // Keep that source stable on web; the optimized manifest/cache URL can
    // arrive later and replacing it is what interrupts pending HTML play()
    // requests. Native playback keeps the async replacement path.
    if (Platform.OS === "web") {
      sourceReadyRef.current = true;
      return;
    }

    sourceReadyRef.current = false;
    let cancelled = false;
    player.replaceAsync({ uri: playbackUri }).then(() => {
      if (cancelled) return;
      sourceReadyRef.current = true;
      if (isActive && !paused && !preloadOnly && tabFocused && !inPip) {
        safelyPlay();
      }
    }).catch(() => {
      // replaceAsync failed (bad URI, network error, codec unsupported).
      // Flip videoError so playbackUri falls back to the raw video_url on
      // the next render; guard prevents a re-render loop if the raw URL
      // itself also fails.
      if (!videoError) setVideoError(true);
    });
    return () => { cancelled = true; };
  }, [playbackUri, shouldMountVideo]);

  // Keep refs in sync with state/props so closures always read current values.
  useEffect(() => { inPipRef.current = inPip; }, [inPip]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { tabFocusedRef.current = tabFocused; }, [tabFocused]);

  // ── Play / pause control ───────────────────────────────────────────────
  useEffect(() => {
    // player.play() / player.pause() throw when the AVPlayer has been
    // deallocated or enters an unrecoverable error state (rapid swipes,
    // background audio session conflicts, etc.).
    try {
      if (!shouldMountVideo) { safePause(player); return; }
      if (!sourceReadyRef.current) return;
      // When PiP is active honour the paused state — this lets the native
      // PiP play/pause button work correctly instead of being overridden.
      if (inPip) { if (paused) { safePause(player); } else { safelyPlay(); } return; }
      if (!isActive || paused || preloadOnly || !tabFocused) { safePause(player); } else { safelyPlay(); }
    } catch {}
  }, [isActive, paused, preloadOnly, tabFocused, shouldMountVideo, inPip]);

  // ── Progress + started + buffering polling (100 ms) ────────────────────
  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => {
      // Wrap the entire body — expo-video property accesses (player.playing,
      // player.status, player.duration, player.currentTime) throw when the
      // underlying AVPlayer has been deallocated mid-interval (e.g. rapid
      // swipe away) or when the player enters an unrecoverable error state.
      // A silent swallow here is intentional: one failed tick is harmless,
      // and the interval cleans up on unmount via the return below.
      try {
        if (player.playing && !videoStartedRef.current) {
          videoStartedRef.current = true;
          setVideoStarted(true);
          if (bufferingTimerRef.current) { clearTimeout(bufferingTimerRef.current); bufferingTimerRef.current = null; }
          setShowBuffering(false);
        }
        const isLoading = (player.status as string) === "loading";
        if (isLoading !== bufferingRef.current) {
          bufferingRef.current = isLoading;
          setBuffering(isLoading);
          if (isLoading) {
            if (!bufferingTimerRef.current) bufferingTimerRef.current = setTimeout(() => { setShowBuffering(true); bufferingTimerRef.current = null; }, 400);
          } else {
            if (bufferingTimerRef.current) { clearTimeout(bufferingTimerRef.current); bufferingTimerRef.current = null; }
            setShowBuffering(false);
          }
        }
        const dur = player.duration;
        if (dur > 0) {
          const frac = player.currentTime / dur;
          const now = Date.now();
          if (now - lastProgressFrameRef.current >= 250) {
            lastProgressFrameRef.current = now;
            setDurationMs(dur * 1000);
            setProgress(frac);
            if (frac >= 0.97) {
              clearVideoProgress(item.id);
              if (!videoEndFiredRef.current) { videoEndFiredRef.current = true; onVideoEnd?.(); }
            } else if (now - lastSavedProgressRef.current >= 2000) { lastSavedProgressRef.current = now; saveVideoProgress(item.id, frac); }
          }
        }
      } catch {}
    }, 100);
    return () => clearInterval(timer);
  }, [isActive]);

  function handleTap() {
    _showBar();
    setPaused((p) => !p);
  }

  function triggerDoubleTapLike(x: number, y: number) {
    if (!item.liked) onLike(item.id, false);

    // The gesture coordinates are local to the video area. Keep the heart
    // anchored to the second tap and restart cleanly if the user taps again
    // before the previous burst has finished.
    setDoubleTapPoint({ x, y });
    doubleTapOpacity.stopAnimation();
    doubleTapScale.stopAnimation();
    doubleTapOpacity.setValue(0);
    doubleTapScale.setValue(0.3);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(doubleTapOpacity, { toValue: 1, duration: 100, useNativeDriver: USE_NATIVE }),
        Animated.spring(doubleTapScale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: USE_NATIVE }),
      ]),
      Animated.delay(500),
      Animated.parallel([
        Animated.timing(doubleTapOpacity, { toValue: 0, duration: 250, useNativeDriver: USE_NATIVE }),
        Animated.timing(doubleTapScale, { toValue: 0.3, duration: 250, useNativeDriver: USE_NATIVE }),
      ]),
    ]).start();
  }

  function handleLike() {
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 0.6, duration: 80, useNativeDriver: USE_NATIVE }),
      Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 7, useNativeDriver: USE_NATIVE }),
    ]).start();
    onLike(item.id, item.liked);
  }

  function handleProgressBarPress(locationX: number) {
    if (!progressBarWidth || !durationMs) return;
    const pct = Math.max(0, Math.min(1, locationX / progressBarWidth));
    player.currentTime = (durationMs / 1000) * pct;
  }

  const videoElement = (
    <View style={StyleSheet.absoluteFill}>
      {shouldMountVideo ? (
        <VideoView
          ref={videoViewRef}
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={isActive}
          startsPictureInPictureAutomatically={isActive}
          onPictureInPictureStart={() => {
            justExitedPipRef.current = false;
            setInPip(true);
          }}
          onPictureInPictureStop={() => {
            // Raise the flag BEFORE clearing inPip so the tabFocused effect
            // sees it during the same render cycle and skips the poster reset.
            justExitedPipRef.current = true;
            setInPip(false);
            // Show opaque cover while Android animates the PiP window back to
            // full screen (~400 ms).  Without this the user sees the VideoView
            // still at PiP dimensions on a black background.
            if (pipExitTimerRef.current) clearTimeout(pipExitTimerRef.current);
            setPipExiting(true);
            pipExitTimerRef.current = setTimeout(() => {
              setPipExiting(false);
              pipExitTimerRef.current = null;
            }, 500);
            // Capture what the native player's play state was right now —
            // this reflects any play/pause the user triggered via PiP controls.
            // Then ALWAYS pause directly. Two outcomes:
            //   (a) User dismissed PiP while app in BG → stays paused, no BG audio.
            //   (b) User tapped PiP to return to app → AppState "active" fires and
            //       resumes only if pausedRef.current is false (not manually paused).
            const wasPlaying = (() => { try { return player.playing; } catch { return false; } })();
            pausedRef.current = !wasPlaying;
            setPaused(!wasPlaying);
            safePause(player);
          }}
        />
      ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} />}

      {/* TapHandler on native — uses Responder, does NOT block scroll */}
      <TapHandler
        onTap={handleTap}
        onDoubleTap={triggerDoubleTapLike}
        onLongPress={() => onOpenMenu(item)}
      />
    </View>
  );

  return (
    <View style={[vStyles.item, { width: screenW, height: screenH }]}>
      {/* Video area — squeezes up when comments open (TikTok/Shorts style) */}
      <Animated.View style={{
        width: screenW, height: videoAreaAnim, overflow: "hidden",
        borderBottomLeftRadius: commentsOpen ? 20 : 0,
        borderBottomRightRadius: commentsOpen ? 20 : 0,
      }}>
        {videoElement}

        {/* PiP-exit cover: hides the VideoView while Android animates it back to full size */}
        {pipExiting && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", pointerEvents: "none" } as any]} />
        )}

        {/* Poster thumbnail: persists until first frame renders, eliminates black flash on swipe */}
        {item.image_url && !videoStarted && (
          <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
            <ExpoImage
              source={{ uri: item.image_url }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              priority="high"
            />
          </View>
        )}

        {showBuffering && isActive && (
          <View style={[vStyles.centerOverlay, { pointerEvents: "none" } as any]}>
            <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
          </View>
        )}
        {paused && !buffering && (
          <View style={[vStyles.centerOverlay, { pointerEvents: "none" } as any]}>
            <View style={vStyles.pauseCircle}>
              <Ionicons name="play" size={32} color="#fff" style={{ marginLeft: 3 }} />
            </View>
          </View>
        )}

        {/* Double-tap like burst, centered on the user's second tap */}
        <Animated.View
          style={[
            vStyles.doubleTapHeart,
            {
              left: doubleTapPoint.x - 55,
              top: doubleTapPoint.y - 55,
              opacity: doubleTapOpacity,
              transform: [{ scale: doubleTapScale }],
              pointerEvents: "none",
            } as any,
          ]}
        >
          <Ionicons name="heart" size={90} color="#FF3B30" />
        </Animated.View>

        {/* Gradient — bottom only */}
        <GradientOverlay position="bottom" height={300} />

        {/* Caption overlay — flush above seek bar, 1-line default + read more */}
        <Animated.View style={[vStyles.captionOverlay, { opacity: overlayOpacity, pointerEvents: commentsOpen ? "none" : "box-none" } as any]}>
          {!!item.content && (
            <>
              {/* Hidden full-text measurement — determines if truncation occurs */}
              <Text
                style={[vStyles.caption, vStyles.captionMeasure]}
                numberOfLines={undefined}
                onTextLayout={(e) => setHasMoreLines(e.nativeEvent.lines.length > 1)}
                aria-hidden
              >
                {item.content}
              </Text>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => hasMoreLines && setExpanded((e) => !e)}
                disabled={!hasMoreLines && !expanded}
                style={vStyles.captionWrap}
              >
                <RichText
                  style={vStyles.caption}
                  numberOfLines={expanded ? undefined : 1}
                  linkColor="#1018D8"
                >
                  {item.content}
                </RichText>
                {hasMoreLines && !expanded && (
                  <Text style={vStyles.captionMore}> more</Text>
                )}
                {expanded && (
                  <Text style={vStyles.captionLess}> less</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        {/* ── Seek bar — hidden by default, revealed on tap, draggable ─── */}
        <Animated.View
          style={[vStyles.seekContainer, { opacity: barOpacity }]}
          onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width - 24)}
          onStartShouldSetResponder={() => barVisibleRef.current}
          onMoveShouldSetResponder={() => barVisibleRef.current}
          onResponderGrant={(e) => {
            isDraggingBarRef.current = true;
            if (barHideTimerRef.current) { clearTimeout(barHideTimerRef.current); barHideTimerRef.current = null; }
            const w = progressBarWidth || 1;
            const p = Math.max(0, Math.min(1, (e.nativeEvent.locationX - 12) / w));
            setProgress(p);
            try { if (durationMs > 0) player.currentTime = p * durationMs / 1000; } catch {}
          }}
          onResponderMove={(e) => {
            const w = progressBarWidth || 1;
            const p = Math.max(0, Math.min(1, (e.nativeEvent.locationX - 12) / w));
            setProgress(p);
            try { if (durationMs > 0) player.currentTime = p * durationMs / 1000; } catch {}
          }}
          onResponderRelease={(e) => {
            const w = progressBarWidth || 1;
            const p = Math.max(0, Math.min(1, (e.nativeEvent.locationX - 12) / w));
            setProgress(p);
            isDraggingBarRef.current = false;
            try { if (durationMs > 0) player.currentTime = p * durationMs / 1000; } catch {}
            _resetBarTimer();
          }}
          onResponderTerminate={() => {
            isDraggingBarRef.current = false;
            _resetBarTimer();
          }}
        >
          {/* Track background */}
          <View style={vStyles.seekTrack}>
            {/* Filled portion */}
            <View style={[vStyles.seekFill, { width: `${(progress * 100).toFixed(2)}%` as any }]} />
          </View>
          {/* Thumb */}
          <View style={[vStyles.seekThumb, { left: `${(progress * 100).toFixed(2)}%` as any }]} />
        </Animated.View>
      </Animated.View>

      {/* ── WeChat-style horizontal bottom action bar ─────────────────────── */}
      <View style={vStyles.bottomBar}>
        {/* Left: avatar · @handle · slim Follow button below handle (no display name) */}
        <View style={vStyles.bottomBarLeft}>
          <TouchableOpacity onPress={() => navigateToProfile(item.profile.handle, true).catch(() => {})} activeOpacity={0.85}>
            <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={36} userId={item.author_id} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <TouchableOpacity
              onPress={() => navigateToProfile(item.profile.handle, true).catch(() => {})}
              activeOpacity={0.85}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <UserName
                  userId={item.author_id}
                  name={`@${item.profile.handle}`}
                  style={vStyles.barHandle}
                  numberOfLines={1}
                  suppressStar
                />
                <VerifiedBadge
                  isVerified={item.profile.is_verified}
                  isOrganizationVerified={item.profile.is_organization_verified}
                  size={12}
                />
              </View>
            </TouchableOpacity>
            {!isSelf && (
              <TouchableOpacity
                onPress={() => onFollow(item.author_id, isFollowing)}
                style={[vStyles.followBtn, isFollowing && vStyles.followBtnActive]}
                activeOpacity={0.8}
              >
                <Text style={[vStyles.followBtnText, isFollowing && vStyles.followBtnTextActive]}>
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Right: like · comment · bookmark · share · more — size 24, all solid */}
        <View style={vStyles.bottomBarRight}>
          <TouchableOpacity onPress={handleLike} hitSlop={8} activeOpacity={0.75} style={vStyles.barAction}>
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons name="heart" size={24} color={item.liked ? "#FF3B30" : "#fff"} />
            </Animated.View>
            <Text style={vStyles.barActionLabel}>{formatCount(item.likeCount)}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onOpenComments(item.id)} hitSlop={8} activeOpacity={0.75} style={vStyles.barAction}>
            <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
            <Text style={vStyles.barActionLabel}>{formatCount(item.replyCount)}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onBookmark(item.id, item.bookmarked)} hitSlop={8} activeOpacity={0.75} style={vStyles.barAction}>
            <Ionicons name="bookmark" size={24} color={item.bookmarked ? "#FFD60A" : "#fff"} />
            <Text style={vStyles.barActionLabel}> </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onShare(item)} hitSlop={8} activeOpacity={0.75} style={vStyles.barAction}>
            <Ionicons name="paper-plane" size={24} color="#fff" />
            <Text style={vStyles.barActionLabel}> </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}); // React.memo

const VS_SHADOW = Platform.select({
  web: { textShadow: "0 1px 5px rgba(0,0,0,0.8)" } as any,
  default: { textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
});
const vStyles = StyleSheet.create({
  item: { backgroundColor: "#000", overflow: "hidden" },
  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  doubleTapHeart: {
    position: "absolute",
    width: 110,
    height: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  pauseCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  // Caption sits directly above the seek bar (seekContainer height = 28)
  captionOverlay: { position: "absolute", left: 16, right: 16, bottom: 28 },
  captionWrap: { marginTop: 2 },
  caption: { color: "rgba(255,255,255,0.93)", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, ...VS_SHADOW },
  captionMeasure: { position: "absolute", opacity: 0, left: 0, right: 0, top: -9999, pointerEvents: "none" } as any,
  captionMore: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontFamily: "Inter_600SemiBold", ...VS_SHADOW },
  captionLess: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontFamily: "Inter_600SemiBold", ...VS_SHADOW },
  // ── WeChat-style horizontal bottom action bar ──────────────────────────────
  bottomBar: {
    height: BOTTOM_BAR_H,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0d0d0d",
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.14)",
    gap: 8,
  },
  bottomBarLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, overflow: "hidden" },
  bottomBarRight: { flexDirection: "row", alignItems: "center", gap: 18, flexShrink: 0 },
  barHandle: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold", ...VS_SHADOW },
  barName: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  followBtn: { alignSelf: "flex-start", marginTop: 3, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 99, borderWidth: 1, borderColor: "#fff" },
  followBtnActive: { borderColor: "rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.07)" },
  followBtnText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  followBtnTextActive: { color: "rgba(255,255,255,0.45)" },
  barAction: { alignItems: "center", gap: 3 },
  barActionLabel: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold", ...VS_SHADOW },
  // ── Seek bar — hidden by default, tap to reveal, drag to scrub ────────────
  seekContainer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    height: 28,
    paddingHorizontal: 12,
    justifyContent: "flex-end",
    paddingBottom: 4,
  },
  seekTrack: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.28)",
    borderRadius: 2,
    overflow: "hidden",
  },
  seekFill: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  seekThumb: {
    position: "absolute",
    bottom: 4 - 5,    // track is 4px at paddingBottom:4, thumb 14px — centres on track
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#fff",
    marginLeft: -7,
    ...Platform.select({
      web: { boxShadow: "0 1px 3px rgba(0,0,0,0.40)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.40, shadowRadius: 3, elevation: 4 },
    }),
  },
});

// ─── VideoFeed (embeddable) ───────────────────────────────────────────────────

export function VideoFeed({ isEmbedded = false }: { isEmbedded?: boolean } = {}) {
  const { accent } = useAppAccent();
  const { colors, isDark, setForceDark } = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const rawId = isEmbedded ? undefined : params.id;
  const id = rawId && !isUuid(rawId) ? decodeId(rawId) : rawId;
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  // Height taken by the floating pill tab bar when this feed is embedded in the tabs navigator.
  // PILL_H (62) + PILL_BOTTOM (max(insets.bottom,8)+6) — must match _tabLayout.tsx values.
  // Applied as paddingBottom so the FlatList measures the correct available height
  // and each video item stops flush with the top of the tab bar (never behind it).
  const PILL_H = 62;
  const PILL_BOTTOM = Math.max(insets.bottom, 8) + 6;
  const tabOffset = isEmbedded ? PILL_H + PILL_BOTTOM : 0;

  const [videoTab, setVideoTab] = useState<"for_you" | "following">("for_you");
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [menuItem, setMenuItem] = useState<VideoPost | null>(null);
  const [shareSheetItem, setShareSheetItem] = useState<VideoPost | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [tabFocused, setTabFocused] = useState(true);
  const [autoScroll, setAutoScroll] = useState(false);
  const autoScrollRef = useRef(false);
  // Offline state — updated reactively by NetInfo
  const [isOffline, setIsOffline] = useState(false);
  // true while the currently displayed feed is from local SQLite cache
  const isOfflineFeedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setTabFocused(true);
      setForceDark(true);
      activateKeepAwakeAsync?.("video-feed")?.catch(() => {});
      return () => {
        setTabFocused(false);
        setForceDark(false);
        setAutoScroll(false);
        autoScrollRef.current = false;
      deactivateKeepAwake?.("video-feed")?.catch(() => {});
      };
    }, [setForceDark])
  );

  const listRef = useRef<FlatList>(null);
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  const videoTabRef = useRef(videoTab);
  // Tracks loaded video IDs so the realtime callback can skip posts not in feed
  const loadedVideoIdsRef = useRef<Set<string>>(new Set());
  const activeIndexRef = useRef(activeIndex);
  const videosLenRef = useRef(videos.length);
  // Stable ref for user — lets fetchVideos read the current user without
  // having it as a dep, so auth-context refreshes never reset the feed.
  const userRef = useRef(user);
  // ── Infinite / varied feed state ────────────────────────────────────────────
  // loadRangeRef: tracks the .range() start position for for_you pagination.
  // Initialised to a random offset so each session starts from a different
  // slice of the catalogue — the user never sees the same feed twice.
  const loadRangeRef = useRef(Math.floor(Math.random() * 30) * VIDEO_PAGE_SIZE);
  // sessionSeenRef: IDs already shown this session — prevents duplicates when
  // the range wraps around after exhausting the full catalogue.
  const sessionSeenRef = useRef(new Set<string>());
  // Stable ref for videos — lets interaction callbacks (like/bookmark) always
  // read the latest videos array without being in every useCallback dep list.
  const videosRef = useRef(videos);
  // Tab indicator is driven purely by videoTab state — no Animated needed.

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { videoTabRef.current = videoTab; }, [videoTab]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { autoScrollRef.current = autoScroll; }, [autoScroll]);

  // PiP is always-on — no toggle needed. Auto-starts on home button press.
  useEffect(() => {
    videosLenRef.current = videos.length;
    videosRef.current = videos;
    loadedVideoIdsRef.current = new Set(videos.map((v) => v.id));
  }, [videos]);
  useEffect(() => { userRef.current = user; }, [user]);

  // ── Offline connectivity tracking ─────────────────────────────────────────
  useEffect(() => {
    // Seed initial state synchronously from the cached NetInfo value
    setIsOffline(checkIsOffline());
    return subscribeToNetworkChanges((offline) => {
      setIsOffline(offline);
      // Came back online while serving cached content → reload live feed
      if (!offline && isOfflineFeedRef.current) {
        isOfflineFeedRef.current = false;
        fetchVideos(videoTabRef.current).catch(() => setLoading(false));
      }
    });
  // fetchVideos is stable (dep is only `id`) — safe to omit here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Offline feed builder ──────────────────────────────────────────────────
  // Converts the SQLite video registry into VideoPost objects using local file
  // paths as video_url so they play without any network access.
  const buildOfflineFeed = useCallback(async (): Promise<VideoPost[]> => {
    const entries = await getOfflineVideos();
    return entries
      .filter((e) => !!e.fileUri)
      .map((e): VideoPost => ({
        id: e.postId,
        author_id: e.authorId ?? "offline",
        content: e.title ?? "",
        video_url: e.fileUri,         // ← local file path, plays without network
        image_url: e.thumbnail ?? null,
        created_at: new Date(e.cachedAt).toISOString(),
        view_count: 0,
        audio_name: null,
        profile: {
          display_name: e.authorName ?? "Cached video",
          handle: e.authorHandle ?? "offline",
          avatar_url: e.authorAvatar ?? null,
          is_verified: false,
          is_organization_verified: false,
        },
        liked: false,
        bookmarked: false,
        likeCount: 0,
        replyCount: 0,
      }));
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchVideos = useCallback(async (tab: "for_you" | "following", cursor?: string | null) => {
    const isLoadMore = !!cursor;
    if (isLoadMore) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      cursorRef.current = null; setHasMore(true);

      // ── Offline-first: show the target video from local cache immediately ────
      // This lets the video open instantly even with no internet connection.
      let showedLocalVideo = false;
      if (id) {
        const local = await getLocalFeedPost(id);
        if (local?.video_url) {
          showedLocalVideo = true;
          setVideos([{
            id: local.id,
            author_id: local.author_id,
            content: local.content ?? "",
            video_url: local.video_url!,
            image_url: local.image_url,
            created_at: local.created_at,
            view_count: local.view_count,
            audio_name: null,
            profile: {
              display_name: local.author_name ?? "User",
              handle: local.author_handle ?? "user",
              avatar_url: local.author_avatar ?? null,
              is_verified: false,
              is_organization_verified: false,
            },
            liked: local.liked,
            bookmarked: local.bookmarked,
            likeCount: local.like_count,
            replyCount: local.reply_count,
          }]);
          setLoading(false);
        }
      }
      if (!showedLocalVideo) {
        setLoading(true); setVideos([]);
      }
    }

    const currentUser = userRef.current;
    let followingIds: string[] = [];

    // ── Offline fast-path ─────────────────────────────────────────────────────
    // If we have no network, skip all Supabase calls and serve cached videos.
    if (checkIsOffline()) {
      if (!isLoadMore) {
        const offlineVids = await buildOfflineFeed();
        if (offlineVids.length > 0) {
          setVideos(offlineVids);
          isOfflineFeedRef.current = true;
        }
        setLoading(false);
      } else {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
      return;
    }

    try {
    if (tab === "following" && currentUser) {
      const { data: followData } = await supabase.from("follows").select("following_id").eq("follower_id", currentUser.id);
      followingIds = (followData || []).map((f: any) => f.following_id);
      if (followingIds.length === 0) {
        setVideos([]); setLoading(false); loadingMoreRef.current = false; setLoadingMore(false); return;
      }
    }

    // ── Query building ─────────────────────────────────────────────────────────
    // "For You": range-based pagination across ALL videos (no time cap).
    //   - Initial load picks a fresh random start so every session begins at a
    //     different position in the catalogue — the user never sees the same
    //     feed twice in a row.
    //   - Load-more advances the window by VIDEO_PAGE_SIZE each call.
    //   - When the range passes the end of the DB we wrap to a new random start.
    //   - hasMore is always true for this tab (infinite scroll, no hard limit).
    //
    // "Following": stays cursor-based / newest-first (chronological intention).

    // Always fetch a large pool for the initial For You load so the ranking
    // algorithm has enough candidates to produce genuinely varied results.
    const FOR_YOU_POOL = VIDEO_PAGE_SIZE * 4;

    if (tab === "for_you" && !isLoadMore) {
      sessionSeenRef.current = new Set<string>();
    }

    let query = supabase
      .from("posts")
      .select(`id, author_id, content, video_url, image_url, created_at, audio_name, profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified)`)
      .not("video_url", "is", null)
      .or("post_type.eq.video,post_type.is.null")
      .order("created_at", { ascending: false });

    if (tab === "for_you") {
      // Limit-based: always fetch the freshest FOR_YOU_POOL videos (no random
      // range offset — that breaks on small catalogues where the offset exceeds
      // row count and returns nothing). Variety comes from weighted sampling +
      // score jitter, not from a database offset.
      query = (query as any).limit(FOR_YOU_POOL).or("visibility.eq.public,visibility.is.null");
      if (isLoadMore && cursor) {
        // Load-more: advance cursor through older videos
        query = (query as any).lt("created_at", cursor);
      }
    } else if (tab === "following" && followingIds.length > 0) {
      query = (query as any).limit(VIDEO_PAGE_SIZE).in("author_id", followingIds).or("visibility.eq.public,visibility.eq.followers,visibility.is.null");
      if (cursor) query = (query as any).lt("created_at", cursor);
    } else {
      query = (query as any).limit(VIDEO_PAGE_SIZE).or("visibility.eq.public,visibility.is.null");
      if (cursor) query = (query as any).lt("created_at", cursor);
    }

    const { data, error: qErr } = await query;
    if (qErr) console.warn("[VideoFeed] query error:", qErr.message);

    if (data && data.length > 0) {
      const postIds = data.map((p: any) => p.id);
      const authorIds = [...new Set(data.map((p: any) => p.author_id))] as string[];

      const [
        { data: likesData }, { data: repliesData }, { data: viewsData },
        { data: myLikes }, { data: myBookmarks }, { data: myFollows },
      ] = await Promise.all([
        supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
        supabase.from("post_replies").select("post_id").in("post_id", postIds),
        supabase.from("post_views").select("post_id").in("post_id", postIds),
        currentUser ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", currentUser.id) : { data: [] },
        currentUser ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", currentUser.id) : { data: [] },
        currentUser ? supabase.from("follows").select("following_id").eq("follower_id", currentUser.id).in("following_id", authorIds) : { data: [] },
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
      const followedSet = new Set((myFollows || []).map((f: any) => f.following_id as string));

      const allMapped: VideoPost[] = data.map((p: any) => ({
        id: p.id, author_id: p.author_id, content: p.content || "",
        video_url: p.video_url, image_url: p.image_url || null, created_at: p.created_at,
        view_count: viewMap[p.id] || 0, audio_name: p.audio_name || null,
        profile: { display_name: p.profiles?.display_name || "User", handle: p.profiles?.handle || "user", avatar_url: p.profiles?.avatar_url || null, is_verified: !!p.profiles?.is_verified, is_organization_verified: !!p.profiles?.is_organization_verified },
        liked: myLikeSet.has(p.id), bookmarked: myBookmarkSet.has(p.id),
        likeCount: likeMap[p.id] || 0, replyCount: replyMap[p.id] || 0,
      }));

      // Deduplicate against videos already shown this session (matters on wrap-around)
      const mapped = tab === "for_you"
        ? allMapped.filter((v) => !sessionSeenRef.current.has(v.id))
        : allMapped;
      for (const v of mapped) sessionSeenRef.current.add(v.id);

      // ── Rank by quality algorithm ───────────────────────────────────────────
      const [learnedWeights, seenVideoMap, notInterestedSignals] = await Promise.all([
        getLearnedInterestBoosts(),
        getSeenVideoMap(),
        getNotInterestedSignals(),
      ]);
      const now = Date.now();

      // Count how many times each author appears in this page (for diversity penalty)
      const authorPageCount: Record<string, number> = {};
      for (const v of mapped) authorPageCount[v.author_id] = (authorPageCount[v.author_id] || 0) + 1;

      let diversified: VideoPost[];

      if (tab === "for_you") {
        // Full quality algorithm: freshness + velocity + interest + seen-video demotion
        const scored = mapped.map((v) => {
          const interestMatches = matchInterestsWeighted(v.content, [], learnedWeights);
          const seenAt = seenVideoMap.get(v.id);
          const hashtags = extractHashtags(v.content);
          const engagementRate = v.likeCount / Math.max(v.view_count, 1);
          const completionProxy = Math.min(v.likeCount / Math.max(v.view_count, 0.5), 1);
          const postTopics = detectTopicsInContent(v.content || "");
          const notInterestedTopicCount = postTopics.filter((t) => notInterestedSignals.topics.has(t)).length;
          const signals: FeedSignals = {
            likeCount: v.likeCount,
            replyCount: v.replyCount,
            viewCount: v.view_count,
            createdAt: v.created_at,
            interestMatches,
            isFollowing: followedSet.has(v.author_id),
            authorInteractionCount: v.liked ? 3 : 0,
            isVerified: false,
            isOrgVerified: false,
            hasImages: !!v.image_url,
            sameCountry: false,
            authorPostCountInFeed: authorPageCount[v.author_id] || 1,
            contentLength: v.content?.length || 0,
            postType: "video",
            seenAt,
            engagementRate,
            hashtagCount: hashtags.length,
            completionProxy,
            notInterestedAuthorId: notInterestedSignals.authorIds.has(v.author_id),
            notInterestedTopicCount,
          };
          const score = computeFeedScore(signals);
          return { id: v.id, author_id: v.author_id, score, postType: "video" as const, video: v };
        });

        // Weighted random sampling from top candidates so every session feels
        // different even with the same pool of videos. Pick from top-40 scored
        // videos proportional to their score so quality still wins, just not always.
        const topPool = [...scored].sort((a, b) => b.score - a.score).slice(0, 40);
        const sampled = weightedSample(topPool, Math.min(topPool.length, VIDEO_PAGE_SIZE));

        // Diversify to prevent same-creator back-to-back slots
        const diversifiedScored = diversifyFeed(sampled);
        diversified = diversifiedScored.map((s) => s.video as VideoPost);
      } else {
        // Following tab: newest-first with light engagement velocity boost.
        const scored = mapped.map((v) => {
          const ageHours = (now - new Date(v.created_at).getTime()) / 3600000;
          const recency = Math.max(0, 100 - ageHours * 1.5);
          const velocity = Math.min((v.likeCount + v.replyCount * 2) / Math.max(ageHours, 0.5) * 6, 20);
          // Larger jitter so following tab isn't purely chronological every time
          const score = recency + velocity + Math.random() * 8;
          return { id: v.id, author_id: v.author_id, score, postType: "video" as const, video: v };
        });
        scored.sort((a, b) => b.score - a.score);
        diversified = scored.map((s) => s.video);
      }

      let newVideos = diversified;
      cursorRef.current = data[data.length - 1].created_at;
      // "For You" is truly infinite — never stop. "Following" uses natural cursor end.
      setHasMore(tab === "for_you" ? true : data.length === VIDEO_PAGE_SIZE);

      if (isLoadMore) {
        setVideos((prev) => {
          const seen = new Set(prev.map((v) => v.id));
          return [...prev, ...newVideos.filter((v) => !seen.has(v.id))];
        });
      } else {
        // Bubble up the requested video ID to position 0
        if (id) {
          const existingIdx = newVideos.findIndex((v) => v.id === id);
          if (existingIdx > 0) {
            const [target] = newVideos.splice(existingIdx, 1);
            newVideos = [target, ...newVideos];
          } else if (existingIdx === -1) {
            const { data: tRow } = await supabase
              .from("posts")
              .select(`id, author_id, content, video_url, image_url, created_at, audio_name, profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified)`)
              .eq("id", id).not("video_url", "is", null).maybeSingle();
            if (tRow) {
              newVideos = [{
                id: tRow.id, author_id: tRow.author_id, content: tRow.content || "",
                video_url: tRow.video_url, image_url: tRow.image_url || null, created_at: tRow.created_at,
                view_count: 0, audio_name: tRow.audio_name || null,
                profile: { display_name: (tRow.profiles as any)?.display_name || "User", handle: (tRow.profiles as any)?.handle || "user", avatar_url: (tRow.profiles as any)?.avatar_url || null, is_verified: !!(tRow.profiles as any)?.is_verified, is_organization_verified: !!(tRow.profiles as any)?.is_organization_verified },
                liked: false, bookmarked: false, likeCount: 0, replyCount: 0,
              }, ...newVideos];
            }
          }
        }
        setVideos(newVideos);
      }
    } else {
      if (tab === "for_you" && isLoadMore) {
        // Catalogue exhausted — wrap back to the freshest videos.
        // Clear session dedup so resurfaced content feels natural.
        cursorRef.current = null;
        sessionSeenRef.current = new Set<string>();
        setHasMore(true); // keep infinite scroll alive — next scroll triggers fresh fetch
      } else if (tab === "for_you" && !isLoadMore) {
        // Initial load got nothing — don't wipe videos, keep any existing content.
        // This can happen when the target video takes a moment to resolve.
      } else {
        setHasMore(false);
        if (!isLoadMore) setVideos([]);
      }
    }

    isOfflineFeedRef.current = false;
    if (isLoadMore) { loadingMoreRef.current = false; setLoadingMore(false); }
    else setLoading(false);
    } catch (networkErr: any) {
      // Network unavailable — try offline cache before giving up.
      console.warn("[VideoFeed] offline or network error:", networkErr?.message ?? networkErr);
      if (!isLoadMore) {
        try {
          const offlineVids = await buildOfflineFeed();
          if (offlineVids.length > 0) {
            setVideos(offlineVids);
            isOfflineFeedRef.current = true;
          }
        } catch {}
        setLoading(false);
      } else {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // user intentionally omitted — read via userRef so auth refreshes never reset the feed

  useEffect(() => {
    // videoTab is the only thing that should trigger a full reset (user switched tabs).
    // fetchVideos intentionally omitted — it's stable (dep is only `id`).
    fetchVideos(videoTab).catch(() => { setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoTab]);

  // Double-tap the Shorts tab to refresh: scroll to top and reload feed.
  useEffect(() => {
    if (!isEmbedded) return;
    const unsub = onShortsRefresh(() => {
      setActiveIndex(0);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      fetchVideos(videoTabRef.current).catch(() => { setLoading(false); });
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmbedded]);

  // Realtime like/reply count updates — only fire DB calls for videos that
  // are actually loaded in this feed (avoids count queries for unrelated posts).
  useEffect(() => {
    const channelName = `video-feed-realtime:${id ?? "embed"}`;
    const channelTopic = `realtime:${channelName}`;

    // React Strict Mode and fast tab transitions can run the next effect
    // before Supabase has finished removing the previous channel. Supabase
    // rejects adding postgres_changes handlers to that still-subscribed
    // channel, which otherwise takes down the whole Shorts screen.
    const staleChannels = supabase.getChannels().filter(
      (candidate) => candidate.topic === channelTopic,
    );
    staleChannels.forEach((staleChannel) => {
      void supabase.removeChannel(staleChannel).catch(() => {});
    });

    const channel = supabase.channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_acknowledgments" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId || !loadedVideoIdsRef.current.has(postId)) return;
        supabase.from("post_acknowledgments").select("id", { count: "exact", head: true }).eq("post_id", postId)
          .then(({ count }) => { setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, likeCount: count || 0 } : v)); });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_replies" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId || !loadedVideoIdsRef.current.has(postId)) return;
        supabase.from("post_replies").select("id", { count: "exact", head: true }).eq("post_id", postId)
          .then(({ count }) => { setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, replyCount: count || 0 } : v)); });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel).catch(() => {}); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── FlatList config ────────────────────────────────────────────────────────

  // Stable ref — never changes identity so FlatList never re-wires the handler
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      const idx = viewableItems[0].index;
      setActiveIndex(idx);
      activeIndexRef.current = idx;
      // Mark this video (and its neighbors) as seen so it gets demoted next session
      const seenBatch: string[] = [];
      for (const vt of viewableItems) {
        if (vt.item?.id) seenBatch.push(vt.item.id);
      }
      if (seenBatch.length > 0) markVideosSeen(seenBatch).catch(() => {});
      // Preload more when 3 from end
      if (idx >= videosLenRef.current - 3 && !loadingMoreRef.current && hasMoreRef.current && cursorRef.current) {
        fetchVideos(videoTabRef.current, cursorRef.current).catch(() => { loadingMoreRef.current = false; setLoadingMore(false); });
      }
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  // Use measured FlatList height for perfect snap on all Android devices.
  // useWindowDimensions() may include status/nav bar pixels that the FlatList
  // itself does not occupy (common on Infinix, Tecno, OPPO with gesture nav),
  // causing pagingEnabled to snap to the wrong position.
  // Seed with inset-adjusted height so the action bar is correctly positioned
  // on the very first render, before onLayout fires.
  const [listHeight, setListHeight] = useState(() => SCREEN_H - tabOffset);
  const listHeightRef = useRef(SCREEN_H - tabOffset);
  const onListLayout = useCallback((e: any) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - listHeightRef.current) > 2) {
      listHeightRef.current = h;
      setListHeight(h);
    }
  }, []);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: listHeight, offset: listHeight * index, index,
  }), [listHeight]);

  // ── Interactions ───────────────────────────────────────────────────────────

  const handleLike = useCallback(async (postId: string, currentlyLiked: boolean) => {
    const currentUser = userRef.current;
    if (!currentUser) { setShowSignInPrompt(true); return; }

    // Optimistic update — update UI immediately before any await
    if (currentlyLiked) {
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: false, likeCount: Math.max(0, v.likeCount - 1) } : v));
    } else {
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: true, likeCount: v.likeCount + 1 } : v));
    }

    if (currentlyLiked) {
      const { error } = await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", currentUser.id);
      if (error) {
        // Rollback on failure
        setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: true, likeCount: v.likeCount + 1 } : v));
      }
    } else {
      const { error } = await supabase.from("post_acknowledgments").upsert(
        { post_id: postId, user_id: currentUser.id },
        { onConflict: "post_id,user_id", ignoreDuplicates: true }
      );
      if (error) {
        // Rollback on failure
        setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: false, likeCount: Math.max(0, v.likeCount - 1) } : v));
      } else {
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBookmark = useCallback(async (postId: string, currentlyBookmarked: boolean) => {
    const currentUser = userRef.current;
    if (!currentUser) { setShowSignInPrompt(true); return; }
    // Optimistic update first
    setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, bookmarked: !currentlyBookmarked } : v));
    if (currentlyBookmarked) {
      const { error } = await supabase.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", currentUser.id);
      if (error) setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, bookmarked: true } : v));
    } else {
      const { error } = await supabase.from("post_bookmarks").upsert({ post_id: postId, user_id: currentUser.id }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
      if (error) setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, bookmarked: false } : v));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFollow = useCallback(async (authorId: string, isFollowing: boolean) => {
    const currentUser = userRef.current;
    if (!currentUser) { setShowSignInPrompt(true); return; }
    // Optimistic update first
    setFollowingSet((prev) => { const next = new Set(prev); if (isFollowing) next.delete(authorId); else next.add(authorId); return next; });
    if (isFollowing) {
      const { error } = await supabase.from("follows").delete().eq("follower_id", currentUser.id).eq("following_id", authorId);
      if (error) setFollowingSet((prev) => { const next = new Set(prev); next.add(authorId); return next; });
    } else {
      const { error } = await supabase.from("follows").upsert({ follower_id: currentUser.id, following_id: authorId }, { onConflict: "follower_id,following_id", ignoreDuplicates: true });
      if (error) setFollowingSet((prev) => { const next = new Set(prev); next.delete(authorId); return next; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleReplyCountChange(postId: string, delta: number) {
    setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, replyCount: v.replyCount + delta } : v));
  }

  const recordedViews = useRef(new Set<string>());
  const handleRecordView = useCallback(async (postId: string) => {
    if (!user || recordedViews.current.has(postId)) return;
    recordedViews.current.add(postId);
    supabase.from("post_views").upsert({ post_id: postId, viewer_id: user.id }, { onConflict: "post_id,viewer_id" }).then(null, () => {});
    setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, view_count: v.view_count + 1 } : v));
    const video = videosRef.current.find((v) => v.id === postId);
    trackEvent("view_video", { post_id: postId, author_id: video?.author_id ?? "" });
  }, [user]);

  function getVideoUrl(item: VideoPost): string {
    const shortId = encodeId(item.id);
    return `https://afuchat.com/video/${shortId}`;
  }

  function showToast(msg: string, durationMs = 2500) {
    setDownloadToast(msg);
    setTimeout(() => setDownloadToast(null), durationMs);
  }

  async function handleDownload(item: VideoPost) {
    if (downloading) return;

    // Resolve the best public MP4 URL via the manifest (same as playback).
    // Falls back to item.video_url if the manifest isn't available yet.
    async function resolveDownloadUrl(): Promise<string> {
      try {
        const manifest = await getPostVideoManifest(item.id);
        if (manifest) {
          // Prefer H.264 for broadest device compatibility when saving.
          const h264 = manifest.sources.find(
            (s) => s.codec === "h264" && s.url,
          );
          if (h264?.url) return h264.url;
          // Fall back to any ready source.
          const best = pickBestSource(manifest, { targetHeight: 1080 });
          if (best.url) return best.url;
          // Last resort: manifest's fallback_url (the original upload).
          if (manifest.fallback_url) return manifest.fallback_url;
        }
      } catch {
        // ignore — use raw video_url below
      }
      return item.video_url;
    }

    setDownloading(true); showToast("Saving to device…", 30000);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== "granted") {
        setDownloading(false); setDownloadToast(null);
        showAlert("Permission needed", "Please allow media library access in Settings to save videos.");
        return;
      }
      const url = await resolveDownloadUrl();
      const dest = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}afuchat_dl_${item.id}.mp4`;
      const { uri, status: dlStatus } = await FileSystem.downloadAsync(url, dest);
      if (!uri || (dlStatus !== undefined && (dlStatus < 200 || dlStatus >= 400))) throw new Error(`HTTP ${dlStatus}`);
      await MediaLibrary.createAssetAsync(uri);
      await FileSystem.deleteAsync(uri, { idempotent: true });
      setDownloading(false); showToast("Saved to your device");
    } catch (err) {
      setDownloading(false); setDownloadToast(null);
      console.error("[download]", err);
      showAlert("Download failed", "Could not save the video. If the issue persists, check the Status page under Settings → Help & About.");
    }
  }

  async function handleRepost(item: VideoPost) {
    const url = getVideoUrl(item);
    try { await Share.share({ message: `Reposting: ${item.profile.display_name} on AfuChat\n${url}`, url, title: "Repost from AfuChat" }); } catch {}
  }

  function handleCopyLink(item: VideoPost) { Clipboard.setStringAsync(getVideoUrl(item)); showToast("Link copied"); }
  async function handleNotInterested(item: VideoPost) {
    setVideos((prev) => prev.filter((v) => v.id !== item.id));
    const marked = await markNotInterested(item.author_id, item.content || "");
    globalShowActionToast(
      "We\u2019ll show less of this",
      "Undo",
      async () => {
        await undoNotInterested(marked.authorId, marked.topics);
        setVideos((prev) => (prev.some((v) => v.id === item.id) ? prev : [item, ...prev]));
      },
      { type: "info", icon: "eye-off" },
    );
  }
  function handleReport(item: VideoPost) {
    showAlert("Report video", "Why are you reporting this?", [
      { text: "Spam", onPress: () => showToast("Report submitted. Thanks") },
      { text: "Inappropriate", onPress: () => showToast("Report submitted. Thanks") },
      { text: "Misinformation", onPress: () => showToast("Report submitted. Thanks") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function switchTab(tab: "for_you" | "following") {
    if (tab === videoTab) return;
    if (tab === "following" && !user) { router.push("/(auth)/login"); return; }
    setActiveIndex(0);
    setVideoTab(tab);
  }

  // ── Derived callbacks — must be declared before any early return ───────────

  const onShare = useCallback((item: VideoPost) => setShareSheetItem(item), []);
  const onOpenMenu = useCallback((item: VideoPost) => {
    setMenuItem(item);
  }, []);

  const handleVideoEnd = useCallback(() => {
    if (!autoScrollRef.current) return;
    const next = activeIndexRef.current + 1;
    if (next >= videosLenRef.current) return;
    listRef.current?.scrollToIndex({ index: next, animated: true });
  }, []);

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => {
      const next = !prev;
      autoScrollRef.current = next;
      return next;
    });
  }, []);


  const squeezedH = Math.round(listHeight * 0.38);

  const videoItemProps = React.useMemo(() => ({
    screenH: listHeight, screenW: SCREEN_W,
    navOffset: 0,
    onLike: handleLike, onBookmark: handleBookmark,
    onOpenComments: setCommentPostId,
    onShare,
    onFollow: handleFollow,
    onRecordView: handleRecordView,
    onOpenMenu,
    onVideoEnd: handleVideoEnd,
    tabFocused,
    squeezedH,
  }), [listHeight, SCREEN_W, isEmbedded, insets, handleLike, handleBookmark, handleFollow, handleRecordView, onShare, onOpenMenu, handleVideoEnd, tabFocused, squeezedH]);

  const renderItem = useCallback(({ item, index }: { item: VideoPost; index: number }) => (
    <VideoItem
      item={item}
      isActive={index === activeIndex}
      isNearActive={Math.abs(index - activeIndex) <= 2}
      isFollowing={followingSet.has(item.author_id)}
      isSelf={user?.id === item.author_id}
      commentsOpen={commentPostId === item.id}
      {...videoItemProps}
    />
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [activeIndex, followingSet, user?.id, videoItemProps, commentPostId]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[mStyles.root, { paddingBottom: tabOffset }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ShortsFeedSkeleton dark={isDark} />
        {/* Render the real header on top so navigation chrome is visible during load */}
        <View style={[mStyles.headerRow, { paddingTop: insets.top + 6 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={[mStyles.headerSide, isEmbedded && { opacity: 0, pointerEvents: "none" } as any]}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={mStyles.tabRow}>
            <TouchableOpacity
              onPress={() => switchTab("for_you")}
              style={[mStyles.tabBtn, videoTab === "for_you" && mStyles.tabBtnActive]}
            >
              <Text style={[mStyles.tabText, videoTab === "for_you" && mStyles.tabTextActive]}>For You</Text>
            </TouchableOpacity>
            <View style={mStyles.tabDivider} />
            <TouchableOpacity
              onPress={() => switchTab("following")}
              style={[mStyles.tabBtn, videoTab === "following" && mStyles.tabBtnActive]}
            >
              <Text style={[mStyles.tabText, videoTab === "following" && mStyles.tabTextActive]}>Following</Text>
            </TouchableOpacity>
          </View>
          <View style={mStyles.headerRight}>
            <TouchableOpacity hitSlop={8} onPress={() => router.push("/search" as any)}>
              <Ionicons name="search" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[mStyles.root, { paddingBottom: tabOffset }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Fixed header */}
      <View style={[mStyles.headerRow, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={[mStyles.headerSide, isEmbedded && { opacity: 0, pointerEvents: "none" } as any]}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={mStyles.tabRow}>
          <TouchableOpacity
            onPress={() => switchTab("for_you")}
            style={[mStyles.tabBtn, videoTab === "for_you" && mStyles.tabBtnActive]}
          >
            <Text style={[mStyles.tabText, videoTab === "for_you" && mStyles.tabTextActive]}>For You</Text>
          </TouchableOpacity>
          <View style={mStyles.tabDivider} />
          <TouchableOpacity
            onPress={() => switchTab("following")}
            style={[mStyles.tabBtn, videoTab === "following" && mStyles.tabBtnActive]}
          >
            <Text style={[mStyles.tabText, videoTab === "following" && mStyles.tabTextActive]}>Following</Text>
          </TouchableOpacity>
        </View>
        <View style={mStyles.headerRight}>
          <TouchableOpacity hitSlop={8} onPress={() => router.push("/search" as any)}>
            <Ionicons name="search" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>


      {videos.length === 0 ? (
        <View style={mStyles.emptyState}>
          <View style={mStyles.emptyIcon}>
            <Ionicons name={isOffline ? "cloud-offline" : "videocam"} size={44} color="rgba(255,255,255,0.25)" />
          </View>
          <Text style={mStyles.emptyTitle}>{isOffline ? "You're offline" : "No videos yet"}</Text>
          <Text style={mStyles.emptySubtitle}>
            {isOffline
              ? "Watch some videos first so they can be saved for offline viewing"
              : videoTab === "following" ? "Follow creators to see their videos here" : "Videos will appear here soon"}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={videos}
          keyExtractor={(v) => v.id}
          renderItem={renderItem}
          // Core scroll config
          pagingEnabled
          scrollEnabled
          showsVerticalScrollIndicator={false}
          // Viewability
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          // Performance
          getItemLayout={getItemLayout}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={3}
          removeClippedSubviews={false}
          // End-reached
          onEndReached={() => {
            if (!loadingMoreRef.current && hasMore && cursorRef.current) {
              fetchVideos(videoTab, cursorRef.current).catch(() => { loadingMoreRef.current = false; setLoadingMore(false); });
            }
          }}
          onEndReachedThreshold={2}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: false }), 300);
          }}
          // Layout measurement — fixes snap misalignment on Infinix/Android devices
          // where the FlatList height differs from useWindowDimensions()
          onLayout={onListLayout}
          // Misc
          decelerationRate="fast"
          style={{ flex: 1, backgroundColor: "#000" }}
          ListFooterComponent={loadingMore ? (
            <View style={{ width: SCREEN_W, height: listHeight, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
              <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
            </View>
          ) : null}
        />
      )}

      {/* Comments — full Modal bottom sheet, floats over video + tab bar */}
      <VideoCommentsSheet
        visible={!!commentPostId}
        onClose={() => setCommentPostId(null)}
        postId={commentPostId ?? ""}
        postAuthorId={videos.find((v) => v.id === commentPostId)?.author_id ?? ""}
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
        autoScroll={autoScroll}
        onToggleAutoScroll={() => { toggleAutoScroll(); }}
      />

      <SocialShareSheet
        visible={!!shareSheetItem} onClose={() => setShareSheetItem(null)}
        url={shareSheetItem ? getVideoUrl(shareSheetItem) : ""}
        title={shareSheetItem ? `${shareSheetItem.profile.display_name} on AfuChat` : ""}
      />

      {!!downloadToast && (
        <View style={[mStyles.toast, { pointerEvents: "none" } as any]}>
          <Text style={mStyles.toastText}>{downloadToast}</Text>
        </View>
      )}

      <SignInPromptModal visible={showSignInPrompt} onDismiss={() => setShowSignInPrompt(false)} />
    </View>
  );
}

// ─── Route default export ─────────────────────────────────────────────────────
export default function VideoPlayerScreen() {
  return <VideoFeed isEmbedded={false} />;
}

const mStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  } as any,
  headerRow: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 30, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 10 },
  headerSide: { width: 38, alignItems: "center" },
  headerRight: { width: 72, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 12 },
  tabRow: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 2 },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 18, borderBottomWidth: 2.5, borderBottomColor: "transparent" },
  tabBtnActive: { borderBottomColor: "#fff" },
  tabDivider: { width: 1, height: 16, backgroundColor: "rgba(255,255,255,0.18)" },
  tabText: { color: "rgba(255,255,255,0.45)", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  tabTextActive: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { color: "rgba(255,255,255,0.65)", fontSize: 18, fontFamily: "Inter_700Bold" },
  emptySubtitle: { color: "rgba(255,255,255,0.35)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  toast: { position: "absolute", bottom: 90, left: 0, right: 0, alignItems: "center" },
  toastText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium", backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24, overflow: "hidden" },
  offlineBanner: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 30 },
  offlineBannerPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.72)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  offlineBannerText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: "Inter_500Medium" },
});
