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
import { decodeId } from "@/lib/shortId";
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
import { useIsDesktop } from "@/hooks/useIsDesktop";

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
  if (images.length === 2) {
    return (
      <View style={styles.imgGrid2}>
        {images.map((uri, i) => (
          <TouchableOpacity key={i} activeOpacity={0.9} onPress={() => onPress(i)} style={{ flex: 1 }}>
            <Image source={{ uri }} style={styles.imgHalf} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.imgGridMany}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => onPress(0)} style={{ flex: 1 }}>
        <Image source={{ uri: images[0] }} style={styles.imgMainMany} resizeMode="cover" />
      </TouchableOpacity>
      <View style={styles.imgColMany}>
        {images.slice(1, 3).map((uri, i) => (
          <TouchableOpacity key={i} activeOpacity={0.9} onPress={() => onPress(i + 1)} style={{ flex: 1 }}>
            <Image source={{ uri }} style={styles.imgThumb} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const THREAD_COLORS = ["#00BCD4", "#5C6BC0", "#26A69A", "#EF6C00", "#8E24AA"];

function ReplyCard({ item, colors, depth, onReplyTo }: { item: Reply; colors: any; depth: number; onReplyTo: (reply: Reply) => void }) {
  const { displayText, isTranslated, lang } = useAutoTranslate(item.content);
  const [collapsed, setCollapsed] = useState(false);
  const [liked, setLiked] = useState(false);
  const [localLikes, setLocalLikes] = useState(0);
  const indent = Math.min(depth, 4) * 18;
  const hasChildren = (item.children?.length ?? 0) > 0;
  const threadColor = THREAD_COLORS[depth % THREAD_COLORS.length];
  const isTopLevel = depth === 0;
  const avatarSize = isTopLevel ? 36 : 28;

  return (
    <>
      <View style={{ flexDirection: "row", paddingLeft: 16 + indent, paddingRight: 16, paddingTop: isTopLevel ? 14 : 8, paddingBottom: 2 }}>
        {depth > 0 && <View style={{ width: 2, borderRadius: 1, backgroundColor: threadColor + "50", position: "absolute", left: 16 + indent - 10, top: 0, bottom: 0 }} />}
        <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author.id, init_name: item.author.display_name, init_handle: item.author.handle, init_avatar: item.author.avatar_url ?? "", init_verified: item.author.is_verified ? "1" : "0", init_org_verified: item.author.is_organization_verified ? "1" : "0" } })} activeOpacity={0.8} style={{ marginRight: 10, marginTop: 2 }}>
          <Avatar uri={item.author.avatar_url} name={item.author.display_name} size={avatarSize} square={!!(item.author.is_organization_verified)} />
          {isTopLevel && (
            <View style={{ position: "absolute", bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#34C759" }} />
            </View>
          )}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 3 }}>
            <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author.id, init_name: item.author.display_name, init_handle: item.author.handle, init_avatar: item.author.avatar_url ?? "", init_verified: item.author.is_verified ? "1" : "0", init_org_verified: item.author.is_organization_verified ? "1" : "0" } })} activeOpacity={0.8}>
              <Text style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_700Bold" }} numberOfLines={1}>{item.author.display_name}</Text>
            </TouchableOpacity>
            {item.author.is_organization_verified && <Ionicons name="checkmark-circle" size={13} color={Colors.gold} />}
            {!item.author.is_organization_verified && item.author.is_verified && <Ionicons name="checkmark-circle" size={13} color={colors.accent} />}
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>@{item.author.handle}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>· {timeAgo(item.created_at)}</Text>
          </View>
          <RichText style={{ color: colors.text, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 }}>{displayText}</RichText>
          {isTranslated && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 }}>
              <Ionicons name="language" size={10} color={colors.textMuted} />
              <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.textMuted }}>{`Translated · ${LANG_LABELS[lang || ""] ?? lang}`}</Text>
            </View>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8, marginBottom: 4 }}>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => { const next = !liked; setLiked(next); setLocalLikes((c) => next ? c + 1 : Math.max(0, c - 1)); }} activeOpacity={0.7}>
              <Ionicons name={liked ? "heart" : "heart-outline"} size={14} color={liked ? "#FF2D55" : colors.textMuted} />
              {localLikes > 0 && <Text style={{ color: liked ? "#FF2D55" : colors.textMuted, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{localLikes}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => onReplyTo(item)} activeOpacity={0.7}>
              <Ionicons name="arrow-undo-outline" size={14} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Reply</Text>
            </TouchableOpacity>
            {hasChildren && (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => setCollapsed((c) => !c)} activeOpacity={0.7}>
                <Ionicons name={collapsed ? "chevron-down-circle-outline" : "chevron-up-circle-outline"} size={14} color={threadColor} />
                <Text style={{ color: threadColor, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{collapsed ? `${item.children!.length} ${item.children!.length === 1 ? "reply" : "replies"}` : "Hide"}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
      {isTopLevel && !hasChildren && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 16 + indent + avatarSize + 10, marginRight: 16, marginTop: 4 }} />}
      {!collapsed && item.children?.map((child) => <ReplyCard key={child.id} item={child} colors={colors} depth={depth + 1} onReplyTo={onReplyTo} />)}
      {isTopLevel && hasChildren && !collapsed && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 16, marginRight: 16, marginTop: 6, marginBottom: 2 }} />}
    </>
  );
}

