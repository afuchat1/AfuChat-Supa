import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { RichText } from "@/components/ui/RichText";
import Colors from "@/constants/colors";
import { notifyPostLike, notifyPostReply } from "@/lib/notifyUser";
import { showAlert } from "@/lib/alert";

const BRAND = Colors.brand;

type Author = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  handle: string;
  is_verified: boolean;
  is_organization_verified: boolean;
};

type PostData = {
  id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  author: Author;
  liked: boolean;
  likeCount: number;
  replyCount: number;
};

type Reply = {
  id: string;
  content: string;
  created_at: string;
  author: Author;
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

export function DesktopPostView({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const [post, setPost] = useState<PostData | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [liking, setLiking] = useState(false);

  const loadPost = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    const { data } = await supabase
      .from("posts")
      .select(`id, content, image_url, created_at, view_count,
        profiles!posts_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified),
        post_images(image_url, display_order)`)
      .eq("id", postId)
      .single();

    if (!data) { setLoading(false); return; }

    const { count: likeCount } = await supabase
      .from("post_acknowledgments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", postId);

    let myLike = null;
    if (user) {
      const { data: likeData } = await supabase
        .from("post_acknowledgments")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", user.id)
        .maybeSingle();
      myLike = likeData;
    }

    const { count: replyCount } = await supabase
      .from("post_replies")
      .select("id", { count: "exact", head: true })
      .eq("post_id", postId);

    setPost({
      id: data.id,
      content: data.content,
      image_url: data.image_url,
      images: ((data as any).post_images || [])
        .sort((a: any, b: any) => a.display_order - b.display_order)
        .map((i: any) => i.image_url),
      created_at: data.created_at,
      view_count: data.view_count || 0,
      author: (data as any).profiles,
      liked: !!myLike,
      likeCount: likeCount || 0,
      replyCount: replyCount || 0,
    });
    setLoading(false);
  }, [postId, user]);

  const loadReplies = useCallback(async () => {
    if (!postId) return;
    const { data } = await supabase
      .from("post_replies")
      .select("id, content, created_at, profiles!post_replies_author_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (data) setReplies(data.map((r: any) => ({ ...r, author: r.profiles })));
  }, [postId]);

  useEffect(() => {
    loadPost();
    loadReplies();
  }, [loadPost, loadReplies]);

  useEffect(() => {
    if (!postId) return;
    const ch = supabase
      .channel(`desktop-post:${postId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_replies", filter: `post_id=eq.${postId}` }, () => loadReplies())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [postId, loadReplies]);

  async function toggleLike() {
    if (!user || !post || liking) return;
    setLiking(true);
    if (post.liked) {
      await supabase.from("post_acknowledgments").delete().eq("post_id", post.id).eq("user_id", user.id);
      setPost((p) => p ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p);
    } else {
      await supabase.from("post_acknowledgments").insert({ post_id: post.id, user_id: user.id });
      setPost((p) => p ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p);
      if (post.author.id !== user.id) {
        notifyPostLike({ postId: post.id, postAuthorId: post.author.id, likerName: user.user_metadata?.display_name || "Someone" }).catch(() => {});
      }
    }
    setLiking(false);
  }

  async function submitReply() {
    if (!user || !post || !replyText.trim() || sending) return;
    setSending(true);
    const { error } = await supabase.from("post_replies").insert({
      post_id: post.id,
      author_id: user.id,
      content: replyText.trim(),
    });
    if (error) {
      showAlert("Error", "Could not post reply.");
    } else {
      setReplyText("");
      if (post.author.id !== user.id) {
        notifyPostReply({ postId: post.id, postAuthorId: post.author.id, replierName: user.user_metadata?.display_name || "Someone" }).catch(() => {});
      }
      setPost((p) => p ? { ...p, replyCount: p.replyCount + 1 } : p);
      loadReplies();
    }
    setSending(false);
  }

  const allImages = post ? (post.images.length > 0 ? post.images : post.image_url ? [post.image_url] : []) : [];

  return (
    <View style={[pv.root, { backgroundColor: isDark ? "#0d0d0d" : "#f7f9fb" }]}>
      <View style={[pv.header, { borderBottomColor: colors.border, backgroundColor: isDark ? "#161618" : "#fff" }]}>
        <TouchableOpacity onPress={onClose} hitSlop={10} style={pv.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[pv.headerTitle, { color: colors.text }]}>Post</Text>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/post/[id]", params: { id: postId } } as any)}
          hitSlop={10}
          style={pv.expandBtn}
        >
          <Ionicons name="expand-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={pv.loadingWrap}>
          <ActivityIndicator color={BRAND} size="large" />
        </View>
      ) : !post ? (
        <View style={pv.loadingWrap}>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>Post not found.</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[pv.postCard, { backgroundColor: isDark ? "#161618" : "#fff", borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={pv.authorRow}
              onPress={() => router.push({ pathname: "/profile/[id]", params: { id: post.author.id } } as any)}
              activeOpacity={0.7}
            >
              <Avatar uri={post.author.avatar_url} name={post.author.display_name} size={42} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={[pv.authorName, { color: colors.text }]} numberOfLines={1}>{post.author.display_name}</Text>
                  {post.author.is_organization_verified && (
                    <Ionicons name="checkmark-circle" size={14} color={Colors.gold} />
                  )}
                  {!post.author.is_organization_verified && post.author.is_verified && (
                    <Ionicons name="checkmark-circle" size={14} color={BRAND} />
                  )}
                </View>
                <Text style={[pv.authorHandle, { color: colors.textMuted }]}>@{post.author.handle} · {formatRelative(post.created_at)}</Text>
              </View>
            </TouchableOpacity>

            <RichText
              text={post.content}
              style={[pv.postContent, { color: colors.text }]}
              linkColor={BRAND}
            />

            {allImages.length > 0 && (
              <View style={pv.imageRow}>
                {allImages.slice(0, 4).map((uri, i) => (
                  <Image
                    key={i}
                    source={{ uri }}
                    style={[
                      pv.postImage,
                      allImages.length === 1 ? { width: "100%", aspectRatio: 16 / 9 } : { width: "48%", aspectRatio: 1 },
                    ]}
                    resizeMode="cover"
                  />
                ))}
              </View>
            )}

            <View style={pv.actionsRow}>
              <TouchableOpacity style={pv.actionBtn} onPress={toggleLike} disabled={!user || liking}>
                <Ionicons
                  name={post.liked ? "heart" : "heart-outline"}
                  size={20}
                  color={post.liked ? "#FF4B6A" : colors.textMuted}
                />
                <Text style={[pv.actionCount, { color: post.liked ? "#FF4B6A" : colors.textMuted }]}>{post.likeCount}</Text>
              </TouchableOpacity>
              <View style={pv.actionBtn}>
                <Ionicons name="chatbubble-outline" size={19} color={colors.textMuted} />
                <Text style={[pv.actionCount, { color: colors.textMuted }]}>{post.replyCount}</Text>
              </View>
              <View style={pv.actionBtn}>
                <Ionicons name="eye-outline" size={19} color={colors.textMuted} />
                <Text style={[pv.actionCount, { color: colors.textMuted }]}>{post.view_count}</Text>
              </View>
            </View>
          </View>

          {replies.length > 0 && (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <Text style={[pv.repliesLabel, { color: colors.textMuted }]}>
                {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </Text>
              {replies.map((reply) => (
                <View key={reply.id} style={[pv.replyItem, { borderBottomColor: colors.border }]}>
                  <TouchableOpacity onPress={() => router.push({ pathname: "/profile/[id]", params: { id: reply.author.id } } as any)}>
                    <Avatar uri={reply.author.avatar_url} name={reply.author.display_name} size={32} />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Text style={[pv.replyName, { color: colors.text }]} numberOfLines={1}>{reply.author.display_name}</Text>
                      <Text style={[pv.replyTime, { color: colors.textMuted }]}>{formatRelative(reply.created_at)}</Text>
                    </View>
                    <Text style={[pv.replyContent, { color: colors.text }]}>{reply.content}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {user && post && (
        <View style={[pv.replyBar, { backgroundColor: isDark ? "#161618" : "#fff", borderTopColor: colors.border }]}>
          <Avatar uri={null} name={user.user_metadata?.display_name || "Me"} size={30} />
          <TextInput
            style={[pv.replyInput, { color: colors.text, backgroundColor: isDark ? "#222" : "#f0f2f5" }]}
            placeholder="Reply…"
            placeholderTextColor={colors.textMuted}
            value={replyText}
            onChangeText={setReplyText}
            multiline
            maxLength={500}
            onSubmitEditing={submitReply}
          />
          <TouchableOpacity
            onPress={submitReply}
            disabled={!replyText.trim() || sending}
            style={[pv.sendBtn, { opacity: replyText.trim() && !sending ? 1 : 0.4 }]}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const pv = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { marginRight: 12 },
  expandBtn: { marginLeft: "auto" as any },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  postCard: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  authorName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  authorHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  postContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 12 },
  imageRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  postImage: { borderRadius: 10, overflow: "hidden" },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 4 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionCount: { fontSize: 13, fontFamily: "Inter_500Medium" },
  repliesLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 10 },
  replyItem: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  replyName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  replyContent: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 2 },
  replyBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  replyInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 80,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
});
