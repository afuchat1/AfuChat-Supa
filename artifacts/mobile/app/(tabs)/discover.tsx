import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { showAlert } from "@/lib/alert";
import ViewShot from "react-native-view-shot";
import { useSafeAreaInsets as useCardInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { ImageViewer, useImageViewer } from "@/components/ImageViewer";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { RichText } from "@/components/ui/RichText";
import Colors from "@/constants/colors";
import { PostSkeleton } from "@/components/ui/Skeleton";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { cacheMoments, getCachedMoments, cacheFeedTab, getCachedFeedTab, isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { notifyPostLike } from "@/lib/notifyUser";
import { sharePost } from "@/lib/share";
import { matchInterestsWeighted, recordInteraction, getLearnedInterestBoosts, computeFeedScore, diversifyFeed, type FeedSignals } from "@/lib/feedAlgorithm";
import { useLanguage } from "@/context/LanguageContext";
import { translateText, LANG_LABELS } from "@/lib/translate";
import { useDesktopDetail } from "@/context/DesktopDetailContext";
import { useIsDesktop } from "@/hooks/useIsDesktop";

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
  profile: { display_name: string; handle: string; avatar_url: string | null };
  liked: boolean;
  likeCount: number;
  replyCount: number;
  score: number;
  bookmarked: boolean;
  post_type: string;
  article_title: string | null;
  video_url: string | null;
  isFollowing: boolean;
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function BookmarkButton({ bookmarked, onPress }: { bookmarked: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  function handlePress() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.7, duration: 100, useNativeDriver: Platform.OS !== "web" }),
      Animated.spring(scale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
    onPress();
  }
  return (
    <Animated.View style={{ transform: [{ scale }], marginLeft: "auto" }}>
      <TouchableOpacity onPress={handlePress} hitSlop={8}>
        <Ionicons name={bookmarked ? "bookmark" : "bookmark-outline"} size={18} color={bookmarked ? Colors.gold : "#8E8E93"} />
      </TouchableOpacity>
    </Animated.View>
  );
}

function PostCard({ item, onToggleLike, onToggleBookmark, onToggleFollow, onImagePress, colWidth }: { item: PostItem; onToggleLike: (postId: string) => void; onToggleBookmark: (postId: string) => void; onToggleFollow: (authorId: string) => void; onImagePress?: (images: string[], index: number) => void; colWidth?: number }) {
  const { colors } = useTheme();
  const { preferredLang } = useLanguage();
  const { width: screenW } = useWindowDimensions();
  const cardInsets = useCardInsets();
  const isDesktop = useIsDesktop();
  const { openDetail } = useDesktopDetail();
  const { user: currentUser } = useAuth();
  const [displayContent, setDisplayContent] = useState(item.content);
  const [isTranslated, setIsTranslated] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const cardRef = useRef<ViewShot>(null);
  const isOwnPost = currentUser?.id === item.author_id;
  const showFollowBtn = !isOwnPost && !item.isFollowing;

  const allImages = item.images.length > 0 ? item.images : item.image_url ? [item.image_url] : [];
  const effectiveW = colWidth ?? screenW;
  const singleImgW = effectiveW - 48;
  const multiImgW = (effectiveW - 56) / 2;
  const imgW = allImages.length === 1 ? singleImgW : multiImgW;

  useEffect(() => {
    if (!preferredLang || !item.content?.trim()) { setDisplayContent(item.content); setIsTranslated(false); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      translateText(item.content, preferredLang).then((result) => {
        if (!cancelled && result && result !== item.content) {
          setDisplayContent(result);
          setIsTranslated(true);
        }
      });
    }, Math.random() * 800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [preferredLang, item.content]);

  function openPost() {
    if (item.post_type === "article") {
      router.push({ pathname: "/article/[id]", params: { id: item.id } });
      return;
    }
    if (item.post_type === "video") {
      if (Platform.OS === "web") return;
      router.push({ pathname: "/video/[id]", params: { id: item.id } });
      return;
    }
    if (isDesktop) {
      openDetail({ type: "post", id: item.id });
    } else {
      router.push({ pathname: "/post/[id]", params: { id: item.id } });
    }
  }

  async function capturePostImage() {
    setMenuVisible(false);
    if (!cardRef.current) return;
    setCapturing(true);
    try {
      if (Platform.OS === "web") {
        const html2canvas = (await import("html2canvas")).default;
        const { findDOMNode } = await import("react-dom");
        let el: HTMLElement | null = null;
        try {
          const domNode = findDOMNode(cardRef.current as any);
          if (domNode && domNode instanceof HTMLElement) el = domNode;
        } catch {}
        if (!el && typeof document !== "undefined") {
          el = document.querySelector("[data-post-card=\"" + item.id + "\"]") as HTMLElement | null;
        }
        if (!el) {
          showAlert("Error", "Capture not available.");
          setCapturing(false);
          return;
        }
        const canvas = await html2canvas(el as HTMLElement, {
          useCORS: true,
          allowTaint: false,
          backgroundColor: null,
          scale: 2,
        });
        const dataUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `afuchat-post-${Date.now()}.png`;
        link.click();
      } else {
        if (typeof (cardRef.current as any).capture !== "function") {
          showAlert("Error", "Capture not available.");
          setCapturing(false);
          return;
        }
        const uri = await (cardRef.current as any).capture();
        const Sharing = require("expo-sharing");
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Save Post Image" });
        } else {
          showAlert("Not available", "Sharing is not available on this device.");
        }
      }
    } catch (err) {
      showAlert("Error", "Could not capture post image.");
    }
    setCapturing(false);
  }

  return (
    <>
      <ViewShot ref={cardRef} options={{ format: "png", quality: 1, result: "tmpfile" }}>
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
          onPress={openPost}
          activeOpacity={0.97}
          {...(Platform.OS === "web" ? { dataSet: { postCard: item.id } } as any : {})}
        >
          {/* ── Header ── */}
          <View style={styles.cardHeader}>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}
              activeOpacity={0.8}
            >
              <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={40} />
            </TouchableOpacity>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.nameRow}>
                <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
                  {item.profile.display_name}
                </Text>
                <VerifiedBadge isVerified={item.is_verified} isOrganizationVerified={item.is_organization_verified} size={13} />
              </View>
              <Text style={[styles.cardMeta, { color: colors.textMuted }]} numberOfLines={1}>
                @{item.profile.handle} · {formatRelative(item.created_at)}
              </Text>
            </View>
            {showFollowBtn && (
              <TouchableOpacity
                style={styles.followBtn}
                onPress={() => onToggleFollow(item.author_id)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={15} color="#fff" />
                <Text style={styles.followBtnText}>Follow</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => { Haptics.impact?.(); setMenuVisible(true); }}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ── VIDEO: thumbnail preview card ── */}
          {item.post_type === "video" && item.video_url && (
            Platform.OS === "web" ? (
              <View style={styles.videoCard}>
                <View style={styles.videoThumb}>
                  {/* @ts-ignore: HTML video element for web thumbnail extraction */}
                  <video
                    src={item.video_url}
                    preload="metadata"
                    muted
                    playsInline
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" } as any}
                  />
                  <View style={StyleSheet.absoluteFill}>
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                      <View style={styles.playCircle}>
                        <Ionicons name="play" size={22} color="#fff" />
                      </View>
                    </View>
                    <View style={{ position: "absolute", top: 8, right: 10, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 10, fontFamily: "Inter_600SemiBold" }}>App only</Text>
                    </View>
                  </View>
                  <View style={styles.videoBadge}>
                    <Ionicons name="videocam" size={11} color="#fff" />
                    <Text style={styles.videoBadgeText}>Video</Text>
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => router.push({ pathname: "/video/[id]", params: { id: item.id } })}
                style={styles.videoCard}
              >
                <View style={styles.videoThumb}>
                  <Image
                    source={{ uri: item.image_url || item.video_url }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
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
            )
          )}

          {/* ── ARTICLE: type badge + title ── */}
          {item.post_type === "article" && (
            <View style={[styles.articleBadgeRow, { backgroundColor: Colors.brand + "12" }]}>
              <Ionicons name="document-text" size={12} color={Colors.brand} />
              <Text style={[styles.articleBadgeText, { color: Colors.brand }]}>Article</Text>
            </View>
          )}
          {item.post_type === "article" && item.article_title ? (
            <Text style={[styles.articleTitle, { color: colors.text }]}>{item.article_title}</Text>
          ) : null}

          {/* ── Content text ── */}
          {(displayContent || "").trim().length > 0 && (
            <RichText
              style={[styles.cardContent, { color: colors.text }]}
              numberOfLines={item.post_type === "article" ? 3 : undefined}
            >
              {displayContent}
            </RichText>
          )}

          {isTranslated && (
            <View style={styles.translatedBadge}>
              <Ionicons name="language" size={11} color={colors.textMuted} />
              <Text style={[styles.translatedText, { color: colors.textMuted }]}>
                {`Translated · ${LANG_LABELS[preferredLang || ""] ?? preferredLang}`}
              </Text>
            </View>
          )}

          {/* ── Article: read CTA ── */}
          {item.post_type === "article" && (
            <TouchableOpacity onPress={openPost} style={styles.readMore}>
              <Text style={[styles.readMoreText, { color: Colors.brand }]}>Read article</Text>
              <Ionicons name="arrow-forward" size={13} color={Colors.brand} />
            </TouchableOpacity>
          )}

          {/* ── Images ── */}
          {allImages.length > 0 && item.post_type !== "video" && (
            <View style={[styles.images, allImages.length > 1 && { flexDirection: "row", flexWrap: "wrap", gap: 2 }]}>
              {allImages.map((uri, i) => (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.9}
                  onPress={(e) => { e.stopPropagation(); onImagePress?.(allImages, i); }}
                  style={allImages.length > 1 ? { flex: 1 } : undefined}
                >
                  <Image
                    source={{ uri }}
                    style={{
                      width: allImages.length === 1 ? effectiveW : multiImgW,
                      height: allImages.length === 1 ? Math.round(effectiveW * 0.56) : Math.round(multiImgW * 0.75),
                    }}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Footer ── */}
          <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={styles.action} onPress={() => onToggleLike(item.id)}>
              <Ionicons
                name={item.liked ? "heart" : "heart-outline"}
                size={18}
                color={item.liked ? "#FF3B30" : colors.textMuted}
              />
              {item.likeCount > 0 && (
                <Text style={[styles.actionText, { color: item.liked ? "#FF3B30" : colors.textMuted }]}>
                  {item.likeCount}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.action} onPress={openPost}>
              <Ionicons name="chatbubble-outline" size={17} color={colors.textMuted} />
              {item.replyCount > 0 && (
                <Text style={[styles.actionText, { color: colors.textMuted }]}>{item.replyCount}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.action}
              onPress={() => sharePost({ postId: item.id, authorName: item.profile.display_name, content: item.content })}
            >
              <Ionicons name="arrow-redo-outline" size={17} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <View style={styles.viewCount}>
              <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.viewText, { color: colors.textMuted }]}>{item.view_count}</Text>
            </View>
            <BookmarkButton bookmarked={item.bookmarked} onPress={() => onToggleBookmark(item.id)} />
          </View>
        </TouchableOpacity>
      </ViewShot>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuSheet, { backgroundColor: colors.surface, paddingBottom: cardInsets.bottom + 12 }]}>
            <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuVisible(false); sharePost({ postId: item.id, authorName: item.profile.display_name, content: item.content }); }}
            >
              <Ionicons name="share-outline" size={22} color={Colors.brand} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Share Post</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={capturePostImage} disabled={capturing}>
              {capturing
                ? <ActivityIndicator size={22} color={Colors.brand} />
                : <Ionicons name="image-outline" size={22} color={Colors.brand} />
              }
              <Text style={[styles.menuItemText, { color: colors.text }]}>Save as Image</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
              <Ionicons name="close-outline" size={22} color={colors.textMuted} />
              <Text style={[styles.menuItemText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export default function DiscoverScreen() {
  "use no memo";
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isDesktop = useIsDesktop();
  const SIDEBAR_W = 280;
  const RIGHT_PANEL_W = screenWidth >= 1280 ? 380 : 0;
  const centerW = isDesktop ? screenWidth - SIDEBAR_W - RIGHT_PANEL_W : screenWidth;
  const desktopColWidth = isDesktop ? Math.floor((centerW - 32) / 2) : undefined;
  const [feedTab, setFeedTab] = useState<"for_you" | "following">("for_you");
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreatePicker, setShowCreatePicker] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [followingEmpty, setFollowingEmpty] = useState(false);
  const [bgRefreshing, setBgRefreshing] = useState(false);
  const PAGE_SIZE = 30;
  const imgViewer = useImageViewer();

  const tabPostsCache = useRef<Record<"for_you" | "following", PostItem[]>>({ for_you: [], following: [] });
  const tabCacheTimestamp = useRef<Record<"for_you" | "following", number>>({ for_you: 0, following: 0 });
  const learnedWeightsRef = useRef<Record<string, number>>({});
  const postsRef = useRef<PostItem[]>([]);
  const feedTabRef = useRef<"for_you" | "following">("for_you");

  useEffect(() => { postsRef.current = posts; }, [posts]);
  useEffect(() => { feedTabRef.current = feedTab; }, [feedTab]);

  useEffect(() => {
    getLearnedInterestBoosts().then((w) => { learnedWeightsRef.current = w; });
  }, []);

  const fetchPosts = useCallback(async (offset: number, isRefresh: boolean, tab?: "for_you" | "following", background?: boolean) => {
    const activeTab = tab ?? feedTabRef.current;
    if (background) setBgRefreshing(true);
    try {
    if (!isOnline()) {
      if (!background) {
        if (isRefresh) {
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

      const { data: followData } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);

      const followingIds = (followData || []).map((f: any) => f.following_id);

      if (followingIds.length === 0) {
        setFollowingEmpty(true);
        if (isRefresh) setPosts([]);
        setLoading(false); setRefreshing(false); setLoadingMore(false);
        return;
      }
      setFollowingEmpty(false);

      const { data } = await supabase
        .from("posts")
        .select(`
          id, author_id, content, image_url, created_at, view_count, visibility, language_code,
          post_type, article_title, video_url,
          profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified),
          post_images(image_url, display_order)
        `)
        .eq("is_blocked", false)
        .in("author_id", followingIds)
        .in("visibility", ["public", "followers"])
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (data) {
        if (data.length < PAGE_SIZE) setHasMore(false); else setHasMore(true);

        const postIds = data.map((p: any) => p.id);
        const [{ data: myLikes }, { data: replyCounts }, { data: myBookmarks }, { data: likeCounts }] = await Promise.all([
          postIds.length > 0 && user ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id) : { data: [] },
          postIds.length > 0 ? supabase.from("post_replies").select("post_id").in("post_id", postIds) : { data: [] },
          postIds.length > 0 && user ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id) : { data: [] },
          postIds.length > 0 ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds) : { data: [] },
        ]);

        const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
        const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id));
        const likeMap: Record<string, number> = {};
        for (const l of (likeCounts || [])) { likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1; }
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
          profile: { display_name: p.profiles?.display_name || "User", handle: p.profiles?.handle || "user", avatar_url: p.profiles?.avatar_url || null },
          liked: myLikeSet.has(p.id), likeCount: likeMap[p.id] || 0, replyCount: replyMap[p.id] || 0, score: 0, bookmarked: myBookmarkSet.has(p.id),
          post_type: p.post_type || "post", article_title: p.article_title || null, video_url: p.video_url || null,
          isFollowing: true,
        }));

        if (isRefresh) {
          setPosts(mapped);
          tabPostsCache.current[activeTab] = mapped;
          tabCacheTimestamp.current[activeTab] = Date.now();
          cacheFeedTab(activeTab, mapped);
        } else {
          setPosts((prev) => { const ids = new Set(prev.map((p) => p.id)); return [...prev, ...mapped.filter((i) => !ids.has(i.id))]; });
        }
      }
      if (!background) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
      return;
    }

    // --- For You tab (existing logic) ---
    const userInterests: string[] = profile?.interests || [];
    const userCountry: string = profile?.country || "";

    const { data } = await supabase
      .from("posts")
      .select(`
        id, author_id, content, image_url, created_at, view_count, visibility, language_code,
        post_type, article_title, video_url,
        profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified, country, interests),
        post_images(image_url, display_order)
      `)
      .eq("is_blocked", false)
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (data) {
      if (data.length < PAGE_SIZE) setHasMore(false);
      else setHasMore(true);

      const postIds = data.map((p: any) => p.id);
      const authorIds = [...new Set(data.map((p: any) => p.author_id))];

      const [
        { data: likeCounts },
        { data: myLikes },
        { data: replyCounts },
        { data: myAuthorLikes },
        { data: followingData },
        { data: myReplies },
        { data: myBookmarks },
      ] = await Promise.all([
        postIds.length > 0
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds)
          : { data: [] },
        postIds.length > 0 && user
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id)
          : { data: [] },
        postIds.length > 0
          ? supabase.from("post_replies").select("post_id").in("post_id", postIds)
          : { data: [] },
        authorIds.length > 0 && user
          ? supabase.from("post_acknowledgments")
              .select("post_id, posts!inner(author_id)")
              .eq("user_id", user.id)
              .in("posts.author_id", authorIds)
              .limit(500)
          : { data: [] },
        authorIds.length > 0 && user
          ? supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", authorIds)
          : { data: [] },
        authorIds.length > 0 && user
          ? supabase.from("post_replies")
              .select("post_id, posts!inner(author_id)")
              .eq("author_id", user.id)
              .in("posts.author_id", authorIds)
              .limit(500)
          : { data: [] },
        postIds.length > 0 && user
          ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id)
          : { data: [] },
      ]);

      const likeMap: Record<string, number> = {};
      for (const l of (likeCounts || [])) { likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1; }

      const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
      const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id));

      const replyMap: Record<string, number> = {};
      for (const r of (replyCounts || [])) { replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1; }

      const followingSet = new Set((followingData || []).map((f: any) => f.following_id));

      const authorInteractionMap: Record<string, number> = {};
      for (const al of (myAuthorLikes || [])) {
        const authorId = (al as any).posts?.author_id;
        if (authorId) authorInteractionMap[authorId] = (authorInteractionMap[authorId] || 0) + 1;
      }
      for (const ar of (myReplies || [])) {
        const authorId = (ar as any).posts?.author_id;
        if (authorId) authorInteractionMap[authorId] = (authorInteractionMap[authorId] || 0) + 2;
      }

      const authorPostCount: Record<string, number> = {};
      for (const p of data) {
        const aid = (p as any).author_id;
        authorPostCount[aid] = (authorPostCount[aid] || 0) + 1;
      }

      const scored = data.map((p: any) => {
        const likeCount = likeMap[p.id] || 0;
        const replyCount = replyMap[p.id] || 0;
        const hasImages = (p.post_images?.length > 0) || !!p.image_url;
        const content = p.content || "";
        const authorCountry = p.profiles?.country || "";

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
          },
          liked: myLikeSet.has(p.id),
          likeCount,
          replyCount,
          score,
          bookmarked: myBookmarkSet.has(p.id),
          post_type: p.post_type || "post",
          article_title: p.article_title || null,
          video_url: p.video_url || null,
          isFollowing: followingSet.has(p.author_id),
        };
      });

      const diversified = diversifyFeed(scored);

      if (isRefresh) {
        setPosts(diversified as PostItem[]);
        tabPostsCache.current[activeTab] = diversified as PostItem[];
        tabCacheTimestamp.current[activeTab] = Date.now();
        cacheFeedTab(activeTab, diversified);
        cacheMoments(diversified as PostItem[]);
      } else {
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newItems = (diversified as PostItem[]).filter((i) => !existingIds.has(i.id));
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
      setBgRefreshing(false);
    }
  }, [user, profile]);

  const loadPosts = useCallback(
    (tab?: "for_you" | "following", background?: boolean) => fetchPosts(0, true, tab, background),
    [fetchPosts]
  );

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPosts(postsRef.current.length, false, feedTabRef.current);
  }, [fetchPosts, loadingMore, hasMore]);

  const loadPostsRef = useRef(loadPosts);
  useEffect(() => { loadPostsRef.current = loadPosts; }, [loadPosts]);

  // Tab switch — show loading, then load fresh data (use cache as quick fallback)
  useEffect(() => {
    const STALE_MS = 3 * 60 * 1000;
    const cached = tabPostsCache.current[feedTab];
    const cacheAge = Date.now() - tabCacheTimestamp.current[feedTab];

    setPosts([]);
    setHasMore(true);
    setFollowingEmpty(false);

    if (cached.length > 0 && cacheAge < STALE_MS) {
      setPosts(cached);
      setLoading(false);
    } else {
      setLoading(true);
      loadPostsRef.current(feedTab, false);
    }
  }, [feedTab]);

  // Mount: preload both tabs from AsyncStorage, then background-refresh For You
  useEffect(() => {
    (async () => {
      const [fyCache, flCache] = await Promise.all([
        getCachedFeedTab("for_you"),
        getCachedFeedTab("following"),
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
      const hasFyCache = (fyCache?.posts?.length ?? 0) > 0;
      if (isOnline()) {
        loadPostsRef.current("for_you", hasFyCache);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth/profile change — refresh active tab in background if posts already showing
  useEffect(() => {
    if (!user && !profile) return;
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
    const channel = supabase
      .channel("discover-posts-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, () => {
        const hasPosts = postsRef.current.length > 0;
        loadPostsRef.current(feedTabRef.current, hasPosts);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, () => {
        const hasPosts = postsRef.current.length > 0;
        loadPostsRef.current(feedTabRef.current, hasPosts);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_acknowledgments" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        supabase.from("post_acknowledgments").select("id", { count: "exact", head: true }).eq("post_id", postId)
          .then(({ count }) => {
            setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, likeCount: count || 0 } : p));
          });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_replies" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        supabase.from("post_replies").select("id", { count: "exact", head: true }).eq("post_id", postId)
          .then(({ count }) => {
            setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, replyCount: count || 0 } : p));
          });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function toggleBookmark(postId: string) {
    if (!user) { router.push("/(auth)/login"); return; }
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
        learnedWeightsRef.current = await getLearnedInterestBoosts();
      });
    }
  }

  async function toggleLike(postId: string) {
    if (!user) { router.push("/(auth)/login"); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const post = postsRef.current.find((p) => p.id === postId);
    if (!post) return;

    if (post.liked) {
      const { error } = await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
      if (!error) {
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p)
        );
      }
    } else {
      const { error } = await supabase.from("post_acknowledgments").insert({ post_id: postId, user_id: user.id });
      if (!error) {
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p)
        );
        const content = [post.content, post.article_title].filter(Boolean).join(" ");
        recordInteraction(content, "like").then(async () => {
          learnedWeightsRef.current = await getLearnedInterestBoosts();
        });
        if (post.author_id !== user.id) {
          notifyPostLike({
            postAuthorId: post.author_id,
            likerName: profile?.display_name || "Someone",
            likerUserId: user.id,
            postId,
          });
        }
        try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_liked"); } catch (_) {}
      }
    }
  }

  async function toggleFollow(authorId: string) {
    if (!user) { router.push("/(auth)/login"); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await supabase.from("follows").upsert({ follower_id: user.id, following_id: authorId }, { onConflict: "follower_id,following_id" });
    if (!error) {
      setPosts((prev) => prev.map((p) => p.author_id === authorId ? { ...p, isFollowing: true } : p));
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <OfflineBanner />
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        {/* Tab switcher */}
        <View style={[styles.tabRow, { backgroundColor: colors.backgroundTertiary }]}>
          <TouchableOpacity
            style={[styles.tabPill, feedTab === "for_you" && { backgroundColor: Colors.brand }]}
            onPress={() => setFeedTab("for_you")}
          >
            <Text style={[styles.tabPillText, { color: feedTab === "for_you" ? "#fff" : colors.textMuted }]}>
              For You
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabPill, feedTab === "following" && { backgroundColor: Colors.brand }]}
            onPress={() => {
              if (!user) { router.push("/(auth)/login"); return; }
              setFeedTab("following");
            }}
          >
            <Text style={[styles.tabPillText, { color: feedTab === "following" ? "#fff" : colors.textMuted }]}>
              Following
            </Text>
          </TouchableOpacity>
        </View>

        {!user && (
          <TouchableOpacity
            onPress={() => router.push("/(auth)/login")}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.brand, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 }}
          >
            <Ionicons name="log-in-outline" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Sign In</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Background refresh indicator */}
      {bgRefreshing && (
        <View style={[styles.bgRefreshBar, { backgroundColor: Colors.brand + "18" }]}>
          <ActivityIndicator size={10} color={Colors.brand} />
          <Text style={[styles.bgRefreshText, { color: Colors.brand }]}>Updating feed…</Text>
        </View>
      )}

      {/* Following tab — not signed in */}
      {feedTab === "following" && !user ? (
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Sign in to see Following</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Follow people to see their posts here</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.createBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      ) : feedTab === "following" && followingEmpty ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No one followed yet</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Follow people to see their posts here</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => setFeedTab("for_you")}>
            <Text style={styles.createBtnText}>Browse For You</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={{ padding: 8, gap: 8 }}>{[1,2,3].map(i => <PostSkeleton key={i} />)}</View>
      ) : (
        <FlatList
          key={isDesktop ? "desktop-2col" : "mobile-1col"}
          data={posts}
          numColumns={isDesktop ? 2 : 1}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={isDesktop ? { flex: 1, maxWidth: desktopColWidth } : undefined}>
              <PostCard
                item={item}
                onToggleLike={toggleLike}
                onToggleBookmark={toggleBookmark}
                onToggleFollow={toggleFollow}
                onImagePress={imgViewer.openViewer}
                colWidth={desktopColWidth}
              />
            </View>
          )}
          columnWrapperStyle={isDesktop ? { gap: 0, paddingHorizontal: 8 } : undefined}
          contentContainerStyle={{ gap: isDesktop ? 0 : 8, paddingVertical: 8, paddingBottom: insets.bottom + 52 + 80 + 50 }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); setHasMore(true); loadPosts(feedTab); }}
              tintColor={Colors.brand}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator color={Colors.brand} />
              </View>
            ) : null
          }
        />
      )}
      {user && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: Colors.brand, bottom: insets.bottom + 52 + 16 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCreatePicker(true); }}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Create type picker */}
      <Modal
        visible={showCreatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreatePicker(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setShowCreatePicker(false)}
        >
          <View style={[styles.createPickerSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.createPickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.createPickerTitle, { color: colors.text }]}>What would you like to create?</Text>
            {[
              { icon: "create-outline", label: "Post", desc: "Share a thought, photo, or link", route: "/moments/create", color: Colors.brand },
              { icon: "document-text-outline", label: "Article", desc: "Write a long-form article", route: "/moments/create-article", color: "#007AFF" },
              ...(Platform.OS !== "web" ? [{ icon: "videocam-outline", label: "Video", desc: "Share a short video clip", route: "/moments/create-video", color: "#FF3B30" }] : []),
            ].map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={[styles.createPickerOption, { backgroundColor: colors.backgroundTertiary }]}
                onPress={() => { setShowCreatePicker(false); setTimeout(() => router.push(opt.route as any), 150); }}
              >
                <View style={[styles.createPickerIconBox, { backgroundColor: opt.color + "18" }]}>
                  <Ionicons name={opt.icon as any} size={24} color={opt.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.createPickerLabel, { color: colors.text }]}>{opt.label}</Text>
                  <Text style={[styles.createPickerDesc, { color: colors.textMuted }]}>{opt.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      <ImageViewer
        images={imgViewer.images}
        initialIndex={imgViewer.index}
        visible={imgViewer.visible}
        onClose={imgViewer.closeViewer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  tabRow: { flexDirection: "row", borderRadius: 22, padding: 3, flex: 1 },
  tabPill: { flex: 1, paddingVertical: 7, borderRadius: 19, alignItems: "center" },
  tabPillText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  card: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardName: { fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: -0.1 },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  followBtn: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.brand, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  followBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  cardContent: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 16,
    paddingBottom: 12,
    lineHeight: 23,
  },
  translatedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, marginBottom: 8 },
  translatedText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  images: { marginBottom: 0 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 18,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  viewCount: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  videoCard: { marginBottom: 2 },
  videoThumb: {
    height: 220,
    backgroundColor: "#0a0a0a",
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
  articleBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  articleBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  readMore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  readMoreText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
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
  fab: {
    position: "absolute",
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
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
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 13,
    marginBottom: 6,
    lineHeight: 24,
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
  createPickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 10,
  },
  createPickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 10,
  },
  createPickerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  createPickerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
  },
  createPickerIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  createPickerLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  createPickerDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  bgRefreshBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 5,
  },
  bgRefreshText: { fontSize: 11, fontFamily: "Inter_500Medium" },
});
