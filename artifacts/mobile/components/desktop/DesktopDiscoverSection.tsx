import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useDesktopDetail } from "@/context/DesktopDetailContext";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { RichText } from "@/components/ui/RichText";
import { DesktopRightPanel } from "@/components/DesktopRightPanel";
import { sharePost } from "@/lib/share";
import { useDataMode } from "@/context/DataModeContext";

const BRAND = "#00BCD4";

type FeedTab = "for_you" | "following";

type Post = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  images: string[];
  post_type: string | null;
  video_url: string | null;
  article_title: string | null;
  created_at: string;
  view_count: number;
  like_count: number;
  reply_count: number;
  author: {
    id: string;
    display_name: string;
    handle: string;
    avatar_url: string | null;
    is_verified: boolean;
    is_organization_verified: boolean;
  } | null;
  liked_by_me: boolean;
};

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function LoginPrompt({ visible, onClose, colors }: { visible: boolean; onClose: () => void; colors: any }) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <TouchableOpacity style={modal.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={[modal.card, { backgroundColor: colors.card }]}>
          <Ionicons name="person-circle-outline" size={52} color={BRAND} style={{ marginBottom: 10 }} />
          <Text style={[modal.title, { color: colors.text }]}>Sign in to interact</Text>
          <Text style={[modal.sub, { color: colors.textMuted }]}>
            Create an account or log in to like, comment and join the conversation.
          </Text>
          <TouchableOpacity
            style={[modal.loginBtn, { backgroundColor: BRAND }]}
            onPress={() => { onClose(); router.push("/(auth)/login" as any); }}
          >
            <Text style={modal.loginBtnText}>Log in</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[modal.registerBtn, { borderColor: BRAND }]}
            onPress={() => { onClose(); router.push("/(auth)/register" as any); }}
          >
            <Text style={[modal.registerBtnText, { color: BRAND }]}>Create account</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const modal = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  card: { width: 340, borderRadius: 20, padding: 28, alignItems: "center", gap: 10 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  loginBtn: { width: "100%" as any, paddingVertical: 13, borderRadius: 24, alignItems: "center", marginTop: 6 },
  loginBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  registerBtn: { width: "100%" as any, paddingVertical: 12, borderRadius: 24, alignItems: "center", borderWidth: 1.5 },
  registerBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

function ComposeBox({ profile, colors, isLoggedIn, onAuthRequired, onPost }: {
  profile: any; colors: any; isLoggedIn: boolean; onAuthRequired: () => void;
  onPost: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  async function handlePost() {
    if (!text.trim() || posting) return;
    setPosting(true);
    await onPost(text.trim());
    setText("");
    setPosting(false);
  }

  if (!isLoggedIn) {
    return (
      <TouchableOpacity
        onPress={onAuthRequired}
        activeOpacity={0.92}
        style={[styles.composeBox, { borderBottomColor: colors.border }]}
      >
        <Avatar uri={null} name="G" size={40} />
        <View style={[styles.composePlaceholder, { borderColor: colors.border }]}>
          <Text style={[styles.composePlaceholderText, { color: colors.textMuted }]}>
            What's happening?
          </Text>
          <View style={[styles.composePostBtn, { backgroundColor: BRAND }]}>
            <Text style={styles.composePostBtnText}>Post</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.composeBox, { borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: profile?.id } } as any)} activeOpacity={0.85}>
        <Avatar uri={profile?.avatar_url || null} name={profile?.display_name || "Me"} size={40} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <TextInput
          multiline
          style={[styles.composeInput, { color: colors.text }]}
          placeholder="What's happening?"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
        />
        <View style={[styles.composeToolbar, { borderTopColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <TouchableOpacity style={styles.toolbarBtn} onPress={() => router.push("/moments/create" as any)}>
              <Ionicons name="image-outline" size={20} color={BRAND} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolbarBtn} onPress={() => {}}>
              <Ionicons name="happy-outline" size={20} color={BRAND} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolbarBtn} onPress={() => {}}>
              <Ionicons name="location-outline" size={20} color={BRAND} />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {text.length > 0 && (
              <Text style={[styles.charCount, { color: text.length > 260 ? "#F4212E" : colors.textMuted }]}>
                {280 - text.length}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.composePostBtn, { backgroundColor: BRAND, opacity: !text.trim() || posting ? 0.5 : 1 }]}
              onPress={handlePost}
              disabled={!text.trim() || posting}
              activeOpacity={0.88}
            >
              {posting ? (
                <ActivityIndicator color="#fff" size="small" style={{ width: 36 }} />
              ) : (
                <Text style={styles.composePostBtnText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  activeIcon,
  count,
  isActive,
  activeColor,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  activeIcon?: React.ComponentProps<typeof Ionicons>["name"];
  count?: number;
  isActive?: boolean;
  activeColor?: string;
  color: string;
  onPress: (e: any) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps = Platform.OS === "web"
    ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
    : {};

  const displayColor = isActive ? (activeColor || color) : color;

  return (
    <TouchableOpacity
      style={[styles.actionBtn, hovered && { backgroundColor: (activeColor || BRAND) + "18" }]}
      onPress={onPress}
      activeOpacity={0.75}
      {...(hoverProps as any)}
    >
      <Ionicons name={isActive && activeIcon ? activeIcon : icon} size={18} color={displayColor} />
      {count != null && count > 0 && (
        <Text style={[styles.actionCount, { color: displayColor }]}>
          {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function PostCard({
  post,
  colors,
  onLike,
  onOpen,
  isLoggedIn,
  onAuthRequired,
  feedWidth,
}: {
  post: Post;
  colors: any;
  onLike: (id: string) => void;
  onOpen: (id: string) => void;
  isLoggedIn: boolean;
  onAuthRequired: () => void;
  feedWidth: number;
}) {
  const { isLowData } = useDataMode();
  const allImages = post.images?.length > 0 ? post.images : post.image_url ? [post.image_url] : [];
  const imgAreaW = feedWidth - 72;
  const multiImgW = (imgAreaW - 4) / 2;

  return (
    <TouchableOpacity
      onPress={() => onOpen(post.id)}
      activeOpacity={0.97}
      style={[styles.card, { borderBottomColor: colors.border }]}
    >
      {/* Left: Avatar column */}
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation?.();
          if (!isLoggedIn) { onAuthRequired(); return; }
          post.author && router.push({ pathname: "/contact/[id]", params: { id: post.author.id } });
        }}
        activeOpacity={0.85}
        style={styles.avatarCol}
      >
        <Avatar uri={post.author?.avatar_url || null} name={post.author?.display_name || "?"} size={40} />
      </TouchableOpacity>

      {/* Right: Content column */}
      <View style={styles.contentCol}>
        {/* Header row */}
        <View style={styles.postHeader}>
          <Text style={[styles.postName, { color: colors.text }]} numberOfLines={1}>
            {post.author?.display_name || "User"}
          </Text>
          {post.author?.is_verified && (
            <VerifiedBadge
              isVerified={post.author.is_verified}
              isOrganizationVerified={post.author.is_organization_verified}
              size={13}
            />
          )}
          <Text style={[styles.postMeta, { color: colors.textMuted }]} numberOfLines={1}>
            {" "}@{post.author?.handle} · {timeAgo(post.created_at)}
          </Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation?.(); }}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons name="ellipsis-horizontal" size={17} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {(post.content || "").trim().length > 0 && (
          <RichText style={[styles.postContent, { color: colors.text }]} linkColor={BRAND}>
            {post.content}
          </RichText>
        )}

        {/* Article card */}
        {post.post_type === "article" && post.article_title && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={(e) => { e.stopPropagation?.(); onOpen(post.id); }}
            style={[styles.articleCard, { borderColor: colors.border }]}
          >
            <View style={styles.articleBadgeRow}>
              <Ionicons name="document-text-outline" size={12} color={BRAND} />
              <Text style={[styles.articleBadgeText, { color: BRAND }]}>ARTICLE</Text>
            </View>
            <Text style={[styles.articleTitle, { color: colors.text }]} numberOfLines={2}>
              {post.article_title}
            </Text>
            {(post.content || "").trim().length > 0 && (
              <Text style={[styles.articleExcerpt, { color: colors.textMuted }]} numberOfLines={2}>
                {post.content}
              </Text>
            )}
            {allImages.length > 0 && (
              <ExpoImage
                source={{ uri: allImages[0] }}
                style={styles.articleThumb}
                contentFit="cover"
                cachePolicy={isLowData ? "disk" : "memory-disk"}
                priority={isLowData ? "low" : "normal"}
              />
            )}
          </TouchableOpacity>
        )}

        {/* Video post */}
        {post.post_type === "video" && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={(e) => { e.stopPropagation?.(); onOpen(post.id); }}
            style={[styles.videoCard, { width: imgAreaW, height: Math.round(imgAreaW * 0.56) }]}
          >
            {post.image_url ? (
              <ExpoImage source={{ uri: post.image_url }} style={styles.videoThumb} contentFit="cover" cachePolicy={isLowData ? "disk" : "memory-disk"} />
            ) : (
              <View style={[styles.videoThumb, { backgroundColor: "#000" }]} />
            )}
            <View style={styles.videoOverlay}>
              <View style={styles.playBtn}>
                <Ionicons name="play" size={26} color="#fff" />
              </View>
              {Platform.OS === "web" && (
                <View style={styles.appOnlyBadge}>
                  <Ionicons name="phone-portrait-outline" size={11} color="#fff" />
                  <Text style={styles.appOnlyText}>App only</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* Images (regular posts) */}
        {post.post_type !== "video" && post.post_type !== "article" && allImages.length > 0 && (
          <View style={[styles.images, allImages.length > 1 && { flexDirection: "row", gap: 2 }]}>
            {allImages.slice(0, 4).map((uri, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.9}
                onPress={(e) => { e.stopPropagation?.(); onOpen(post.id); }}
                style={allImages.length > 1 ? { flex: 1 } : undefined}
              >
                <ExpoImage
                  source={{ uri }}
                  style={{
                    width: allImages.length === 1 ? imgAreaW : multiImgW,
                    height: allImages.length === 1 ? Math.round(imgAreaW * 0.56) : Math.round(multiImgW * 0.75),
                    borderRadius: 12,
                  }}
                  contentFit="cover"
                  cachePolicy={isLowData ? "disk" : "memory-disk"}
                  priority={i === 0 ? (isLowData ? "low" : "high") : "low"}
                  transition={150}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Action bar */}
        <View style={styles.actionBar}>
          <ActionButton
            icon="chatbubble-outline"
            color={colors.textMuted}
            activeColor={BRAND}
            count={post.reply_count}
            onPress={(e) => { e.stopPropagation?.(); if (!isLoggedIn) { onAuthRequired(); return; } onOpen(post.id); }}
          />
          <ActionButton
            icon="heart-outline"
            activeIcon="heart"
            color={colors.textMuted}
            activeColor="#F91880"
            isActive={post.liked_by_me}
            count={post.like_count}
            onPress={(e) => { e.stopPropagation?.(); if (!isLoggedIn) { onAuthRequired(); return; } onLike(post.id); }}
          />
          {post.view_count > 0 && (
            <ActionButton
              icon="bar-chart-outline"
              color={colors.textMuted}
              count={post.view_count}
              onPress={(e) => { e.stopPropagation?.(); }}
            />
          )}
          <ActionButton
            icon="arrow-redo-outline"
            color={colors.textMuted}
            activeColor={BRAND}
            onPress={(e) => {
              e.stopPropagation?.();
              if (!isLoggedIn) { onAuthRequired(); return; }
              sharePost({ postId: post.id, authorName: post.author?.display_name || "User", content: post.content });
            }}
          />
          <ActionButton
            icon="bookmark-outline"
            activeIcon="bookmark"
            color={colors.textMuted}
            activeColor={BRAND}
            onPress={(e) => {
              e.stopPropagation?.();
              if (!isLoggedIn) { onAuthRequired(); return; }
            }}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

async function fetchPostsForIds(
  postIds: string[],
  userId?: string
): Promise<{ likeMap: Record<string, number>; replyMap: Record<string, number>; likedSet: Set<string> }> {
  if (postIds.length === 0) return { likeMap: {}, replyMap: {}, likedSet: new Set() };

  const [{ data: likeCounts }, { data: replyCounts }, { data: myLikes }] = await Promise.all([
    supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
    supabase.from("post_replies").select("post_id").in("post_id", postIds),
    userId
      ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", userId)
      : { data: [] },
  ]);

  const likeMap: Record<string, number> = {};
  for (const l of (likeCounts || [])) likeMap[(l as any).post_id] = (likeMap[(l as any).post_id] || 0) + 1;
  const replyMap: Record<string, number> = {};
  for (const r of (replyCounts || [])) replyMap[(r as any).post_id] = (replyMap[(r as any).post_id] || 0) + 1;
  const likedSet = new Set((myLikes || []).map((l: any) => l.post_id));

  return { likeMap, replyMap, likedSet };
}

function mapRaw(raw: any[], likeMap: Record<string, number>, replyMap: Record<string, number>, likedSet: Set<string>): Post[] {
  return raw.map((p: any) => ({
    id: p.id,
    author_id: p.author_id,
    content: p.content || "",
    image_url: p.image_url,
    images: (p.post_images || []).sort((a: any, b: any) => a.display_order - b.display_order).map((i: any) => i.image_url),
    post_type: p.post_type || null,
    video_url: p.video_url || null,
    article_title: p.article_title || null,
    created_at: p.created_at,
    view_count: p.view_count || 0,
    like_count: likeMap[p.id] || 0,
    reply_count: replyMap[p.id] || 0,
    author: p.profiles ? {
      id: p.profiles.id,
      display_name: p.profiles.display_name || "User",
      handle: p.profiles.handle || "user",
      avatar_url: p.profiles.avatar_url || null,
      is_verified: p.profiles.is_verified || false,
      is_organization_verified: p.profiles.is_organization_verified || false,
    } : null,
    liked_by_me: likedSet.has(p.id),
  }));
}

export function DesktopDiscoverSection() {
  const { colors, isDark } = useTheme();
  const { user, session, profile } = useAuth();
  const { openDetail } = useDesktopDetail();
  const isLoggedIn = !!session;
  const [feedWidth, setFeedWidth] = useState(600);
  const [feedTab, setFeedTab] = useState<FeedTab>("for_you");

  const [forYouPosts, setForYouPosts] = useState<Post[]>([]);
  const [followingPosts, setFollowingPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const posts = feedTab === "for_you" ? forYouPosts : followingPosts;

  const loadForYou = useCallback(async () => {
    const { data, error } = await supabase
      .from("posts")
      .select(`id, author_id, content, image_url, post_type, video_url, article_title, created_at, view_count,
               profiles!posts_author_id_fkey(id, display_name, handle, avatar_url, is_verified, is_organization_verified),
               post_images(image_url, display_order)`)
      .eq("is_blocked", false)
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(40);

    if (error || !data) return;
    const ids = data.map((p: any) => p.id);
    const counts = await fetchPostsForIds(ids, user?.id);
    setForYouPosts(mapRaw(data, counts.likeMap, counts.replyMap, counts.likedSet));
  }, [user]);

  const loadFollowing = useCallback(async () => {
    if (!user) { setFollowingPosts([]); return; }
    const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
    const followingIds = (follows || []).map((f: any) => f.following_id);
    if (followingIds.length === 0) { setFollowingPosts([]); return; }

    const { data, error } = await supabase
      .from("posts")
      .select(`id, author_id, content, image_url, post_type, video_url, article_title, created_at, view_count,
               profiles!posts_author_id_fkey(id, display_name, handle, avatar_url, is_verified, is_organization_verified),
               post_images(image_url, display_order)`)
      .eq("is_blocked", false)
      .in("author_id", followingIds)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error || !data) return;
    const ids = data.map((p: any) => p.id);
    const counts = await fetchPostsForIds(ids, user.id);
    setFollowingPosts(mapRaw(data, counts.likeMap, counts.replyMap, counts.likedSet));
  }, [user]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadForYou(), loadFollowing()]);
    setLoading(false);
    setRefreshing(false);
  }, [loadForYou, loadFollowing]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleLike(postId: string) {
    if (!user) return;
    const setter = feedTab === "for_you" ? setForYouPosts : setFollowingPosts;
    const currentPosts = feedTab === "for_you" ? forYouPosts : followingPosts;
    const post = currentPosts.find((p) => p.id === postId);
    if (!post) return;
    if (post.liked_by_me) {
      await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
      setter((prev) => prev.map((p) => p.id === postId ? { ...p, liked_by_me: false, like_count: Math.max(0, p.like_count - 1) } : p));
    } else {
      await supabase.from("post_acknowledgments").insert({ post_id: postId, user_id: user.id });
      setter((prev) => prev.map((p) => p.id === postId ? { ...p, liked_by_me: true, like_count: p.like_count + 1 } : p));
    }
  }

  async function handleQuickPost(text: string) {
    if (!user) return;
    const { data, error } = await supabase
      .from("posts")
      .insert({ author_id: user.id, content: text, visibility: "public" })
      .select(`id, author_id, content, image_url, created_at, view_count,
               profiles!posts_author_id_fkey(id, display_name, handle, avatar_url, is_verified, is_organization_verified),
               post_images(image_url, display_order)`)
      .single();
    if (!error && data) {
      const newPost = mapRaw([data], {}, {}, new Set());
      setForYouPosts((prev) => [...newPost, ...prev]);
      if (feedTab !== "for_you") setFeedTab("for_you");
    }
  }

  const noFollowingContent = !loading && feedTab === "following" && followingPosts.length === 0;

  return (
    <View style={styles.root}>
      <LoginPrompt visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} colors={colors} />

      {/* Feed column */}
      <View
        style={[styles.feedArea, { borderRightColor: colors.border }]}
        onLayout={(e) => setFeedWidth(e.nativeEvent.layout.width)}
      >
        {/* Sticky header */}
        <View style={[styles.feedHeader, { borderBottomColor: colors.border, backgroundColor: colors.background + "ee" }]}>
          <Text style={[styles.feedTitle, { color: colors.text }]}>Home</Text>
        </View>

        {/* Tab switcher */}
        <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
          {(["for_you", "following"] as FeedTab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabItem, feedTab === tab && { borderBottomColor: BRAND, borderBottomWidth: 2 }]}
              onPress={() => {
                if (tab === "following" && !isLoggedIn) { setShowLoginPrompt(true); return; }
                setFeedTab(tab);
              }}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: feedTab === tab ? colors.text : colors.textMuted },
                  feedTab === tab && { fontFamily: "Inter_700Bold" },
                ]}
              >
                {tab === "for_you" ? "For you" : "Following"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Compose box */}
        <ComposeBox
          profile={profile}
          colors={colors}
          isLoggedIn={isLoggedIn}
          onAuthRequired={() => setShowLoginPrompt(true)}
          onPost={handleQuickPost}
        />

        {/* Feed */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={BRAND} size="large" />
          </View>
        ) : noFollowingContent ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Follow people to see their posts</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              When you follow someone, their posts will show up here.
            </Text>
            <TouchableOpacity
              style={[styles.findPeopleBtn, { backgroundColor: BRAND }]}
              onPress={() => setFeedTab("for_you")}
            >
              <Text style={styles.findPeopleBtnText}>Discover posts</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <PostCard
                post={item}
                colors={colors}
                onLike={handleLike}
                onOpen={(id) => openDetail({ type: "post", id })}
                isLoggedIn={isLoggedIn}
                onAuthRequired={() => setShowLoginPrompt(true)}
                feedWidth={feedWidth}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.feedList}
            onRefresh={() => { setRefreshing(true); loadAll(); }}
            refreshing={refreshing}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="newspaper-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No posts yet</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Right panel */}
      <View style={[styles.rightPanel, { backgroundColor: colors.background, borderLeftColor: colors.border }]}>
        <DesktopRightPanel activeTab="discover" colors={colors} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", overflow: "hidden" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  feedArea: {
    flex: 1,
    flexDirection: "column",
    overflow: "hidden",
    borderRightWidth: StyleSheet.hairlineWidth,
    maxWidth: 620,
  },
  feedHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  feedTitle: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },

  tabRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
  },
  tabText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },

  composeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  composeInput: {
    fontSize: 19,
    fontFamily: "Inter_400Regular",
    minHeight: 56,
    paddingTop: 6,
    paddingBottom: 6,
    lineHeight: 26,
  },
  composeToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  toolbarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  charCount: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  composePlaceholder: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  composePlaceholderText: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_400Regular",
  },
  composePostBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  composePostBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },

  feedList: { flexGrow: 1 },

  card: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatarCol: { width: 40, flexShrink: 0 },
  contentCol: { flex: 1 },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    marginBottom: 2,
  },
  postName: { fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: -0.1, flexShrink: 1 },
  postMeta: { fontSize: 14, fontFamily: "Inter_400Regular", flexShrink: 1 },
  postContent: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 10,
  },
  images: { marginBottom: 10 },

  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginLeft: -8,
    gap: 4,
    marginBottom: 6,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
  },
  actionCount: { fontSize: 13, fontFamily: "Inter_400Regular" },

  rightPanel: {
    width: 340,
    flexShrink: 0,
    overflow: "hidden",
  },

  emptyState: { alignItems: "center", paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 23, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  findPeopleBtn: { paddingHorizontal: 24, paddingVertical: 13, borderRadius: 24, marginTop: 8 },
  findPeopleBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  articleCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 6,
    overflow: "hidden",
  },
  articleBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  articleBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  articleTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    lineHeight: 22,
  },
  articleExcerpt: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  articleThumb: {
    width: "100%" as any,
    height: 140,
    borderRadius: 8,
    marginTop: 8,
  },

  videoCard: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 10,
    position: "relative",
  },
  videoThumb: {
    width: "100%" as any,
    height: "100%" as any,
    position: "absolute",
    top: 0,
    left: 0,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  appOnlyBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  appOnlyText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
