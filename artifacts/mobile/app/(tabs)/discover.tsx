import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image as RNImage,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
// PagerView gives true native 1:1 finger-tracking on Android/iOS.
const _PagerView: any = (() => {
  try { return require("react-native-pager-view").default; } catch { return null; }
})();
// Animated.event with useNativeDriver requires the VirtualizedList itself to
// be wrapped, not just the scroll handler passed to a plain FlatList.
const AnimatedFlatList: any = Animated.createAnimatedComponent(FlatList);
import { TabSwipeContext } from "@/context/TabSwipeContext";
import { Image as ExpoImage } from "expo-image";
import { showAlert } from "@/lib/alert";
import { useSafeAreaInsets, useSafeAreaInsets as useCardInsets } from "react-native-safe-area-context";
import { router, useNavigation, useFocusEffect } from "expo-router";
import { safeRouter } from "@/lib/navUtils";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { ImageViewer, useImageViewer, type PostViewerMeta } from "@/components/ImageViewer";
import { supabase } from "@/lib/supabase";
import {
  ACCOUNT_PROFILE_FOLLOWER_COLUMNS,
  ACCOUNT_PROFILE_FEED_COLUMNS,
  fetchAccountProfileMap,
} from "@/lib/sharedProfiles";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import CachedImage from "@/components/ui/CachedImage";
import { RichText } from "@/components/ui/RichText";
import Colors from "@/constants/colors";
import { PostSkeleton } from "@/components/ui/Skeleton";
import { VideoThumbnail } from "@/components/ui/VideoThumbnail";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import UserName from "@/components/ui/UserName";
import PostUploadBanner from "@/components/ui/PostUploadBanner";
import { isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { getLocalFeedPosts, saveFeedPosts, getNewestFeedPostDate, type FeedTab as LocalFeedTab } from "@/lib/storage/localFeed";
import { getCachedFeedTab, cacheFeedTab, getCachedMoments, cacheMoments } from "@/lib/offlineStore";
import { timeAgo as formatRelative, formatPostDate } from "@/lib/timeAgo";
import { sharePost, shareVideo } from "@/lib/share";
import { matchInterestsWeighted, recordInteraction, getLearnedInterestBoosts, computeFeedScore, diversifyFeed, getSeenPostIds, markPostsSeen, weightedSample, type FeedSignals } from "@/lib/feedAlgorithm";
import { setHandleId } from "@/lib/profileCache";
import { trackEvent } from "@/lib/activityTracker";
import { getMergedLearnedWeights } from "@/lib/personalization";
import { useLanguage } from "@/context/LanguageContext";
import { translateUserContent } from "@/lib/translate";
import { LANG_LABELS } from "@/lib/i18n";
import { encodeId } from "@/lib/shortId";
import { useOpenLink } from "@/lib/useOpenLink";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import SignInPromptModal from "@/components/ui/SignInPromptModal";
import { PostShareCaptureModal, type ShareablePost } from "@/components/ui/PostShareCard";
import { UserRecsCard } from "@/components/discover/UserRecsCard";
import { DismissSheet, type DismissReason } from "@/components/discover/DismissSheet";
import { SuggestedUsers } from "@/components/ui/SuggestedUsers";
import { StoryRing } from "@/components/ui/StoryRing";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { BlurView } from "expo-blur";
import { GLASS, glassTokens } from "@/constants/glass";
import { useUserEffects } from "@/hooks/useUserEffects";
import { getViewedUserIds, hydrateViewedUsers, subscribeStoryViewed } from "@/lib/storyViewedStore";
import { getCachedStoryMedia } from "@/lib/storyMediaCache";
import { prefetchAvatars, prefetchThumbnails, prefetchListImages } from "@/lib/storage/imagePrefetcher";
import { useThrottledFocusEffect } from "@/lib/hooks/useThrottledFocusEffect";
import FindPeopleTab from "@/components/discover/FindPeopleTab";

async function hydrateFeedPostRows(rows: any[]) {
  if (rows.length === 0) return rows;

  const postIds = [...new Set(rows.map((row) => row.id).filter(Boolean))];
  const authorIds = [...new Set(rows.map((row) => row.author_id).filter(Boolean))];
  const assetIds = [...new Set(rows.map((row) => row.video_asset_id).filter(Boolean))];
  const [profileResult, imageResult, assetResult] = await Promise.all([
    fetchAccountProfileMap(authorIds, ACCOUNT_PROFILE_FEED_COLUMNS),
    postIds.length > 0
      ? supabase
          .from("post_images")
          .select("post_id, image_url, display_order")
          .in("post_id", postIds)
          .order("display_order", { ascending: true })
      : Promise.resolve({ data: [] }),
    assetIds.length > 0
      ? supabase
          .from("video_assets")
          .select("id, duration_seconds")
          .in("id", assetIds)
      : Promise.resolve({ data: [] }),
  ]);

  const imagesByPost = new Map<string, any[]>();
  for (const image of imageResult.data || []) {
    const images = imagesByPost.get(image.post_id) || [];
    images.push(image);
    imagesByPost.set(image.post_id, images);
  }
  const assetsById = new Map<string, any>();
  for (const asset of assetResult.data || []) {
    assetsById.set((asset as any).id, asset);
  }

  return rows.map((row) => ({
    ...row,
    profiles: profileResult.profiles.get(row.author_id) || null,
    post_images: imagesByPost.get(row.id) || [],
    video_assets: row.video_asset_id ? assetsById.get(row.video_asset_id) || null : null,
  }));
}

type PostItem = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  visibility: string;
  is_verified: boolean;
  is_organization_verified: boolean;
  profile: { display_name: string; handle: string; avatar_url: string | null; bio: string | null };
  liked: boolean;
  likeCount: number;
  replyCount: number;
  score: number;
  bookmarked: boolean;
  post_type: string;
  article_title: string | null;
  article_body: string | null;
  video_url: string | null;
  duration_seconds: number | null;
  isFollowing: boolean;
  language_code?: string | null;
  org_page_id?: string;
  org_slug?: string;
  org_type?: string;
  org_verified?: boolean;
  showThreadLine?: boolean;
};

const LOCAL_FEED_HYDRATION_TIMEOUT_MS = 1500;
const FEED_REQUEST_TIMEOUT_MS = 15000;

function waitForRequest<T>(
  request: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout();
      resolve(undefined);
    }, timeoutMs);

    request.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

