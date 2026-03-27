import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { PostDetailSkeleton } from "@/components/ui/Skeleton";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { sharePost } from "@/lib/share";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { RichText } from "@/components/ui/RichText";
import { Avatar } from "@/components/ui/Avatar";
import { ImageViewer, useImageViewer } from "@/components/ImageViewer";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { notifyPostLike, notifyPostReply } from "@/lib/notifyUser";
import { useAutoTranslate } from "@/context/LanguageContext";
import { LANG_LABELS } from "@/lib/translate";
import { aiSummarizeThread } from "@/lib/aiHelper";

type Reply = {
  id: string;
  content: string;
  created_at: string;
  author: { id: string; display_name: string; avatar_url: string | null; handle: string; is_verified: boolean; is_organization_verified: boolean };
};

type PostData = {
  id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  author: { id: string; display_name: string; avatar_url: string | null; handle: string; is_verified: boolean; is_organization_verified: boolean };
  liked: boolean;
  likeCount: number;
  replyCount: number;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function ReplyCard({ item, colors }: { item: Reply; colors: any }) {
  const { displayText, isTranslated, lang } = useAutoTranslate(item.content);
  return (
    <View style={[styles.replyRow, { backgroundColor: colors.surface }]}>
      <Avatar uri={item.author.avatar_url} name={item.author.display_name} size={36} />
      <View style={{ flex: 1 }}>
        <View style={styles.replyHeader}>
          <Text style={[styles.replyName, { color: colors.text }]}>{item.author.display_name}</Text>
          {item.author.is_organization_verified && <Ionicons name="checkmark-circle" size={12} color={Colors.gold} style={{ marginLeft: 3 }} />}
          {!item.author.is_organization_verified && item.author.is_verified && <Ionicons name="checkmark-circle" size={12} color={Colors.brand} style={{ marginLeft: 3 }} />}
          <Text style={[styles.replyTime, { color: colors.textMuted }]}> {timeAgo(item.created_at)}</Text>
        </View>
        <RichText style={[styles.replyContent, { color: colors.text }]}>{displayText}</RichText>
        {isTranslated && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
            <Ionicons name="language" size={10} color={colors.textMuted} />
            <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.textMuted }}>
              {`Translated · ${LANG_LABELS[lang || ""] ?? lang}`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile: myProfile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<PostData | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const imgViewer = useImageViewer();
  const { displayText: postDisplayText, isTranslated: postIsTranslated, lang: postLang } = useAutoTranslate(post?.content);

  const loadPost = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("posts")
      .select(`id, content, image_url, created_at, view_count,
        profiles!posts_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified),
        post_images(image_url, display_order)`)
      .eq("id", id)
      .single();

    if (!data) { setLoading(false); return; }

    const { count: likeCount } = await supabase
      .from("post_acknowledgments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", id);

    let myLike = null;
    if (user) {
      const { data: likeData } = await supabase
        .from("post_acknowledgments")
        .select("id")
        .eq("post_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      myLike = likeData;
    }

    const { count: replyCount } = await supabase
      .from("post_replies")
      .select("id", { count: "exact", head: true })
      .eq("post_id", id);

    if (user) {
      const { data: existingView } = await supabase.from("post_views").select("id").eq("post_id", id).eq("viewer_id", user.id).maybeSingle();
      if (!existingView) {
        await supabase.from("post_views").insert({ post_id: id, viewer_id: user.id });
        await supabase.from("posts").update({ view_count: (data.view_count || 0) + 1 }).eq("id", id);
      }
    }

    setPost({
      id: data.id,
      content: data.content,
      image_url: data.image_url,
      images: ((data as any).post_images || []).sort((a: any, b: any) => a.display_order - b.display_order).map((i: any) => i.image_url),
      created_at: data.created_at,
      view_count: (data.view_count || 0) + (user ? 1 : 0),
      author: (data as any).profiles,
      liked: !!myLike,
      likeCount: likeCount || 0,
      replyCount: replyCount || 0,
    });
    setLoading(false);
  }, [id, user]);

  const loadReplies = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("post_replies")
      .select("id, content, created_at, profiles!post_replies_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)")
      .eq("post_id", id)
      .order("created_at", { ascending: true })
      .limit(50);

    if (data) {
      setReplies(data.map((r: any) => ({ ...r, author: r.profiles })));
    }
  }, [id]);

  useEffect(() => { loadPost(); loadReplies(); }, [loadPost, loadReplies]);

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`post-detail:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "post_replies", filter: `post_id=eq.${id}` },
        () => loadReplies()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_acknowledgments", filter: `post_id=eq.${id}` },
        () => {
          if (!user) return;
          supabase
            .from("post_acknowledgments")
            .select("id", { count: "exact", head: true })
            .eq("post_id", id)
            .then(({ count }) => {
              setPost((p) => p ? { ...p, likeCount: count || 0 } : p);
            });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, user, loadReplies]);

  async function toggleLike() {
    if (!post) return;
    if (!user) { router.push("/(auth)/login"); return; }
    if (Platform.OS !== "web") { try { const H = require("expo-haptics"); H.impactAsync(H.ImpactFeedbackStyle.Light); } catch {} }
    if (post.liked) {
      const { error } = await supabase.from("post_acknowledgments").delete().eq("post_id", post.id).eq("user_id", user.id);
      if (!error) setPost({ ...post, liked: false, likeCount: Math.max(0, post.likeCount - 1) });
    } else {
      const { error } = await supabase.from("post_acknowledgments").insert({ post_id: post.id, user_id: user.id });
      if (!error) {
        setPost({ ...post, liked: true, likeCount: post.likeCount + 1 });
        if (post.author.id !== user.id) {
          notifyPostLike({
            postAuthorId: post.author.id,
            likerName: myProfile?.display_name || "Someone",
            likerUserId: user.id,
            postId: post.id,
          });
        }
        try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_liked"); } catch (_) {}
      }
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !user || sending) return;
    if (replyText.trim().length > 280) {
      showAlert("Too long", "Replies are limited to 280 characters.");
      return;
    }
    setSending(true);
    if (Platform.OS !== "web") { try { const H = require("expo-haptics"); H.impactAsync(H.ImpactFeedbackStyle.Light); } catch {} }
    const content = replyText.trim();
    const { error } = await supabase.from("post_replies").insert({
      post_id: id,
      author_id: user.id,
      content,
    });
    if (error) {
      showAlert("Error", "Could not post reply.");
    } else {
      setReplyText("");
      setPost((p) => p ? { ...p, replyCount: p.replyCount + 1 } : p);
      loadReplies();
      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_reply"); } catch (_) {}
      if (post && post.author.id !== user.id) {
        notifyPostReply({
          postAuthorId: post.author.id,
          replierName: myProfile?.display_name || "Someone",
          replierUserId: user.id,
          postId: post.id,
          replyPreview: content,
        });
      }
    }
    setSending(false);
  }

  if (loading) return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Post</Text>
        <View style={{ width: 24 }} />
      </View>
      <PostDetailSkeleton />
    </View>
  );
  if (!post) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.text }}>Post not found</Text></View>;

  const allImages = post.images.length > 0 ? post.images : post.image_url ? [post.image_url] : [];
  const seoTitle = `${post.author.display_name} on AfuChat`;
  const seoDesc = post.content.length > 160 ? post.content.slice(0, 157) + "..." : post.content;
  const seoImage = allImages.length > 0 ? allImages[0] : post.author.avatar_url || undefined;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Post</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={replies}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={[styles.postSection, { backgroundColor: colors.surface }]}>
            <View style={styles.postHeader}>
              <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: post.author.id } })}>
                <Avatar uri={post.author.avatar_url} name={post.author.display_name} size={44} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={[styles.authorName, { color: colors.text }]}>{post.author.display_name}</Text>
                  {post.author.is_organization_verified && <Ionicons name="checkmark-circle" size={14} color={Colors.gold} style={{ marginLeft: 4 }} />}
                  {!post.author.is_organization_verified && post.author.is_verified && <Ionicons name="checkmark-circle" size={14} color={Colors.brand} style={{ marginLeft: 4 }} />}
                </View>
                <Text style={[styles.authorHandle, { color: colors.textSecondary }]}>@{post.author.handle}</Text>
              </View>
            </View>

            <RichText style={[styles.postContent, { color: colors.text }]}>{postDisplayText || post.content}</RichText>
            {postIsTranslated && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 0, marginBottom: 6 }}>
                <Ionicons name="language" size={11} color={colors.textMuted} />
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted }}>
                  {`Translated · ${LANG_LABELS[postLang || ""] ?? postLang}`}
                </Text>
              </View>
            )}

            {allImages.length > 0 && (
              <View style={styles.imgWrap}>
                {allImages.map((uri, i) => (
                  <TouchableOpacity key={i} activeOpacity={0.9} onPress={() => imgViewer.openViewer(allImages, i)}>
                    <Image source={{ uri }} style={styles.postImg} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={[styles.postTime, { color: colors.textMuted }]}>
              {new Date(post.created_at).toLocaleString()} · {post.view_count} views
            </Text>

            <View style={[styles.statsBar, { borderColor: colors.border }]}>
              <TouchableOpacity style={styles.statBtn} onPress={toggleLike}>
                <Ionicons name={post.liked ? "heart" : "heart-outline"} size={20} color={post.liked ? "#FF3B30" : colors.textSecondary} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>{post.likeCount}</Text>
              </TouchableOpacity>
              <View style={styles.statBtn}>
                <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>{post.replyCount}</Text>
              </View>
              <TouchableOpacity style={styles.statBtn} onPress={() => sharePost({ postId: post.id, authorName: post.author.display_name, content: post.content })}>
                <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {replies.length >= 2 && (
              <TouchableOpacity
                style={[styles.aiSummaryBtn, { backgroundColor: Colors.brand + "12", borderColor: Colors.brand + "30" }]}
                onPress={async () => {
                  setAiSummarizing(true);
                  setAiSummary(null);
                  try {
                    const summary = await aiSummarizeThread(
                      post.content,
                      replies.map(r => ({ author: r.author.display_name, content: r.content })),
                    );
                    setAiSummary(summary);
                  } catch { showAlert("AI Error", "Could not summarize. Try again."); }
                  setAiSummarizing(false);
                }}
                disabled={aiSummarizing}
              >
                {aiSummarizing ? (
                  <ActivityIndicator size="small" color={Colors.brand} />
                ) : (
                  <Ionicons name="sparkles" size={14} color={Colors.brand} />
                )}
                <Text style={[styles.aiSummaryBtnText, { color: Colors.brand }]}>
                  {aiSummarizing ? "Summarizing..." : "AI Summarize Thread"}
                </Text>
              </TouchableOpacity>
            )}
            {aiSummary && (
              <View style={[styles.aiSummaryCard, { backgroundColor: Colors.brand + "10", borderColor: Colors.brand + "25" }]}>
                <View style={styles.aiSummaryHeader}>
                  <Ionicons name="sparkles" size={14} color={Colors.brand} />
                  <Text style={[styles.aiSummaryTitle, { color: Colors.brand }]}>AI Summary</Text>
                  <TouchableOpacity onPress={() => setAiSummary(null)} hitSlop={8} style={{ marginLeft: "auto" }}>
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.aiSummaryText, { color: colors.text }]}>{aiSummary}</Text>
              </View>
            )}
            {replies.length > 0 && (
              <Text style={[styles.repliesLabel, { color: colors.textMuted }]}>Replies</Text>
            )}
          </View>
        }
        renderItem={({ item }) => <ReplyCard item={item} colors={colors} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      />

      {user ? (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
          <View style={[styles.replyBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
            <View style={[styles.replyInputWrap, { backgroundColor: colors.inputBg }]}>
              <TextInput
                style={[styles.replyInput, { color: colors.text }]}
                placeholder="Write a reply..."
                placeholderTextColor={colors.textMuted}
                value={replyText}
                onChangeText={setReplyText}
                maxLength={280}
                multiline
              />
            </View>
            <TouchableOpacity
              onPress={sendReply}
              disabled={!replyText.trim() || sending}
              style={[styles.replySendBtn, { backgroundColor: replyText.trim() && !sending ? Colors.brand : colors.border }]}
            >
              {sending ? <ActivityIndicator color="#fff" size="small" /> : (
                <Ionicons name="send" size={16} color={replyText.trim() ? "#fff" : colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={[styles.replyBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
          <TouchableOpacity
            onPress={() => router.push("/(auth)/login")}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.brand, paddingVertical: 10, borderRadius: 24 }}
          >
            <Ionicons name="log-in-outline" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Sign in to reply</Text>
          </TouchableOpacity>
        </View>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  postSection: { padding: 16, gap: 12 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  authorName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  authorHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  postContent: { fontSize: 17, fontFamily: "Inter_400Regular", lineHeight: 26 },
  imgWrap: { gap: 6 },
  postImg: { width: "100%", height: 200, borderRadius: 12 },
  postTime: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statsBar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 28 },
  statBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  repliesLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  replyHeader: { flexDirection: "row", alignItems: "center" },
  replyName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  replyTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  replyContent: { fontSize: 15, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 21 },
  replyBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingTop: 4, gap: 6 },
  replyInputWrap: { flex: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 0 },
  replyInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 20, maxHeight: 100, borderWidth: 0, outlineStyle: "none" as any, paddingVertical: 0, minHeight: 20 },
  replySendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginBottom: 1 },
  aiSummaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  aiSummaryBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  aiSummaryCard: { borderRadius: 12, padding: 14, borderWidth: 1 },
  aiSummaryHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  aiSummaryTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  aiSummaryText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
});
