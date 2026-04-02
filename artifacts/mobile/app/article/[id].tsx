import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { RichText } from "@/components/ui/RichText";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { notifyPostLike, notifyPostReply } from "@/lib/notifyUser";

type ArticleData = {
  id: string;
  content: string;
  article_title: string;
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
  author: { id: string; display_name: string; avatar_url: string | null; handle: string; is_verified: boolean; is_organization_verified: boolean };
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function estimateReadTime(text: string): string {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

export default function ArticleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile: myProfile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [liking, setLiking] = useState(false);

  const fetchArticle = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: post } = await supabase
        .from("posts")
        .select(`
          id, content, article_title, created_at, view_count, author_id,
          profiles!posts_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)
        `)
        .eq("id", id)
        .eq("post_type", "article")
        .single();

      if (!post) { setLoading(false); return; }

      const [{ data: likesData }, { data: repliesData }, { data: myLike }] = await Promise.all([
        supabase.from("post_acknowledgments").select("post_id").eq("post_id", id),
        supabase.from("post_replies").select("id, content, created_at, profiles!post_replies_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)").eq("post_id", id).order("created_at", { ascending: true }),
        user ? supabase.from("post_acknowledgments").select("post_id").eq("post_id", id).eq("user_id", user.id).maybeSingle() : { data: null },
      ]);

      const p = post as any;
      setArticle({
        id: p.id,
        content: p.content || "",
        article_title: p.article_title || "Untitled",
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

  async function submitReply() {
    if (!user || !replyText.trim() || !article) return;
    setReplying(true);
    const { data: inserted, error } = await supabase
      .from("post_replies")
      .insert({ post_id: article.id, author_id: user.id, content: replyText.trim() })
      .select("id, content, created_at, profiles!post_replies_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)")
      .single();
    if (!error && inserted) {
      const r = inserted as any;
      const newReply: Reply = {
        id: r.id, content: r.content, created_at: r.created_at,
        author: { id: r.profiles?.id, display_name: r.profiles?.display_name || "User", avatar_url: r.profiles?.avatar_url || null, handle: r.profiles?.handle || "user", is_verified: r.profiles?.is_verified || false, is_organization_verified: r.profiles?.is_organization_verified || false },
      };
      setReplies((prev) => [...prev, newReply]);
      setArticle((a) => a ? { ...a, replyCount: a.replyCount + 1 } : a);
      setReplyText("");
      if (article.author.id !== user.id) {
        notifyPostReply({ postAuthorId: article.author.id, replierName: myProfile?.display_name || "Someone", replierUserId: user.id, postId: article.id });
      }
    }
    setReplying(false);
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={Colors.brand} size="large" />
      </View>
    );
  }

  if (!article) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.textMuted }]}>Article not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.brand, fontFamily: "Inter_500Medium" }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ListHeader = (
    <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
      {/* Back */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </TouchableOpacity>

      {/* Article badge */}
      <View style={[styles.articleBadge, { backgroundColor: Colors.brand + "15" }]}>
        <Ionicons name="document-text-outline" size={13} color={Colors.brand} />
        <Text style={[styles.articleBadgeText, { color: Colors.brand }]}>Article</Text>
      </View>

      {/* Title */}
      <Text style={[styles.title, { color: colors.text }]}>{article.article_title}</Text>

      {/* Meta */}
      <View style={styles.metaRow}>
        <TouchableOpacity
          style={styles.authorRow}
          onPress={() => router.push({ pathname: "/contact/[id]", params: { id: article.author.id } })}
        >
          <Avatar uri={article.author.avatar_url} name={article.author.display_name} size={32} />
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[styles.authorName, { color: colors.text }]}>{article.author.display_name}</Text>
              {article.author.is_organization_verified && <Ionicons name="checkmark-circle" size={13} color={Colors.gold} />}
              {!article.author.is_organization_verified && article.author.is_verified && <Ionicons name="checkmark-circle" size={13} color={Colors.brand} />}
            </View>
            <Text style={[styles.authorHandle, { color: colors.textMuted }]}>@{article.author.handle}</Text>
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <View style={styles.readMeta}>
          <Text style={[styles.readMetaText, { color: colors.textMuted }]}>{timeAgo(article.created_at)}</Text>
          <View style={[styles.metaDot, { backgroundColor: colors.textMuted }]} />
          <Text style={[styles.readMetaText, { color: colors.textMuted }]}>{estimateReadTime(article.content)}</Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Body */}
      <RichText style={[styles.body, { color: colors.text }]}>{article.content}</RichText>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Stats */}
      <View style={styles.statsRow}>
        <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
        <Text style={[styles.statText, { color: colors.textMuted }]}>{article.view_count} views</Text>
        <View style={[styles.metaDot, { backgroundColor: colors.textMuted }]} />
        <Text style={[styles.statText, { color: colors.textMuted }]}>{article.likeCount} likes</Text>
        <View style={[styles.metaDot, { backgroundColor: colors.textMuted }]} />
        <Text style={[styles.statText, { color: colors.textMuted }]}>{article.replyCount} comments</Text>
      </View>

      {/* Action bar */}
      <View style={[styles.actionBar, { borderColor: colors.border }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={toggleLike} disabled={liking}>
          <Ionicons name={article.liked ? "heart" : "heart-outline"} size={22} color={article.liked ? "#FF3B30" : colors.textMuted} />
          <Text style={[styles.actionLabel, { color: article.liked ? "#FF3B30" : colors.textMuted }]}>
            {article.likeCount > 0 ? article.likeCount : "Like"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="chatbubble-outline" size={21} color={colors.textMuted} />
          <Text style={[styles.actionLabel, { color: colors.textMuted }]}>
            {article.replyCount > 0 ? article.replyCount : "Comment"}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.commentsHeading, { color: colors.text }]}>Comments ({article.replyCount})</Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 52 : 0}>
        <FlatList
          data={replies}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={[styles.replyRow, { backgroundColor: colors.surface, marginHorizontal: 16, marginBottom: 8 }]}>
              <Avatar uri={item.author.avatar_url} name={item.author.display_name} size={34} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 }}>
                  <Text style={[styles.replyName, { color: colors.text }]}>{item.author.display_name}</Text>
                  {item.author.is_organization_verified && <Ionicons name="checkmark-circle" size={11} color={Colors.gold} />}
                  {!item.author.is_organization_verified && item.author.is_verified && <Ionicons name="checkmark-circle" size={11} color={Colors.brand} />}
                  <Text style={[styles.replyTime, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
                </View>
                <RichText style={[styles.replyContent, { color: colors.text }]}>{item.content}</RichText>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <Text style={[{ color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 14 }]}>No comments yet. Be the first!</Text>
            </View>
          }
        />

        {/* Reply input */}
        {user ? (
          <View style={[styles.replyBar, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 }]}>
            <Avatar uri={myProfile?.avatar_url} name={myProfile?.display_name} size={30} />
            <TextInput
              style={[styles.replyInput, { backgroundColor: colors.backgroundTertiary, color: colors.text }]}
              placeholder="Add a comment…"
              placeholderTextColor={colors.textMuted}
              value={replyText}
              onChangeText={setReplyText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              onPress={submitReply}
              disabled={replying || !replyText.trim()}
              style={[styles.sendBtn, { backgroundColor: replyText.trim() ? Colors.brand : colors.backgroundTertiary }]}
            >
              {replying
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={16} color={replyText.trim() ? "#fff" : colors.textMuted} />
              }
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.signInBar, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 }]}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={[styles.signInText, { color: Colors.brand }]}>Sign in to comment</Text>
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
  backBtn: { marginBottom: 16, alignSelf: "flex-start", padding: 4, marginTop: 4 },
  articleBadge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginBottom: 12 },
  articleBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", lineHeight: 36, marginBottom: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 12 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  authorName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  authorHandle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  readMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  readMetaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  metaDot: { width: 3, height: 3, borderRadius: 1.5 },
  divider: { height: 1, marginVertical: 20 },
  body: { fontSize: 17, fontFamily: "Inter_400Regular", lineHeight: 28 },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  statText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  actionBar: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 24 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, flex: 1, justifyContent: "center" },
  actionLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  commentsHeading: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 16 },
  replyRow: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 12 },
  replyName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  replyContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  replyBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  replyInput: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 100 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  signInBar: { alignItems: "center", paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  signInText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