function formatNum(n: number): string {
  if (!n || n < 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, "") + "M";
  if (n >= 10_000) return Math.round(n / 1_000) + "K";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

/** Compact relative time: "just now" → "now", "3 mins ago" → "3m", "2h", "5d", "3w", "4mo", "1y" */
function compactTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff) || diff < 0) return "";
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 4)  return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y`;
}

const URL_RE = /https?:\/\/[^\s<)"'\]]+/g;
function extractFirstUrl(text: string): string | null {
  const m = text.match(URL_RE);
  return m?.[0] ?? null;
}

// ── OG data cache & fetcher ───────────────────────────────────────────────────
type _OgData = { image: string | null; title: string | null };
const _ogCache: Record<string, _OgData> = {};
async function fetchOgData(url: string): Promise<_OgData> {
  if (url in _ogCache) return _ogCache[url];
  const empty: _OgData = { image: null, title: null };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AfuChatBot/1.0)" },
    });
    const html = await res.text();
    // og:image / twitter:image
    const imgMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    let image = imgMatch ? imgMatch[1] : null;
    if (image && !image.startsWith("http")) {
      try { image = new URL(image, new URL(res.url).origin).href; } catch {}
    }
    // og:title / twitter:title / <title>
    const titleMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:title["']/i) ||
      html.match(/<title[^>]*>([^<]{1,120})<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;
    const data: _OgData = { image, title };
    _ogCache[url] = data;
    return data;
  } catch {
    _ogCache[url] = empty;
    return empty;
  }
}

function LinkPreviewCard({ url, colors }: { url: string; colors: any }) {
  const openLink = useOpenLink();
  const [ogImage, setOgImage] = useState<string | null>(null);
  const [ogTitle, setOgTitle] = useState<string | null>(null);
  let domain = url;
  try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  const faviconUri = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  useEffect(() => {
    fetchOgData(url).then((d) => { setOgImage(d.image); setOgTitle(d.title); }).catch(() => {});
  }, [url]);

  return (
    <TouchableOpacity
      onPress={() => openLink(url)}
      activeOpacity={0.85}
      style={{
        marginLeft: 66,
        marginRight: 16,
        marginVertical: 6,
        borderRadius: 14,
        overflow: "hidden",
        flexDirection: "row",
        alignItems: "stretch",
        minHeight: 80,
        backgroundColor: colors.card,
      }}
    >
      {/* Thumbnail: og:image if available, otherwise large favicon */}
      <View style={{ width: 90, minHeight: 80, backgroundColor: colors.backgroundTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {ogImage ? (
          <CachedImage uri={ogImage} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
        ) : (
          <CachedImage uri={faviconUri} style={{ width: 36, height: 36 }} contentFit="contain" />
        )}
      </View>
      {/* Text */}
      <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 10, gap: 4, justifyContent: "center" }}>
        {/* favicon + hostname */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <CachedImage uri={faviconUri} style={{ width: 13, height: 13, borderRadius: 2 }} contentFit="contain" />
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted, flex: 1 }} numberOfLines={1}>{domain}</Text>
        </View>
        {/* title (og:title preferred, else domain) */}
        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text, lineHeight: 18 }} numberOfLines={2}>
          {ogTitle || domain}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function RecentCommenters(_props: { postId: string; replyCount: number; bgColor: string; accentColor: string }) {
  return null;
}

// ── Stories row — real stories from the `stories` table ──────────────────────
type StoryEntry = {
  userId: string;
  name: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  storyCount: number;
  seenCount: number;
};

function StoriesRow({
  userId,
  avatarUrl,
  displayName,
}: {
  userId: string | null;
  avatarUrl: string | null;
  displayName: string | null;
}) {
  const { colors } = useTheme();
  const [stories, setStories] = useState<StoryEntry[]>([]);
  const [storiesLoaded, setStoriesLoaded] = useState(false);
  const SZ = 46;
const DISCOVER_STORY_CACHE_KEY = "@afuchat:discover_story_list";

  const loadDiscoverStories = useCallback(async () => {
    const applyRows = (rows: any[], viewedIds = new Set<string>()) => {
      const visible = rows.filter((s: any) =>
        (s.user_id === userId || s.privacy === "everyone") &&
        s.expires_at &&
        new Date(s.expires_at).getTime() > Date.now()
      );
      const sessionViewed = getViewedUserIds();
      const map = new Map<string, StoryEntry>();
      for (const s of visible) {
        if (!s.user_id) continue;
        const isOwn = s.user_id === userId;
        const isSeen = isOwn || sessionViewed.has(s.user_id) || viewedIds.has(s.id);
        const existing = map.get(s.user_id);
        if (existing) {
          existing.storyCount += 1;
          if (isSeen) existing.seenCount += 1;
          continue;
        }
        map.set(s.user_id, {
          userId: s.user_id,
          name: isOwn ? (displayName || "You") : (s.profiles?.display_name || "User"),
          avatar_url: isOwn ? avatarUrl : (s.profiles?.avatar_url ?? null),
          is_verified: !!s.profiles?.is_verified,
          is_organization_verified: !!s.profiles?.is_organization_verified,
          storyCount: 1,
          seenCount: isSeen ? 1 : 0,
        });
      }
      const ordered = Array.from(map.values()).sort((a, b) => {
        const aUnread = a.seenCount < a.storyCount;
        const bUnread = b.seenCount < b.storyCount;
        if (aUnread !== bUnread) return aUnread ? -1 : 1;
        return 0;
      });
      setStories(ordered.slice(0, 12));
    };

     // Hydrate the row before touching the network, but never resurrect an
     // expired story from the local cache.
    await hydrateViewedUsers();
    const cached = await AsyncStorage.getItem(DISCOVER_STORY_CACHE_KEY).catch(() => null);
    if (cached) {
      try { applyRows(JSON.parse(cached)); } catch {}
    }

    try {
      const { data: storyRows } = await supabase
        .from("stories")
        .select("id, user_id, media_url, media_type, caption, created_at, expires_at, view_count, privacy")
          .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(100);
      if (storyRows) {
        const { profiles: storyProfiles } = await fetchAccountProfileMap(
          storyRows.map((story: any) => story.user_id),
          ACCOUNT_PROFILE_FOLLOWER_COLUMNS,
        );
        const data = storyRows.map((story: any) => ({
          ...story,
          profiles: storyProfiles.get(story.user_id) || null,
        }));
        const visible = data.filter((s: any) => s.user_id === userId || s.privacy === "everyone");
        const storyIds = visible.map((s) => s.id).filter(Boolean);
        const { data: viewed } = userId && storyIds.length
          ? await supabase.from("story_views").select("story_id").eq("viewer_id", userId).in("story_id", storyIds)
          : { data: [] as any[] };
        applyRows(visible, new Set((viewed || []).map((v: any) => v.story_id)));
        if (visible.length > 0) {
          AsyncStorage.setItem(DISCOVER_STORY_CACHE_KEY, JSON.stringify(visible)).catch(() => {});
          // Warm the persistent media cache for the stories users can open
          // from this row. This runs in the background and never blocks paint.
          void Promise.all(visible.map((story: any) =>
            story.media_url
              ? getCachedStoryMedia(story.id, story.media_url, story.media_type || "image").catch(() => null)
              : Promise.resolve(null),
          ));
        }
      }
    } catch {
      // Keep the cached row visible when the device is offline.
    } finally {
      setStoriesLoaded(true);
    }
  }, [avatarUrl, displayName, userId]);

  // Reload whenever this tab comes into focus — throttled to at most once per
  // 90 seconds so rapid tab switches don't hammer Supabase.
  useThrottledFocusEffect(
    useCallback(() => { loadDiscoverStories(); }, [loadDiscoverStories]),
    { intervalMs: 90_000, storageKey: "tfx:stories-discover" },
  );

  // Realtime: pick up new stories without requiring a tab switch.
  useEffect(() => {
    const staleRt = supabase.getChannels().find(
      (ch) => ch.topic === "realtime:stories-discover-row"
    );
    if (staleRt) supabase.removeChannel(staleRt);

    const rt = supabase
      .channel("stories-discover-row")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stories" }, () => {
        loadDiscoverStories();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "stories" }, () => {
        loadDiscoverStories();
      })
      .subscribe();
    return () => { supabase.removeChannel(rt); };
  }, [loadDiscoverStories]);

  // Update the ring immediately when the story viewer marks a user as viewed.
  // Without this subscription, the ring stayed purple until the next refresh.
  useEffect(() => {
    return subscribeStoryViewed(() => {
      const viewed = getViewedUserIds();
      setStories((prev) => prev.map((entry) => (
        viewed.has(entry.userId)
          ? { ...entry, seenCount: entry.storyCount }
          : entry
      )).sort((a, b) => {
        const aUnread = a.seenCount < a.storyCount;
        const bUnread = b.seenCount < b.storyCount;
        return aUnread === bUnread ? 0 : aUnread ? -1 : 1;
      }));
    });
  }, []);

  // Return null whenever there are no stories — do not wait for storiesLoaded
  // so the empty horizontal ScrollView (dark placeholder bar) never renders.
  if (stories.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6, gap: 10 }}
    >
      {/* Stories from other users */}
      {stories.map((s) => (
        <TouchableOpacity
          key={s.userId}
          style={{ alignItems: "center", gap: 3, width: 76 }}
          activeOpacity={0.8}
          onPress={() => safeRouter.push({
            pathname: "/stories/view",
            params: { userId: s.userId },
          })}
        >
          <StoryRing size={SZ} storyCount={s.storyCount} seenCount={s.seenCount}>
            <View style={{ width: SZ, height: SZ, borderRadius: SZ / 2, overflow: "hidden", backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" }}>
              {s.avatar_url ? (
                <CachedImage uri={s.avatar_url} cacheType="avatar" style={{ width: SZ, height: SZ }} contentFit="cover" />
              ) : (
                <Text style={{ color: colors.accent, fontSize: 20, fontFamily: "Inter_700Bold" }}>{(s.name[0] ?? "?").toUpperCase()}</Text>
              )}
            </View>
          </StoryRing>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              maxWidth: 76,
            }}
          >
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 10,
                lineHeight: 12,
                letterSpacing: -0.15,
                fontFamily: "Inter_700Bold",
                flex: 1,
                minWidth: 0,
                flexShrink: 1,
                textAlign: "center",
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {s.name}
            </Text>
            {(s.is_verified || s.is_organization_verified) ? (
              <VerifiedBadge
                isVerified={s.is_verified}
                isOrganizationVerified={s.is_organization_verified}
                size={11}
              />
            ) : null}
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function BookmarkButton({ bookmarked, onPress }: { bookmarked: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  function handlePress() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.7, duration: 100, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
    ]).start();
    onPress();
  }
  return (
    <Animated.View style={[styles.footerStat, { transform: [{ scale }] }]}>
      <TouchableOpacity onPress={handlePress} hitSlop={8}>
        <Ionicons name={bookmarked ? "bookmark" : "bookmark"} size={21} color={bookmarked ? Colors.gold : colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── PostImages: swipeable carousel with stable feed geometry ────────────────
// Keep one predictable aspect ratio for every feed carousel. Changing a row's
// height after the image loads makes VirtualizedList recalculate offsets while
// the user is scrolling, which presents as a shaking/jumping feed.
const IMG_RATIO_MIN = 9 / 16;   // ~0.5625  (landscape cap)

function PostImages({
  images,
  onPress,
  onDoubleTap,
  effectiveW,
}: {
  images: string[];
  onPress: (index: number) => void;
  onDoubleTap: () => void;
  effectiveW: number;
}) {
  const { isDark } = useTheme();
  const [currentIdx, setCurrentIdx] = React.useState(0);
  // ratio = height/width of the first detected image; null = not yet loaded

  const L_PAD  = 66;
  const R_PAD  = 16;
  const imgW   = effectiveW - L_PAD - R_PAD;
  // Keep row geometry stable while images load; late resizing makes the feed jump.
  const ratio  = IMG_RATIO_MIN;
  const imgH   = Math.round(imgW * ratio);
  const CORNER = 12;
  const { colors: imgColors } = useTheme();
  const BG     = imgColors.backgroundSecondary;

  const heartOpacity = useRef(new Animated.Value(0)).current;
  const heartScale   = useRef(new Animated.Value(0.3)).current;
  const lastTapMs    = useRef(0);
  const tapTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashHeart() {
    heartOpacity.setValue(0);
    heartScale.setValue(0.3);
    Animated.parallel([
      Animated.timing(heartOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.spring(heartScale,   { toValue: 1, speed: 50, bounciness: 14, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.timing(heartOpacity, { toValue: 0, duration: 380, useNativeDriver: true }).start();
      }, 500);
    });
    onDoubleTap();
  }

  function handleTap(idx: number) {
    const now = Date.now();
    if (now - lastTapMs.current < 320) {
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
      lastTapMs.current = 0;
      flashHeart();
    } else {
      lastTapMs.current = now;
      tapTimer.current = setTimeout(() => { tapTimer.current = null; onPress(idx); }, 320);
    }
  }

  return (
    <View style={{ marginLeft: L_PAD, marginRight: R_PAD, marginBottom: images.length > 1 ? 4 : 10 }}>
      {/* ── Carousel strip ── */}
      <View style={{ borderRadius: CORNER, overflow: "hidden", backgroundColor: BG, width: imgW, height: imgH }}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          decelerationRate="fast"
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / imgW);
            setCurrentIdx(Math.max(0, Math.min(idx, images.length - 1)));
          }}
        >
          {images.map((uri, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.95}
              onPress={() => handleTap(i)}
              style={{ width: imgW, height: imgH }}
            >
              <CachedImage
                uri={uri}
                style={{ width: imgW, height: imgH }}
                contentFit="cover"
                priority={i === 0 ? "high" : "normal"}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Double-tap heart */}
        <Animated.View
          style={{ position: "absolute", alignSelf: "center", top: imgH / 2 - 44, opacity: heartOpacity, transform: [{ scale: heartScale }], pointerEvents: "none" }}
        >
          <Ionicons name="heart" size={88} color="#FF3B30" />
        </Animated.View>

        {/* Counter badge — top-right */}
        {images.length > 1 && (
          <View style={{ position: "absolute", top: 7, right: 8, backgroundColor: "rgba(0,0,0,0.52)", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{currentIdx + 1}/{images.length}</Text>
          </View>
        )}
      </View>

    </View>
  );

}

const PostCard = React.memo(function PostCard({ item, onToggleLike, onToggleBookmark, onToggleFollow, onImagePress, onRequireAuth, colWidth, onDismiss, onMuteAuthor }: { item: PostItem; onToggleLike: (postId: string) => void; onToggleBookmark: (postId: string) => void; onToggleFollow: (authorId: string) => void; onImagePress?: (images: string[], index: number, meta?: PostViewerMeta) => void; onRequireAuth?: () => void; colWidth?: number; onDismiss?: (postId: string) => void; onMuteAuthor?: (authorId: string, handle: string) => void }) {
  const { colors, isDark } = useTheme();
  const { preferredLang } = useLanguage();
  const { width: screenW } = useWindowDimensions();
  const cardInsets = useCardInsets();
  const { user: currentUser } = useAuth();
  const { isPlatinum } = useUserEffects(item.author_id);
  const watchedFraction = useVideoProgress(item.post_type === "video" ? item.id : "");
  const [displayContent, setDisplayContent] = useState(item.content);
  const [isTranslated, setIsTranslated] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareablePost, setShareablePost] = useState<ShareablePost | null>(null);
  const [showCrownDetails, setShowCrownDetails] = useState(false);
  const isOwnPost = currentUser?.id === item.author_id;
  const [expanded, setExpanded] = useState(false);

  const heartScale = useRef(new Animated.Value(1)).current;
  const animateHeart = useCallback(() => {
    heartScale.setValue(1);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: true, speed: 50, bounciness: 14 }),
      Animated.spring(heartScale, { toValue: 1,   useNativeDriver: true, speed: 22, bounciness: 4  }),
    ]).start();
  }, [heartScale]);

  const showFollowBtn = !isOwnPost && !item.isFollowing;

  const allImages = item.images.length > 0 ? item.images : item.image_url ? [item.image_url] : [];
  const effectiveW = colWidth ?? screenW;
  const CONTENT_INDENT = 66;

  // URL to show in the preview card — only for plain text posts with no images
  const previewUrl =
    item.post_type !== "article" && item.post_type !== "video" && allImages.length === 0
      ? extractFirstUrl(displayContent || "")
      : null;

  useEffect(() => {
    if (!preferredLang || !item.content?.trim()) { setDisplayContent(item.content); setIsTranslated(false); return; }
    if (item.language_code && item.language_code === preferredLang) return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      translateUserContent(item.content, preferredLang).then((result) => {
        if (!cancelled && result && result !== item.content) {
          setDisplayContent(result);
          setIsTranslated(true);
        }
      }).catch(() => {});
    });
    return () => { cancelled = true; task.cancel(); };
  }, [preferredLang, item.content, item.language_code]);

  function openPost() {
    if (item.post_type === "video") {
      safeRouter.push({ pathname: "/video/[id]", params: { id: item.id } });
      return;
    }
    if (item.post_type === "article") {
      safeRouter.push({ pathname: "/article/[id]", params: { id: item.id } } as any);
      return;
    }
    // All other post types (text, image, etc.) → dedicated post detail page.
    safeRouter.push({ pathname: "/post/[id]", params: { id: item.id, ...(item.org_page_id ? { org: "1" } : {}) } } as any);
  }

  function capturePostImage() {
    setMenuVisible(false);
    setShareablePost({
      id: item.id,
      author_name: item.profile.display_name,
      author_handle: item.profile.handle,
      avatar_url: item.profile.avatar_url,
      is_verified: item.is_verified,
      is_org_verified: item.is_organization_verified,
      created_at: item.created_at,
      post_type: item.post_type,
      content: item.content,
      article_title: item.article_title ?? null,
      like_count: item.likeCount,
      reply_count: item.replyCount,
      view_count: item.view_count,
      bookmarked: item.bookmarked,
      accent: colors.accent,
    });
    setShowShareModal(true);
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.background, borderBottomColor: colors.border }]}
        onPress={openPost}
        activeOpacity={0.97}

      >
          {/* X/Twitter-style thread connector line */}
          {item.showThreadLine && (
            <View
              style={{
                pointerEvents: "none",
                position: "absolute",
                left: 35,
                top: 64,
                bottom: -8,
                width: 2,
                backgroundColor: colors.border,
                borderRadius: 1,
                zIndex: 1,
              }}
            />
          )}
          {/* ── Header ── */}
          <View style={[styles.cardHeader, !item.profile.bio && { paddingBottom: 2 }]}>
            {item.org_page_id ? (
              <TouchableOpacity
                onPress={() => safeRouter.push(`/company/${item.org_slug}` as any)}
                activeOpacity={0.8}
              >
                {item.profile.avatar_url
                  ? <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={40} square userId={item.author_id} />
                  : <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: colors.accent + "20", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 16 }}>{(item.profile.display_name || "O").slice(0, 1).toUpperCase()}</Text>
                    </View>
                }
              </TouchableOpacity>
            ) : (
              <View style={{ position: "relative" }}>
                <TouchableOpacity
                  onPress={() => safeRouter.push({ pathname: "/contact/[id]", params: { id: item.author_id, init_name: item.profile.display_name, init_handle: item.profile.handle, init_avatar: item.profile.avatar_url ?? "", init_verified: item.is_verified ? "1" : "0", init_org_verified: item.is_organization_verified ? "1" : "0" } } as any)}
                  activeOpacity={0.8}
                >
                  <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={40} square={!!(item.is_organization_verified)} userId={item.author_id} />
                </TouchableOpacity>
                {/* Platinum crown rendered after avatar so it sits on top */}
                {isPlatinum && (
                  <TouchableOpacity
                    style={{ position: "absolute", top: -10, left: -2, zIndex: 20 }}
                    onPress={() => setShowCrownDetails(true)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Platinum membership details"
                  >
                    <Text style={{ fontSize: 14 }}>👑</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <View style={{ flex: 1, gap: 0, paddingTop: 10 }}>
              <>
                  <View style={[styles.nameRow, { flex: 1 }]}>
                  <UserName userId={item.author_id} name={item.profile.display_name || item.profile.handle} style={[styles.cardHandle, { color: colors.text, fontSize: 13, fontFamily: "Inter_700Bold", flexShrink: 1 }]} numberOfLines={1} />
                  <VerifiedBadge isVerified={item.is_verified} isOrganizationVerified={item.is_organization_verified} size={12} />
                    <View style={{ flex: 1 }} />
                    {showFollowBtn && !item.org_page_id && (
                      <TouchableOpacity
                        style={{
                          backgroundColor: isDark ? "#ffffff" : "#0f0f0f",
                          borderRadius: 20,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          marginRight: 6,
                        }}
                        onPress={() => { if (!currentUser) { onRequireAuth?.(); return; } onToggleFollow(item.author_id); }}
                        activeOpacity={0.8}
                      >
                        <Text style={{ color: isDark ? "#0f0f0f" : "#ffffff", fontSize: 12, fontFamily: "Inter_700Bold" }}>Follow</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMenuVisible(true); }}
                      hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    >
                      <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                    @{item.profile.handle} · {compactTime(item.created_at)}
                  </Text>
              </>
            </View>
          </View>

          {/* ── ARTICLE: horizontal card ── */}
          {item.post_type === "article" ? (
            <TouchableOpacity
              onPress={openPost}
              activeOpacity={0.85}
              style={[styles.articleCard, { backgroundColor: colors.card }]}
            >
              {allImages.length > 0 && (
                <CachedImage
                  uri={allImages[0]}
                  style={styles.articleCover}
                  contentFit="cover"
                  priority="normal"
                />
              )}
              <View style={styles.articleCardBody}>
                {item.article_title ? (
                  <Text style={[styles.articleTitle, { color: colors.text }]} numberOfLines={2}>{item.article_title}</Text>
                ) : null}
                {(displayContent || "").trim().length > 0 && (
                  <Text style={[styles.articleExcerpt, { color: colors.textSecondary }]} numberOfLines={2}>
                    {displayContent}
                  </Text>
                )}
                <Text style={styles.articleReadLink}>Read article ›</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <>
              {/* ── Content text — same architecture as post details page ── */}
              {(displayContent || "").trim().length > 0 && (() => {
                const LIMIT = 300;
                // When a link-preview card is shown below, strip ALL URLs from the
                // body using regex so there is no possibility of duplication —
                // regardless of whether the extracted previewUrl exactly matches
                // every URL variant in the content (trailing comma, encoding, etc.).
                const full = previewUrl
                  ? (displayContent || "").replace(/https?:\/\/[^\s<)"'\]]+/g, "").replace(/\s{2,}/g, " ").trim()
                  : (displayContent || "").trim();
                const isTruncated = !expanded && full.length > LIMIT;
                const shown = isTruncated ? full.slice(0, LIMIT).trimEnd() : full;
                if (!shown) return null;
                return (
                  <View>
                    <RichText
                      style={[styles.cardContent, { color: colors.text, fontSize: 15, lineHeight: 23 }]}
                      linkColor={colors.accent}
                    >
                      {isTruncated ? shown + "…" : shown}
                    </RichText>
                    {isTruncated && (
                      <TouchableOpacity onPress={() => setExpanded(true)} activeOpacity={0.7} style={{ paddingLeft: 66, paddingTop: 2, paddingBottom: 2 }}>
                        <Text style={{ color: Colors.gold, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Read more</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })()}
            </>
          )}

          {isTranslated && (
            <View style={styles.translatedBadge}>
              <Ionicons name="language" size={11} color={colors.textMuted} />
              <Text style={[styles.translatedText, { color: colors.textMuted }]}>
                {`Translated · ${LANG_LABELS[preferredLang || ""] ?? preferredLang}`}
              </Text>
            </View>
          )}

          {/* ── VIDEO: thumbnail preview card (caption shown above, thumbnail below) ── */}
          {item.post_type === "video" && item.video_url && (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => safeRouter.push({ pathname: "/video/[id]", params: { id: item.id } })}
              style={styles.videoCard}
            >
              <View style={styles.videoThumb}>
                <VideoThumbnail
                  videoUrl={item.video_url!}
                  fallbackImageUrl={item.image_url}
                  style={StyleSheet.absoluteFill}
                  lowData={false}
                  durationSeconds={item.duration_seconds}
                  watchedFraction={watchedFraction}
                />
                <View style={styles.playCircle}>
                  <Ionicons name="play" size={22} color="#fff" />
                </View>
                <View style={styles.videoBadge}>
                  <Ionicons name="videocam" size={11} color="#fff" />
                  <Text style={styles.videoBadgeText}>Video</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* ── Images ── */}
          {allImages.length > 0 && item.post_type !== "video" && item.post_type !== "article" && (
            <PostImages
              images={allImages}
              onPress={(i) => {
                onImagePress?.(allImages, i, {
                  postId: item.id,
                  authorId: item.author_id,
                  authorName: item.profile.display_name,
                  authorHandle: item.profile.handle,
                  authorAvatar: item.profile.avatar_url,
                  isVerified: item.is_verified,
                  isOrgVerified: item.is_organization_verified,
                  likeCount: item.likeCount,
                  replyCount: item.replyCount,
                  viewCount: item.view_count,
                  bookmarked: item.bookmarked,
                  liked: item.liked,
                  isFollowing: item.isFollowing,
                  onToggleLike: () => { if (!currentUser) { onRequireAuth?.(); return; } animateHeart(); onToggleLike(item.id); },
                  onToggleBookmark: () => { if (!currentUser) { onRequireAuth?.(); return; } onToggleBookmark(item.id); },
                  onToggleFollow: () => { if (!currentUser) { onRequireAuth?.(); return; } onToggleFollow(item.author_id); },
                });
              }}
              onDoubleTap={() => {
                if (!currentUser) { onRequireAuth?.(); return; }
                if (!item.liked) { animateHeart(); onToggleLike(item.id); }
              }}
              effectiveW={effectiveW}
            />
          )}

          {/* ── Link preview (for plain-text posts containing a URL, no image) ── */}
          {previewUrl ? <LinkPreviewCard url={previewUrl} colors={colors} /> : null}

          {/* ── Footer ── */}
          <View style={styles.cardFooter}>
            {/* Likes */}
            <TouchableOpacity
              style={styles.footerStat}
              onPress={() => {
                if (!currentUser) { onRequireAuth?.(); return; }
                animateHeart();
                onToggleLike(item.id);
              }}
              activeOpacity={0.7}
            >
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons
                  name={item.liked ? "heart" : "heart"}
                  size={21}
                  color={item.liked ? "#FF3B30" : colors.textMuted}
                />
              </Animated.View>
              <Text style={[styles.footerStatNum, { color: item.liked ? "#FF3B30" : colors.textMuted }]}>
                {formatNum(item.likeCount)}
              </Text>
            </TouchableOpacity>

            {/* Comments */}
            <TouchableOpacity
              style={styles.footerStat}
              onPress={openPost}
              activeOpacity={0.7}
            >
              <Ionicons name="chatbubble" size={21} color={colors.textMuted} />
              <RecentCommenters postId={item.id} replyCount={item.replyCount} bgColor={colors.background} accentColor={colors.accent} />
              <Text style={[styles.footerStatNum, { color: colors.textMuted }]}>{formatNum(item.replyCount)}</Text>
            </TouchableOpacity>

            {/* Views */}
            <View style={styles.footerStat}>
              <Ionicons name="eye" size={21} color={colors.textMuted} />
              <Text style={[styles.footerStatNum, { color: colors.textMuted }]}>{formatNum(item.view_count)}</Text>
            </View>

            {/* Share */}
            <TouchableOpacity
              style={styles.footerStat}
              onPress={() => {
                if (item.post_type === "video") {
                  shareVideo({ postId: item.id, authorName: item.profile.display_name, caption: item.content });
                } else {
                  sharePost({ postId: item.id, authorName: item.profile.display_name, content: item.content });
                }
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-redo" size={21} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Bookmark */}
            <BookmarkButton bookmarked={item.bookmarked} onPress={() => { if (!currentUser) { onRequireAuth?.(); return; } onToggleBookmark(item.id); }} />
          </View>

        </TouchableOpacity>

      <PostShareCaptureModal
        post={shareablePost}
        visible={showShareModal}
        onClose={() => { setShowShareModal(false); setShareablePost(null); }}
      />

      <Modal
        visible={showCrownDetails}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCrownDetails(false)}
      >
        <Pressable style={styles.crownModalBackdrop} onPress={() => setShowCrownDetails(false)}>
          <Pressable
            style={[styles.crownModalCard, { backgroundColor: colors.surface }]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.crownModalIcon}>
              <Text style={{ fontSize: 28 }}>👑</Text>
            </View>
            <Text style={[styles.crownModalTitle, { color: colors.text }]}>Platinum member</Text>
            <Text style={[styles.crownModalBody, { color: colors.textSecondary }]}>
              This crown marks an AfuChat Platinum member. Platinum includes unlimited AI, exclusive perks, priority support, and early access to new features.
            </Text>
            <TouchableOpacity
              style={[styles.crownModalCta, { backgroundColor: colors.accent }]}
              onPress={() => {
                setShowCrownDetails(false);
                safeRouter.push("/premium" as any);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="diamond" size={16} color="#fff" />
              <Text style={styles.crownModalCtaText}>View Premium plans</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCrownDetails(false)} style={styles.crownModalClose}>
              <Text style={[styles.crownModalCloseText, { color: colors.textMuted }]}>Not now</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={menuVisible} transparent animationType="none" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuSheet, { backgroundColor: colors.surface, paddingBottom: cardInsets.bottom + 12 }]}>
            <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuVisible(false); item.post_type === "video" ? shareVideo({ postId: item.id, authorName: item.profile.display_name, caption: item.content }) : sharePost({ postId: item.id, authorName: item.profile.display_name, content: item.content }); }}
            >
              <Ionicons name="share" size={22} color={colors.accent} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Share Post</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={capturePostImage}>
              <Ionicons name="image" size={22} color={colors.accent} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Save as Image</Text>
            </TouchableOpacity>
            {!isOwnPost && (
              <>
                <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => { setMenuVisible(false); setTimeout(() => onDismiss?.(item.id), 150); }}
                >
                  <Ionicons name="thumbs-down" size={22} color={colors.textMuted} />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>Not interested</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setMenuVisible(false); onMuteAuthor?.(item.author_id, item.profile.handle); }}
                >
                  <Ionicons name="volume-mute" size={22} color={colors.textMuted} />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>Mute @{item.profile.handle}</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
              <Text style={[styles.menuItemText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </>
  );
}, (prev, next) =>
  prev.item.id === next.item.id &&
  prev.item.liked === next.item.liked &&
  prev.item.likeCount === next.item.likeCount &&
  prev.item.replyCount === next.item.replyCount &&
  prev.item.bookmarked === next.item.bookmarked &&
  prev.item.view_count === next.item.view_count &&
  prev.item.isFollowing === next.item.isFollowing &&
  prev.item.content === next.item.content &&
  prev.colWidth === next.colWidth &&
  prev.onDismiss === next.onDismiss &&
  prev.onMuteAuthor === next.onMuteAuthor
);

type FeedEntry =
  | { _kind: "post"; item: PostItem }
  | { _kind: "user_recs"; id: string; seed: number }
  | { _kind: "premium"; id: string; variant: "ai" | "creator" | "wallet" };

export default function DiscoverScreen() {
  "use no memo";
  const { horizontalScrollActive } = React.useContext(TabSwipeContext);
  const { colors, isDark, setForceDark } = useTheme();
  const pillGlass = glassTokens(isDark);
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isCompactHeader = screenWidth < 600;
  const navigation = useNavigation();
  // Shorts now lives at /shorts (which redirects to /video/[id]). Any URL like
  // ?tab=shorts is forwarded there so existing links keep working.
  const [feedTab, setFeedTab] = useState<"for_you" | "following">("for_you");
  const [activeDiscoverTab, setActiveDiscoverTab] = useState<"for_you" | "following" | "find">("for_you");
  const activeDiscoverTabRef = useRef<"for_you" | "following" | "find">("for_you");
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [followingEmpty, setFollowingEmpty] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [suppressedAuthors, setSuppressedAuthors] = useState<Set<string>>(new Set());
  const [dismissTarget, setDismissTarget] = useState<PostItem | null>(null);

  type UndoEntry = { type: "post"; id: string } | { type: "author"; id: string };
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const snackAnim = useRef(new Animated.Value(0)).current;
  const snackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSnack = useCallback((count: number) => {
    if (snackTimerRef.current) clearTimeout(snackTimerRef.current);
    Animated.spring(snackAnim, { toValue: 1, useNativeDriver: true, tension: 140, friction: 14 }).start();
    snackTimerRef.current = setTimeout(() => {
      Animated.timing(snackAnim, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    }, 4000);
  }, [snackAnim]);

  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      if (last.type === "post") {
        setDismissedIds(d => { const n = new Set(d); n.delete(last.id); return n; });
      } else {
        setSuppressedAuthors(d => { const n = new Set(d); n.delete(last.id); return n; });
      }
      const next = prev.slice(0, -1);
      if (next.length === 0) {
        if (snackTimerRef.current) clearTimeout(snackTimerRef.current);
        Animated.timing(snackAnim, { toValue: 0, duration: 260, useNativeDriver: true }).start();
      }
      return next;
    });
  }, [snackAnim]);
  const PAGE_SIZE = 30;
  const imgViewer = useImageViewer();

  const filteredPosts = useMemo(() => {
    const seen = new Set<string>();
    return posts.filter(p => {
      if (dismissedIds.has(p.id) || suppressedAuthors.has(p.author_id)) return false;
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [posts, dismissedIds, suppressedAuthors]);

  const PREMIUM_VARIANTS: Array<"ai" | "creator" | "wallet"> = ["ai", "creator", "wallet"];
  const augmentedFeed = useMemo<FeedEntry[]>(() => {
    const entries: FeedEntry[] = [];
    let recSeed = 0;
    let premiumIdx = 0;
    for (let i = 0; i < filteredPosts.length; i++) {
      const curr = filteredPosts[i];
      const next = filteredPosts[i + 1];
      const showThreadLine = !!(
        next &&
        next.author_id === curr.author_id &&
        new Date(curr.created_at).toDateString() === new Date(next.created_at).toDateString()
      );
      entries.push({ _kind: "post", item: showThreadLine ? { ...curr, showThreadLine: true } : curr });
      if ((i + 1) % 8 === 0) {
        entries.push({ _kind: "user_recs", id: `recs_${Math.floor(i / 8)}`, seed: recSeed++ });
      }
    }
    return entries;
  }, [filteredPosts]);

  const onDismissPost = useCallback((postId: string) => {
    const post = posts.find(p => p.id === postId);
    if (post) setDismissTarget(post);
  }, [posts]);

  const onDismissReason = useCallback((reason: DismissReason) => {
    if (!dismissTarget) return;
    const { id, author_id } = dismissTarget;
    setDismissTarget(null);
    if (reason === "mute_author") {
      setSuppressedAuthors(prev => new Set([...prev, author_id]));
      setUndoStack(prev => {
        const next = [...prev, { type: "author" as const, id: author_id }];
        showSnack(next.length);
        return next;
      });
    } else {
      setDismissedIds(prev => new Set([...prev, id]));
      setUndoStack(prev => {
        const next = [...prev, { type: "post" as const, id }];
        showSnack(next.length);
        return next;
      });
    }
  }, [dismissTarget, showSnack]);

  const onMuteAuthor = useCallback((authorId: string, _handle: string) => {
    setSuppressedAuthors(prev => new Set([...prev, authorId]));
    setUndoStack(prev => {
      const next = [...prev, { type: "author" as const, id: authorId }];
      showSnack(next.length);
      return next;
    });
  }, [showSnack]);

  const fabRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);

  const tabPostsCache = useRef<Record<"for_you" | "following", PostItem[]>>({ for_you: [], following: [] });
  const tabCacheTimestamp = useRef<Record<"for_you" | "following", number>>({ for_you: 0, following: 0 });
  const initialHydrationDoneRef = useRef(false);
  const learnedWeightsRef = useRef<Record<string, number>>({});
  const postsRef = useRef<PostItem[]>([]);
  const feedTabRef = useRef<"for_you" | "following">("for_you");
  // Cache following IDs for 5 min — eliminates the serial round-trip on every Following tab load.
  const followingIdsCacheRef = useRef<{ ids: string[]; cachedAt: number }>({ ids: [], cachedAt: 0 });
  // Batched post_views — buffer IDs and flush as a single insert every 3 s.
  const pendingViewsRef = useRef<string[]>([]);
  const viewFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef<string | undefined>(undefined);
  // Throwback pagination — tracks how far into the older-posts pool we've paged.
  // Reset to a random starting point on each fresh load so every session shows
  // different older content.
  const throwbackOffsetRef = useRef(0);
  const throwbackExhaustedRef = useRef(false);
  const midOffsetRef = useRef(0);
  const midExhaustedRef = useRef(false);
  const flatListRef = useRef<any>(null);
  const recordedViewsRef = useRef<Set<string>>(new Set());
  const pagerRef = useRef<any>(null);
  const discoverPillX = useRef(new Animated.Value(0)).current;
  const discoverPillW = useRef(new Animated.Value(0)).current;
  const discoverTabLayoutsRef = useRef<Record<number, { x: number; width: number }>>({});

  // ── Scroll-aware header ──────────────────────────────────────────────────
  // Uses Animated.event (not a plain onScroll function) so FlatList's internal
  // scroll tracking for onEndReached is never overridden.
  const [coreHeaderHeight, setCoreHeaderHeight] = useState(0);
  const [storiesHeight, setStoriesHeight] = useState(0);
  const headerOffset = useRef(new Animated.Value(0)).current;
  const headerFlowHeight = useRef(new Animated.Value(1)).current;
  const headerAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const fullHeaderHeight = coreHeaderHeight + storiesHeight;
  const prevScrollYRef = useRef(0);
  const headerVisibleRef = useRef(true);
  const headerAnimationDuration = 150;
  // useNativeDriver:false because headerOffset target changes dynamically
  // and web doesn't support native driver for transforms driven this way.
  const DRIVER = false;

  function revealHeader(updatePageLayout = true) {
    if (headerVisibleRef.current && updatePageLayout) return;
    headerVisibleRef.current = true;
    headerAnimationRef.current?.stop();
    headerAnimationRef.current = null;
    const animations: Animated.CompositeAnimation[] = [
      Animated.timing(headerOffset, {
        toValue: 0,
        duration: headerAnimationDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: DRIVER,
      }),
    ];
    if (updatePageLayout) {
      animations.push(Animated.timing(headerFlowHeight, {
        toValue: fullHeaderHeight,
        duration: headerAnimationDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: DRIVER,
      }));
    }
    headerAnimationRef.current = Animated.parallel(animations);
    headerAnimationRef.current.start(() => { headerAnimationRef.current = null; });
  }

  function hideHeader(height: number, updatePageLayout = true) {
    if (height === 0) return;
    const shouldMoveChrome = headerVisibleRef.current;
    headerVisibleRef.current = false;
    const coreTravel = coreHeaderHeight > 0
      ? coreHeaderHeight
      : Math.max(0, height - storiesHeight);
    const storyFlowHeight = storiesHeight > 0 ? storiesHeight + insets.top : 0;
    headerAnimationRef.current?.stop();
    headerAnimationRef.current = null;
    const animations: Animated.CompositeAnimation[] = [];
    if (shouldMoveChrome) {
      animations.push(Animated.timing(headerOffset, {
        // Hide the top bar and tabs, but move stories into their space so the
        // stories remain visible instead of disappearing with the header.
        toValue: -coreTravel + insets.top,
        duration: headerAnimationDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: DRIVER,
      }));
    }
    if (updatePageLayout) {
      animations.push(Animated.timing(headerFlowHeight, {
        toValue: storyFlowHeight,
        duration: headerAnimationDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: DRIVER,
      }));
    }
    if (animations.length === 0) return;
    headerAnimationRef.current = Animated.parallel(animations);
    headerAnimationRef.current.start(() => { headerAnimationRef.current = null; });
  }

  const handleFeedScrollFrame = useCallback((event: any) => {
    const y = Math.max(0, Number(event?.nativeEvent?.contentOffset?.y ?? 0));
    const delta = y - prevScrollYRef.current;
    // Start collapsing after a short intentional downward drag. Requiring the
    // full header height made the mobile header feel stuck; the visibility
    // guard keeps this low threshold from flickering between states.
    if (Platform.OS === "web") return;
    const collapsePoint = Math.min(16, Math.max(8, fullHeaderHeight - 12));

    if (y > collapsePoint) hideHeader(fullHeaderHeight, false);
    else if (delta < -3 || y <= 0) revealHeader(false);
    prevScrollYRef.current = y;
  }, [coreHeaderHeight, fullHeaderHeight, storiesHeight]);

  // The header and new-posts pill are combined animated nodes. Use the same
  // JS driver for their scroll updates and transitions so React Native never
  // tries to switch one node between native and JS ownership.
  const onFeedScroll = handleFeedScrollFrame;
  const handleFeedScrollSettled = useCallback((event: any) => {
    if (Platform.OS === "web") return;
    const y = Number(event?.nativeEvent?.contentOffset?.y ?? 0);
    const delta = y - prevScrollYRef.current;
    const collapsePoint = Math.min(16, Math.max(8, fullHeaderHeight - 12));
    if (y > collapsePoint) hideHeader(fullHeaderHeight, true);
    else if (delta < -3 || y <= 0) revealHeader(true);
    prevScrollYRef.current = y;
  }, [fullHeaderHeight]);

  useEffect(() => {
    if (headerVisibleRef.current && fullHeaderHeight > 0) {
      headerFlowHeight.setValue(fullHeaderHeight);
    }
  }, [fullHeaderHeight]);

  // ────────────────────────────────────────────────────────────────────────
  const viewabilityConfig = useRef({ minimumViewTime: 800, itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {});
  onViewableItemsChangedRef.current = ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!user) return;
    for (const vi of viewableItems) {
      if (vi.item?._kind && vi.item._kind !== "post") continue;
      const postId = (vi.item?._kind === "post" ? vi.item.item?.id : vi.item?.id) as string | undefined;
      if (!postId || recordedViewsRef.current.has(postId)) continue;
      recordedViewsRef.current.add(postId);
      const postEntry = vi.item?._kind === "post" ? vi.item.item : vi.item;
      const authorId = postEntry?.author_id as string | undefined;
      const postType = postEntry?.post_type as string | undefined;
      // Buffer view IDs — flush as one batch insert every 3 s instead of
      // one round-trip per visible post.
      pendingViewsRef.current.push(postId);
      if (viewFlushTimerRef.current === null) {
        viewFlushTimerRef.current = setTimeout(() => {
          viewFlushTimerRef.current = null;
          const ids = pendingViewsRef.current.splice(0);
          const uid = userIdRef.current;
          if (ids.length === 0 || !uid) return;
          supabase
            .from("post_views")
            .insert(ids.map((id) => ({ post_id: id, viewer_id: uid })))
            .then(() => {
              const idSet = new Set(ids);
              setPosts((prev) =>
                prev.map((p) => idSet.has(p.id) ? { ...p, view_count: (p.view_count || 0) + 1 } : p)
              );
            });
        }, 3000);
      }
      trackEvent("view_post", { post_id: postId, author_id: authorId ?? "", post_type: postType ?? "text" });
    }
  };
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    onViewableItemsChangedRef.current({ viewableItems });
  }).current;

  type PendingRealtimePatch = {
    likeDelta?: number;
    replyDelta?: number;
    following?: boolean;
    deleted?: boolean;
    authorId?: string;
  };
  const pendingRealtimePatchesRef = useRef<Map<string, PendingRealtimePatch>>(new Map());
  const realtimeFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRealtimePatch = useCallback((key: string, patch: PendingRealtimePatch) => {
    const current = pendingRealtimePatchesRef.current.get(key) ?? {};
    pendingRealtimePatchesRef.current.set(key, {
      ...current,
      ...patch,
      likeDelta: (current.likeDelta ?? 0) + (patch.likeDelta ?? 0),
      replyDelta: (current.replyDelta ?? 0) + (patch.replyDelta ?? 0),
    });
    if (realtimeFlushTimerRef.current !== null) return;
    realtimeFlushTimerRef.current = setTimeout(() => {
      realtimeFlushTimerRef.current = null;
      const patches = new Map(pendingRealtimePatchesRef.current);
      pendingRealtimePatchesRef.current.clear();
      setPosts((prev) => {
        let changed = false;
        const next = prev.flatMap((post) => {
          const direct = patches.get(post.id);
          if (direct?.deleted) {
            changed = true;
            return [];
          }
          const authorPatch = patches.get(`author:${post.author_id}`);
          if (!direct && !authorPatch) return [post];
          changed = true;
          return [{
            ...post,
            likeCount: Math.max(0, post.likeCount + (direct?.likeDelta ?? 0)),
            replyCount: Math.max(0, post.replyCount + (direct?.replyDelta ?? 0)),
            ...(authorPatch?.following !== undefined ? { isFollowing: authorPatch.following } : {}),
          }];
        });
        return changed ? next : prev;
      });
    }, 120);
  }, []);

  useEffect(() => () => {
    if (realtimeFlushTimerRef.current !== null) clearTimeout(realtimeFlushTimerRef.current);
  }, []);
  const [newPostAuthors, setNewPostAuthors] = useState<{ id: string; avatar_url: string | null; display_name: string }[]>([]);
  const newPostAuthorIdsRef = useRef<Set<string>>(new Set());
  const pendingPostsRef = useRef<PostItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  // Ref tracking the newest post's created_at currently shown in feed (for polling)
  const newestPostAtRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInFlightRef = useRef(false);
  // Timestamp of the last pill dismissal — poller won't show pill again until cooldown expires
  const pillDismissedAtRef = useRef<number>(0);
  const PILL_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
  // Floating "new posts" popup animation
  const popupSlide = useRef(new Animated.Value(-80)).current;
  const popupOpacity = useRef(new Animated.Value(0)).current;
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [popupSnapshot, setPopupSnapshot] = useState<{ id: string; avatar_url: string | null; display_name: string }[]>([]);

  useEffect(() => { postsRef.current = posts; }, [posts]);
  useEffect(() => { feedTabRef.current = feedTab; }, [feedTab]);
  useEffect(() => {
    activeDiscoverTabRef.current = activeDiscoverTab;
    if (activeDiscoverTab === "find") _resetPill(false);
  }, [activeDiscoverTab]);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);

  // Keep newestPostAtRef pointed at the latest post currently rendered in the feed.
  // This is what the poller uses to ask "are there posts newer than this?"
  useEffect(() => {
    const first = posts.find(p => p.created_at);
    if (first) newestPostAtRef.current = first.created_at;
  }, [posts]);

  // Animate the floating "new posts" popup in when new authors arrive,
  // out when the list is cleared (refresh, tab switch, etc.).
  // Keep this on the JS driver because popupSlide is combined with the
  // JS-driven headerOffset in the pill transform below.
  const _useND = false;
  useEffect(() => {
    if (newPostAuthors.length === 0) {
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
      Animated.parallel([
        Animated.timing(popupSlide, { toValue: -80, duration: 250, useNativeDriver: _useND }),
        Animated.timing(popupOpacity, { toValue: 0, duration: 250, useNativeDriver: _useND }),
      ]).start();
      return;
    }
    setPopupSnapshot(newPostAuthors);
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    Animated.parallel([
      Animated.spring(popupSlide, { toValue: 0, useNativeDriver: _useND, tension: 70, friction: 10 }),
      Animated.timing(popupOpacity, { toValue: 1, duration: 180, useNativeDriver: _useND }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPostAuthors.length]);

  // If the user logs out while on the Following tab, snap back to For You
  useEffect(() => {
    if (!user && feedTabRef.current === "following") {
      setFeedTab("for_you");
      setActiveDiscoverTab("for_you");
      pagerRef.current?.setPage(0);
    }
  }, [user]);

  // Sync the animated tab underline to the current feedTab on change.
  useEffect(() => {
    const idx = feedTab === "for_you" ? 0 : 1;
    const layout = discoverTabLayoutsRef.current[idx];
    if (!layout) return;
    discoverPillX.setValue(layout.x + 4);
    discoverPillW.setValue(layout.width - 8);
  }, [feedTab]);

  const handleDiscoverPageScroll = useCallback((e: any) => {
    const { position, offset } = e.nativeEvent;
    const fromLayout = discoverTabLayoutsRef.current[position];
    const toLayout = discoverTabLayoutsRef.current[position + 1];
    if (!fromLayout) return;
    if (!toLayout || offset === 0) {
      discoverPillX.setValue(fromLayout.x + 4);
      discoverPillW.setValue(fromLayout.width - 8);
      return;
    }
    discoverPillX.setValue(fromLayout.x + (toLayout.x - fromLayout.x) * offset + 4);
    discoverPillW.setValue(fromLayout.width + (toLayout.width - fromLayout.width) * offset - 8);
  }, [discoverPillX, discoverPillW]);

  const handleDiscoverPageSelected = useCallback((e: any) => {
    const idx = e.nativeEvent.position;
    if (idx === 2) {
      setActiveDiscoverTab("find");
      return;
    }
    const nextTab = idx === 0 ? "for_you" : "following";
    setActiveDiscoverTab(nextTab);
    setFeedTab(nextTab);
  }, []);

  function selectDiscoverTab(nextTab: "for_you" | "following" | "find") {
    Haptics.selectionAsync();
    revealHeader();
    setActiveDiscoverTab(nextTab);
    if (nextTab !== "find") setFeedTab(nextTab);
    pagerRef.current?.setPage(nextTab === "for_you" ? 0 : nextTab === "following" ? 1 : 2);
  }

  useEffect(() => {
    getMergedLearnedWeights().then((w) => { learnedWeightsRef.current = w; }).catch(() => {});
  }, []);

  const fetchPosts = useCallback(async (offset: number, isRefresh: boolean, tab?: "for_you" | "following", background?: boolean) => {
    const activeTab = tab ?? feedTabRef.current;
    try {
    if (!isOnline()) {
      if (!background) {
        // Serve from SQLite for initial load, refresh, AND load-more (offline infinite scroll).
        // For load-more (isRefresh=false, posts already in state) use cursor pagination.
        const cursor = !isRefresh && postsRef.current.length > 0
          ? postsRef.current[postsRef.current.length - 1]?.created_at
          : undefined;
        const localPosts = await getLocalFeedPosts(activeTab as LocalFeedTab, 30, cursor);
        if (localPosts.length > 0) {
          const toItem = (r: any) => ({
            ...r,
            likeCount: r.like_count,
            replyCount: r.reply_count,
            is_organization_verified: r.is_org_verified,
            profile: { display_name: r.author_name ?? "User", handle: r.author_handle ?? "user", avatar_url: r.author_avatar ?? null, bio: null },
            article_body: null,
            duration_seconds: null,
            isFollowing: activeTab === "following",
          }) as unknown as PostItem;
          if (isRefresh) {
            const p = localPosts.map(toItem);
            setPosts(p);
            tabPostsCache.current[activeTab] = p;
            tabCacheTimestamp.current[activeTab] = localPosts[0]?.stored_at ?? Date.now();
          } else {
            // Load-more: append without duplicates (same as online path)
            setPosts((prev) => {
              const ids = new Set(prev.map((p) => p.id));
              const fresh = localPosts.map(toItem).filter((p) => !ids.has(p.id));
              return fresh.length > 0 ? [...prev, ...fresh] : prev;
            });
          }
          // Signal more if we filled the page; SQLite will return fewer when exhausted
          setHasMore(localPosts.length >= 30);
        } else if (isRefresh) {
          // SQLite empty: fall back to AsyncStorage legacy cache (refresh only)
          const cached = await getCachedFeedTab(activeTab);
          if (cached?.posts?.length) {
            const p = cached.posts as PostItem[];
            setPosts(p);
            tabPostsCache.current[activeTab] = p;
            tabCacheTimestamp.current[activeTab] = cached.cachedAt;
          } else {
            const legacyCached = await getCachedMoments();
            if (legacyCached.length > 0) setPosts(legacyCached as PostItem[]);
          }
          setHasMore(false);
        } else {
          // Load-more reached end of SQLite — nothing more to show offline
          setHasMore(false);
        }
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
      return;
    }

    // --- Following tab ---
    if (activeTab === "following") {
      if (!user) { setLoading(false); setRefreshing(false); setLoadingMore(false); return; }

      // Cache following IDs for 5 min — skip the round-trip on every tab switch.
      const FOLLOWING_IDS_TTL = 5 * 60 * 1000;
      let followingIds: string[];
      const _fidCache = followingIdsCacheRef.current;
      if (_fidCache.ids.length > 0 && Date.now() - _fidCache.cachedAt < FOLLOWING_IDS_TTL) {
        followingIds = _fidCache.ids;
      } else {
        const { data: followData } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id)
          .limit(1000);
        followingIds = (followData || []).map((f: any) => f.following_id);
        followingIdsCacheRef.current = { ids: followingIds, cachedAt: Date.now() };
      }

      if (followingIds.length === 0) {
        setFollowingEmpty(true);
        if (isRefresh) setPosts([]);
        setLoading(false); setRefreshing(false); setLoadingMore(false);
        return;
      }
      setFollowingEmpty(false);

      const followOlderThan = !isRefresh && postsRef.current.length > 0
        ? postsRef.current[postsRef.current.length - 1]?.created_at
        : null;
      // Delta sync: on refresh, only fetch posts NEWER than newest stored — never re-download existing posts
      const followNewerThan = isRefresh ? await getNewestFeedPostDate("following") : null;
      const followBaseQ = supabase
        .from("posts")
        .select(`
          id, author_id, content, image_url, created_at, view_count, like_count, visibility, language_code,
          post_type, article_title, article_body, video_url, video_asset_id
        `)
        .in("author_id", followingIds)
        .in("visibility", ["public", "followers"])
        .order("created_at", { ascending: false });
      const { data: rawData } = await (followOlderThan
        ? followBaseQ.lt("created_at", followOlderThan).limit(PAGE_SIZE)
        : followNewerThan
          ? followBaseQ.gt("created_at", followNewerThan).limit(PAGE_SIZE)
          : followBaseQ.limit(PAGE_SIZE));

      if (rawData) {
        const data = await hydrateFeedPostRows(rawData);
        if (data.length < PAGE_SIZE) setHasMore(false); else setHasMore(true);

        const postIds = data.map((p: any) => p.id);
        const _followLimit = PAGE_SIZE * 3;
        const [{ data: myLikes }, { data: replyCounts }, { data: myBookmarks }] = await Promise.all([
          postIds.length > 0 && user ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id).limit(_followLimit) : { data: [] },
          postIds.length > 0 ? supabase.from("post_replies").select("post_id").in("post_id", postIds).limit(_followLimit) : { data: [] },
          postIds.length > 0 && user ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id).limit(_followLimit) : { data: [] },
        ]);

        const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
        const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id));
        const replyMap: Record<string, number> = {};
        for (const r of (replyCounts || [])) { replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1; }

        const mapped: PostItem[] = data.map((p: any) => ({
          id: p.id, author_id: p.author_id, content: p.content || "",
          image_url: p.image_url,
          images: (p.post_images || []).sort((a: any, b: any) => a.display_order - b.display_order).map((i: any) => i.image_url),
          created_at: p.created_at, view_count: p.view_count || 0,
          visibility: p.visibility || "public",
          is_verified: p.profiles?.is_verified || false,
          is_organization_verified: p.profiles?.is_organization_verified || false,
          profile: { display_name: p.profiles?.display_name || "User", handle: p.profiles?.handle || "user", avatar_url: p.profiles?.avatar_url || null, bio: p.profiles?.bio || null },
          liked: myLikeSet.has(p.id), likeCount: p.like_count || 0, replyCount: replyMap[p.id] || 0, score: 0, bookmarked: myBookmarkSet.has(p.id),
          post_type: p.post_type || "post", article_title: p.article_title || null, article_body: p.article_body || null, video_url: p.video_url || null,
          duration_seconds: (() => { const arr = Array.isArray(p.video_assets) ? p.video_assets : (p.video_assets ? [p.video_assets] : []); return arr.length > 0 ? (arr[0].duration_seconds ?? null) : null; })(),
          isFollowing: true,
          language_code: p.language_code || null,
        }));

        // Enrichment is deliberately deferred until the first interactions
        // have been handled. The post rows can paint without warming every
        // profile/image cache up front.
        InteractionManager.runAfterInteractions(() => {
          for (const p of data) {
            const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
            if (p.author_id && profile?.handle) setHandleId(profile.handle, p.author_id);
          }
          prefetchAvatars(mapped.slice(0, 8).map((p) => p.profile?.avatar_url));
          prefetchThumbnails(mapped.slice(0, 6).map((p) => p.image_url));
        });

        if (isRefresh) {
          tabPostsCache.current[activeTab] = mapped;
          tabCacheTimestamp.current[activeTab] = Date.now();
          cacheFeedTab(activeTab, mapped);
          saveFeedPosts(mapped, activeTab as LocalFeedTab).catch(() => {});
          // Delta sync: prepend new posts to existing local posts (don't wipe them)
          if (background) {
            const prevIds = new Set(postsRef.current.map((p) => p.id));
            const brandNew = mapped.filter((p) => !prevIds.has(p.id));
            if (brandNew.length > 0) {
              pendingPostsRef.current = [...brandNew, ...pendingPostsRef.current.filter((p) => !prevIds.has(p.id))];
              setNewPostAuthors((prev) => {
                if (prev.length > 0) return prev;
                const seen = new Set<string>();
                const authors: { id: string; avatar_url: string | null; display_name: string }[] = [];
                for (const p of brandNew) {
                  if (!p.author_id || seen.has(p.author_id)) continue;
                  seen.add(p.author_id);
                  authors.push({ id: p.author_id, avatar_url: p.profile?.avatar_url ?? null, display_name: p.profile?.display_name || "User" });
                  if (authors.length >= 5) break;
                }
                return authors;
              });
            }
          } else if (followNewerThan && mapped.length > 0) {
            setPosts((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              const brandNew = mapped.filter((p) => !existingIds.has(p.id));
              return brandNew.length > 0 ? [...brandNew, ...prev] : prev;
            });
          } else if (!followNewerThan) {
            setPosts(mapped);
          }
        } else {
          setPosts((prev) => { const ids = new Set(prev.map((p) => p.id)); return [...prev, ...mapped.filter((i) => !ids.has(i.id))]; });
        }
      }
      if (!background) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
      return;
    }

    // --- For You tab ---
    const userInterests: string[] = profile?.interests || [];
    const userCountry: string = profile?.country || "";

    // Three-stream feed — each refresh delivers a unique mix of time ranges:
    //  1. RECENT    — newest posts (last 4 days)
    //  2. MID       — posts 4–30 days old, random window per session
    //  3. THROWBACK — posts older than 30 days, random window per session
    // Streams are shuffled before scoring so every pull-to-refresh feels different.
    const RECENT_SIZE = 12;
    const MID_SIZE = 10;
    const THROWBACK_SIZE = 8;

    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const fyOlderThan =
      !isRefresh && postsRef.current.length > 0
        ? postsRef.current[postsRef.current.length - 1]?.created_at
        : null;

    const fySelect = `
      id, author_id, content, image_url, created_at, view_count, like_count, visibility, language_code,
      post_type, article_title, article_body, video_url, video_asset_id
    `;

    // Kick off SQLite reads immediately so they overlap with query-building and network.
    const seenPostIdsPromise = getSeenPostIds();

    // Delta sync: on refresh, only fetch posts NEWER than newest stored
    const fyNewerThan = isRefresh ? await getNewestFeedPostDate("for_you") : null;

    // On refresh, reset all stream offsets to new random positions so every
    // session surfaces a completely different combination of content.
    if (isRefresh) {
      throwbackOffsetRef.current = Math.floor(Math.random() * 120);
      throwbackExhaustedRef.current = false;
      midOffsetRef.current = Math.floor(Math.random() * 80);
      midExhaustedRef.current = false;
    }

    // ── Stream 1: Recent posts (last 4 days) ──
    let fyQ: any = supabase.from("posts").select(fySelect).eq("visibility", "public")
      .order("created_at", { ascending: false });
    if (fyOlderThan) {
      fyQ = fyQ.lt("created_at", fyOlderThan);
    } else if (fyNewerThan) {
      fyQ = fyQ.gt("created_at", fyNewerThan);
    } else {
      fyQ = fyQ.gte("created_at", fourDaysAgo);
    }
    fyQ = fyQ.limit(RECENT_SIZE);

    // ── Stream 2: Mid posts (4–30 days old, random window) ──
    const mdOffset = midOffsetRef.current;
    const midPromise = midExhaustedRef.current || fyOlderThan
      ? Promise.resolve({ data: [] as any[] })
      : supabase.from("posts")
          .select(fySelect)
          .eq("visibility", "public")
          .lt("created_at", fourDaysAgo)
          .gte("created_at", thirtyDaysAgo)
          .order("view_count", { ascending: false })
          .range(mdOffset, mdOffset + MID_SIZE - 1)
          .then((res) => {
            if (!res.data || res.data.length === 0) {
              midExhaustedRef.current = true;
            } else {
              midOffsetRef.current += MID_SIZE;
            }
            return res;
          });

    // ── Stream 3: Throwback posts (older than 30 days, high engagement) ──
    const tbOffset = throwbackOffsetRef.current;
    const throwbackPromise = throwbackExhaustedRef.current || fyOlderThan
      ? Promise.resolve({ data: [] as any[] })
      : supabase.from("posts")
          .select(fySelect)
          .eq("visibility", "public")
          .lt("created_at", thirtyDaysAgo)
          .order("view_count", { ascending: false })
          .range(tbOffset, tbOffset + THROWBACK_SIZE - 1)
          .then((res) => {
            if (!res.data || res.data.length === 0) {
              throwbackExhaustedRef.current = true;
            } else {
              throwbackOffsetRef.current += THROWBACK_SIZE;
            }
            return res;
          });

    const [{ data: recentData }, { data: midData }, { data: throwbackData }] = await Promise.all([fyQ, midPromise, throwbackPromise]);

    // Merge all streams, deduplicate, then Fisher-Yates shuffle so the scoring
    // algorithm picks the best content from a randomly ordered pool — making
    // every refresh feel genuinely different rather than always newest-first.
    const existingIds = new Set((postsRef.current || []).map((p) => p.id));
    const seenInBatch = new Set<string>();
    const allRaw: any[] = [];
    for (const item of [...(recentData || []), ...(midData || []), ...(throwbackData || [])]) {
      if (!seenInBatch.has(item.id) && !existingIds.has(item.id)) {
        seenInBatch.add(item.id);
        allRaw.push(item);
      }
    }
    // Fisher-Yates shuffle — seeded by Math.random() so each refresh is unique
    for (let i = allRaw.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allRaw[i], allRaw[j]] = [allRaw[j], allRaw[i]];
    }
    const data = await hydrateFeedPostRows(allRaw);
    // Seed handle→id cache — makes mention-taps to these authors instant
    for (const p of data) {
      if (p.author_id && p.profiles?.handle) setHandleId(p.profiles.handle, p.author_id);
    }

    if (data) {
      // hasMore if any stream still has content to page through
      const recentFull = (recentData || []).length >= RECENT_SIZE;
      setHasMore(recentFull || !midExhaustedRef.current || !throwbackExhaustedRef.current);

      const postIds = data.map((p: any) => p.id);
      const authorIds = [...new Set(data.map((p: any) => p.author_id))];

      // Build org-posts query now so it fires alongside the 6 metadata queries
      // rather than sequentially after them.
      let _orgQ: any = supabase
        .from("organization_page_posts")
        .select("id, content, image_url, created_at, author_id, likes, page_id")
        .order("created_at", { ascending: false })
        .limit(6);
      if (fyOlderThan) _orgQ = _orgQ.lt("created_at", fyOlderThan);

      const _fyLimit = PAGE_SIZE * 3;
      const [
        { data: myLikes },
        { data: replyCounts },
        { data: followingData },
        { data: myBookmarks },
        _orgResult,
        authorPostsResult,
      ] = await Promise.all([
        postIds.length > 0 && user
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id).limit(_fyLimit)
          : { data: [] },
        postIds.length > 0
          ? supabase.from("post_replies").select("post_id").in("post_id", postIds).limit(_fyLimit)
          : { data: [] },
        authorIds.length > 0 && user
          ? supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", authorIds)
          : { data: [] },
        postIds.length > 0 && user
          ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id).limit(_fyLimit)
          : { data: [] },
        Promise.resolve(_orgQ).catch(() => ({ data: null })),
        authorIds.length > 0
          ? supabase.from("posts").select("id, author_id").in("author_id", authorIds).limit(500)
          : { data: [] },
      ]);
      const authorPostRows: any[] = (authorPostsResult as any)?.data ?? [];
      const authorPostIds = authorPostRows.map((post) => post.id);
      const authorByPostId = new Map<string, string>();
      for (const post of authorPostRows) {
        authorByPostId.set(post.id, post.author_id);
      }
      let myAuthorLikes: any[] = [];
      let myReplies: any[] = [];
      if (user && authorPostIds.length > 0) {
        const [authorLikesResult, authorRepliesResult] = await Promise.all([
          supabase
            .from("post_acknowledgments")
            .select("post_id")
            .eq("user_id", user.id)
            .in("post_id", authorPostIds)
            .limit(100),
          supabase
            .from("post_replies")
            .select("post_id")
            .eq("author_id", user.id)
            .in("post_id", authorPostIds)
            .limit(100),
        ]);
        myAuthorLikes = authorLikesResult.data || [];
        myReplies = authorRepliesResult.data || [];
      }

      let _orgData: any[] = (_orgResult as any)?.data ?? [];
      if (_orgData.length > 0) {
        const pageIds = [...new Set(_orgData.map((post) => post.page_id).filter(Boolean))];
        const { data: pageRows } = pageIds.length > 0
          ? await supabase
              .from("organization_pages")
              .select("id, slug, name, org_type, logo_url, is_verified")
              .in("id", pageIds)
          : { data: [] };
        const pagesById = new Map<string, any>();
        for (const page of pageRows || []) {
          pagesById.set((page as any).id, page);
        }
        _orgData = _orgData
          .map((post) => ({ ...post, organization_pages: pagesById.get(post.page_id) }))
          .filter((post) => post.organization_pages);
      }

      const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
      const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id));

      const replyMap: Record<string, number> = {};
      for (const r of (replyCounts || [])) { replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1; }

      const followingSet = new Set((followingData || []).map((f: any) => f.following_id));

      // Enforce hide_posts_non_followers: remove posts from authors who restrict
      // visibility to their followers only, when the current viewer doesn't follow them.
      const visibleData = data.filter((p: any) => {
        if (p.profiles?.hide_posts_non_followers && p.author_id !== user?.id && !followingSet.has(p.author_id)) {
          return false;
        }
        return true;
      });

      const authorInteractionMap: Record<string, number> = {};
      for (const al of (myAuthorLikes || [])) {
        const authorId = authorByPostId.get(al.post_id);
        if (authorId) authorInteractionMap[authorId] = (authorInteractionMap[authorId] || 0) + 1;
      }
      for (const ar of (myReplies || [])) {
        const authorId = authorByPostId.get(ar.post_id);
        if (authorId) authorInteractionMap[authorId] = (authorInteractionMap[authorId] || 0) + 2;
      }

      const authorPostCount: Record<string, number> = {};
      for (const p of visibleData) {
        const aid = (p as any).author_id;
        authorPostCount[aid] = (authorPostCount[aid] || 0) + 1;
      }

      // seenPostIds was kicked off before the network requests — resolves from
      // SQLite concurrently with the Supabase round-trips, so this await is free.
      const seenPostIds = await seenPostIdsPromise;

      const scored = visibleData.map((p: any) => {
        const likeCount = p.like_count || 0;
        const replyCount = replyMap[p.id] || 0;
        const hasImages = (p.post_images?.length > 0) || !!p.image_url;
        const content = p.content || "";
        const authorCountry = p.profiles?.country || "";
        const postType = p.post_type || "post";
        const isSeen = seenPostIds.has(p.id);

        const interestMatches = matchInterestsWeighted(content, userInterests, learnedWeightsRef.current);

        const signals: FeedSignals = {
          likeCount,
          replyCount,
          viewCount: p.view_count || 0,
          createdAt: p.created_at,
          interestMatches,
          isFollowing: followingSet.has(p.author_id),
          authorInteractionCount: authorInteractionMap[p.author_id] || 0,
          isVerified: p.profiles?.is_verified || false,
          isOrgVerified: p.profiles?.is_organization_verified || false,
          hasImages,
          sameCountry: !!userCountry && !!authorCountry && userCountry === authorCountry,
          authorPostCountInFeed: authorPostCount[p.author_id] || 1,
          contentLength: content.length,
          postType,
          isSeen,
        };

        const score = computeFeedScore(signals);

        return {
          id: p.id,
          author_id: p.author_id,
          content,
          image_url: p.image_url,
          images: (p.post_images || [])
            .sort((a: any, b: any) => a.display_order - b.display_order)
            .map((i: any) => i.image_url),
          created_at: p.created_at,
          view_count: p.view_count || 0,
          visibility: p.visibility || "public",
          is_verified: p.profiles?.is_verified || false,
          is_organization_verified: p.profiles?.is_organization_verified || false,
          profile: {
            display_name: p.profiles?.display_name || "User",
            handle: p.profiles?.handle || "user",
            avatar_url: p.profiles?.avatar_url || null,
            bio: p.profiles?.bio || null,
          },
          liked: myLikeSet.has(p.id),
          likeCount,
          replyCount,
          score,
          bookmarked: myBookmarkSet.has(p.id),
          post_type: postType,
          article_title: p.article_title || null,
          article_body: p.article_body || null,
          video_url: p.video_url || null,
          duration_seconds: (() => { const arr = Array.isArray(p.video_assets) ? p.video_assets : (p.video_assets ? [p.video_assets] : []); return arr.length > 0 ? (arr[0].duration_seconds ?? null) : null; })(),
          isFollowing: followingSet.has(p.author_id),
          language_code: p.language_code || null,
        };
      });

      // Weighted random sampling from top candidates — quality still wins but
      // lower-ranked posts can surface, making every refresh genuinely different.
      const topPool = [...scored].sort((a, b) => b.score - a.score).slice(0, 60);
      const sampled = weightedSample(topPool, Math.min(topPool.length, 30));

      // Diversify: no same-author back-to-back, no 3 same post-types in a row
      const diversified = diversifyFeed(sampled.map((p) => ({ ...p, postType: p.post_type })));

      InteractionManager.runAfterInteractions(() => {
        prefetchAvatars(diversified.slice(0, 8).map((p) => (p as any).profile?.avatar_url));
        prefetchThumbnails(diversified.slice(0, 6).map((p) => (p as any).image_url));
        // Mark these posts as seen so they get demoted on the next refresh.
        markPostsSeen(diversified.map((p) => p.id)).catch(() => {});
      });

      // Org posts were fetched in parallel with the metadata queries above.
      let orgPostItems: PostItem[] = [];
      try {
        const orgData = _orgData;
        if (orgData && orgData.length > 0) {
          const orgIds = orgData.map((op: any) => op.id);
          const [{ data: orgReplies }, { data: orgLikes }] = await Promise.all([
            supabase.from("post_replies").select("post_id").in("post_id", orgIds),
            user
              ? supabase.from("post_acknowledgments").select("post_id").in("post_id", orgIds).eq("user_id", user.id)
              : Promise.resolve({ data: [] }),
          ]);
          const orgReplyCounts: Record<string, number> = {};
          for (const reply of (orgReplies || [])) {
            orgReplyCounts[reply.post_id] = (orgReplyCounts[reply.post_id] || 0) + 1;
          }
          const orgLiked = new Set((orgLikes || []).map((like: any) => like.post_id));
          orgPostItems = orgData.map((op: any) => {
            const pg = op.organization_pages;
            return {
              // Organization posts use the same post-id namespace as regular
              // posts so likes, replies, bookmarks, and detail routes behave
              // identically.
              id: op.id,
              author_id: op.author_id || pg?.id || "",
              content: op.content || "",
              image_url: op.image_url || null,
              images: op.image_url ? [op.image_url] : [],
              created_at: op.created_at,
              view_count: 0,
              visibility: "public",
              is_verified: false,
              is_organization_verified: pg?.is_verified || false,
              profile: {
                display_name: pg?.name || "Organization",
                handle: pg?.slug || "",
                avatar_url: pg?.logo_url || null,
              },
              liked: orgLiked.has(op.id),
              likeCount: op.likes || 0,
              replyCount: orgReplyCounts[op.id] || 0,
              score: 50,
              bookmarked: false,
              post_type: "post",
              article_title: null,
              article_body: null,
              video_url: null,
              duration_seconds: null,
              isFollowing: false,
              org_page_id: pg?.id,
              org_slug: pg?.slug,
              org_type: pg?.org_type,
              org_verified: pg?.is_verified,
            } as PostItem;
          });
        }
      } catch (_) {}

      // Interleave: insert 1 org post for every 5 regular posts
      const merged: PostItem[] = [];
      let orgIdx = 0;
      for (let i = 0; i < diversified.length; i++) {
        merged.push(diversified[i] as PostItem);
        if ((i + 1) % 5 === 0 && orgIdx < orgPostItems.length) {
          merged.push(orgPostItems[orgIdx++]);
        }
      }
      // Append any remaining org posts at end
      while (orgIdx < orgPostItems.length) {
        merged.push(orgPostItems[orgIdx++]);
      }

      if (isRefresh) {
        tabPostsCache.current[activeTab] = merged;
        tabCacheTimestamp.current[activeTab] = Date.now();
        cacheFeedTab(activeTab, merged);
        cacheMoments(merged);
        saveFeedPosts(merged, activeTab as LocalFeedTab).catch(() => {});
        if (background) {
          const prevIds = new Set(postsRef.current.map((p) => p.id));
          const brandNew = merged.filter((p) => !prevIds.has(p.id));
          if (brandNew.length > 0) {
            pendingPostsRef.current = [...brandNew, ...pendingPostsRef.current.filter((p) => !prevIds.has(p.id))];
            setNewPostAuthors((prev) => {
              if (prev.length > 0) return prev;
              const seen = new Set<string>();
              const authors: { id: string; avatar_url: string | null; display_name: string }[] = [];
              for (const p of brandNew) {
                if (!p.author_id || seen.has(p.author_id)) continue;
                seen.add(p.author_id);
                authors.push({ id: p.author_id, avatar_url: p.profile?.avatar_url ?? null, display_name: p.profile?.display_name || "User" });
                if (authors.length >= 5) break;
              }
              return authors;
            });
          }
        } else if (fyNewerThan && merged.length > 0) {
          setPosts((prev) => {
            const prevIds = new Set(prev.map((p) => p.id));
            const brandNew = merged.filter((p) => !prevIds.has(p.id));
            return brandNew.length > 0 ? [...brandNew, ...prev] : prev;
          });
        } else if (!fyNewerThan) {
          setPosts(merged);
        }
      } else {
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newItems = merged.filter((i) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
      }
    }
    } catch (err) {
      console.error("[Discover] fetchPosts error:", err);
    } finally {
      if (!background) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [user, profile]);

  const loadPosts = useCallback(
    (tab?: "for_you" | "following", background?: boolean) =>
      waitForRequest(
        fetchPosts(0, true, tab, background),
        FEED_REQUEST_TIMEOUT_MS,
        () => {
          if (!background) {
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
          }
        },
      ).then(() => undefined),
    [fetchPosts]
  );

  const loadMoreInFlight = useRef(false);
  const loadMore = useCallback(() => {
    if (loadMoreInFlight.current || !hasMore || postsRef.current.length === 0) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    fetchPosts(0, false, feedTabRef.current).finally(() => {
      loadMoreInFlight.current = false;
    });
  }, [fetchPosts, hasMore]);

  const loadPostsRef = useRef(loadPosts);
  useEffect(() => { loadPostsRef.current = loadPosts; }, [loadPosts]);

  // Tab switch — show cached posts immediately, background-refresh if stale
  useEffect(() => {
    if (!initialHydrationDoneRef.current) return;
    const dataTab = feedTab;
    const STALE_MS = 3 * 60 * 1000;
    const cached = tabPostsCache.current[dataTab];
    const cacheAge = Date.now() - tabCacheTimestamp.current[dataTab];

    // Always reveal the header when switching tabs
    revealHeader();
    prevScrollYRef.current = 0;

    setHasMore(true);
    setFollowingEmpty(false);
    // Tab switch: clear pill without starting the cooldown
    setNewPostAuthors([]);
    newPostAuthorIdsRef.current.clear();
    pendingPostsRef.current = [];
    setPendingCount(0);
    pillDismissedAtRef.current = 0;

    if (cached.length > 0) {
      setPosts(cached);
      setLoading(false);
      if (cacheAge >= STALE_MS) {
        loadPostsRef.current(dataTab, true);
      }
    } else {
      setPosts([]);
      setLoading(true);
      loadPostsRef.current(dataTab, false);
    }
  }, [feedTab]);

  // Mount: preload both tabs from SQLite first (instant), then AsyncStorage fallback,
  // then background-refresh For You from the network.
  useEffect(() => {
    (async () => {
      const localHydration = Promise.all([
        getLocalFeedPosts("for_you", 30),
        getLocalFeedPosts("following", 30),
      ]);
      // SQLite migrations and the native bridge can be much slower on a
      // standalone first launch than in Expo Go. Never block the live feed
      // behind a cache read that does not settle.
      const [fyLocal, flLocal] = await Promise.race([
        localHydration,
        new Promise<[any[], any[]]>((resolve) =>
          setTimeout(() => resolve([[], []]), LOCAL_FEED_HYDRATION_TIMEOUT_MS),
        ),
      ]);
      if (fyLocal.length > 0) {
        const toItem = (r: any) => ({ ...r, likeCount: r.like_count, replyCount: r.reply_count, is_organization_verified: r.is_org_verified, profile: { display_name: r.author_name ?? "User", handle: r.author_handle ?? "user", avatar_url: r.author_avatar ?? null, bio: null }, article_body: null, duration_seconds: null, isFollowing: false }) as unknown as PostItem;
        tabPostsCache.current.for_you = fyLocal.map(toItem);
        tabCacheTimestamp.current.for_you = fyLocal[0]?.stored_at ?? Date.now();
        if (feedTabRef.current === "for_you") { setPosts(tabPostsCache.current.for_you); setLoading(false); }
      }
      if (flLocal.length > 0) {
        const toItem = (r: any) => ({ ...r, likeCount: r.like_count, replyCount: r.reply_count, is_organization_verified: r.is_org_verified, profile: { display_name: r.author_name ?? "User", handle: r.author_handle ?? "user", avatar_url: r.author_avatar ?? null, bio: null }, article_body: null, duration_seconds: null, isFollowing: true }) as unknown as PostItem;
        tabPostsCache.current.following = flLocal.map(toItem);
        tabCacheTimestamp.current.following = flLocal[0]?.stored_at ?? Date.now();
        if (feedTabRef.current === "following") { setPosts(tabPostsCache.current.following); setLoading(false); }
      }
      // Only fall through to AsyncStorage if SQLite had nothing
      const [fyCache, flCache] = await Promise.all([
        fyLocal.length > 0 ? Promise.resolve(null) : getCachedFeedTab("for_you"),
        flLocal.length > 0 ? Promise.resolve(null) : getCachedFeedTab("following"),
      ]);
      if (fyCache?.posts?.length) {
        const p = fyCache.posts as PostItem[];
        tabPostsCache.current.for_you = p;
        tabCacheTimestamp.current.for_you = fyCache.cachedAt;
        if (feedTabRef.current === "for_you") {
          setPosts(p);
          setLoading(false);
        }
      }
      if (flCache?.posts?.length) {
        tabPostsCache.current.following = flCache.posts as PostItem[];
        tabCacheTimestamp.current.following = flCache.cachedAt;
      }
      initialHydrationDoneRef.current = true;
      const activeTab = feedTabRef.current;
      const hasActiveCache = tabPostsCache.current[activeTab].length > 0;
      if (isOnline()) {
        loadPostsRef.current(activeTab, hasActiveCache);
      } else if (!hasActiveCache) {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth/profile change — refresh active tab in background if posts already showing.
  // Uses a stable key (userId + interests) so this only fires when auth identity or
  // interests actually change, not on every AuthContext re-render.
  const _authKeyRef = useRef("");
  useEffect(() => {
    const key = `${user?.id ?? ""}:${JSON.stringify(profile?.interests ?? [])}`;
    if (!initialHydrationDoneRef.current) return;
    if (key === _authKeyRef.current) return;
    _authKeyRef.current = key;
    if (!user?.id && !profile) return;
    const hasPosts = tabPostsCache.current[feedTabRef.current].length > 0;
    loadPostsRef.current(feedTabRef.current, hasPosts);
  }, [user, profile]);

  // Auto-refresh on reconnect
  useEffect(() => {
    const unsub = onConnectivityChange((online) => {
      if (online) {
        const hasPosts = tabPostsCache.current[feedTabRef.current].length > 0;
        loadPostsRef.current(feedTabRef.current, hasPosts);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const staleChannel = supabase
      .getChannels()
      .find((channel) => channel.topic === "realtime:discover-posts-realtime");
    if (staleChannel) {
      supabase.removeChannel(staleChannel).catch(() => {});
    }

    const channel = supabase
      .channel("discover-posts-realtime")
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, (payload: any) => {
        const deletedId = payload.old?.id;
        if (deletedId) queueRealtimePatch(deletedId, { deleted: true });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_acknowledgments" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        const evType = payload.eventType;
        if (evType !== "INSERT" && evType !== "DELETE") return;
        const isOwnAction = (evType === "INSERT" && payload.new?.user_id === user?.id) || (evType === "DELETE" && payload.old?.user_id === user?.id);
        if (isOwnAction) return;
        const delta = evType === "INSERT" ? 1 : -1;
        queueRealtimePatch(postId, { likeDelta: delta });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_replies" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        const evType = payload.eventType;
        const delta = evType === "INSERT" ? 1 : evType === "DELETE" ? -1 : 0;
        if (delta !== 0) {
          queueRealtimePatch(postId, { replyDelta: delta });
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "follows" }, (payload: any) => {
        const followerId = payload.new?.follower_id;
        const followingId = payload.new?.following_id;
        if (followerId === user?.id && followingId) {
          queueRealtimePatch(`author:${followingId}`, { authorId: followingId, following: true });
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "follows" }, (payload: any) => {
        const followerId = payload.old?.follower_id;
        const followingId = payload.old?.following_id;
        if (followerId === user?.id && followingId) {
          queueRealtimePatch(`author:${followingId}`, { authorId: followingId, following: false });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queueRealtimePatch]);

  // ── Twitter/X-style background poller ──────────────────────────────────────
  // Every 60 s the poller silently queries for posts newer than the newest one
  // currently visible. If any are found they go into pendingPostsRef and the
  // floating pill appears. The feed list itself is NOT touched until the user
  // taps the pill — so the current reading position never shifts unexpectedly.
  useEffect(() => {
    const POLL_INTERVAL_MS = 60_000;
    let cancelled = false;

    const poll = async () => {
      if (pollInFlightRef.current) return;
      if (activeDiscoverTabRef.current === "find") return;
      if (!isOnline()) return;
      const newestAt = newestPostAtRef.current;
      if (!newestAt) return;
      // Don't stack up if a pill is already visible
      if (pendingPostsRef.current.length > 0) return;
      // Respect the cooldown after pill dismissal
      if (Date.now() - pillDismissedAtRef.current < PILL_COOLDOWN_MS) return;

      pollInFlightRef.current = true;
      try {
      const activeTab = feedTabRef.current;
      const fySelect = `
        id, author_id, content, image_url, created_at, view_count, like_count, visibility,
        post_type, article_title, article_body, video_url, video_asset_id
      `;

      let newPostsData: any[] = [];

      if (activeTab === "for_you") {
        const { data } = await supabase
          .from("posts")
          .select(fySelect)
          .eq("visibility", "public")
          .gt("created_at", newestAt)
          .neq("author_id", user?.id ?? "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
          .order("created_at", { ascending: false })
          .limit(20);
        newPostsData = data ?? [];
      } else if (activeTab === "following" && user?.id) {
        const { data: followData } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id)
          .limit(500);
        const followingIds = (followData ?? []).map((f: any) => f.following_id);
        if (followingIds.length > 0) {
          const { data } = await supabase
            .from("posts")
            .select(fySelect)
            .in("author_id", followingIds)
            .in("visibility", ["public", "followers"])
            .gt("created_at", newestAt)
            .order("created_at", { ascending: false })
            .limit(20);
          newPostsData = data ?? [];
        }
      }

      if (!newPostsData.length || cancelled) return;
      newPostsData = await hydrateFeedPostRows(newPostsData);
      if (cancelled) return;

      // Map to PostItem
      const mappedPosts: PostItem[] = newPostsData.map((p: any) => ({
        id: p.id,
        author_id: p.author_id,
        content: p.content ?? "",
        image_url: p.image_url,
        images: (p.post_images ?? [])
          .sort((a: any, b: any) => a.display_order - b.display_order)
          .map((i: any) => i.image_url),
        created_at: p.created_at,
        view_count: p.view_count ?? 0,
        visibility: p.visibility ?? "public",
        is_verified: p.profiles?.is_verified ?? false,
        is_organization_verified: p.profiles?.is_organization_verified ?? false,
        profile: {
          display_name: p.profiles?.display_name || "User",
          handle: p.profiles?.handle || "user",
          avatar_url: p.profiles?.avatar_url || null,
          bio: null,
        },
        liked: false,
        likeCount: p.like_count ?? 0,
        replyCount: 0,
        score: 0,
        bookmarked: false,
        post_type: p.post_type ?? "text",
        article_title: p.article_title ?? null,
        article_body: p.article_body ?? null,
        video_url: p.video_url ?? null,
        duration_seconds: (() => {
          const arr = Array.isArray(p.video_assets) ? p.video_assets : (p.video_assets ? [p.video_assets] : []);
          return arr.length > 0 ? (arr[0].duration_seconds ?? null) : null;
        })(),
        isFollowing: activeTab === "following",
      }));

      // Deduplicate against current feed and existing pending buffer
      const existingIds = new Set([
        ...postsRef.current.map((p) => p.id),
        ...pendingPostsRef.current.map((p) => p.id),
      ]);
      const trulyNew = mappedPosts.filter((p) => !existingIds.has(p.id));
      if (!trulyNew.length) return;

      // Buffer the new posts — they'll be prepended when the user taps the pill
      pendingPostsRef.current = [...trulyNew, ...pendingPostsRef.current];
      setPendingCount(pendingPostsRef.current.length);

      // Collect unique author profiles for the pill avatars (max 5)
      const seen = new Set(newPostAuthorIdsRef.current);
      const newAuthors: { id: string; avatar_url: string | null; display_name: string }[] = [];
      for (const post of trulyNew) {
        if (!seen.has(post.author_id)) {
          seen.add(post.author_id);
          newPostAuthorIdsRef.current.add(post.author_id);
          newAuthors.push({
            id: post.author_id,
            avatar_url: post.profile.avatar_url,
            display_name: post.profile.display_name,
          });
        }
      }
      if (newAuthors.length > 0) {
        setNewPostAuthors((prev) => {
          const combined = [...prev, ...newAuthors.filter((a) => !prev.some((p) => p.id === a.id))];
          return combined.slice(0, 5);
        });
      }
      } finally {
        pollInFlightRef.current = false;
      }
    };

    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  // Re-run when user changes so we get the right `user?.id` closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Pill state management ──────────────────────────────────────────────────
  // recordDismissal=true  → starts the 2-min cooldown (user tapped the pill)
  // recordDismissal=false → just clears UI state (tab switch, pull-to-refresh)
  function _resetPill(recordDismissal = true) {
    setNewPostAuthors([]);
    newPostAuthorIdsRef.current.clear();
    pendingPostsRef.current = [];
    setPendingCount(0);
    if (recordDismissal) pillDismissedAtRef.current = Date.now();
    else pillDismissedAtRef.current = 0; // reset so poller can fire immediately after a manual refresh
  }

  // ── Pill tap handler ───────────────────────────────────────────────────────
  // Production-grade instant-reveal pattern:
  //   1. Deduplicate the buffer synchronously against postsRef (no setState yet)
  //   2. Dismiss pill + start cooldown
  //   3. Advance the polling watermark immediately — next poll won't resurface these posts
  //   4. Jump to offset 0 INSTANTLY (animated: false) — user's eyes land on top before React re-renders
  //   5. Prepend fresh posts — they appear at offset 0 on the very next frame the user is already watching
  // No setTimeout, no requestAnimationFrame, no loadPosts call.
  function handleShowNewPosts() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // ① Snapshot + eagerly deduplicate against the live feed (postsRef = no stale closure)
    const existIds = new Set(postsRef.current.map((p) => p.id));
    const fresh = pendingPostsRef.current.filter((p) => !existIds.has(p.id));

    // ② Dismiss pill and arm the cooldown clock
    _resetPill(true);

    if (fresh.length === 0) {
      // Nothing truly new — just snap the user back to the top
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      return;
    }

    // ③ Advance the watermark NOW so the next poll interval treats these posts as seen.
    //    (The useEffect on `posts` would also do this, but doing it synchronously here
    //     prevents any poll that fires in the same 60-second window from re-surfacing them.)
    const watermark = fresh[0]?.created_at; // fresh is sorted newest-first from the poll
    if (watermark) newestPostAtRef.current = watermark;

    // ④ Instantly jump to top — zero delay, user's viewport is at position 0
    //    BEFORE React even processes the prepend below.
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });

    // ⑤ Prepend fresh posts into the feed.
    //    Because the scroll already landed at offset 0, these new items
    //    appear exactly where the user is looking on the very next render frame.
    setPosts((prev) => {
      // Re-check against latest prev in case another setState raced in
      const prevIds = new Set(prev.map((p) => p.id));
      const deduped = fresh.filter((p) => !prevIds.has(p.id));
      return deduped.length > 0 ? [...deduped, ...prev] : prev;
    });
  }

  const toggleBookmark = useCallback(async (postId: string) => {
    if (!user) { setShowSignInPrompt(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const post = postsRef.current.find((p) => p.id === postId);
    if (!post) return;
    if (post.bookmarked) {
      await supabase.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", user.id);
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, bookmarked: false } : p));
    } else {
      await supabase.from("post_bookmarks").upsert({ post_id: postId, user_id: user.id }, { onConflict: "post_id,user_id" });
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, bookmarked: true } : p));
      const content = [post.content, post.article_title].filter(Boolean).join(" ");
      recordInteraction(content, "bookmark").then(async () => {
        learnedWeightsRef.current = await getMergedLearnedWeights();
      });
      trackEvent("bookmark_post", { post_id: postId, author_id: post.author_id });
    }
  }, [user, postsRef]);

  const toggleLike = useCallback(async (postId: string) => {
    if (!user) { setShowSignInPrompt(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const post = postsRef.current.find((p) => p.id === postId);
    if (!post) return;

    if (post.liked) {
      // Optimistic update — flip instantly
      setPosts((prev) =>
        prev.map((p) => p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p)
      );
      const { error } = await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
      if (error) {
        // Revert on failure
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p)
        );
      } else if (post.org_page_id) {
        await supabase.from("organization_page_posts")
          .update({ likes: Math.max(0, post.likeCount - 1) })
          .eq("id", post.id);
      }
    } else {
      // Optimistic update — flip instantly
      setPosts((prev) =>
        prev.map((p) => p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p)
      );
      const content = [post.content, post.article_title].filter(Boolean).join(" ");
      recordInteraction(content, "like").then(async () => {
        learnedWeightsRef.current = await getMergedLearnedWeights();
      });
      trackEvent("like_post", { post_id: postId, author_id: post.author_id });
      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_liked"); } catch (_) {}
      const { error } = await supabase.from("post_acknowledgments").upsert({ post_id: postId, user_id: user.id }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
      if (error) {
        // Revert on failure
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p)
        );
      } else if (post.org_page_id) {
        await supabase.from("organization_page_posts")
          .update({ likes: post.likeCount + 1 })
          .eq("id", post.id);
      }
    }
  }, [user, profile, postsRef]);

  const toggleFollow = useCallback(async (authorId: string) => {
    if (!user) { setShowSignInPrompt(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await supabase.from("follows").upsert({ follower_id: user.id, following_id: authorId }, { onConflict: "follower_id,following_id" });
    if (!error) {
      setPosts((prev) => prev.map((p) => p.author_id === authorId ? { ...p, isFollowing: true } : p));
    }
  }, [user]);

  const onRequireAuth = useCallback(() => setShowSignInPrompt(true), []);

  const renderFeedItem = useCallback(
    ({ item: entry }: { item: FeedEntry }) => {
      if (entry._kind === "user_recs") {
        return <UserRecsCard seed={entry.seed} onRequireAuth={onRequireAuth} />;
      }
      if (entry._kind === "premium") return null;
      return (
        <PostCard
          item={entry.item}
          onToggleLike={toggleLike}
          onToggleBookmark={toggleBookmark}
          onToggleFollow={toggleFollow}
          onImagePress={imgViewer.openViewer}
          onRequireAuth={onRequireAuth}
          onDismiss={onDismissPost}
          onMuteAuthor={onMuteAuthor}
        />
      );
    },
    [imgViewer.openViewer, onDismissPost, onMuteAuthor, onRequireAuth, toggleBookmark, toggleFollow, toggleLike],
  );

  // Re-sync isFollowing for every post whenever Discover comes back into focus
  // (handles the "follow from profile page → back to feed" stale-state case).
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id)
        .then(({ data }) => {
          if (!data) return;
          const followed = new Set(data.map((f: any) => f.following_id as string));
          setPosts((prev) =>
            prev.map((p) =>
              p.isFollowing !== followed.has(p.author_id)
                ? { ...p, isFollowing: followed.has(p.author_id) }
                : p
            )
          );
        });
    }, [user?.id])
  );

  // The dedicated Shorts experience now lives at /shorts (which redirects to
  // /video/[id]), so there is only ONE video player implementation app-wide.
  // The Shorts pill in the discover header navigates there.

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <PostUploadBanner />
      <>

      {/* ── Fixed, compact Discover header ── */}
      <View style={styles.headerBlock}>
        {/* The compact top bar, tabs, and refresh status collapse together. */}
        <View
          onLayout={(e) => {
            const nextHeight = Math.round(e.nativeEvent.layout.height);
            setCoreHeaderHeight((current) => current === nextHeight ? current : nextHeight);
          }}
          style={{ zIndex: 2 }}
        >
          {/* ── Tabs and actions ── */}
          <View style={[
            styles.tabRow,
            isCompactHeader && styles.tabRowCompact,
            { paddingTop: insets.top + 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
          ]}>
          <View style={[styles.tabsGroup, isCompactHeader && styles.tabsGroupCompact]}>
          <TouchableOpacity
            style={[
              styles.tabPill,
              isCompactHeader && styles.tabPillCompact,
              activeDiscoverTab === "for_you" && { borderBottomWidth: 2.5, borderBottomColor: colors.accent },
            ]}
            onPress={() => selectDiscoverTab("for_you")}
          >
            <View style={styles.tabContent}>
              <Text style={[
                styles.tabPillText,
                isCompactHeader && styles.tabPillTextCompact,
                { color: activeDiscoverTab === "for_you" ? colors.accent : colors.textMuted },
              ]}>For You</Text>
            </View>
          </TouchableOpacity>
          {user && (
            <TouchableOpacity
              style={[
                styles.tabPill,
                isCompactHeader && styles.tabPillCompact,
                activeDiscoverTab === "following" && { borderBottomWidth: 2.5, borderBottomColor: colors.accent },
              ]}
              onPress={() => selectDiscoverTab("following")}
            >
              <View style={styles.tabContent}>
                <Text style={[
                  styles.tabPillText,
                  isCompactHeader && styles.tabPillTextCompact,
                  { color: activeDiscoverTab === "following" ? colors.accent : colors.textMuted },
                ]}>Following</Text>
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.tabPill,
              isCompactHeader && styles.tabPillCompact,
              activeDiscoverTab === "find" && { borderBottomWidth: 2.5, borderBottomColor: colors.accent },
            ]}
            onPress={() => selectDiscoverTab("find")}
            accessibilityRole="tab"
            accessibilityLabel="Find people nearby"
          >
            <View style={styles.tabContent}>
              <Text style={[
                styles.tabPillText,
                isCompactHeader && styles.tabPillTextCompact,
                { color: activeDiscoverTab === "find" ? colors.accent : colors.textMuted },
              ]}>Find</Text>
              <View style={[styles.newTabBadge, { backgroundColor: colors.accent }]}>
                <Text style={styles.newTabBadgeText}>NEW</Text>
              </View>
            </View>
          </TouchableOpacity>
          </View>
          <View style={[styles.tabSpacer, isCompactHeader && styles.tabSpacerCompact]} />
          {!user && (
            <TouchableOpacity
              onPress={() => safeRouter.push("/(auth)/login")}
              style={styles.signInBtn}
              activeOpacity={0.7}
            >
              <Text style={[styles.signInText, { color: colors.textSecondary }]}>Sign in</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); router.push("/search" as any); }}
            style={[
              styles.searchBtn,
              isCompactHeader && styles.searchBtnCompact,
              { backgroundColor: isCompactHeader ? colors.surface : "transparent" },
            ]}
            activeOpacity={0.7}
            hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Ionicons name="search" size={24} color={colors.icon} />
          </TouchableOpacity>
          </View>

        </View>

        {/* Stories move into the top-bar space when the tabs collapse. Keep
            this layer above the collapsing chrome and give it its own opaque
            background so the feed never shows through during the handoff. */}
        <View
          onLayout={(e) => {
            const nextHeight = Math.round(e.nativeEvent.layout.height);
            setStoriesHeight((current) => current === nextHeight ? current : nextHeight);
          }}
          style={{
            zIndex: 3,
            width: "100%",
            backgroundColor: colors.background,
          }}
        >
          <StoriesRow
            userId={user?.id ?? null}
            avatarUrl={profile?.avatar_url ?? null}
            displayName={profile?.display_name ?? null}
          />
        </View>
      </View>
      {/* ────────────────────────────────────────────────────────────────── */}

      {/* Edge fade removed — it was overlaying the first row of feed content */}

      {_PagerView ? (
        <_PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={0}
          onPageScroll={handleDiscoverPageScroll}
          onPageSelected={handleDiscoverPageSelected}
          overdrag={false}
            scrollEnabled
        >
          {/* Page 0: For You */}
          <View key="for_you" style={{ flex: 1 }}>
            {(
              loading ? (
                  <View style={{ padding: 8, gap: 8 }}>
                  {[1,2,3,4,5,6,7,8].map(i => <PostSkeleton key={i} />)}
                </View>
              ) : (
                <AnimatedFlatList
                  ref={flatListRef}
                  data={augmentedFeed}
                  keyExtractor={(entry: FeedEntry) => entry._kind === "post" ? entry.item.id : entry.id}
                  renderItem={renderFeedItem}
                  contentContainerStyle={{ gap: 8, paddingBottom: insets.bottom + 100 }}
                  showsVerticalScrollIndicator={false}
                  onScroll={onFeedScroll}
                   scrollEventThrottle={16}
                   onScrollBeginDrag={() => headerAnimationRef.current?.stop()}
                  onScrollEndDrag={handleFeedScrollSettled}
                  onMomentumScrollEnd={handleFeedScrollSettled}
                  onEndReached={loadMore}
                  onEndReachedThreshold={0.5}
                  onViewableItemsChanged={onViewableItemsChanged}
                  viewabilityConfig={viewabilityConfig}
                  initialNumToRender={6}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  updateCellsBatchingPeriod={30}
                  removeClippedSubviews={false}

                  refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={() => { revealHeader(); setRefreshing(true); setHasMore(true); _resetPill(false); loadPosts(feedTab); }} tintColor={colors.accent} />
                  }
                  ListFooterComponent={
                    !hasMore && filteredPosts.length > 0 ? (
                      <View style={[styles.endOfFeed, { borderTopColor: colors.border }]}>
                        <View style={[styles.endOfFeedDot, { backgroundColor: colors.border }]} />
                        <Text style={[styles.endOfFeedText, { color: colors.textMuted }]}>You're all caught up</Text>
                        <View style={[styles.endOfFeedDot, { backgroundColor: colors.border }]} />
                      </View>
                     ) : null
                  }
                />
              )
            )}
          </View>
          {/* Page 1: Following */}
          <View key="following" style={{ flex: 1 }}>
            {(
              !user ? (
                <View style={[styles.center, { paddingTop: 80 }]}>
                  <Ionicons name="lock-closed" size={56} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>Sign in to see Following</Text>
                  <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Follow people to see their posts here</Text>
                  <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.accent }]} onPress={() => safeRouter.push("/(auth)/login")}>
                    <Text style={styles.createBtnText}>Sign In</Text>
                  </TouchableOpacity>
                </View>
              ) : followingEmpty ? (
                <View style={[styles.center, { paddingTop: 80 }]}>
                  <Ionicons name="people" size={56} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No one followed yet</Text>
                  <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Follow people to see their posts here</Text>
                  <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.accent }]} onPress={() => { setFeedTab("for_you"); pagerRef.current?.setPage(0); }}>
                    <Text style={styles.createBtnText}>Browse For You</Text>
                  </TouchableOpacity>
                </View>
              ) : loading ? (
                <View style={{ padding: 8, gap: 8 }}>
                  {[1,2,3,4,5,6,7,8].map(i => <PostSkeleton key={i} />)}
                </View>
              ) : (
                <AnimatedFlatList
                  ref={flatListRef}
                  data={augmentedFeed}
                  keyExtractor={(entry: FeedEntry) => entry._kind === "post" ? entry.item.id : entry.id}
                   renderItem={renderFeedItem}
                  contentContainerStyle={{ gap: 8, paddingBottom: insets.bottom + 100 }}
                  showsVerticalScrollIndicator={false}
                  onScroll={onFeedScroll}
                   scrollEventThrottle={16}
                   onScrollBeginDrag={() => headerAnimationRef.current?.stop()}
                  onScrollEndDrag={handleFeedScrollSettled}
                  onMomentumScrollEnd={handleFeedScrollSettled}
                  onEndReached={loadMore}
                  onEndReachedThreshold={0.5}
                  onViewableItemsChanged={onViewableItemsChanged}
                  viewabilityConfig={viewabilityConfig}
                  initialNumToRender={6}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  updateCellsBatchingPeriod={30}
                   removeClippedSubviews={false}

                  refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={() => { revealHeader(); setRefreshing(true); setHasMore(true); _resetPill(false); loadPosts(feedTab); }} tintColor={colors.accent} />
                  }
                  ListFooterComponent={
                    !hasMore && filteredPosts.length > 0 ? (
                      <View style={[styles.endOfFeed, { borderTopColor: colors.border }]}>
                        <View style={[styles.endOfFeedDot, { backgroundColor: colors.border }]} />
                        <Text style={[styles.endOfFeedText, { color: colors.textMuted }]}>You're all caught up</Text>
                        <View style={[styles.endOfFeedDot, { backgroundColor: colors.border }]} />
                      </View>
                     ) : null
                  }
                />
              )
            )}
          </View>
          {/* Page 2: Find — kept in the same pager so switching tabs does not
              replace the feed container or jump the surrounding layout. */}
          <View key="find" style={{ flex: 1 }}>
            <FindPeopleTab />
          </View>
        </_PagerView>
      ) : (
        feedTab === "following" && !user ? (
          <View style={[styles.center, { paddingTop: 80 }]}>
            <Ionicons name="lock-closed" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Sign in to see Following</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Follow people to see their posts here</Text>
            <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.accent }]} onPress={() => safeRouter.push("/(auth)/login")}>
              <Text style={styles.createBtnText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : feedTab === "following" && followingEmpty ? (
          <View style={[styles.center, { paddingTop: 80 }]}>
            <Ionicons name="people" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No one followed yet</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Follow people to see their posts here</Text>
            <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.accent }]} onPress={() => setFeedTab("for_you")}>
              <Text style={styles.createBtnText}>Browse For You</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <View style={{ padding: 8, gap: 8 }}>{[1,2,3,4,5,6,7,8].map(i => <PostSkeleton key={i} />)}</View>
        ) : (
          <AnimatedFlatList
            ref={flatListRef}
            data={augmentedFeed}
            keyExtractor={(entry: FeedEntry) => entry._kind === "post" ? entry.item.id : entry.id}
            renderItem={renderFeedItem}
            contentContainerStyle={{ gap: 8, paddingBottom: insets.bottom + 100 }}
            showsVerticalScrollIndicator={false}
            onScroll={onFeedScroll}
              scrollEventThrottle={16}
              onScrollBeginDrag={() => headerAnimationRef.current?.stop()}
              onScrollEndDrag={handleFeedScrollSettled}
              onMomentumScrollEnd={handleFeedScrollSettled}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
              initialNumToRender={6}
              maxToRenderPerBatch={4}
              windowSize={5}
            updateCellsBatchingPeriod={30}
            removeClippedSubviews={false}

            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { revealHeader(); setRefreshing(true); setHasMore(true); _resetPill(false); loadPosts(feedTab); }} tintColor={colors.accent} />
            }
            ListFooterComponent={
              !hasMore && filteredPosts.length > 0 ? (
                <View style={[styles.endOfFeed, { borderTopColor: colors.border }]}>
                  <View style={[styles.endOfFeedDot, { backgroundColor: colors.border }]} />
                  <Text style={[styles.endOfFeedText, { color: colors.textMuted }]}>You're all caught up</Text>
                  <View style={[styles.endOfFeedDot, { backgroundColor: colors.border }]} />
                </View>
              ) : null
            }
          />
        )
      )}
      </>
      {/* Sticky "loading more" pill — always visible regardless of scroll position */}
      {loadingMore && (
        <View
          style={[styles.loadMorePill, { bottom: insets.bottom + 90, pointerEvents: "none" }]}
        >
          <View style={styles.loadMorePillInner}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.loadMorePillText}>Loading more…</Text>
          </View>
        </View>
      )}

      {/* FAB removed — create button now lives in the bottom tab bar */}

      <ImageViewer
        images={imgViewer.images}
        initialIndex={imgViewer.index}
        visible={imgViewer.visible}
        onClose={imgViewer.closeViewer}
        meta={imgViewer.meta}
      />

      <SignInPromptModal visible={showSignInPrompt} onDismiss={() => setShowSignInPrompt(false)} />

      <DismissSheet
        visible={!!dismissTarget}
        authorHandle={dismissTarget?.profile.handle ?? ""}
        onSelect={onDismissReason}
        onClose={() => setDismissTarget(null)}
      />

      {/* ── Dismiss undo snackbar ── */}
      <Animated.View
        style={[
          snackStyles.snack,
          {
            bottom: insets.bottom + 80,
            backgroundColor: isDark ? "#2C2C2E" : "#1C1C1E",
            opacity: snackAnim,
            transform: [
              {
                translateY: snackAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
            pointerEvents: undoStack.length > 0 ? "auto" : "none",
          } as any,
        ]}
      >
        <Text style={snackStyles.label}>
          {undoStack.length} post{undoStack.length !== 1 ? "s" : ""} dismissed
        </Text>
        <TouchableOpacity onPress={handleUndo} style={snackStyles.undoBtn} hitSlop={8}>
          <Text style={[snackStyles.undoText, { color: colors.accent }]}>Undo</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Floating "new posts" pill ── */}
      {activeDiscoverTab !== "find" && (
      <Animated.View
        style={[
          styles.newPostsFloatingWrap,
          {
             // Keep the pill directly below the top bar and tabs. It follows
             // the page-flow header instead of positioning against an overlay.
             top: coreHeaderHeight + 2,
            transform: [{ translateY: Animated.add(headerOffset, popupSlide) }],
            opacity: popupOpacity,
            pointerEvents: popupSnapshot.length > 0 ? "auto" : "none",
          } as any,
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.newPostsPillBtn,
            pillGlass.shadow,
            { opacity: pressed ? 0.82 : 1 },
          ]}
          onPress={handleShowNewPosts}
        >
          <BlurView
            intensity={GLASS.blur.heavy}
            tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
            style={StyleSheet.absoluteFill}
          />
          {/* glass fill */}
          <View style={[StyleSheet.absoluteFill, {
            backgroundColor: pillGlass.fillSubtle,
            borderRadius: 999,
          }]} />
          {/* specular border */}
          <View style={[StyleSheet.absoluteFill, {
            borderRadius: 999,
            borderWidth: 0.75,
            borderColor: pillGlass.border,
          }]} />
          <Ionicons name="arrow-up" size={12} color={colors.text} />
          {/* Up to 3 plain avatar circles — no Avatar component, no rings */}
          <View style={styles.newPostsAvatars}>
            {popupSnapshot.slice(0, 3).map((a, i) => (
              <View
                key={a.id}
                style={[
                  styles.newPostsAvatarCircle,
                  {
                    marginLeft: i > 0 ? -10 : 0,
                    zIndex: 10 - i,
                    borderColor: isDark ? "rgba(255,255,255,0.86)" : "rgba(0,0,0,0.14)",
                  },
                ]}
              >
                {a.avatar_url ? (
                  <CachedImage
                    uri={a.avatar_url}
                    cacheType="avatar"
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.newPostsAvatarFallback, {
                    backgroundColor: isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.08)",
                  }]}>
                    <Text style={[styles.newPostsAvatarInitial, { color: colors.text }]}>
                      {(a.display_name?.[0] ?? "?").toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
          <Text style={[styles.newPostsPillLabel, { color: colors.text }]}>
            {pendingCount > 1 ? `${pendingCount} new posts` : "new posts"}
          </Text>
        </Pressable>
      </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBlock: {
    position: "relative",
    zIndex: 1,
    overflow: "hidden",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  headerSpacer: {
    flex: 1,
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  wordmarkText: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  headerActions: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  signInBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  signInText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabsGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  tabsGroupCompact: {
    flex: 1,
    minWidth: 0,
  },
  tabRowCompact: {
    justifyContent: "flex-start",
    paddingHorizontal: 8,
  },
  tabPillCompact: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingHorizontal: 4,
    minHeight: 44,
    justifyContent: "center",
  },
  tabPillTextCompact: {
    fontSize: 13,
  },
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  tabSpacer: {
    flex: 1,
  },
  tabSpacerCompact: {
    flex: 0,
  },
  searchBtnCompact: {
    width: 40,
    height: 40,
    marginLeft: 4,
  },
  loadMorePill: {
    position: "absolute",
    alignSelf: "center",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    zIndex: 50,
    pointerEvents: "none" as any,
  },
  loadMorePillInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 24,
  },
  loadMorePillText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#fff",
  },
  footerSpinnerRow: {
    alignItems: "center",
    paddingVertical: 24,
  },
  endOfFeed: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  endOfFeedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
  },
  endOfFeedText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.1,
  },
  tabPill: { minWidth: 116, paddingVertical: 12, paddingHorizontal: 22, alignItems: "center" },
  tabPillText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  newTabBadge: {
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  newTabBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  crownModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  crownModalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  crownModalIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#D4A85322",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  crownModalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  crownModalBody: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 20,
  },
  crownModalCta: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  crownModalCtaText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  crownModalClose: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  crownModalCloseText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  card: {
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 10,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "nowrap" },
  cardHandle: { fontSize: 13.5, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  cardName: { fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: -0.1 },
  cardMeta: { fontSize: 11, fontFamily: "Inter_400Regular", letterSpacing: 0.1 },
  cardBio: { fontSize: 11, fontFamily: "Inter_400Regular", letterSpacing: 0.1, marginTop: 2, opacity: 0.6 },
  followBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 9, paddingVertical: 2, borderRadius: 20 },
  followBtnText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardContent: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingLeft: 66,
    paddingRight: 16,
    paddingBottom: 8,
    lineHeight: 23,
  },
  translatedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 66, paddingRight: 16, marginBottom: 8 },
  translatedText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  images: { marginBottom: 8 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 66,
    paddingRight: 16,
    paddingTop: 2,
    paddingBottom: 10,
  },
  footerStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
  },
  footerStatNum: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.1,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  viewCount: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  videoCard: { marginLeft: 66, marginRight: 16, marginBottom: 2 },
  videoThumb: {
    height: 220,
    backgroundColor: "transparent",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  playCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoBadge: {
    position: "absolute",
    bottom: 10,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  videoBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  articleCard: {
    marginLeft: 66,
    marginRight: 16,
    marginVertical: 6,
    borderRadius: 14,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "stretch",
  },
  articleCover: {
    width: 110,
    height: 95,
  },
  articleCardBody: {
    flex: 1,
    padding: 10,
    gap: 4,
    justifyContent: "center",
  },
  articleBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  articleBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  articleExcerpt: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  articleReadLink: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#FF9500",
    marginTop: 4,
  },
  articleReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  articleReadBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  createBtn: { backgroundColor: Colors.brand, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  createBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  ellipsisBtn: { padding: 4 },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    paddingHorizontal: 8,
  },
  menuSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 8,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
    borderRadius: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  menuDivider: {
    height: 0.5,
    marginVertical: 4,
    marginHorizontal: 16,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  postTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    marginHorizontal: 13,
    marginBottom: 6,
    marginTop: 6,
  },
  postTypeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  articleTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
  },
  readArticleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginHorizontal: 13,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  readArticleText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  newPostsPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    marginVertical: 8,
    gap: 6,
  },
  newPostsPillText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  // Floating pill (X / Twitter style)
  newPostsFloatingWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 200,
  },
  newPostsPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    overflow: "hidden",
    paddingVertical: 5,
    paddingLeft: 9,
    paddingRight: 12,
    gap: 5,
  },
  newPostsAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  newPostsAvatarCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#fff",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  newPostsAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  newPostsAvatarInitial: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  newPostsAvatarWrap: {
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: "#fff",
    overflow: "hidden",
  },
  newPostsExtraCount: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  newPostsExtraText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  newPostsBgIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  newPostsPillLabel: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
});

const snackStyles = StyleSheet.create({
  snack: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 12,
    zIndex: 999,
  },
  label: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
  undoBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  undoText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.1,
  },
});