function buildReplyTree(flatReplies: Reply[]): Reply[] {
  const map = new Map<string, Reply>();
  const roots: Reply[] = [];
  for (const r of flatReplies) map.set(r.id, { ...r, children: [] });
  for (const r of flatReplies) {
    const node = map.get(r.id)!;
    if (r.parent_reply_id && map.has(r.parent_reply_id)) map.get(r.parent_reply_id)!.children!.push(node);
    else roots.push(node);
  }
  return roots;
}

export default function PostShortLinkScreen() {
  const { id: shortCode } = useLocalSearchParams<{ id: string }>();
  const id = useMemo(() => (shortCode ? decodeId(shortCode) : shortCode), [shortCode]);

  const { user, profile: myProfile } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useIsDesktop();
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
      supabase.from("posts").select(`id, content, image_url, article_title, created_at, view_count, visibility, post_type, video_url, profiles!posts_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified), post_images(image_url, display_order)`).eq("id", id).single(),
      supabase.from("post_acknowledgments").select("id", { count: "exact", head: true }).eq("post_id", id),
      supabase.from("post_replies").select("id", { count: "exact", head: true }).eq("post_id", id),
      user ? supabase.from("post_acknowledgments").select("id").eq("post_id", id).eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
      user ? supabase.from("post_views").select("id").eq("post_id", id).eq("viewer_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const data = postRes.data;
    if (!data) { setLoading(false); return; }
    if ((data as any).post_type === "video" && (data as any).video_url && !isDesktop) { router.replace({ pathname: "/video/[id]", params: { id: data.id } }); return; }
    const viewCount = data.view_count || 0;
    setPost({ id: data.id, content: data.content, image_url: data.image_url, images: ((data as any).post_images || []).sort((a: any, b: any) => a.display_order - b.display_order).map((i: any) => i.image_url), post_type: (data as any).post_type || null, article_title: (data as any).article_title || null, created_at: data.created_at, view_count: viewCount, visibility: (data as any).visibility || "public", author: (data as any).profiles, liked: !!(myLikeRes as any).data, likeCount: likeCountRes.count || 0, replyCount: replyCountRes.count || 0 });
    setLoading(false);
    if (user && !(myViewRes as any).data) supabase.from("post_views").insert({ post_id: id, viewer_id: user.id }).then(() => supabase.from("posts").update({ view_count: viewCount + 1 }).eq("id", id));
  }, [id, user]);

  const loadReplies = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("post_replies").select("id, content, created_at, parent_reply_id, profiles!post_replies_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)").eq("post_id", id).order("created_at", { ascending: true }).limit(200);
    if (data) setReplies(data.map((r: any) => ({ ...r, author: r.profiles, parent_reply_id: r.parent_reply_id || null })));
  }, [id]);

  useEffect(() => { loadPost(); loadReplies(); }, [loadPost, loadReplies]);

  useEffect(() => {
    if (!post || !shortCode) return;
    const snippet = (post.content || "").slice(0, 70);
    const title = `${post.author?.display_name ?? "User"} on AfuChat: "${snippet}${(post.content?.length ?? 0) > 70 ? "…" : ""}"`;
    const description = (post.content || "").slice(0, 200) || "View this post on AfuChat.";
    const image = (post.images?.[0] ?? post.image_url) ?? undefined;
    setPageMeta({ title, description, image, url: `https://afuchat.com/p/${shortCode}`, type: "article", publishedAt: post.created_at, author: post.author?.display_name });
    return resetPageMeta;
  }, [post, shortCode]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`post-detail:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_replies", filter: `post_id=eq.${id}` }, () => loadReplies())
      .on("postgres_changes", { event: "*", schema: "public", table: "post_acknowledgments", filter: `post_id=eq.${id}` }, (payload: any) => {
        const evType = payload.eventType;
        if (evType !== "INSERT" && evType !== "DELETE") return;
        const isOwnAction = (evType === "INSERT" && payload.new?.user_id === user?.id) || (evType === "DELETE" && payload.old?.user_id === user?.id);
        if (isOwnAction) return;
        setPost((p) => p ? { ...p, likeCount: Math.max(0, p.likeCount + (evType === "INSERT" ? 1 : -1)) } : p);
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
        if (post.author.id !== user.id) notifyPostLike({ postAuthorId: post.author.id, likerName: myProfile?.display_name || "Someone", likerUserId: user.id, postId: post.id });
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
    if (error) { showAlert("Error", "Could not post reply."); }
    else {
      setReplyText(""); setReplyingTo(null);
      setPost((p) => p ? { ...p, replyCount: p.replyCount + 1 } : p);
      loadReplies();
      try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_reply"); } catch (_) {}
      if (post && post.author.id !== user.id) notifyPostReply({ postAuthorId: post.author.id, replierName: myProfile?.display_name || "Someone", replierUserId: user.id, postId: post.id, replyPreview: content });
    }
    setSending(false);
  }

  async function handleEdit() {
    if (!post || !user || editSaving) return;
    if (!editContent.trim()) { showAlert("Error", "Post content cannot be empty."); return; }
    setEditSaving(true);
    const { error } = await supabase.from("posts").update({ content: editContent.trim(), updated_at: new Date().toISOString() }).eq("id", post.id).eq("author_id", user.id);
    if (error) { showAlert("Error", "Could not update post."); }
    else { setPost({ ...post, content: editContent.trim() }); setEditMode(false); if (Platform.OS !== "web") { try { const H = require("expo-haptics"); H.notificationAsync(H.NotificationFeedbackType.Success); } catch {} } }
    setEditSaving(false);
  }

  async function handleDelete() {
    if (!post || !user) return;
    setMenuVisible(false);
    showAlert("Delete Post", "Are you sure you want to delete this post? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { const { error } = await supabase.from("posts").delete().eq("id", post.id).eq("author_id", user.id); if (error) { showAlert("Error", "Could not delete post."); } else { router.back(); } } },
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
          <Ionicons name={post!.liked ? "heart" : "heart-outline"} size={22} color={post!.liked ? "#FF3B30" : colors.textSecondary} />
          <Text style={[styles.engagementCount, { color: post!.liked ? "#FF3B30" : colors.textSecondary }]}>{post!.likeCount}</Text>
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
        <TouchableOpacity style={styles.engagementBtn} onPress={() => sharePost({ postId: post!.id, authorName: post!.author.display_name, content: post!.content })} activeOpacity={0.7}>
          <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.engagementCount, { color: colors.textSecondary }]}>Share</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderAiSection() {
    if (replies.length < 2) return null;
    return !aiSummary ? (
      <TouchableOpacity style={[styles.aiBtn, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "30" }]} onPress={async () => { setAiSummarizing(true); setAiSummary(null); try { const s = await aiSummarizeThread(post!.content, replies.map(r => ({ author: r.author.display_name, content: r.content }))); setAiSummary(s); } catch { showAlert("AI Error", "Could not summarize. Try again."); } setAiSummarizing(false); }} disabled={aiSummarizing}>
        {aiSummarizing ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="sparkles" size={15} color={colors.accent} />}
        <Text style={[styles.aiBtnText, { color: colors.accent }]}>{aiSummarizing ? "Summarizing discussion…" : "AI Summarize Discussion"}</Text>
      </TouchableOpacity>
    ) : (
      <View style={[styles.aiCard, { backgroundColor: colors.accent + "0D", borderColor: colors.accent + "22" }]}>
        <View style={styles.aiCardHeader}>
          <Ionicons name="sparkles" size={14} color={colors.accent} />
          <Text style={[styles.aiCardTitle, { color: colors.accent }]}>AI Summary</Text>
          <TouchableOpacity onPress={() => setAiSummary(null)} hitSlop={8} style={{ marginLeft: "auto" }}><Ionicons name="close" size={16} color={colors.textMuted} /></TouchableOpacity>
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
          <Text style={[styles.repliesHeaderText, { color: colors.textMuted }]}>{replies.length} {replies.length === 1 ? "Reply" : "Replies"}</Text>
        </View>
        <View style={[styles.repliesHeaderLine, { backgroundColor: colors.border }]} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{post.post_type === "article" ? "Article" : "Post"}</Text>
        <TouchableOpacity onPress={() => setMenuVisible(true)} hitSlop={8}><Ionicons name="ellipsis-horizontal" size={22} color={colors.text} /></TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 52 : 0}>
        <FlatList
          data={buildReplyTree(replies)}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View>
              {post.post_type === "article" ? (
                <View style={{ backgroundColor: colors.surface }}>
                  {allImages.length > 0 ? (
                    <TouchableOpacity activeOpacity={0.95} onPress={() => imgViewer.openViewer(allImages, 0)} style={styles.heroWrap}>
                      <Image source={{ uri: allImages[0] }} style={styles.articleHero} resizeMode="cover" />
                      <LinearGradient colors={["transparent", isDark ? "rgba(13,17,23,0.95)" : "rgba(255,255,255,0.92)"]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0.35 }} end={{ x: 0, y: 1 }} pointerEvents="none" />
                      <View style={styles.heroOverlayContent}>
                        <View style={styles.articleBadgeRow}>
                          <Ionicons name="document-text" size={12} color={colors.accent} />
                          <Text style={[styles.articleBadgeTxt, { color: colors.accent }]}>ARTICLE</Text>
                          <Text style={[styles.readingTime, { color: colors.textSecondary }]}>· {readingTime(post.content)} min read</Text>
                        </View>
                        {post.article_title && !editMode && <Text style={[styles.articleHeadingOnHero, { color: colors.text }]}>{post.article_title}</Text>}
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.articleNoHeroPad}>
                      <View style={styles.articleBadgeRow}>
                        <Ionicons name="document-text" size={12} color={colors.accent} />
                        <Text style={[styles.articleBadgeTxt, { color: colors.accent }]}>ARTICLE</Text>
                        <Text style={[styles.readingTime, { color: colors.textSecondary }]}>· {readingTime(post.content)} min read</Text>
                      </View>
                      {post.article_title && !editMode && <Text style={[styles.articleHeading, { color: colors.text }]}>{post.article_title}</Text>}
                    </View>
                  )}
                  <View style={styles.articleContentPad}>
                    <View style={[styles.authorByline, { borderColor: colors.border }]}>
                      <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: post.author.id, init_name: post.author.display_name, init_handle: post.author.handle, init_avatar: post.author.avatar_url ?? "", init_verified: post.author.is_verified ? "1" : "0", init_org_verified: post.author.is_organization_verified ? "1" : "0" } })}>
                        <Avatar uri={post.author.avatar_url} name={post.author.display_name} size={38} />
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        <View style={styles.nameRow}>
                          <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: post.author.id, init_name: post.author.display_name, init_handle: post.author.handle, init_avatar: post.author.avatar_url ?? "", init_verified: post.author.is_verified ? "1" : "0", init_org_verified: post.author.is_organization_verified ? "1" : "0" } })}>
                            <Text style={[styles.authorName, { color: colors.text }]}>{post.author.display_name}</Text>
                          </TouchableOpacity>
                          {post.author.is_organization_verified && <Ionicons name="checkmark-circle" size={14} color={Colors.gold} style={{ marginLeft: 4 }} />}
                          {!post.author.is_organization_verified && post.author.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.accent} style={{ marginLeft: 4 }} />}
                        </View>
                        <Text style={[styles.authorMeta, { color: colors.textMuted }]}>{new Date(post.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} · {post.view_count.toLocaleString()} views</Text>
                      </View>
                    </View>
                    {editMode ? (
                      <View style={{ gap: 10 }}>
                        <TextInput style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]} value={editContent} onChangeText={setEditContent} multiline autoFocus maxLength={2000} />
                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.border }]} onPress={() => setEditMode(false)}><Text style={[styles.editBtnText, { color: colors.text }]}>Cancel</Text></TouchableOpacity>
                          <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.accent }]} onPress={handleEdit} disabled={editSaving}>{editSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.editBtnText, { color: "#fff" }]}>Save</Text>}</TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <>
                        <RichText style={[styles.articleBodyText, { color: colors.text }]}>{postDisplayText || post.content}</RichText>
                        {postIsTranslated && <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 8 }}><Ionicons name="language" size={11} color={colors.textMuted} /><Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted }}>{`Translated · ${LANG_LABELS[postLang || ""] ?? postLang}`}</Text></View>}
                      </>
                    )}
                    {renderEngagementBar()}
                    {renderAiSection()}
                    {renderRepliesHeader()}
                  </View>
                </View>
              ) : (
                <View style={[styles.postSection, { backgroundColor: colors.surface }]}>
                  <View style={styles.postHeader}>
                    <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: post.author.id, init_name: post.author.display_name, init_handle: post.author.handle, init_avatar: post.author.avatar_url ?? "", init_verified: post.author.is_verified ? "1" : "0", init_org_verified: post.author.is_organization_verified ? "1" : "0" } })}>
                      <Avatar uri={post.author.avatar_url} name={post.author.display_name} size={46} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: post.author.id, init_name: post.author.display_name, init_handle: post.author.handle, init_avatar: post.author.avatar_url ?? "", init_verified: post.author.is_verified ? "1" : "0", init_org_verified: post.author.is_organization_verified ? "1" : "0" } })}>
                          <Text style={[styles.authorName, { color: colors.text }]}>{post.author.display_name}</Text>
                        </TouchableOpacity>
                        {post.author.is_organization_verified && <Ionicons name="checkmark-circle" size={14} color={Colors.gold} style={{ marginLeft: 4 }} />}
                        {!post.author.is_organization_verified && post.author.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.accent} style={{ marginLeft: 4 }} />}
                      </View>
                      <Text style={[styles.authorHandle, { color: colors.textMuted }]}>@{post.author.handle} · {timeAgo(post.created_at)}</Text>
                    </View>
                  </View>
                  {editMode ? (
                    <View style={{ gap: 10 }}>
                      <TextInput style={[styles.editInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]} value={editContent} onChangeText={setEditContent} multiline autoFocus maxLength={2000} />
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.border }]} onPress={() => setEditMode(false)}><Text style={[styles.editBtnText, { color: colors.text }]}>Cancel</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.accent }]} onPress={handleEdit} disabled={editSaving}>{editSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.editBtnText, { color: "#fff" }]}>Save</Text>}</TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <>
                      <RichText style={[styles.postContent, { color: colors.text }]}>{postDisplayText || post.content}</RichText>
                      {postIsTranslated && <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 4 }}><Ionicons name="language" size={11} color={colors.textMuted} /><Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted }}>{`Translated · ${LANG_LABELS[postLang || ""] ?? postLang}`}</Text></View>}
                    </>
                  )}
                  {allImages.length > 0 && <ImageGrid images={allImages} onPress={(i) => imgViewer.openViewer(allImages, i)} />}
                  <Text style={[styles.postTimestamp, { color: colors.textMuted }]}>{new Date(post.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
                  {renderEngagementBar()}
                  {renderAiSection()}
                  {renderRepliesHeader()}
                </View>
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
                  <Text style={[styles.replyingText, { color: colors.textMuted }]}>Replying to <Text style={{ color: colors.accent, fontFamily: "Inter_600SemiBold" }}>@{replyingTo.author.handle}</Text></Text>
                </View>
                <TouchableOpacity onPress={() => { setReplyingTo(null); setReplyText(""); }} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity>
              </View>
            )}
            <View style={[styles.composerBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 4, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
              <Avatar uri={myProfile?.avatar_url ?? null} name={myProfile?.display_name ?? ""} size={32} />
              <View style={[styles.composerPill, { backgroundColor: colors.inputBg }]}>
                <TextInput ref={replyInputRef} style={[styles.composerInput, { color: colors.text }]} placeholder={replyingTo ? `Reply to @${replyingTo.author.handle}…` : "Write a reply…"} placeholderTextColor={colors.textMuted} value={replyText} onChangeText={setReplyText} maxLength={280} multiline />
                {replyText.length > 200 && <Text style={[styles.charCount, { color: charLeft < 20 ? "#FF3B30" : colors.textMuted }]}>{charLeft}</Text>}
              </View>
              <TouchableOpacity onPress={sendReply} disabled={!replyText.trim() || sending} style={[styles.sendBtn, { backgroundColor: replyText.trim() && !sending ? colors.accent : colors.border }]}>
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={17} color={replyText.trim() ? "#fff" : colors.textMuted} />}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={[styles.signInBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8, borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <TouchableOpacity onPress={() => router.push("/(auth)/login")} style={[styles.signInBtn, { backgroundColor: colors.accent }]}>
              <Ionicons name="log-in-outline" size={18} color="#fff" />
              <Text style={styles.signInBtnText}>Sign in to reply</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

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

      <Modal visible={reportVisible} transparent animationType="slide" onRequestClose={() => setReportVisible(false)}>
        <View style={styles.reportOverlay}>
          <View style={[styles.reportSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.reportTitle, { color: colors.text }]}>Report Post</Text>
            <Text style={[styles.reportSub, { color: colors.textMuted }]}>Help us understand what's wrong</Text>
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {REPORT_REASONS.map((reason) => (
                <TouchableOpacity key={reason} style={[styles.reasonRow, { borderColor: colors.border }]} onPress={() => setReportReason(reason)} activeOpacity={0.7}>
                  <View style={[styles.reasonRadio, { borderColor: colors.accent }]}>{reportReason === reason && <View style={[styles.reasonRadioInner, { backgroundColor: colors.accent }]} />}</View>
                  <Text style={[styles.reasonText, { color: colors.text }]}>{reason}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {reportReason === "Other" && <TextInput style={[styles.reportOtherInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]} placeholder="Describe the issue…" placeholderTextColor={colors.textMuted} value={reportOtherText} onChangeText={setReportOtherText} multiline maxLength={500} />}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <TouchableOpacity style={[styles.reportBtn, { backgroundColor: colors.border, flex: 1 }]} onPress={() => { setReportVisible(false); setReportReason(""); setReportOtherText(""); }}><Text style={[styles.reportBtnText, { color: colors.text }]}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.reportBtn, { backgroundColor: colors.accent, flex: 1 }]} onPress={handleReport} disabled={reportSending}>{reportSending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.reportBtnText, { color: "#fff" }]}>Submit</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ImageViewer visible={imgViewer.visible} images={imgViewer.images} initialIndex={imgViewer.initialIndex} onClose={imgViewer.closeViewer} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  postSection: { marginBottom: 8 },
  postHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, paddingBottom: 10 },
  nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  authorName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  authorHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  postContent: { fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 24, paddingHorizontal: 16, paddingBottom: 12 },
  postTimestamp: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 16, paddingBottom: 12, marginTop: -4 },
  imgSingle: { width: "100%", height: 280, marginVertical: 8 },
  imgGrid2: { flexDirection: "row", gap: 2, marginVertical: 8 },
  imgHalf: { width: "100%", height: 200 },
  imgGridMany: { flexDirection: "row", gap: 2, marginVertical: 8 },
  imgMainMany: { width: "100%", height: 280 },
  imgColMany: { width: 120, gap: 2 },
  imgThumb: { width: "100%", height: 139 },
  engagementBar: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  engagementBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  engagementCount: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  engagementDivider: { width: StyleSheet.hairlineWidth, height: 24 },
  repliesHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 16 },
  repliesHeaderLine: { flex: 1, height: StyleSheet.hairlineWidth },
  repliesHeaderBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  repliesHeaderText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  aiBtn: { flexDirection: "row", alignItems: "center", gap: 8, margin: 16, padding: 12, borderRadius: 12, borderWidth: 1 },
  aiBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  aiCard: { margin: 16, padding: 14, borderRadius: 12, borderWidth: 1 },
  aiCardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  aiCardTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  aiCardText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  composerBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  composerPill: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row", alignItems: "flex-end" },
  composerInput: { flex: 1, fontSize: 15, maxHeight: 100, fontFamily: "Inter_400Regular" },
  charCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: 6, marginBottom: 2 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  replyingBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  replyingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  signInBar: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  signInBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12 },
  signInBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  menuSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 16 },
  menuHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  menuIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  menuText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  reportOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  reportSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 16 },
  reportTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 4 },
  reportSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 16 },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  reasonRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  reasonRadioInner: { width: 10, height: 10, borderRadius: 5 },
  reasonText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  reportOtherInput: { marginTop: 12, borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14, minHeight: 80 },
  reportBtn: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  reportBtnText: { fontFamily: "Inter_700Bold", fontSize: 15 },
  editInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, minHeight: 80, marginHorizontal: 16 },
  editBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", marginHorizontal: 16 },
  editBtnText: { fontFamily: "Inter_700Bold", fontSize: 15 },
  heroWrap: { position: "relative" },
  articleHero: { width: "100%", height: 240 },
  heroOverlayContent: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16 },
  articleBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  articleBadgeTxt: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  readingTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  articleHeadingOnHero: { fontSize: 22, fontFamily: "Inter_700Bold", lineHeight: 28 },
  articleNoHeroPad: { padding: 20 },
  articleHeading: { fontSize: 22, fontFamily: "Inter_700Bold", lineHeight: 28, marginTop: 10 },
  articleContentPad: { padding: 16 },
  authorByline: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 16, marginBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  authorMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  articleBodyText: { fontSize: 16, fontFamily: "Inter_400Regular", lineHeight: 26, marginBottom: 16 },
});
