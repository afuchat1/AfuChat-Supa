import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { PostDetailSkeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import { RichText } from "@/components/ui/RichText";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { notifyPostLike, notifyPostReply } from "@/lib/notifyUser";
import { setPageMeta, resetPageMeta } from "@/lib/webMeta";
import { useAutoTranslate } from "@/context/LanguageContext";
import { LANG_LABELS } from "@/lib/translate";
import { encodeId } from "@/lib/shortId";

const { width: SCREEN_W } = Dimensions.get("window");
const COVER_H = SCREEN_W * 0.56;

type ArticleData = {
  id: string;
  content: string;
  article_body: string;
  article_title: string;
  article_cover_url: string | null;
  created_at: string;
  view_count: number;
  author: { id: string; display_name: string; avatar_url: string | null; handle: string; is_verified: boolean; is_organization_verified: boolean };
  liked: boolean;
  likeCount: number;
  replyCount: number;
};

type Reply = {
  id: string;
  content: string;
  created_at: string;
  parent_reply_id: string | null;
  author: { id: string; display_name: string; avatar_url: string | null; handle: string; is_verified: boolean; is_organization_verified: boolean };
  children?: Reply[];
};

const ART_THREAD_COLORS = ["#00BCD4", "#5C6BC0", "#26A69A", "#EF6C00", "#8E24AA"];

type ArticleBlock = { type: "text"; content: string } | { type: "image"; url: string };

function parseArticleBlocks(body: string): ArticleBlock[] {
  const IMG_REGEX = /\[img:(https?:\/\/[^\]]+)\]/g;
  const blocks: ArticleBlock[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  IMG_REGEX.lastIndex = 0;
  while ((match = IMG_REGEX.exec(body)) !== null) {
    if (match.index > lastIndex) {
      const text = body.slice(lastIndex, match.index).trim();
      if (text) blocks.push({ type: "text", content: text });
    }
    blocks.push({ type: "image", url: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    const text = body.slice(lastIndex).trim();
    if (text) blocks.push({ type: "text", content: text });
  }
  if (blocks.length === 0) blocks.push({ type: "text", content: body });
  return blocks;
}

const EMOJI_HEADING_RE = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;

function ArticleTextBlock({ content, bodyStyle }: { content: string; bodyStyle: any }) {
  const paragraphs = content.split(/\n{2,}/).filter((p) => p.trim());
  if (paragraphs.length === 0) return null;
  return (
    <View style={{ gap: 16 }}>
      {paragraphs.map((para, i) => {
        const trimmed = para.trim();
        const isHeading = EMOJI_HEADING_RE.test(trimmed) && trimmed.length < 90 && !trimmed.includes("\n");
        if (isHeading) {
          return (
            <Text key={i} style={[bodyStyle, articleBodyStyles.sectionHeading]}>
              {trimmed}
            </Text>
          );
        }
        return <RichText key={i} style={bodyStyle}>{trimmed}</RichText>;
      })}
    </View>
  );
}

function ArticleBody({ body, displayBody, bodyStyle }: { body: string; displayBody?: string; bodyStyle: any }) {
  const blocks = parseArticleBlocks(body);

  if (blocks.length === 1 && blocks[0].type === "text") {
    return <ArticleTextBlock content={displayBody || body} bodyStyle={bodyStyle} />;
  }

  return (
    <View style={{ gap: 28 }}>
      {blocks.map((block, i) => {
        if (block.type === "image") {
          return (
            <View key={i} style={articleBodyStyles.inlineImgWrap}>
              <Image source={{ uri: block.url }} style={articleBodyStyles.inlineImg} resizeMode="cover" />
            </View>
          );
        }
        return <ArticleTextBlock key={i} content={block.content} bodyStyle={bodyStyle} />;
      })}
    </View>
  );
}

const articleBodyStyles = StyleSheet.create({
  inlineImgWrap: { borderRadius: 14, overflow: "hidden", width: "100%", elevation: 2 },
  inlineImg: { width: "100%", aspectRatio: 16 / 9 },
  sectionHeading: { fontSize: 20, fontFamily: "Inter_700Bold", lineHeight: 28 },
});

function buildArticleReplyTree(flat: Reply[]): Reply[] {
  const map = new Map<string, Reply>();
  const roots: Reply[] = [];
  for (const r of flat) map.set(r.id, { ...r, children: [] });
  for (const r of flat) {
    const node = map.get(r.id)!;
    if (r.parent_reply_id && map.has(r.parent_reply_id)) {
      map.get(r.parent_reply_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function ArticleReplyCard({
  item,
  colors,
  depth,
  onReplyTo,
}: {
  item: Reply;
  colors: any;
  depth: number;
  onReplyTo: (r: Reply) => void;
}) {
  const [liked, setLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const indent = Math.min(depth, 4) * 18;
  const hasChildren = (item.children?.length ?? 0) > 0;
  const threadColor = ART_THREAD_COLORS[depth % ART_THREAD_COLORS.length];
  const isTop = depth === 0;
  const avatarSize = isTop ? 36 : 28;

  function handleLike() {
    const next = !liked;
    setLiked(next);
    setLocalLikes((c) => (next ? c + 1 : Math.max(0, c - 1)));
  }

  return (
    <>
      <View style={{ flexDirection: "row", paddingLeft: 20 + indent, paddingRight: 20, paddingTop: isTop ? 14 : 8, paddingBottom: 2 }}>
        {depth > 0 && (
          <View style={{
            position: "absolute",
            left: 20 + indent - 10,
            top: 0,
            bottom: 0,
            width: 2,
            borderRadius: 1,
            backgroundColor: threadColor + "50",
          }} />
        )}
        <TouchableOpacity onPress={() => router.push(`/contact/${item.author.id}` as any)} activeOpacity={0.8} style={{ marginRight: 10, marginTop: 2 }}>
          <Avatar uri={item.author.avatar_url} name={item.author.display_name} size={avatarSize} square={!!(item.author.is_organization_verified)} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 3 }}>
            <TouchableOpacity onPress={() => router.push(`/contact/${item.author.id}` as any)} activeOpacity={0.8}>
              <Text style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_700Bold" }}>
                {item.author.display_name}
              </Text>
            </TouchableOpacity>
            {item.author.is_organization_verified && (
              <Ionicons name="checkmark-circle" size={13} color={Colors.gold} />
            )}
            {!item.author.is_organization_verified && item.author.is_verified && (
              <Ionicons name="checkmark-circle" size={13} color={colors.accent} />
            )}
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>@{item.author.handle}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>· {timeAgo(item.created_at)}</Text>
          </View>
          <RichText style={{ color: colors.text, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 }}>
            {item.content}
          </RichText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8, marginBottom: 4 }}>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }} onPress={handleLike} activeOpacity={0.7}>
              <Ionicons name={liked ? "heart" : "heart-outline"} size={14} color={liked ? "#FF2D55" : colors.textMuted} />
              {localLikes > 0 && (
                <Text style={{ color: liked ? "#FF2D55" : colors.textMuted, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{localLikes}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => onReplyTo(item)} activeOpacity={0.7}>
              <Ionicons name="arrow-undo-outline" size={14} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Reply</Text>
            </TouchableOpacity>
            {hasChildren && (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
                onPress={() => setCollapsed((c) => !c)}
                activeOpacity={0.7}
              >
                <Ionicons name={collapsed ? "chevron-down-circle-outline" : "chevron-up-circle-outline"} size={13} color={threadColor} />
                <Text style={{ color: threadColor, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                  {collapsed ? `${item.children!.length} ${item.children!.length === 1 ? "reply" : "replies"}` : "Hide"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
      {isTop && !hasChildren && (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 20 + indent + avatarSize + 10, marginRight: 20, marginTop: 4 }} />
      )}
      {!collapsed && item.children?.map((child) => (
        <ArticleReplyCard key={child.id} item={child} colors={colors} depth={depth + 1} onReplyTo={onReplyTo} />
      ))}
      {isTop && hasChildren && !collapsed && (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 20, marginRight: 20, marginTop: 6, marginBottom: 2 }} />
      )}
    </>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function estimateReadTime(text: string): string {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

export default function ArticleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile: myProfile } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [liking, setLiking] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Reply | null>(null);
  const replyInputRef = React.useRef<TextInput>(null);

  const { displayText: displayBody, isTranslated: bodyTranslated, lang: bodyLang } = useAutoTranslate(
    article?.article_body || article?.content
  );

  const fetchArticle = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: post } = await supabase
        .from("posts")
        .select(`
          id, content, article_title, article_body, article_cover_url, created_at, view_count, author_id,
          profiles!posts_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)
        `)
        .eq("id", id)
        .eq("post_type", "article")
        .single();

      if (!post) { setLoading(false); return; }

      const [{ data: likesData }, { data: repliesData }, { data: myLike }] = await Promise.all([
        supabase.from("post_acknowledgments").select("post_id").eq("post_id", id),
        supabase.from("post_replies").select("id, content, created_at, parent_reply_id, profiles!post_replies_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)").eq("post_id", id).order("created_at", { ascending: true }),
        user ? supabase.from("post_acknowledgments").select("post_id").eq("post_id", id).eq("user_id", user.id).maybeSingle() : { data: null },
      ]);

      const p = post as any;
      setArticle({
        id: p.id,
        content: p.content || "",
        article_body: p.article_body || p.content || "",
        article_title: p.article_title || "Untitled",
        article_cover_url: p.article_cover_url || null,
        created_at: p.created_at,
        view_count: p.view_count || 0,
        author: {
          id: p.author_id,
          display_name: p.profiles?.display_name || "User",
          avatar_url: p.profiles?.avatar_url || null,
          handle: p.profiles?.handle || "user",
          is_verified: p.profiles?.is_verified || false,
          is_organization_verified: p.profiles?.is_organization_verified || false,
        },
        liked: !!myLike,
        likeCount: (likesData || []).length,
        replyCount: (repliesData || []).length,
      });

      setReplies((repliesData || []).map((r: any) => ({
        id: r.id,
        content: r.content,
        created_at: r.created_at,
        parent_reply_id: r.parent_reply_id || null,
        author: {
          id: r.profiles?.id,
          display_name: r.profiles?.display_name || "User",
          avatar_url: r.profiles?.avatar_url || null,
          handle: r.profiles?.handle || "user",
          is_verified: r.profiles?.is_verified || false,
          is_organization_verified: r.profiles?.is_organization_verified || false,
        },
      })));

      supabase.from("posts").update({ view_count: (p.view_count || 0) + 1 }).eq("id", id).then(() => {});
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => { fetchArticle(); }, [fetchArticle]);

  useEffect(() => {
    if (!article) return;
    const title = `${article.article_title} — by ${article.author.display_name} on AfuChat`;
    const description = (article.content || "").slice(0, 200) || "Read this article on AfuChat.";
    setPageMeta({
      title,
      description,
      image: article.article_cover_url ?? undefined,
      url: `https://afuchat.com/p/${encodeId(article.id)}`,
      type: "article",
      publishedAt: article.created_at,
      author: article.author.display_name,
    });
    return resetPageMeta;
  }, [article]);

  async function toggleLike() {
    if (!user) { router.push("/(auth)/login"); return; }
    if (liking || !article) return;
    setLiking(true);
    if (article.liked) {
      await supabase.from("post_acknowledgments").delete().eq("post_id", article.id).eq("user_id", user.id);
      setArticle((a) => a ? { ...a, liked: false, likeCount: Math.max(0, a.likeCount - 1) } : a);
    } else {
      await supabase.from("post_acknowledgments").insert({ post_id: article.id, user_id: user.id });
      setArticle((a) => a ? { ...a, liked: true, likeCount: a.likeCount + 1 } : a);
      if (article.author.id !== user.id) {
        notifyPostLike({ postAuthorId: article.author.id, likerName: myProfile?.display_name || "Someone", likerUserId: user.id, postId: article.id });
      }
    }
    setLiking(false);
  }

  function handleReplyTo(r: Reply) {
    setReplyingTo(r);
    setReplyText("");
    setTimeout(() => replyInputRef.current?.focus(), 100);
  }

  async function submitReply() {
    if (!user || !replyText.trim() || !article) return;
    setReplying(true);
    const insertData: any = { post_id: article.id, author_id: user.id, content: replyText.trim() };
    if (replyingTo) insertData.parent_reply_id = replyingTo.id;
    const { data: inserted, error } = await supabase
      .from("post_replies")
      .insert(insertData)
      .select("id, content, created_at, parent_reply_id, profiles!post_replies_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)")
      .single();
    if (!error && inserted) {
      const r = inserted as any;
      const newReply: Reply = {
        id: r.id, content: r.content, created_at: r.created_at,
        parent_reply_id: r.parent_reply_id || null,
        author: { id: r.profiles?.id, display_name: r.profiles?.display_name || "User", avatar_url: r.profiles?.avatar_url || null, handle: r.profiles?.handle || "user", is_verified: r.profiles?.is_verified || false, is_organization_verified: r.profiles?.is_organization_verified || false },
      };
      setReplies((prev) => [...prev, newReply]);
      setArticle((a) => a ? { ...a, replyCount: a.replyCount + 1 } : a);
      setReplyText("");
      setReplyingTo(null);
      const notifyTarget = replyingTo ? replyingTo.author.id : article.author.id;
      if (notifyTarget !== user.id) {
        notifyPostReply({ postAuthorId: notifyTarget, replierName: myProfile?.display_name || "Someone", replierUserId: user.id, postId: article.id, replyPreview: replyText.trim() });
      }
    }
    setReplying(false);
  }

  async function handleShare() {
    if (!article) return;
    try {
      await Share.share({ message: `${article.article_title}\n\nRead on AfuChat` });
    } catch {}
  }

  if (loading) {
    return <PostDetailSkeleton />;
  }

  if (!article) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.textMuted }]}>Article not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.accent, fontFamily: "Inter_500Medium" }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const bodyText = article.article_body || article.content;
  const readTime = estimateReadTime(bodyText);

  const hasCover = !!article.article_cover_url;

  const ListHeader = (
    <View>
      {hasCover ? (
        /* ── Magazine hero: blurred cover + title overlay ── */
        <View style={styles.magazineHero}>
          <Image
            source={{ uri: article.article_cover_url! }}
            style={[StyleSheet.absoluteFill, { width: SCREEN_W }]}
            resizeMode="cover"
            blurRadius={22}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.18)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.82)"]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
          {/* Nav row */}
          <View style={[styles.headerOverlay, { paddingTop: insets.top + 6 }]}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtnOverlay} hitSlop={8}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={styles.backBtnOverlay} hitSlop={8}>
              <Ionicons name="share-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          {/* Title + author overlaid at bottom */}
          <View style={styles.magazineContent}>
            <View style={styles.topMeta}>
              <View style={[styles.articleBadge, { backgroundColor: "rgba(0,188,212,0.22)", borderColor: "rgba(0,188,212,0.5)", borderWidth: 1 }]}>
                <Ionicons name="document-text" size={12} color="#00BCD4" />
                <Text style={[styles.articleBadgeText, { color: "#00BCD4" }]}>Article</Text>
              </View>
              <View style={styles.readTimeBadge}>
                <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.6)" />
                <Text style={[styles.readTimeText, { color: "rgba(255,255,255,0.6)" }]}>{readTime}</Text>
              </View>
            </View>
            <Text style={styles.magazineTitle}>{article.article_title}</Text>
            {article.content && article.article_body && article.content !== article.article_body && (
              <Text style={styles.magazineSubtitle}>{article.content}</Text>
            )}
            <TouchableOpacity
              style={styles.magazineAuthorRow}
              onPress={() => router.push({ pathname: "/contact/[id]", params: { id: article.author.id } })}
              activeOpacity={0.8}
            >
              <Avatar uri={article.author.avatar_url} name={article.author.display_name} size={32} square={!!(article.author.is_organization_verified)} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={styles.magazineAuthorName}>{article.author.display_name}</Text>
                  {article.author.is_organization_verified && <Ionicons name="checkmark-circle" size={13} color={Colors.gold} />}
                  {!article.author.is_organization_verified && article.author.is_verified && <Ionicons name="checkmark-circle" size={13} color={colors.accent} />}
                </View>
                <Text style={styles.magazineAuthorMeta}>
                  {formatDate(article.created_at)} · {article.view_count.toLocaleString()} views
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* ── No cover: plain nav ── */
        <View style={[styles.headerNoCover, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtnPlain} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={styles.backBtnPlain} hitSlop={8}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.articleContent}>
        {/* Title / author section only shown when there is NO cover (cover articles show it in the hero) */}
        {!hasCover && (
          <>
            <View style={styles.topMeta}>
              <View style={[styles.articleBadge, { backgroundColor: colors.accent + "15" }]}>
                <Ionicons name="document-text" size={12} color={colors.accent} />
                <Text style={[styles.articleBadgeText, { color: colors.accent }]}>Article</Text>
              </View>
              <View style={styles.readTimeBadge}>
                <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.readTimeText, { color: colors.textMuted }]}>{readTime}</Text>
              </View>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{article.article_title}</Text>
            {article.content && article.article_body && article.content !== article.article_body && (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{article.content}</Text>
            )}
            <View style={[styles.authorSection, { borderColor: colors.border }]}>
              <TouchableOpacity
                style={styles.authorRow}
                onPress={() => router.push({ pathname: "/contact/[id]", params: { id: article.author.id } })}
                activeOpacity={0.7}
              >
                <Avatar uri={article.author.avatar_url} name={article.author.display_name} size={40} square={!!(article.author.is_organization_verified)} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={[styles.authorName, { color: colors.text }]}>{article.author.display_name}</Text>
                    {article.author.is_organization_verified && <Ionicons name="checkmark-circle" size={14} color={Colors.gold} />}
                    {!article.author.is_organization_verified && article.author.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.accent} />}
                  </View>
                  <Text style={[styles.authorHandle, { color: colors.textMuted }]}>@{article.author.handle}</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.dateMeta}>
                <Text style={[styles.dateText, { color: colors.textMuted }]}>{formatDate(article.created_at)}</Text>
              </View>
            </View>
          </>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {bodyTranslated && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 8 }}>
            <Ionicons name="language" size={11} color={colors.textMuted} />
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted }}>
              {`Translated · ${LANG_LABELS[bodyLang || ""] ?? bodyLang}`}
            </Text>
          </View>
        )}

        <ArticleBody body={bodyText || ""} displayBody={displayBody} bodyStyle={[styles.body, { color: colors.text }]} />

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="eye-outline" size={15} color={colors.textMuted} />
            <Text style={[styles.statText, { color: colors.textMuted }]}>{article.view_count.toLocaleString()}</Text>
          </View>
          <View style={[styles.statDot, { backgroundColor: colors.textMuted }]} />
          <View style={styles.statItem}>
            <Ionicons name="heart-outline" size={15} color={colors.textMuted} />
            <Text style={[styles.statText, { color: colors.textMuted }]}>{article.likeCount.toLocaleString()}</Text>
          </View>
          <View style={[styles.statDot, { backgroundColor: colors.textMuted }]} />
          <View style={styles.statItem}>
            <Ionicons name="chatbubble-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.statText, { color: colors.textMuted }]}>{article.replyCount.toLocaleString()}</Text>
          </View>
        </View>

        <View style={[styles.actionBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={toggleLike} disabled={liking} activeOpacity={0.7}>
            <Ionicons name={article.liked ? "heart" : "heart-outline"} size={22} color={article.liked ? "#FF3B30" : colors.textMuted} />
            <Text style={[styles.actionLabel, { color: article.liked ? "#FF3B30" : colors.textMuted }]}>
              {article.liked ? "Liked" : "Like"}
            </Text>
          </TouchableOpacity>
          <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
            <Ionicons name="chatbubble-outline" size={20} color={colors.textMuted} />
            <Text style={[styles.actionLabel, { color: colors.textMuted }]}>Comment</Text>
          </TouchableOpacity>
          <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={20} color={colors.textMuted} />
            <Text style={[styles.actionLabel, { color: colors.textMuted }]}>Share</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.commentsHeading, { color: colors.text }]}>
          Comments {article.replyCount > 0 ? `(${article.replyCount})` : ""}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 52 : 0}>
        <FlatList
          data={buildArticleReplyTree(replies)}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ArticleReplyCard item={item} colors={colors} depth={0} onReplyTo={handleReplyTo} />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 32, paddingHorizontal: 20 }}>
              <Ionicons name="chatbubbles-outline" size={36} color={colors.textMuted + "60"} />
              <Text style={{ color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 10 }}>No comments yet. Be the first!</Text>
            </View>
          }
        />

        {user ? (
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface }}>
            {replyingTo && (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.textMuted }}>
                  Replying to <Text style={{ color: colors.accent, fontFamily: "Inter_600SemiBold" }}>@{replyingTo.author.handle}</Text>
                </Text>
                <TouchableOpacity onPress={() => { setReplyingTo(null); setReplyText(""); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            <View style={[styles.replyBar, { paddingBottom: insets.bottom + 8, backgroundColor: "transparent" }]}>
              <Avatar uri={myProfile?.avatar_url} name={myProfile?.display_name} size={30} />
              <TextInput
                ref={replyInputRef}
                style={[styles.replyInput, { backgroundColor: colors.backgroundTertiary, color: colors.text }]}
                placeholder={replyingTo ? `Reply to @${replyingTo.author.handle}...` : "Add a comment..."}
                placeholderTextColor={colors.textMuted}
                value={replyText}
                onChangeText={setReplyText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                onPress={submitReply}
                disabled={replying || !replyText.trim()}
                style={[styles.sendBtn, { backgroundColor: replyText.trim() ? colors.accent : colors.backgroundTertiary }]}
              >
                {replying
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="send" size={16} color={replyText.trim() ? "#fff" : colors.textMuted} />
                }
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.signInBar, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 }]}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={[styles.signInText, { color: colors.accent }]}>Sign in to comment</Text>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16, fontFamily: "Inter_400Regular" },
  /* ── Magazine hero ── */
  magazineHero: { width: SCREEN_W, minHeight: COVER_H + 160, overflow: "hidden", justifyContent: "flex-end" },
  magazineContent: { paddingHorizontal: 20, paddingBottom: 28, paddingTop: 80 },
  magazineTitle: { fontSize: 26, fontFamily: "Inter_700Bold", lineHeight: 33, color: "#fff", letterSpacing: -0.3, marginBottom: 10 },
  magazineSubtitle: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, color: "rgba(255,255,255,0.78)", marginBottom: 12, fontStyle: "italic" },
  magazineAuthorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  magazineAuthorName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  magazineAuthorMeta: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.62)", marginTop: 2 },
  /* ── Legacy / no-cover header ── */
  coverImage: { width: SCREEN_W, height: COVER_H },
  coverGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: COVER_H * 0.5 },
  headerOverlay: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16 },
  backBtnOverlay: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.38)", alignItems: "center", justifyContent: "center" },
  headerNoCover: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  backBtnPlain: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  articleContent: { paddingHorizontal: 20, paddingTop: 24 },
  topMeta: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  articleBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  articleBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  readTimeBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  readTimeText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", lineHeight: 34, marginBottom: 12, letterSpacing: -0.3 },
  subtitle: { fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 24, marginBottom: 20, fontStyle: "italic" },
  authorSection: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 24 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  authorName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  authorHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  dateMeta: { alignItems: "flex-end" },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  divider: { height: 1, marginVertical: 24 },
  body: { fontSize: 17, fontFamily: "Inter_400Regular", lineHeight: 30 },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  statText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  statDot: { width: 3, height: 3, borderRadius: 1.5 },
  actionBar: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginBottom: 28, overflow: "hidden" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  actionDivider: { width: StyleSheet.hairlineWidth, height: 24 },
  actionLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  commentsHeading: { fontSize: 17, fontFamily: "Inter_600SemiBold", marginBottom: 16 },
  replyRow: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 14 },
  replyName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  replyContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  replyBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  replyInput: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 100 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  signInBar: { alignItems: "center", paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  signInText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
