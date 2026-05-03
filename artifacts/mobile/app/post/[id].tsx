import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { LinearGradient } from "expo-linear-gradient";
import { PostDetailSkeleton } from "@/components/ui/Skeleton";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { sharePost } from "@/lib/share";
import { isUuid, isEncodedId, decodeId, encodeId } from "@/lib/shortId";
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
  post_type: string | null;
  article_title: string | null;
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
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function readingTime(text: string): number {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200));
}

function ImageGrid({ images, onPress }: { images: string[]; onPress: (i: number) => void }) {
  if (images.length === 1) {
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => onPress(0)}>
        <Image source={{ uri: images[0] }} style={styles.imgSingle} resizeMode="cover" />
      </TouchableOpacity>
    );
  }
  return (
    <View style={{ gap: 4 }}>
      {/* First image — full width, tall */}
      <TouchableOpacity activeOpacity={0.9} onPress={() => onPress(0)}>
        <Image source={{ uri: images[0] }} style={styles.imgSingle} resizeMode="cover" />
      </TouchableOpacity>
      {/* Remaining images — horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 4 }}
      >
        {images.slice(1).map((uri, i) => (
          <TouchableOpacity
            key={i + 1}
            activeOpacity={0.9}
            onPress={() => onPress(i + 1)}
          >
            <Image source={{ uri }} style={styles.imgThumb} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const THREAD_COLORS = ["#00BCD4", "#5C6BC0", "#26A69A", "#EF6C00", "#8E24AA"];

function ReplyCard({
  item,
  colors,
  depth,
  onReplyTo,
}: {
  item: Reply;
  colors: any;
  depth: number;
  onReplyTo: (reply: Reply) => void;
}) {
  const { displayText, isTranslated, lang } = useAutoTranslate(item.content);
  const [collapsed, setCollapsed] = useState(false);
  const [liked, setLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(0);
  const indent = Math.min(depth, 4) * 18;
  const hasChildren = (item.children?.length ?? 0) > 0;
  const threadColor = THREAD_COLORS[depth % THREAD_COLORS.length];
  const isTopLevel = depth === 0;
  const avatarSize = isTopLevel ? 36 : 28;

  function handleLike() {
    const next = !liked;
    setLiked(next);
    setLocalLikes((c) => (next ? c + 1 : Math.max(0, c - 1)));
  }

  return (
    <>
      <View style={{ flexDirection: "row", paddingLeft: 16 + indent, paddingRight: 16, paddingTop: isTopLevel ? 14 : 8, paddingBottom: 2 }}>
        {/* Thread connector line for nested replies */}
        {depth > 0 && (
          <View
            style={{
              width: 2,
              borderRadius: 1,
              backgroundColor: threadColor + "50",
              position: "absolute",
              left: 16 + indent - 10,
              top: 0,
              bottom: 0,
            }}
          />
        )}

        {/* Avatar */}
        <TouchableOpacity onPress={() => router.push(`/contact/${item.author.id}` as any)} activeOpacity={0.8} style={{ marginRight: 10, marginTop: 2 }}>
          <Avatar uri={item.author.avatar_url} name={item.author.display_name} size={avatarSize} square={!!(item.author.is_organization_verified)} />
          {isTopLevel && (
            <View style={{
              position: "absolute", bottom: -2, right: -2,
              width: 12, height: 12, borderRadius: 6,
              backgroundColor: colors.background,
              alignItems: "center", justifyContent: "center",
            }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#34C759" }} />
            </View>
          )}
        </TouchableOpacity>

        {/* Body */}
        <View style={{ flex: 1 }}>
          {/* Header row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 3 }}>
            <TouchableOpacity onPress={() => router.push(`/contact/${item.author.id}` as any)} activeOpacity={0.8}>
              <Text style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_700Bold" }} numberOfLines={1}>
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

          {/* Content */}
          <RichText style={{ color: colors.text, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 }}>
            {displayText}
          </RichText>

          {isTranslated && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 }}>
              <Ionicons name="language" size={10} color={colors.textMuted} />
              <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.textMuted }}>
                {`Translated · ${LANG_LABELS[lang || ""] ?? lang}`}
              </Text>
            </View>
          )}

          {/* Action row */}
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
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                onPress={() => setCollapsed((c) => !c)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={collapsed ? "chevron-down-circle-outline" : "chevron-up-circle-outline"}
                  size={14}
                  color={threadColor}
                />
                <Text style={{ color: threadColor, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                  {collapsed ? `${item.children!.length} ${item.children!.length === 1 ? "reply" : "replies"}` : "Hide"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Separator line */}
      {isTopLevel && !hasChildren && (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 16 + indent + avatarSize + 10, marginRight: 16, marginTop: 4 }} />
      )}

      {/* Children */}
      {!collapsed && item.children?.map((child) => (
        <ReplyCard key={child.id} item={child} colors={colors} depth={depth + 1} onReplyTo={onReplyTo} />
      ))}

      {/* Bottom separator after thread group */}
      {isTopLevel && hasChildren && !collapsed && (
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 16, marginRight: 16, marginTop: 6, marginBottom: 2 }} />
      )}
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

  useEffect(() => {
    if (!rawId) return;
    const shortCode = isUuid(rawId) ? encodeId(rawId) : rawId;
    router.replace({ pathname: "/p/[id]", params: { id: shortCode } });
  }, [rawId]);
  const { user, profile: myProfile } = useAuth();
  const { colors, isDark } = useTheme();
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
  const charLeft = 280 - replyText.length;

  const loadPost = useCallback(async () => {
    if (!id) return;

    const [postRes, likeCountRes, replyCountRes, myLikeRes, myViewRes] = await Promise.all([
      supabase
        .from("posts")
        .select(`id, content, image_url, article_title, created_at, view_count, visibility, post_type, video_url,
          profiles!posts_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified),
          post_images(image_url, display_order)`)
        .eq("id", id)
        .single(),
      supabase
        .from("post_acknowledgments")
        .select("id", { count: "exact", head: true })
        .eq("post_id", id),
      supabase
        .from("post_replies")
        .select("id", { count: "exact", head: true })
        .eq("post_id", id),
      user
        ? supabase
            .from("post_acknowledgments")
            .select("id")
            .eq("post_id", id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase
            .from("post_views")
            .select("id")
            .eq("post_id", id)
            .eq("viewer_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const data = postRes.data;
    if (!data) { setLoading(false); return; }

    if ((data as any).post_type === "video" && (data as any).video_url) {
      router.replace({ pathname: "/video/[id]", params: { id: data.id } });
      return;
    }

    const viewCount = data.view_count || 0;

    setPost({
      id: data.id,
      content: data.content,
      image_url: data.image_url,
      images: ((data as any).post_images || [])
        .sort((a: any, b: any) => a.display_order - b.display_order)
        .map((i: any) => i.image_url),
      post_type: (data as any).post_type || null,
      article_title: (data as any).article_title || null,
      created_at: data.created_at,
      view_count: viewCount,
      visibility: (data as any).visibility || "public",
      author: (data as any).profiles,
      liked: !!(myLikeRes as any).data,
      likeCount: likeCountRes.count || 0,
      replyCount: replyCountRes.count || 0,
    });
    setLoading(false);

    // Track view in background — non-blocking so it never delays the UI
    if (user && !(myViewRes as any).data) {
      supabase
        .from("post_views")
        .insert({ post_id: id, viewer_id: user.id })
        .then(() =>
          supabase
            .from("posts")
            .update({ view_count: viewCount + 1 })
            .eq("id", id)
        );
    }
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_replies", filter: `post_id=eq.${id}` }, () => loadReplies())
      .on("postgres_changes", { event: "*", schema: "public", table: "post_acknowledgments", filter: `post_id=eq.${id}` }, (payload: any) => {
        const evType = payload.eventType;
        if (evType !== "INSERT" && evType !== "DELETE") return;
        const isOwnAction = (evType === "INSERT" && payload.new?.user_id === user?.id) || (evType === "DELETE" && payload.old?.user_id === user?.id);
        if (isOwnAction) return;
        const delta = evType === "INSERT" ? 1 : -1;
        setPost((p) => p ? { ...p, likeCount: Math.max(0, p.likeCount + delta) } : p);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_views", filter: `post_id=eq.${id}` }, (payload: any) => {
        if (payload.new?.viewer_id === user?.id) return;
        setPost((p) => p ? { ...p, view_count: (p.view_count || 0) + 1 } : p);
      })
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
          notifyPostLike({ postAuthorId: post.author.id, likerName: myProfile?.display_name || "Someone", likerUserId: user.id, postId: post.id });
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
    if (replyText.trim().length > 280) { showAlert("Too long", "Replies are limited to 280 characters."); return; }
    setSending(true);
    if (Platform.OS !== "web") { try { const H = require("expo-haptics"); H.impactAsync(H.ImpactFeedbackStyle.Light); } catch {} }
    const content = replyText.trim();
    const insertData: any = { post_id: id, author_id: user.id, content };
    if (replyingTo) insertData.parent_reply_id = replyingTo.id;
    const { error } = await supabase.from("post_replies").insert(insertData);
    if (error) {
      showAlert("Error", "Could not post reply.");
    } else {
      setReplyText(""); setReplyingTo(null);
      setPost((p) => p ? { ...p, replyCount: p.replyCount + 1 } : p);
      loadReplies();
      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_reply"); } catch (_) {}
      if (post && post.author.id !== user.id) {
        notifyPostReply({ postAuthorId: post.author.id, replierName: myProfile?.display_name || "Someone", replierUserId: user.id, postId: post.id, replyPreview: content });
      }
    }
    setSending(false);
  }

  async function handleEdit() {
    if (!post || !user || editSaving) return;
    if (!editContent.trim()) { showAlert("Error", "Post content cannot be empty."); return; }
    setEditSaving(true);
    const { error } = await supabase.from("posts").update({ content: editContent.trim(), updated_at: new Date().toISOString() }).eq("id", post.id).eq("author_id", user.id);
    if (error) { showAlert("Error", "Could not update post."); }
    else {
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
      { text: "Delete", style: "destructive", onPress: async () => {
        const { error } = await supabase.from("posts").delete().eq("id", post.id).eq("author_id", user.id);
        if (error) { showAlert("Error", "Could not delete post."); }
        else { router.back(); }
      }},
    ]);
  }

  async function handleReport() {
    if (!post || !user || reportSending) return;
    const finalReason = reportReason === "Other" ? reportOtherText.trim() : reportReason.trim();
    if (!finalReason) { showAlert("Required", "Please select or describe a reason."); return; }
    setReportSending(true);
    const { error } = await supabase.from("user_reports").insert({ reporter_id: user.id, reported_user_id: post.author.id, reason: `Post report (${post.id})`, additional_info: finalReason });
    setReportSending(false);
    if (error) { showAlert("Error", "Could not submit report. Please try again."); return; }
    setReportVisible(false); setReportReason(""); setReportOtherText("");
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

  function renderEngagementBar() {
    return (
      <View style={[styles.engagementBar, { borderColor: colors.border }]}>
        <TouchableOpacity style={styles.engagementBtn} onPress={toggleLike} activeOpacity={0.7}>
          <Ionicons
            name={post!.liked ? "heart" : "heart-outline"}
            size={22}
            color={post!.liked ? "#FF3B30" : colors.textSecondary}
          />
          <Text style={[styles.engagementCount, { color: post!.liked ? "#FF3B30" : colors.textSecondary }]}>
            {post!.likeCount}
          </Text>
        </TouchableOpacity>

        <View style={[styles.engagementDivider, { backgroundColor: colors.border }]} />

        <View style={styles.engagementBtn}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.engagementCount, { color: colors.textSecondary }]}>{post!.replyCount}</Text>
        </View>

        <View style={[styles.engagementDivider, { backgroundColor: colors.border }]} />

        <View style={styles.engagementBtn}>
          <Ionicons name="eye-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.engagementCount, { color: colors.textSecondary }]}>{post!.view_count}</Text>
        </View>

        <View style={[styles.engagementDivider, { backgroundColor: colors.border }]} />

        <TouchableOpacity
          style={styles.engagementBtn}
          onPress={() => sharePost({ postId: post!.id, authorName: post!.author.display_name, content: post!.content })}
          activeOpacity={0.7}
        >
          <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.engagementCount, { color: colors.textSecondary }]}>Share</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderAiSection() {
    if (replies.length < 2) return null;
    return !aiSummary ? (
      <TouchableOpacity
        style={[styles.aiBtn, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "30" }]}
        onPress={async () => {
          setAiSummarizing(true); setAiSummary(null);
          try {
            const summary = await aiSummarizeThread(post!.content, replies.map(r => ({ author: r.author.display_name, content: r.content })));
            setAiSummary(summary);
          } catch { showAlert("AI Error", "Could not summarize. Try again."); }
          setAiSummarizing(false);
        }}
        disabled={aiSummarizing}
      >
        {aiSummarizing
          ? <ActivityIndicator size="small" color={colors.accent} />
          : <Ionicons name="sparkles" size={15} color={colors.accent} />}
        <Text style={[styles.aiBtnText, { color: colors.accent }]}>
          {aiSummarizing ? "Summarizing discussion…" : "AI Summarize Discussion"}
        </Text>
      </TouchableOpacity>
    ) : (
      <View style={[styles.aiCard, { backgroundColor: colors.accent + "0D", borderColor: colors.accent + "22" }]}>
        <View style={styles.aiCardHeader}>
          <Ionicons name="sparkles" size={14} color={colors.accent} />
          <Text style={[styles.aiCardTitle, { color: colors.accent }]}>AI Summary</Text>
          <TouchableOpacity onPress={() => setAiSummary(null)} hitSlop={8} style={{ marginLeft: "auto" }}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.aiCardText, { color: colors.text }]}>{aiSummary}</Text>
      </View>
    );
  }

  function renderRepliesHeader() {
    if (replies.length === 0) return null;
    return (
      <View style={[styles.repliesHeader, { borderColor: colors.border }]}>
        <View style={[styles.repliesHeaderLine, { backgroundColor: colors.border }]} />
        <View style={[styles.repliesHeaderBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.repliesHeaderText, { color: colors.textMuted }]}>
            {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
          </Text>
        </View>
        <View style={[styles.repliesHeaderLine, { backgroundColor: colors.border }]} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {post.post_type === "article" ? "Article" : "Post"}
        </Text>
        <TouchableOpacity onPress={() => setMenuVisible(true)} hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 52 : 0}>
        <FlatList
          data={buildReplyTree(replies)}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View>
              {post.post_type === "article" ? (
                /* ── Article Layout ── */
                <View style={{ backgroundColor: colors.surface }}>
                  {/* Hero image with gradient overlay */}
                  {allImages.length > 0 ? (
                    <TouchableOpacity activeOpacity={0.95} onPress={() => imgViewer.openViewer(allImages, 0)} style={styles.heroWrap}>
                      <Image source={{ uri: allImages[0] }} style={styles.articleHero} resizeMode="cover" />
                      <LinearGradient
                        colors={["transparent", isDark ? "rgba(13,17,23,0.95)" : "rgba(255,255,255,0.92)"]}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0.35 }}
                        end={{ x: 0, y: 1 }}
                        pointerEvents="none"
                      />
                      <View style={styles.heroOverlayContent}>
                        <View style={styles.articleBadgeRow}>
                          <Ionicons name="document-text" size={12} color={colors.accent} />
                          <Text style={[styles.articleBadgeTxt, { color: colors.accent }]}>ARTICLE</Text>
                          <Text style={[styles.readingTime, { color: colors.textSecondary }]}>
                            · {readingTime(post.content)} min read
                          </Text>
                        </View>
                        {post.article_title && !editMode && (
                          <Text style={[styles.articleHeadingOnHero, { color: colors.text }]}>{post.article_title}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.articleNoHeroPad}>
                      <View style={styles.articleBadgeRow}>
                        <Ionicons name="document-text" size={12} color={colors.accent} />
                        <Text style={[styles.articleBadgeTxt, { color: colors.accent }]}>ARTICLE</Text>
                        <Text style={[styles.readingTime, { color: colors.textSecondary }]}>
                          · {readingTime(post.content)} min read
                        </Text>
                      </View>
                      {post.article_title && !editMode && (
                        <Text style={[styles.articleHeading, { color: colors.text }]}>{post.article_title}</Text>
                      )}
                    </View>
                  )}

                  <View style={styles.articleContentPad}>
                    {/* Author byline */}
                    <View style={[styles.authorByline, { borderColor: colors.border }]}>
                      <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: post.author.id } })}>
                        <Avatar uri={post.author.avatar_url} name={post.author.display_name} size={38} square={!!(post.author.is_organization_verified)} />
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        <View style={styles.nameRow}>
                          <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: post.author.id } })}>
                            <Text style={[styles.authorName, { color: colors.text }]}>{post.author.display_name}</Text>
                          </TouchableOpacity>
                          {post.author.is_organization_verified && <Ionicons name="checkmark-circle" size={14} color={Colors.gold} style={{ marginLeft: 4 }} />}
                          {!post.author.is_organization_verified && post.author.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.accent} style={{ marginLeft: 4 }} />}
                        </View>
                        <Text style={[styles.authorMeta, { color: colors.textMuted }]}>
                          {new Date(post.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} · {post.view_count.toLocaleString()} views
                        </Text>
                      </View>
                    </View>

                    {/* Body */}
                    {editMode ? (
                      <View style={{ gap: 10 }}>
                        <TextInput
                          style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                          value={editContent} onChangeText={setEditContent} multiline autoFocus maxLength={2000}
                        />
                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.border }]} onPress={() => setEditMode(false)}>
                            <Text style={[styles.editBtnText, { color: colors.text }]}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.accent }]} onPress={handleEdit} disabled={editSaving}>
                            {editSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.editBtnText, { color: "#fff" }]}>Save</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <>
                        <RichText style={[styles.articleBodyText, { color: colors.text }]}>{postDisplayText || post.content}</RichText>
                        {postIsTranslated && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 8 }}>
                            <Ionicons name="language" size={11} color={colors.textMuted} />
                            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted }}>
                              {`Translated · ${LANG_LABELS[postLang || ""] ?? postLang}`}
                            </Text>
                          </View>
                        )}
                      </>
                    )}

                    {renderEngagementBar()}
                    {renderAiSection()}
                    {renderRepliesHeader()}
                  </View>
                </View>
              ) : (
                /* ── Regular Post Layout ── */
                <View style={[styles.postSection, { backgroundColor: colors.surface }]}>
                  {/* Author row */}
                  <View style={styles.postHeader}>
                    <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: post.author.id } })}>
                      <Avatar uri={post.author.avatar_url} name={post.author.display_name} size={46} square={!!(post.author.is_organization_verified)} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: post.author.id } })}>
                          <Text style={[styles.authorName, { color: colors.text }]}>{post.author.display_name}</Text>
                        </TouchableOpacity>
                        {post.author.is_organization_verified && <Ionicons name="checkmark-circle" size={14} color={Colors.gold} style={{ marginLeft: 4 }} />}
                        {!post.author.is_organization_verified && post.author.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.accent} style={{ marginLeft: 4 }} />}
                      </View>
                      <Text style={[styles.authorHandle, { color: colors.textMuted }]}>
                        @{post.author.handle} · {timeAgo(post.created_at)}
                      </Text>
                    </View>
                  </View>

                  {editMode ? (
                    <View style={{ gap: 10 }}>
                      <TextInput
                        style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                        value={editContent} onChangeText={setEditContent} multiline autoFocus maxLength={2000}
                      />
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.border }]} onPress={() => setEditMode(false)}>
                          <Text style={[styles.editBtnText, { color: colors.text }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.accent }]} onPress={handleEdit} disabled={editSaving}>
                          {editSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.editBtnText, { color: "#fff" }]}>Save</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <>
                      <RichText style={[styles.postContent, { color: colors.text }]}>{postDisplayText || post.content}</RichText>
                      {postIsTranslated && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 4 }}>
                          <Ionicons name="language" size={11} color={colors.textMuted} />
                          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted }}>
                            {`Translated · ${LANG_LABELS[postLang || ""] ?? postLang}`}
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  {allImages.length > 0 && (
                    <ImageGrid images={allImages} onPress={(i) => imgViewer.openViewer(allImages, i)} />
                  )}

                  <Text style={[styles.postTimestamp, { color: colors.textMuted }]}>
                    {new Date(post.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </Text>

                  {renderEngagementBar()}
                  {renderAiSection()}
                  {renderRepliesHeader()}
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <ReplyCard item={item} colors={colors} depth={0} onReplyTo={handleReplyTo} />
          )}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        />

        {/* Reply composer */}
        {user ? (
          <>
            {replyingTo && (
              <View style={[styles.replyingBanner, { backgroundColor: colors.backgroundSecondary, borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.replyingText, { color: colors.textMuted }]}>
                    Replying to{" "}
                    <Text style={{ color: colors.accent, fontFamily: "Inter_600SemiBold" }}>@{replyingTo.author.handle}</Text>
                  </Text>
                </View>
                <TouchableOpacity onPress={() => { setReplyingTo(null); setReplyText(""); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            <View style={[styles.composerBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 4, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
              <Avatar uri={myProfile?.avatar_url ?? null} name={myProfile?.display_name ?? ""} size={32} />
              <View style={[styles.composerPill, { backgroundColor: colors.inputBg }]}>
                <TextInput
                  ref={replyInputRef}
                  style={[styles.composerInput, { color: colors.text }]}
                  placeholder={replyingTo ? `Reply to @${replyingTo.author.handle}…` : "Write a reply…"}
                  placeholderTextColor={colors.textMuted}
                  value={replyText}
                  onChangeText={setReplyText}
                  maxLength={280}
                  multiline
                />
                {replyText.length > 200 && (
                  <Text style={[styles.charCount, { color: charLeft < 20 ? "#FF3B30" : colors.textMuted }]}>
                    {charLeft}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={sendReply}
                disabled={!replyText.trim() || sending}
                style={[styles.sendBtn, { backgroundColor: replyText.trim() && !sending ? colors.accent : colors.border }]}
              >
                {sending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Ionicons name="send" size={17} color={replyText.trim() ? "#fff" : colors.textMuted} />}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={[styles.signInBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <TouchableOpacity
              onPress={() => router.push("/(auth)/login")}
              style={[styles.signInBtn, { backgroundColor: colors.accent }]}
            >
              <Ionicons name="log-in-outline" size={18} color="#fff" />
              <Text style={styles.signInBtnText}>Sign in to reply</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Context menu */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); sharePost({ postId: post.id, authorName: post.author.display_name, content: post.content }); }}>
              <View style={[styles.menuIconWrap, { backgroundColor: colors.accent + "15" }]}><Ionicons name="share-outline" size={20} color={colors.accent} /></View>
              <Text style={[styles.menuText, { color: colors.text }]}>Share Post</Text>
            </TouchableOpacity>

            {isOwner && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setEditContent(post.content); setEditMode(true); }}>
                <View style={[styles.menuIconWrap, { backgroundColor: colors.accent + "15" }]}><Ionicons name="create-outline" size={20} color={colors.accent} /></View>
                <Text style={[styles.menuText, { color: colors.text }]}>Edit Post</Text>
              </TouchableOpacity>
            )}

            {isOwner && (
              <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                <View style={[styles.menuIconWrap, { backgroundColor: "#FF3B3015" }]}><Ionicons name="trash-outline" size={20} color="#FF3B30" /></View>
                <Text style={[styles.menuText, { color: "#FF3B30" }]}>Delete Post</Text>
              </TouchableOpacity>
            )}

            {!isOwner && user && (
              <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setReportVisible(true); }}>
                <View style={[styles.menuIconWrap, { backgroundColor: "#FF950015" }]}><Ionicons name="flag-outline" size={20} color="#FF9500" /></View>
                <Text style={[styles.menuText, { color: "#FF9500" }]}>Report Post</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.menuItem, { marginTop: 4 }]} onPress={() => setMenuVisible(false)}>
              <View style={[styles.menuIconWrap, { backgroundColor: colors.border }]}><Ionicons name="close-outline" size={20} color={colors.textMuted} /></View>
              <Text style={[styles.menuText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report modal */}
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
                  style={[styles.reportChip, { borderColor: reportReason === r ? colors.accent : colors.border, backgroundColor: reportReason === r ? colors.accent + "12" : "transparent" }]}
                  onPress={() => setReportReason(r)}
                >
                  <Text style={[styles.reportChipText, { color: reportReason === r ? colors.accent : colors.text }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {reportReason === "Other" && (
              <TextInput
                style={[styles.reportInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                placeholder="Describe the issue…"
                placeholderTextColor={colors.textMuted}
                value={reportOtherText}
                onChangeText={setReportOtherText}
                multiline
                maxLength={500}
              />
            )}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={[styles.editBtn, { flex: 1, backgroundColor: colors.border }]} onPress={() => { setReportVisible(false); setReportReason(""); setReportOtherText(""); }}>
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
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },

  /* Article hero */
  heroWrap: { position: "relative" },
  articleHero: { width: "100%", height: 280 },
  heroOverlayContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 18,
    paddingBottom: 20,
  },
  articleNoHeroPad: { padding: 18, paddingBottom: 4 },
  articleHeadingOnHero: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    lineHeight: 32,
    marginTop: 8,
  },
  articleHeading: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    lineHeight: 34,
    marginTop: 10,
  },

  /* Article content */
  articleContentPad: { padding: 16, paddingTop: 14 },
  articleBadgeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  articleBadgeTxt: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  readingTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  articleBodyText: {
    fontSize: 17,
    fontFamily: "Inter_400Regular",
    lineHeight: 30,
    marginBottom: 20,
  },

  /* Author byline */
  authorByline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    marginBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  authorName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  authorMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  /* Regular post */
  postSection: { padding: 16, gap: 12 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  authorHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  postContent: { fontSize: 18, fontFamily: "Inter_400Regular", lineHeight: 28 },
  postTimestamp: { fontSize: 13, fontFamily: "Inter_400Regular" },

  /* Image grid */
  imgSingle: { width: "100%", height: 260, borderRadius: 14 },
  imgThumb: { width: 110, height: 110, borderRadius: 10 },
  imgGrid2: { flexDirection: "row", gap: 4, height: 220, borderRadius: 14, overflow: "hidden" },
  imgGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, borderRadius: 14, overflow: "hidden" },
  imgGridItem: { width: "49.5%", height: 160, position: "relative" },
  imgGridCell: { width: "100%", height: "100%" },
  imgMoreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  imgMoreText: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },

  /* Engagement bar */
  engagementBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginVertical: 14,
    paddingVertical: 2,
  },
  engagementBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  engagementDivider: { width: StyleSheet.hairlineWidth, marginVertical: 6 },
  engagementCount: { fontSize: 14, fontFamily: "Inter_500Medium" },

  /* AI section */
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 12,
  },
  aiBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  aiCard: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 12 },
  aiCardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  aiCardTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  aiCardText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },

  /* Replies section header */
  repliesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    marginTop: 8,
    marginHorizontal: -16,
    paddingHorizontal: 0,
  },
  repliesHeaderLine: { flex: 1, height: StyleSheet.hairlineWidth },
  repliesHeaderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  repliesHeaderText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  /* Reply card */
  replyRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingRight: 16,
    gap: 10,
    position: "relative",
  },
  replyDepthLine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },
  replyBubble: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  replyHeader: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  replyName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  replyTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  replyContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  replyBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start" },
  replyBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  /* Reply composer */
  replyingBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  replyingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  composerBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  composerPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    minHeight: 44,
  },
  composerInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    borderWidth: 0,
    outlineStyle: "none" as any,
    maxHeight: 120,
  },
  charCount: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 2 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  signInBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 24,
  },
  signInBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  /* Edit mode */
  editInput: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    lineHeight: 24,
    minHeight: 100,
    textAlignVertical: "top",
  },
  editBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  editBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  /* Menu & report */
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  menuSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 20 },
  menuHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
  menuIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  menuText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  reportSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 20, maxHeight: "80%" },
  reportTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 4 },
  reportSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 16, color: "gray" },
  reportReasons: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  reportChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  reportChipText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  reportInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 80, textAlignVertical: "top" },
});
