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
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { notifyPostLike, notifyPostReply } from "@/lib/notifyUser";

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

  const loadPost = useCallback(async () => {
    if (!id || !user) return;
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

    const { data: myLike } = await supabase
      .from("post_acknowledgments")
      .select("id")
      .eq("post_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    const { count: replyCount } = await supabase
      .from("post_replies")
      .select("id", { count: "exact", head: true })
      .eq("post_id", id);

    const { data: existingView } = await supabase.from("post_views").select("id").eq("post_id", id).eq("viewer_id", user.id).maybeSingle();
    if (!existingView) {
      await supabase.from("post_views").insert({ post_id: id, viewer_id: user.id });
      await supabase.from("posts").update({ view_count: (data.view_count || 0) + 1 }).eq("id", id);
    }

    setPost({
      id: data.id,
      content: data.content,
      image_url: data.image_url,
      images: ((data as any).post_images || []).sort((a: any, b: any) => a.display_order - b.display_order).map((i: any) => i.image_url),
      created_at: data.created_at,
      view_count: (data.view_count || 0) + 1,
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

  async function toggleLike() {
    if (!user || !post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
            postId: post.id,
          });
        }
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      if (post && post.author.id !== user.id) {
        notifyPostReply({
          postAuthorId: post.author.id,
          replierName: myProfile?.display_name || "Someone",
          postId: post.id,
          replyPreview: content,
        });
      }
    }
    setSending(false);
  }

  if (loading) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={Colors.brand} /></View>;
  if (!post) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.text }}>Post not found</Text></View>;

  const allImages = post.images.length > 0 ? post.images : post.image_url ? [post.image_url] : [];

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

            <Text style={[styles.postContent, { color: colors.text }]}>{post.content}</Text>

            {allImages.length > 0 && (
              <View style={styles.imgWrap}>
                {allImages.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={styles.postImg} resizeMode="cover" />
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
              <TouchableOpacity style={styles.statBtn}>
                <Ionicons name="share-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {replies.length > 0 && (
              <Text style={[styles.repliesLabel, { color: colors.textMuted }]}>Replies</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.replyRow, { backgroundColor: colors.surface }]}>
            <Avatar uri={item.author.avatar_url} name={item.author.display_name} size={36} />
            <View style={{ flex: 1 }}>
              <View style={styles.replyHeader}>
                <Text style={[styles.replyName, { color: colors.text }]}>{item.author.display_name}</Text>
                {item.author.is_organization_verified && <Ionicons name="checkmark-circle" size={12} color={Colors.gold} style={{ marginLeft: 3 }} />}
                {!item.author.is_organization_verified && item.author.is_verified && <Ionicons name="checkmark-circle" size={12} color={Colors.brand} style={{ marginLeft: 3 }} />}
                <Text style={[styles.replyTime, { color: colors.textMuted }]}> {timeAgo(item.created_at)}</Text>
              </View>
              <Text style={[styles.replyContent, { color: colors.text }]}>{item.content}</Text>
            </View>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <View style={[styles.replyBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]}>
          <TextInput
            style={[styles.replyInput, { color: colors.text, backgroundColor: colors.inputBg }]}
            placeholder="Write a reply..."
            placeholderTextColor={colors.textMuted}
            value={replyText}
            onChangeText={setReplyText}
            maxLength={280}
            multiline
          />
          <TouchableOpacity onPress={sendReply} disabled={!replyText.trim() || sending}>
            {sending ? <ActivityIndicator color={Colors.brand} /> : (
              <Ionicons name="send" size={22} color={replyText.trim() ? Colors.brand : colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  replyBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  replyInput: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 80 },
});
