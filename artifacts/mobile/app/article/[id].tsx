/**
 * Article Reader Page — dedicated to article-type posts only.
 * Text / image posts → /post/[id]
 * Videos → /video/[id]
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { Avatar } from "@/components/ui/Avatar";
import CachedImage from "@/components/ui/CachedImage";
import { RichText } from "@/components/ui/RichText";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import UserName from "@/components/ui/UserName";
import { VideoCommentsSheet } from "@/components/ui/VideoCommentsSheet";
import { sharePost } from "@/lib/share";
import Colors from "@/constants/colors";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (!n || n < 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, "") + "M";
  if (n >= 10_000)   return Math.round(n / 1_000) + "K";
  if (n >= 1_000)    return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function formatPostDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

// ─── Bookmark button ──────────────────────────────────────────────────────────
function BookmarkButton({ bookmarked, onPress }: { bookmarked: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  function handle() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.7, duration: 100, useNativeDriver: true }),
      Animated.spring(scale,  { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
    ]).start();
    onPress();
  }
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity onPress={handle} hitSlop={8} style={st.footerBtn}>
        <Ionicons name="bookmark" size={22} color={bookmarked ? Colors.gold : "#888"} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Article = {
  id: string;
  author_id: string;
  content: string;
  article_title: string | null;
  article_body: string | null;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  like_count: number;
  is_verified: boolean;
  is_organization_verified: boolean;
  profile: { display_name: string; handle: string; avatar_url: string | null };
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ArticleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();
  const { accent } = useAppAccent();
  const { user } = useAuth();
  const insets  = useSafeAreaInsets();

  const [article,    setArticle]    = useState<Article | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [liked,      setLiked]      = useState(false);
  const [likeCount,  setLikeCount]  = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const heartScale = useRef(new Animated.Value(1)).current;

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("posts")
        .select(`
          id, author_id, content, article_title, article_body, image_url, created_at, view_count, like_count,
          profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified),
          post_images(image_url, display_order)
        `)
        .eq("id", id)
        .single();

      if (!data) { setLoading(false); return; }

      const imgs: string[] = ((data.post_images as any[]) ?? [])
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .map((r) => r.image_url);
      const prof = (data.profiles as any) ?? {};

      setArticle({
        id: data.id,
        author_id: data.author_id,
        content: (data as any).content ?? "",
        article_title: (data as any).article_title ?? null,
        article_body:  (data as any).article_body  ?? null,
        image_url:     (data as any).image_url     ?? null,
        images: imgs,
        created_at: data.created_at,
        view_count: (data as any).view_count ?? 0,
        like_count: data.like_count ?? 0,
        is_verified: prof.is_verified ?? false,
        is_organization_verified: prof.is_organization_verified ?? false,
        profile: {
          display_name: prof.display_name ?? "",
          handle: prof.handle ?? "",
          avatar_url: prof.avatar_url ?? null,
        },
      });
      setLikeCount(data.like_count ?? 0);

      if (user) {
        const [likeRes, bmRes] = await Promise.all([
          supabase.from("post_acknowledgments").select("post_id").eq("post_id", id).eq("user_id", user.id).maybeSingle(),
          supabase.from("bookmarks").select("id").eq("post_id", id).eq("user_id", user.id).maybeSingle(),
        ]);
        setLiked(!!likeRes.data);
        setBookmarked(!!bmRes.data);
      }
      setLoading(false);
    })();
  }, [id, user]);

  // ── Like toggle ───────────────────────────────────────────────────────────
  const toggleLike = useCallback(async () => {
    if (!user || !article) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    heartScale.setValue(1);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: true, speed: 50, bounciness: 14 }),
      Animated.spring(heartScale, { toValue: 1,   useNativeDriver: true, speed: 22, bounciness: 4  }),
    ]).start();

    if (liked) {
      setLiked(false); setLikeCount((n) => Math.max(0, n - 1));
      await supabase.from("post_acknowledgments").delete().eq("post_id", article.id).eq("user_id", user.id);
    } else {
      setLiked(true); setLikeCount((n) => n + 1);
      await supabase.from("post_acknowledgments").upsert({ post_id: article.id, user_id: user.id }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
    }
  }, [user, article, liked, heartScale]);

  // ── Bookmark toggle ───────────────────────────────────────────────────────
  const toggleBookmark = useCallback(async () => {
    if (!user || !article) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (bookmarked) {
      setBookmarked(false);
      await supabase.from("bookmarks").delete().eq("post_id", article.id).eq("user_id", user.id);
    } else {
      setBookmarked(true);
      await supabase.from("bookmarks").insert({ post_id: article.id, user_id: user.id });
    }
  }, [user, article, bookmarked]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const coverImage = article?.images[0] ?? article?.image_url ?? null;
  const bodyText   = article?.article_body || article?.content || "";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>

      {loading ? (
        <>
          {/* Minimal header while loading */}
          <View style={[st.topBar, { paddingTop: insets.top + 6, backgroundColor: colors.background }]}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={st.topBarBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={st.center}>
            <ActivityIndicator color={accent} size="large" />
          </View>
        </>
      ) : !article ? (
        <>
          <View style={[st.topBar, { paddingTop: insets.top + 6, backgroundColor: colors.background }]}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={st.topBarBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={st.center}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 12, fontFamily: "Inter_400Regular", fontSize: 15 }}>Article not found</Text>
          </View>
        </>
      ) : (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Hero cover image with floating back/share buttons ── */}
            <View>
              {coverImage ? (
                <View style={st.heroWrap}>
                  <CachedImage uri={coverImage} style={st.heroImage} contentFit="cover" priority="high" />
                  {/* Scrim so buttons are always readable */}
                  <View style={st.heroScrim} />
                </View>
              ) : (
                /* Spacer so back button has room even without an image */
                <View style={[st.heroWrap, { backgroundColor: isDark ? "#1a1a24" : "#e8e0d0", height: 120 }]} />
              )}

              {/* Floating action row over the hero */}
              <View style={[st.heroActions, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity
                  onPress={() => router.back()}
                  hitSlop={10}
                  style={st.heroBtn}
                >
                  <Ionicons name="arrow-back" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => sharePost({ postId: article.id, authorName: article.profile.display_name, content: article.article_title || article.content })}
                  hitSlop={10}
                  style={st.heroBtn}
                >
                  <Ionicons name="share-outline" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Article header ── */}
            <View style={st.body}>
              {/* Title */}
              {article.article_title ? (
                <Text style={[st.title, { color: colors.text }]}>{article.article_title}</Text>
              ) : null}

              {/* Author row */}
              <TouchableOpacity
                style={st.authorRow}
                activeOpacity={0.8}
                onPress={() => router.push({ pathname: "/contact/[id]", params: { id: article.author_id } } as any)}
              >
                <Avatar uri={article.profile.avatar_url} name={article.profile.display_name} size={38} userId={article.author_id} />
                <View style={{ flex: 1, gap: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <UserName
                      userId={article.author_id}
                      name={article.profile.display_name || article.profile.handle}
                      style={[st.authorName, { color: colors.text }]}
                      numberOfLines={1}
                    />
                    <VerifiedBadge isVerified={article.is_verified} isOrganizationVerified={article.is_organization_verified} size={13} />
                  </View>
                  <Text style={[st.authorMeta, { color: colors.textMuted }]}>
                    {formatPostDate(article.created_at)}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Divider */}
              <View style={[st.divider, { backgroundColor: colors.border }]} />

              {/* Body */}
              {bodyText.trim().length > 0 ? (
                <RichText style={[st.bodyText, { color: colors.text }]} linkColor={accent}>
                  {bodyText}
                </RichText>
              ) : (
                <Text style={{ color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 15 }}>
                  No content
                </Text>
              )}
            </View>
          </ScrollView>

          {/* ── Footer action bar ── */}
          <View style={[st.footer, {
            paddingBottom: Math.max(insets.bottom, 8),
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          }]}>
            {/* Like */}
            <TouchableOpacity style={st.footerBtn} onPress={toggleLike} activeOpacity={0.7}>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons name="heart" size={22} color={liked ? "#FF9500" : "#888"} />
              </Animated.View>
              <Text style={[st.footerCount, { color: liked ? "#FF9500" : "#888" }]}>{formatNum(likeCount)}</Text>
            </TouchableOpacity>

            {/* Comment */}
            <TouchableOpacity style={st.footerBtn} onPress={() => setCommentsOpen(true)} activeOpacity={0.7}>
              <Ionicons name="chatbubble" size={22} color="#888" />
            </TouchableOpacity>

            {/* Views */}
            <View style={st.footerBtn}>
              <Ionicons name="eye" size={22} color="#888" />
              <Text style={[st.footerCount, { color: "#888" }]}>{formatNum(article.view_count)}</Text>
            </View>

            {/* Share */}
            <TouchableOpacity
              style={st.footerBtn}
              onPress={() => sharePost({ postId: article.id, authorName: article.profile.display_name, content: article.article_title || article.content })}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-redo" size={22} color="#888" />
            </TouchableOpacity>

            {/* Bookmark */}
            <BookmarkButton bookmarked={bookmarked} onPress={toggleBookmark} />
          </View>
        </>
      )}

      {/* Comments sheet */}
      {article && (
        <VideoCommentsSheet
          visible={commentsOpen}
          postId={article.id}
          postAuthorId={article.author_id}
          onReplyCountChange={() => {}}
          onClose={() => setCommentsOpen(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  root:       { flex: 1 },
  center:     { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  topBar:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 10 },
  topBarBtn:  { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  heroWrap:   { width: "100%", height: 260, backgroundColor: "#111" },
  heroImage:  { width: "100%", height: 260 },
  heroScrim:  { ...StyleSheet.absoluteFill, backgroundColor: "transparent" },
  heroActions:{ position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8 },
  heroBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  body:       { paddingHorizontal: 20, paddingTop: 20 },
  title:      { fontSize: 24, fontFamily: "Inter_700Bold", lineHeight: 32, marginBottom: 16 },
  authorRow:  { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  authorName: { fontSize: 14, fontFamily: "Inter_700Bold", flexShrink: 1 },
  authorMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  divider:    { height: StyleSheet.hairlineWidth, marginBottom: 20 },
  bodyText:   { fontSize: 17, lineHeight: 28, fontFamily: "Inter_400Regular" },
  footer:     { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  footerBtn:  { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8 },
  footerCount:{ fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
