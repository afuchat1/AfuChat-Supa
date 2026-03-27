import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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
import { cacheMoments, getCachedMoments, isOnline } from "@/lib/offlineStore";
import { notifyPostLike } from "@/lib/notifyUser";
import { sharePost } from "@/lib/share";
import { matchInterests, computeFeedScore, diversifyFeed, type FeedSignals } from "@/lib/feedAlgorithm";
import { useLanguage } from "@/context/LanguageContext";
import { translateText, LANG_LABELS } from "@/lib/translate";

const { width } = Dimensions.get("window");

type PostItem = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  is_verified: boolean;
  is_organization_verified: boolean;
  profile: { display_name: string; handle: string; avatar_url: string | null };
  liked: boolean;
  likeCount: number;
  replyCount: number;
  score: number;
  bookmarked: boolean;
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
      Animated.timing(scale, { toValue: 0.7, duration: 100, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
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

function PostCard({ item, onToggleLike, onToggleBookmark, onImagePress }: { item: PostItem; onToggleLike: (postId: string) => void; onToggleBookmark: (postId: string) => void; onImagePress?: (images: string[], index: number) => void }) {
  const { colors } = useTheme();
  const { preferredLang } = useLanguage();
  const [displayContent, setDisplayContent] = useState(item.content);
  const [isTranslated, setIsTranslated] = useState(false);

  const allImages = item.images.length > 0 ? item.images : item.image_url ? [item.image_url] : [];
  const imgW = allImages.length === 1 ? width - 48 : (width - 56) / 2;

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
    router.push({ pathname: "/post/[id]", params: { id: item.id } });
  }

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: colors.surface }]} onPress={openPost} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}>
          <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={40} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={[styles.cardName, { color: colors.text }]}>{item.profile.display_name}</Text>
            <VerifiedBadge isVerified={item.is_verified} isOrganizationVerified={item.is_organization_verified} size={13} />
          </View>
          <Text style={[styles.cardTime, { color: colors.textMuted }]}>
            @{item.profile.handle} · {formatRelative(item.created_at)}
          </Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
      </View>

      <RichText style={[styles.cardContent, { color: colors.text }]}>{displayContent}</RichText>
      {isTranslated && (
        <View style={styles.translatedBadge}>
          <Ionicons name="language" size={10} color={colors.textMuted} />
          <Text style={[styles.translatedText, { color: colors.textMuted }]}>
            {`Translated · ${LANG_LABELS[preferredLang || ""] ?? preferredLang}`}
          </Text>
        </View>
      )}

      {allImages.length > 0 && (
        <View style={styles.images}>
          {allImages.map((uri, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.9}
              onPress={(e) => { e.stopPropagation(); onImagePress?.(allImages, i); }}
            >
              <Image
                source={{ uri }}
                style={[styles.img, { width: imgW, height: imgW * 0.75 }]}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={[styles.cardFooter, { borderTopColor: colors.separator }]}>
        <TouchableOpacity
          style={styles.action}
          onPress={() => { onToggleLike(item.id); }}
        >
          <Ionicons name={item.liked ? "heart" : "heart-outline"} size={18} color={item.liked ? "#FF3B30" : colors.textMuted} />
          {item.likeCount > 0 && <Text style={[styles.actionText, { color: item.liked ? "#FF3B30" : colors.textMuted }]}>{item.likeCount}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={openPost}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
          {item.replyCount > 0 && <Text style={[styles.actionText, { color: colors.textMuted }]}>{item.replyCount}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={() => sharePost({ postId: item.id, authorName: item.profile.display_name, content: item.content })}>
          <Ionicons name="share-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.viewCount}>
          <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.viewText, { color: colors.textMuted }]}>{item.view_count}</Text>
        </View>
        <BookmarkButton bookmarked={item.bookmarked} onPress={() => onToggleBookmark(item.id)} />
      </View>
    </TouchableOpacity>
  );
}

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [feedTab, setFeedTab] = useState<"for_you" | "following">("for_you");
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [followingEmpty, setFollowingEmpty] = useState(false);
  const PAGE_SIZE = 30;
  const imgViewer = useImageViewer();

  const fetchPosts = useCallback(async (offset: number, isRefresh: boolean, tab?: "for_you" | "following") => {
    const activeTab = tab ?? feedTab;
    if (!isOnline()) {
      if (isRefresh && user) {
        const cached = await getCachedMoments();
        if (cached.length > 0) setPosts(cached);
      }
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
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
          id, author_id, content, image_url, created_at, view_count, language_code,
          profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified),
          post_images(image_url, display_order)
        `)
        .eq("is_blocked", false)
        .in("author_id", followingIds)
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
          is_verified: p.profiles?.is_verified || false,
          is_organization_verified: p.profiles?.is_organization_verified || false,
          profile: { display_name: p.profiles?.display_name || "User", handle: p.profiles?.handle || "user", avatar_url: p.profiles?.avatar_url || null },
          liked: myLikeSet.has(p.id), likeCount: likeMap[p.id] || 0, replyCount: replyMap[p.id] || 0, score: 0, bookmarked: myBookmarkSet.has(p.id),
        }));

        if (isRefresh) setPosts(mapped); else setPosts((prev) => { const ids = new Set(prev.map((p) => p.id)); return [...prev, ...mapped.filter((i) => !ids.has(i.id))]; });
      }
      setLoading(false); setRefreshing(false); setLoadingMore(false);
      return;
    }

    // --- For You tab (existing logic) ---
    const userInterests: string[] = profile?.interests || [];
    const userCountry: string = profile?.country || "";

    const { data } = await supabase
      .from("posts")
      .select(`
        id, author_id, content, image_url, created_at, view_count, language_code,
        profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified, country, interests),
        post_images(image_url, display_order)
      `)
      .eq("is_blocked", false)
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

        const interestMatches = matchInterests(content, userInterests);

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
        };
      });

      const diversified = diversifyFeed(scored);

      if (isRefresh) {
        setPosts(diversified as PostItem[]);
        cacheMoments(diversified as PostItem[]);
      } else {
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newItems = (diversified as PostItem[]).filter((i) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
      }
    }
    setLoading(false);
    setRefreshing(false);
    setLoadingMore(false);
  }, [user, profile]);

  const loadPosts = useCallback((tab?: "for_you" | "following") => fetchPosts(0, true, tab), [fetchPosts]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPosts(posts.length, false, feedTab);
  }, [fetchPosts, posts.length, loadingMore, hasMore, feedTab]);

  useEffect(() => {
    setLoading(true);
    setPosts([]);
    setHasMore(true);
    setFollowingEmpty(false);
    loadPosts(feedTab);
  }, [feedTab]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  useEffect(() => {
    const channel = supabase
      .channel("discover-posts-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        () => loadPosts()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "posts" },
        () => loadPosts()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadPosts]);

  async function toggleBookmark(postId: string) {
    if (!user) { router.push("/(auth)/login"); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    if (post.bookmarked) {
      await supabase.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", user.id);
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, bookmarked: false } : p));
    } else {
      await supabase.from("post_bookmarks").upsert({ post_id: postId, user_id: user.id }, { onConflict: "post_id,user_id" });
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, bookmarked: true } : p));
    }
  }

  async function toggleLike(postId: string) {
    if (!user) { router.push("/(auth)/login"); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const post = posts.find((p) => p.id === postId);
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

        {user ? (
          <TouchableOpacity
            onPress={() => router.push("/moments/create")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add-circle-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => router.push("/(auth)/login")}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.brand, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 }}
          >
            <Ionicons name="log-in-outline" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Sign In</Text>
          </TouchableOpacity>
        )}
      </View>

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
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PostCard item={item} onToggleLike={toggleLike} onToggleBookmark={toggleBookmark} onImagePress={imgViewer.openViewer} />}
          contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingBottom: 90 }}
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
    marginHorizontal: 8,
    borderRadius: 16,
    overflow: "hidden",
    paddingTop: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 10,
  },
  nameRow: { flexDirection: "row", alignItems: "center" },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardContent: { fontSize: 15, fontFamily: "Inter_400Regular", paddingHorizontal: 14, marginBottom: 4, lineHeight: 22 },
  translatedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 14, marginBottom: 8 },
  translatedText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  images: { flexDirection: "row", flexWrap: "wrap", gap: 4, paddingHorizontal: 14, marginBottom: 2 },
  img: { borderRadius: 8 },
  cardFooter: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    gap: 20,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  viewCount: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: "auto" },
  viewText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  createBtn: { backgroundColor: Colors.brand, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  createBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
