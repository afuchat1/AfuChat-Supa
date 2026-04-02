import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { isUuid, isEncodedId, decodeId } from "@/lib/shortId";
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
import { setPageMeta, resetPageMeta } from "@/lib/webMeta";


type Reply = {
  id: string;
  content: string;
  created_at: string;
  parent_reply_id: string | null;
  author: { id: string; display_name: string; avatar_url: string | null; handle: string; is_verified: boolean; is_organization_verified: boolean };
  children?: Reply[];
};

type PostData = {
  id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  visibility: string;
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

function ReplyCard({ item, colors, depth, onReplyTo }: { item: Reply; colors: any; depth: number; onReplyTo: (reply: Reply) => void }) {
  const { displayText, isTranslated, lang } = useAutoTranslate(item.content);
  const indent = Math.min(depth, 3) * 28;
  return (
    <>
      <View style={[styles.replyRow, { backgroundColor: colors.surface, paddingLeft: 16 + indent }]}>
        <Avatar uri={item.author.avatar_url} name={item.author.display_name} size={depth > 0 ? 28 : 36} />
        <View style={{ flex: 1 }}>
          <View style={styles.replyHeader}>
            <Text style={[styles.replyName, { color: colors.text }]}>{item.author.display_name}</Text>
            {item.author.is_organization_verified && <Ionicons name="checkmark-circle" size={12} color={Colors.gold} style={{ marginLeft: 3 }} />}
            {!item.author.is_organization_verified && item.author.is_verified && <Ionicons name="checkmark-circle" size={12} color={colors.accent} style={{ marginLeft: 3 }} />}
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
          <TouchableOpacity onPress={() => onReplyTo(item)} style={styles.replyBtn} hitSlop={8}>
            <Ionicons name="arrow-undo-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.replyBtnText, { color: colors.textMuted }]}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
      {item.children?.map((child) => (
        <ReplyCard key={child.id} item={child} colors={colors} depth={depth + 1} onReplyTo={onReplyTo} />
      ))}
    </>
  );
}

function buildReplyTree(flatReplies: Reply[]): Reply[] {
  const map = new Map<string, Reply>();
  const roots: Reply[] = [];
  for (const r of flatReplies) {
    map.set(r.id, { ...r, children: [] });
  }
  for (const r of flatReplies) {
    const node = map.get(r.id)!;
    if (r.parent_reply_id && map.has(r.parent_reply_id)) {
      map.get(r.parent_reply_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export default function PostDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = useMemo(() => {
    if (!rawId) return rawId;
    if (isUuid(rawId)) return rawId;
    if (isEncodedId(rawId)) return decodeId(rawId);
    return rawId;
  }, [rawId]);
  const { user, profile: myProfile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<PostData | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Reply | null>(null);
  const replyInputRef = useRef<TextInput>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportOtherText, setReportOtherText] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const imgViewer = useImageViewer();
  const { displayText: postDisplayText, isTranslated: postIsTranslated, lang: postLang } = useAutoTranslate(post?.content);

  const isOwner = user && post && post.author.id === user.id;

  const loadPost = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("posts")
      .select(`id, content, image_url, created_at, view_count, visibility, post_type, video_url,
        profiles!posts_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified),
        post_images(image_url, display_order)`)
      .eq("id", id)
      .single();

    if (!data) { setLoading(false); return; }

    if (data.post_type === "video" && data.video_url) {
      router.replace({ pathname: "/video/[id]", params: { id: data.id } });
      return;
    }

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

    let viewCount = data.view_count || 0;
    if (user) {
      const { data: existingView } = await supabase.from("post_views").select("id").eq("post_id", id).eq("viewer_id", user.id).maybeSingle();
      if (!existingView) {
        await supabase.from("post_views").insert({ post_id: id, viewer_id: user.id });
        viewCount += 1;
        await supabase.from("posts").update({ view_count: viewCount }).eq("id", id);
      }
    }

    setPost({
      id: data.id,
      content: data.content,
      image_url: data.image_url,
      images: ((data as any).post_images || []).sort((a: any, b: any) => a.display_order - b.display_order).map((i: any) => i.image_url),
      created_at: data.created_at,
      view_count: viewCount,
      visibility: (data as any).visibility || "public",
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
      .select("id, content, created_at, parent_reply_id, profiles!post_replies_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)")
      .eq("post_id", id)
      .order("created_at", { ascending: true })
      .limit(200);

    if (data) {
      setReplies(data.map((r: any) => ({ ...r, author: r.profiles, parent_reply_id: r.parent_reply_id || null })));
    }
  }, [id]);

  useEffect(() => { loadPost(); loadReplies(); }, [loadPost, loadReplies]);

  useEffect(() => {
    if (!post) return;
    const snippet = (post.content || "").slice(0, 70);
    const title = `${post.author?.display_name ?? "User"} on AfuChat: "${snippet}${post.content?.length > 70 ? "…" : ""}"`;
    const description = (post.content || "").slice(0, 200) || "View this post on AfuChat.";
    const image = (post.images?.[0] ?? post.image_url) ?? undefined;
    setPageMeta({
      title,
      description,
      image,
      url: `https://afuchat.com/post/${post.id}`,
      type: "article",
      publishedAt: post.created_at,
      author: post.author?.display_name,
    });
    return resetPageMeta;
  }, [post]);

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
        (payload: any) => {
          const evType = payload.eventType;
          if (evType !== "INSERT" && evType !== "DELETE") return;
          const isOwnAction = (evType === "INSERT" && payload.new?.user_id === user?.id) || (evType === "DELETE" && payload.old?.user_id === user?.id);
          if (isOwnAction) return;
          const delta = evType === "INSERT" ? 1 : -1;
          setPost((p) => p ? { ...p, likeCount: Math.max(0, p.likeCount + delta) } : p);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "post_views", filter: `post_id=eq.${id}` },
        (payload: any) => {
          if (payload.new?.viewer_id === user?.id) return;
          setPost((p) => p ? { ...p, view_count: (p.view_count || 0) + 1 } : p);
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

  function handleReplyTo(reply: Reply) {
    setReplyingTo(reply);
    setReplyText(`@${reply.author.handle} `);
    setTimeout(() => replyInputRef.current?.focus(), 100);
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
    const insertData: any = { post_id: id, author_id: user.id, content };
    if (replyingTo) insertData.parent_reply_id = replyingTo.id;
    const { error } = await supabase.from("post_replies").insert(insertData);
    if (error) {
      showAlert("Error", "Could not post reply.");
    } else {
      setReplyText("");
      setReplyingTo(null);
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

  async function handleEdit() {
    if (!post || !user || editSaving) return;
    if (!editContent.trim()) { showAlert("Error", "Post content cannot be empty."); return; }
    setEditSaving(true);
    const { error } = await supabase
      .from("posts")
      .update({ content: editContent.trim(), updated_at: new Date().toISOString() })
      .eq("id", post.id)
      .eq("author_id", user.id);
    if (error) {
      showAlert("Error", "Could not update post.");
    } else {
      setPost({ ...post, content: editContent.trim() });
      setEditMode(false);
      if (Platform.OS !== "web") { try { const H = require("expo-haptics"); H.notificationAsync(H.NotificationFeedbackType.Success); } catch {} }
    }
    setEditSaving(false);
  }

  async function handleDelete() {
    if (!post || !user) return;
    setMenuVisible(false);
    showAlert("Delete Post", "Are you sure you want to delete this post? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          const { error } = await supabase.from("posts").delete().eq("id", post.id).eq("author_id", user.id);
          if (error) { showAlert("Error", "Could not delete post."); }
          else { router.back(); }
        }
      },
    ]);
  }

  async function handleReport() {
    if (!post || !user || reportSending) return;
    const finalReason = reportReason === "Other" ? reportOtherText.trim() : reportReason.trim();
    if (!finalReason) { showAlert("Required", "Please select or describe a reason."); return; }
    setReportSending(true);
    const { error } = await supabase.from("user_reports").insert({
      reporter_id: user.id,
      reported_user_id: post.author.id,
      reason: `Post report (${post.id})`,
      additional_info: finalReason,
    });
    setReportSending(false);
    if (error) { showAlert("Error", "Could not submit report. Please try again."); return; }
    setReportVisible(false);
    setReportReason("");
    setReportOtherText("");
    if (Platform.OS !== "web") { try { const H = require("expo-haptics"); H.notificationAsync(H.NotificationFeedbackType.Success); } catch {} }
    showAlert("Reported", "Thank you for your report. Our team will review it.");
  }


  const REPORT_REASONS = ["Spam", "Harassment", "Hate speech", "Violence", "Misinformation", "Inappropriate content", "Other"];

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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Post</Text>
        <TouchableOpacity onPress={() => setMenuVisible(true)} hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 52 : 0}>
      <FlatList
        data={buildReplyTree(replies)}
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
                    {!post.author.is_organization_verified && post.author.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.accent} style={{ marginLeft: 4 }} />}
                  </View>
                  <Text style={[styles.authorHandle, { color: colors.textSecondary }]}>@{post.author.handle}</Text>
                </View>
              </View>

              {editMode ? (
                <View style={{ gap: 10 }}>
                  <TextInput
                    style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                    value={editContent}
                    onChangeText={setEditContent}
                    multiline
                    autoFocus
                    maxLength={2000}
                  />
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <TouchableOpacity
                      style={[styles.editBtn, { backgroundColor: colors.border }]}
                      onPress={() => setEditMode(false)}
                    >
                      <Text style={[styles.editBtnText, { color: colors.text }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.editBtn, { backgroundColor: colors.accent }]}
                      onPress={handleEdit}
                      disabled={editSaving}
                    >
                      {editSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.editBtnText, { color: "#fff" }]}>Save</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <RichText style={[styles.postContent, { color: colors.text }]}>{postDisplayText || post.content}</RichText>
                  {postIsTranslated && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 0, marginBottom: 6 }}>
                      <Ionicons name="language" size={11} color={colors.textMuted} />
                      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted }}>
                        {`Translated · ${LANG_LABELS[postLang || ""] ?? postLang}`}
                      </Text>
                    </View>
                  )}
                </>
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
                  style={[styles.aiSummaryBtn, { backgroundColor: colors.accent + "12", borderColor: colors.accent + "30" }]}
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
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Ionicons name="sparkles" size={14} color={colors.accent} />
                  )}
                  <Text style={[styles.aiSummaryBtnText, { color: colors.accent }]}>
                    {aiSummarizing ? "Summarizing..." : "AI Summarize Thread"}
                  </Text>
                </TouchableOpacity>
              )}
              {aiSummary && (
                <View style={[styles.aiSummaryCard, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "25" }]}>
                  <View style={styles.aiSummaryHeader}>
                    <Ionicons name="sparkles" size={14} color={colors.accent} />
                    <Text style={[styles.aiSummaryTitle, { color: colors.accent }]}>AI Summary</Text>
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
        renderItem={({ item }) => <ReplyCard item={item} colors={colors} depth={0} onReplyTo={handleReplyTo} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      />

      {user ? (
        <>
          {replyingTo && (
            <View style={[styles.replyingBanner, { backgroundColor: colors.backgroundSecondary, borderTopColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.replyingText, { color: colors.textMuted }]}>
                  Replying to <Text style={{ color: colors.accent, fontFamily: "Inter_600SemiBold" }}>@{replyingTo.author.handle}</Text>
                </Text>
              </View>
              <TouchableOpacity onPress={() => { setReplyingTo(null); setReplyText(""); }} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}
          <View style={[styles.replyBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 4 }]}>
            <View style={[styles.replyPill, { backgroundColor: colors.inputBg }]}>
              <TouchableOpacity hitSlop={8} style={styles.pillIcon}>
                <Ionicons name="happy-outline" size={24} color={colors.textMuted} />
              </TouchableOpacity>
              <TextInput
                ref={replyInputRef}
                style={[styles.replyInput, { color: colors.text }]}
                placeholder={replyingTo ? `Reply to @${replyingTo.author.handle}...` : "Write a reply..."}
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
              style={[styles.replySendBtn, { backgroundColor: replyText.trim() && !sending ? colors.accent : colors.border }]}
            >
              {sending ? <ActivityIndicator color="#fff" size="small" /> : (
                <Ionicons name="send" size={18} color={replyText.trim() ? "#fff" : colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={[styles.replyBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
          <TouchableOpacity
            onPress={() => router.push("/(auth)/login")}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.accent, paddingVertical: 10, borderRadius: 24 }}
          >
            <Ionicons name="log-in-outline" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" }}>Sign in to reply</Text>
          </TouchableOpacity>
        </View>
      )}
      </KeyboardAvoidingView>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); sharePost({ postId: post.id, authorName: post.author.display_name, content: post.content }); }}>
              <Ionicons name="share-outline" size={22} color={colors.accent} />
              <Text style={[styles.menuText, { color: colors.text }]}>Share Post</Text>
            </TouchableOpacity>

            {isOwner && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setEditContent(post.content); setEditMode(true); }}>
                <Ionicons name="create-outline" size={22} color={colors.accent} />
                <Text style={[styles.menuText, { color: colors.text }]}>Edit Post</Text>
              </TouchableOpacity>
            )}

            {isOwner && (
              <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={22} color="#FF3B30" />
                <Text style={[styles.menuText, { color: "#FF3B30" }]}>Delete Post</Text>
              </TouchableOpacity>
            )}

            {!isOwner && user && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setReportVisible(true); }}>
                <Ionicons name="flag-outline" size={22} color="#FF9500" />
                <Text style={[styles.menuText, { color: "#FF9500" }]}>Report Post</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
              <Ionicons name="close-outline" size={22} color={colors.textMuted} />
              <Text style={[styles.menuText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={reportVisible} transparent animationType="slide" onRequestClose={() => setReportVisible(false)}>
        <View style={styles.menuOverlay}>
          <View style={[styles.reportSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.reportTitle, { color: colors.text }]}>Report Post</Text>
            <Text style={[styles.reportSubtitle, { color: colors.textMuted }]}>Why are you reporting this post?</Text>

            <View style={styles.reportReasons}>
              {REPORT_REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.reportChip,
                    { borderColor: reportReason === r ? colors.accent : colors.border,
                      backgroundColor: reportReason === r ? colors.accent + "15" : "transparent" }
                  ]}
                  onPress={() => setReportReason(r)}
                >
                  <Text style={[styles.reportChipText, { color: reportReason === r ? colors.accent : colors.text }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {reportReason === "Other" && (
              <TextInput
                style={[styles.reportInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                placeholder="Describe the issue..."
                placeholderTextColor={colors.textMuted}
                value={reportOtherText}
                onChangeText={setReportOtherText}
                multiline
                maxLength={500}
              />
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.editBtn, { flex: 1, backgroundColor: colors.border }]}
                onPress={() => { setReportVisible(false); setReportReason(""); setReportOtherText(""); }}
              >
                <Text style={[styles.editBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editBtn, { flex: 1, backgroundColor: "#FF9500" }]}
                onPress={handleReport}
                disabled={reportSending || !reportReason.trim() || (reportReason === "Other" && !reportOtherText.trim())}
              >
                {reportSending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.editBtnText, { color: "#fff" }]}>Submit Report</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  replyRow: { flexDirection: "row", paddingVertical: 10, paddingRight: 16, gap: 10 },
  replyHeader: { flexDirection: "row", alignItems: "center" },
  replyName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  replyTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  replyContent: { fontSize: 15, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 21 },
  replyBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start" },
  replyBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  replyingBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  replyingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  replyBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 5, paddingVertical: 5, gap: 5 },
  replyPill: { flex: 1, flexDirection: "row", alignItems: "center", borderRadius: 22, paddingHorizontal: 4, minHeight: 44 },
  pillIcon: { paddingHorizontal: 6 },
  replyInput: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 22, borderWidth: 0, outlineStyle: "none" as any, paddingVertical: 6, minHeight: 28, maxHeight: 120 },
  replySendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  aiSummaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  aiSummaryBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  aiSummaryCard: { borderRadius: 12, padding: 14, borderWidth: 1 },
  aiSummaryHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  aiSummaryTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  aiSummaryText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  editInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 24, minHeight: 100, textAlignVertical: "top" },
  editBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12 },
  editBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  menuSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 20 },
  menuHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  menuText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  reportSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 20, maxHeight: "80%" },
  reportTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 4 },
  reportSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 16 },
  reportReasons: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  reportChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  reportChipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  reportInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 80, textAlignVertical: "top" },
});
