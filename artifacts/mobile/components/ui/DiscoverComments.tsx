import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import * as Haptics from "@/lib/haptics";
import { notifyPostReply } from "@/lib/notifyUser";
import { showAlert } from "@/lib/alert";

const USE_NATIVE = Platform.OS !== "web";

const QUICK_EMOJIS = ["🔥", "❤️", "😂", "😮", "👏", "💯", "🙌", "😍", "🎉", "✨"];

type CommentItem = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  parent_reply_id: string | null;
  like_count: number;
  profile: { display_name: string; handle: string; avatar_url: string | null };
  children?: CommentItem[];
};

function fmtRel(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return "now";
  if (d < 3600000) return `${Math.floor(d / 60000)}m`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
  if (d < 604800000) return `${Math.floor(d / 86400000)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtNum(n: number): string {
  if (!n) return "0";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function buildTree(flat: CommentItem[]): CommentItem[] {
  const map: Record<string, CommentItem> = {};
  flat.forEach((c) => { map[c.id] = { ...c, children: [] }; });
  const roots: CommentItem[] = [];
  flat.forEach((c) => {
    if (c.parent_reply_id && map[c.parent_reply_id]) {
      map[c.parent_reply_id].children!.push(map[c.id]);
    } else {
      roots.push(map[c.id]);
    }
  });
  return roots;
}

function parseText(text: string, accent: string): React.ReactNode {
  return text.split(/(@\w[\w.]*|#\w+)/g).map((part, i) => {
    if (/^@/.test(part))
      return (
        <Text key={i} style={{ color: accent, fontWeight: "600" }}>
          {part}
        </Text>
      );
    if (/^#/.test(part))
      return (
        <Text key={i} style={{ color: accent + "CC" }}>
          {part}
        </Text>
      );
    return <Text key={i}>{part}</Text>;
  });
}

function AvatarCircle({
  uri,
  name,
  size,
  accent,
}: {
  uri: string | null;
  name: string;
  size: number;
  accent: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: accent + "22",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: size * 0.38,
              color: accent,
              fontWeight: "700",
            }}
          >
            {(name || "U").slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

function CommentRow({
  c,
  colors,
  accent,
  likedIds,
  currentUserId,
  onLike,
  onReply,
  onDelete,
  newIds,
  depth,
}: {
  c: CommentItem;
  colors: any;
  accent: string;
  likedIds: Set<string>;
  currentUserId?: string;
  onLike: (id: string) => void;
  onReply: (c: CommentItem) => void;
  onDelete: (id: string) => void;
  newIds: Set<string>;
  depth: number;
}) {
  const liked = likedIds.has(c.id);
  const isOwn = c.author_id === currentUserId;
  const isNew = newIds.has(c.id);
  const avatarSize = depth > 0 ? 28 : 36;

  const heartScale = useRef(new Animated.Value(1)).current;
  const entrance = useRef(new Animated.Value(isNew ? 0 : 1)).current;

  useEffect(() => {
    if (isNew) {
      Animated.spring(entrance, {
        toValue: 1,
        tension: 160,
        friction: 8,
        useNativeDriver: USE_NATIVE,
      }).start();
    }
  }, []);

  function handleLike() {
    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1.6,
        tension: 320,
        friction: 5,
        useNativeDriver: USE_NATIVE,
      }),
      Animated.spring(heartScale, {
        toValue: 1,
        tension: 320,
        friction: 8,
        useNativeDriver: USE_NATIVE,
      }),
    ]).start();
    Haptics.impactAsync("light").catch(() => {});
    onLike(c.id);
  }

  const likeCount = c.like_count;
  const indentLeft = depth * 40 + 16;

  return (
    <Animated.View style={{ opacity: entrance }}>
      {/* Thread connector line for nested */}
      {depth > 0 && (
        <View
          style={{
            position: "absolute",
            left: (depth - 1) * 40 + 16 + avatarSize / 2 + 16,
            top: 0,
            bottom: 12,
            width: 2,
            borderRadius: 1,
            backgroundColor: accent + "30",
          }}
        />
      )}

      <View
        style={[
          s.row,
          { paddingLeft: indentLeft },
          depth === 0 && {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border + "55",
          },
        ]}
      >
        {/* Avatar */}
        <TouchableOpacity
          onPress={() =>
            router.push({ pathname: "/contact/[id]", params: { id: c.author_id } })
          }
          activeOpacity={0.8}
          style={{ marginTop: 2 }}
        >
          <AvatarCircle
            uri={c.profile.avatar_url}
            name={c.profile.display_name}
            size={avatarSize}
            accent={accent}
          />
        </TouchableOpacity>

        {/* Body */}
        <View style={{ flex: 1 }}>
          {/* Name + time */}
          <View style={s.nameLine}>
            <Text style={[s.name, { color: colors.text }]} numberOfLines={1}>
              {c.profile.display_name}
            </Text>
            <Text style={[s.time, { color: colors.textMuted }]}>{fmtRel(c.created_at)}</Text>
            {isOwn && (
              <TouchableOpacity
                onPress={() => onDelete(c.id)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                style={{ marginLeft: "auto" as any }}
                activeOpacity={0.6}
              >
                <Ionicons name="trash-outline" size={13} color={colors.textMuted + "80"} />
              </TouchableOpacity>
            )}
          </View>

          {/* Content */}
          <Text style={[s.content, { color: colors.text }]}>
            {parseText(c.content, accent)}
          </Text>

          {/* Actions */}
          <View style={s.actRow}>
            {/* Like */}
            <TouchableOpacity onPress={handleLike} style={s.actBtn} activeOpacity={0.7}>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons
                  name={liked ? "heart" : "heart-outline"}
                  size={14}
                  color={liked ? "#FF2D55" : colors.textMuted}
                />
              </Animated.View>
              {likeCount > 0 && (
                <Text
                  style={[
                    s.actCount,
                    { color: liked ? "#FF2D55" : colors.textMuted },
                  ]}
                >
                  {fmtNum(likeCount)}
                </Text>
              )}
            </TouchableOpacity>

            {/* Reply */}
            <TouchableOpacity
              onPress={() => onReply(c)}
              style={s.actBtn}
              activeOpacity={0.7}
            >
              <Ionicons
                name="return-down-forward-outline"
                size={13}
                color={colors.textMuted}
              />
              <Text style={[s.actLabel, { color: colors.textMuted }]}>Reply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Nested children */}
      {(c.children || []).map((child) => (
        <CommentRow
          key={child.id}
          c={child}
          colors={colors}
          accent={accent}
          likedIds={likedIds}
          currentUserId={currentUserId}
          onLike={onLike}
          onReply={onReply}
          onDelete={onDelete}
          newIds={newIds}
          depth={depth + 1}
        />
      ))}
    </Animated.View>
  );
}

export function DiscoverCommentsSheet({
  visible,
  onClose,
  postId,
  postAuthorId,
  onReplyCountChange,
}: {
  visible: boolean;
  onClose: () => void;
  postId: string;
  postAuthorId: string;
  onReplyCountChange: (postId: string, delta: number) => void;
}) {
  const { colors, accent } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sortMode, setSortMode] = useState<"recent" | "top">("recent");
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<CommentItem | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const sendScale = useRef(new Animated.Value(1)).current;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadComments = useCallback(async () => {
    if (!postId) return;
    try {
      const { data: replies, error } = await supabase
        .from("post_replies")
        .select(
          "id, author_id, content, created_at, parent_reply_id, profiles(display_name, handle, avatar_url)",
        )
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(500);

      if (error) throw error;
      if (!replies || !mounted.current) return;

      const replyIds = replies.map((r: any) => r.id);

      const [{ data: allLikes }, { data: userLikes }] = await Promise.all([
        replyIds.length > 0
          ? supabase.from("post_reply_likes").select("reply_id").in("reply_id", replyIds)
          : Promise.resolve({ data: [] as any[] }),
        user && replyIds.length > 0
          ? supabase.from("post_reply_likes").select("reply_id").in("reply_id", replyIds).eq("user_id", user.id)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      if (!mounted.current) return;

      const likeCounts: Record<string, number> = {};
      for (const l of (allLikes || [])) {
        likeCounts[l.reply_id] = (likeCounts[l.reply_id] || 0) + 1;
      }

      setLikedIds(new Set((userLikes || []).map((l: any) => l.reply_id)));
      setComments(
        replies.map((r: any) => ({
          id: r.id,
          author_id: r.author_id,
          content: r.content || "",
          created_at: r.created_at,
          parent_reply_id: r.parent_reply_id || null,
          like_count: likeCounts[r.id] || 0,
          profile: {
            display_name: r.profiles?.display_name || "User",
            handle: r.profiles?.handle || "user",
            avatar_url: r.profiles?.avatar_url || null,
          },
        })),
      );
    } catch (e) {
      console.warn("[Comments] Load failed:", e);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [postId, user?.id]);

  useEffect(() => {
    if (!visible || !postId) return;
    setComments([]);
    setLoading(true);
    setText("");
    setLikedIds(new Set());
    setReplyingTo(null);
    setSortMode("recent");
    setNewIds(new Set());
    loadComments();
  }, [visible, postId, loadComments]);

  useEffect(() => {
    if (!visible || !postId) return;
    const ch = supabase
      .channel(`dc-comments:${postId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "post_replies",
          filter: `post_id=eq.${postId}`,
        },
        loadComments,
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "post_replies",
          filter: `post_id=eq.${postId}`,
        },
        loadComments,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [visible, postId, loadComments]);

  function handleLike(id: string) {
    if (!user) return;
    const wasLiked = likedIds.has(id);

    setLikedIds((prev) => {
      const next = new Set(prev);
      wasLiked ? next.delete(id) : next.add(id);
      return next;
    });
    setComments((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, like_count: Math.max(0, c.like_count + (wasLiked ? -1 : 1)) }
          : c,
      ),
    );

    if (wasLiked) {
      supabase
        .from("post_reply_likes")
        .delete()
        .eq("reply_id", id)
        .eq("user_id", user.id)
        .then(({ error }) => {
          if (error && mounted.current) {
            setLikedIds((prev) => { const n = new Set(prev); n.add(id); return n; });
            setComments((prev) => prev.map((c) => c.id === id ? { ...c, like_count: c.like_count + 1 } : c));
          }
        });
    } else {
      supabase
        .from("post_reply_likes")
        .insert({ reply_id: id, user_id: user.id })
        .then(({ error }) => {
          if (error && error.code !== "23505" && mounted.current) {
            setLikedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
            setComments((prev) => prev.map((c) => c.id === id ? { ...c, like_count: Math.max(0, c.like_count - 1) } : c));
          }
        });
    }
  }

  async function handleDelete(id: string) {
    if (!user) return;
    const { error } = await supabase.from("post_replies").delete().eq("id", id).eq("author_id", user.id);
    if (!error && mounted.current) {
      setComments((prev) => prev.filter((c) => c.id !== id));
      onReplyCountChange(postId, -1);
    }
  }

  function handleReplyTo(c: CommentItem) {
    setReplyingTo(c);
    setText("");
    Haptics.impactAsync("light").catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 120);
  }

  async function sendComment() {
    if (!user || !text.trim()) return;
    setSending(true);
    Animated.sequence([
      Animated.spring(sendScale, {
        toValue: 0.72,
        tension: 400,
        friction: 8,
        useNativeDriver: USE_NATIVE,
      }),
      Animated.spring(sendScale, {
        toValue: 1,
        tension: 400,
        friction: 8,
        useNativeDriver: USE_NATIVE,
      }),
    ]).start();
    Haptics.impactAsync("light").catch(() => {});

    const payload: any = { post_id: postId, author_id: user.id, content: text.trim() };
    if (replyingTo) payload.parent_reply_id = replyingTo.id;

    const { data, error } = await supabase
      .from("post_replies")
      .insert(payload)
      .select("id, author_id, content, created_at, parent_reply_id")
      .single();

    if (!error && data && mounted.current) {
      const newC: CommentItem = {
        id: data.id,
        author_id: data.author_id,
        content: data.content,
        created_at: data.created_at,
        parent_reply_id: data.parent_reply_id || null,
        like_count: 0,
        profile: {
          display_name: profile?.display_name || "You",
          handle: profile?.handle || "you",
          avatar_url: profile?.avatar_url || null,
        },
      };
      setComments((prev) => [...prev, newC]);
      setNewIds((prev) => new Set([...prev, data.id]));
      onReplyCountChange(postId, 1);

      const notifyTarget = replyingTo?.author_id ?? postAuthorId;
      if (notifyTarget && notifyTarget !== user.id) {
        notifyPostReply({
          postAuthorId: notifyTarget,
          replierName: profile?.display_name || "Someone",
          replierUserId: user.id,
          postId,
          replyPreview: data.content,
        });
      }

      const wasThread = !!replyingTo;
      setText("");
      setReplyingTo(null);
      if (!wasThread) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    } else if (error && mounted.current) {
      showAlert(
        "Comment failed",
        "Could not post your comment. If this keeps happening, check the Status page under Settings → Help & About.",
        [{ text: "OK" }],
      );
    }
    if (mounted.current) setSending(false);
  }

  const tree = React.useMemo(() => {
    const roots = buildTree(comments);
    if (sortMode === "top") {
      return [...roots].sort((a, b) => {
        const score = (x: CommentItem) =>
          (x.children?.length ?? 0) * 2 + x.like_count;
        return score(b) - score(a);
      });
    }
    return [...roots].reverse();
  }, [comments, sortMode]);

  const totalCount = comments.length;
  const charLeft = 500 - text.length;
  const sheetMaxH = Math.min(screenH * 0.9, 720);
  const listMaxH = Math.max(
    sheetMaxH - (user ? 210 : 110) - Math.max(insets.bottom, 16) - (replyingTo ? 38 : 0),
    80,
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "web" ? undefined : "height"}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.52)" }]}
          onPress={onClose}
        />

        <View
          style={[
            s.sheet,
            {
              maxHeight: sheetMaxH,
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          {/* Drag handle */}
          <View style={[s.handle, { backgroundColor: colors.border }]} />

          {/* ── Header ── */}
          <View style={s.header}>
            <Text style={[s.headerTitle, { color: colors.text }]}>
              Comments
              {totalCount > 0 && (
                <Text
                  style={{
                    color: colors.textMuted,
                    fontWeight: "400",
                    fontSize: 14,
                  }}
                >
                  {" · "}
                  {fmtNum(totalCount)}
                </Text>
              )}
            </Text>
            <View style={s.sortRow}>
              {(["recent", "top"] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setSortMode(m)}
                  style={[
                    s.sortPill,
                    { borderColor: sortMode === m ? accent + "66" : colors.border },
                    sortMode === m && { backgroundColor: accent + "18" },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      s.sortPillText,
                      { color: sortMode === m ? accent : colors.textMuted },
                    ]}
                  >
                    {m === "recent" ? "Recent" : "Top"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              style={[s.closeBtn, { backgroundColor: colors.border + "60" }]}
            >
              <Ionicons name="close" size={17} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

          {/* ── Comment list ── */}
          <View style={{ flexShrink: 1, minHeight: 80 }}>
            {loading ? (
              <View style={s.skeletonWrap}>
                {[1, 2, 3].map((i) => (
                  <View key={i} style={[s.skeletonRow, { opacity: 1 - i * 0.2 }]}>
                    <View
                      style={[s.skeletonAvatar, { backgroundColor: colors.border }]}
                    />
                    <View style={{ flex: 1, gap: 7 }}>
                      <View
                        style={[
                          s.skeletonLine,
                          { width: "55%", backgroundColor: colors.border },
                        ]}
                      />
                      <View
                        style={[
                          s.skeletonLine,
                          { width: "85%", backgroundColor: colors.border },
                        ]}
                      />
                      <View
                        style={[
                          s.skeletonLine,
                          { width: "40%", backgroundColor: colors.border },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : tree.length === 0 ? (
              <View style={s.empty}>
                <View style={[s.emptyIcon, { backgroundColor: accent + "15" }]}>
                  <Ionicons name="chatbubbles-outline" size={32} color={accent} />
                </View>
                <Text style={[s.emptyTitle, { color: colors.text }]}>No comments yet</Text>
                <Text style={[s.emptySub, { color: colors.textMuted }]}>
                  Be the first to share your thoughts
                </Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={tree}
                keyExtractor={(c) => c.id}
                style={{ maxHeight: listMaxH }}
                contentContainerStyle={{ paddingTop: 4, paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
                onRefresh={loadComments}
                refreshing={loading}
                renderItem={({ item: c }) => (
                  <CommentRow
                    c={c}
                    colors={colors}
                    accent={accent}
                    likedIds={likedIds}
                    currentUserId={user?.id}
                    onLike={handleLike}
                    onReply={handleReplyTo}
                    onDelete={handleDelete}
                    newIds={newIds}
                    depth={0}
                  />
                )}
              />
            )}
          </View>

          {/* ── Input area ── */}
          {user ? (
            <View>
              {/* Quick emoji bar */}
              <View style={[s.emojiBar, { borderTopColor: colors.border }]}>
                {QUICK_EMOJIS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    onPress={() => setText((t) => t + e)}
                    style={s.emojiBtn}
                    activeOpacity={0.6}
                  >
                    <Text style={s.emojiText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Reply-to banner */}
              {replyingTo && (
                <View
                  style={[
                    s.replyBanner,
                    {
                      backgroundColor: accent + "14",
                      borderTopColor: accent + "30",
                    },
                  ]}
                >
                  <Ionicons name="return-down-forward" size={13} color={accent} />
                  <Text
                    style={[s.replyBannerText, { color: accent }]}
                    numberOfLines={1}
                  >
                    Replying to{" "}
                    <Text style={{ fontWeight: "700" }}>
                      @{replyingTo.profile.handle}
                    </Text>
                  </Text>
                  <TouchableOpacity
                    onPress={() => setReplyingTo(null)}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    style={{ marginLeft: "auto" as any }}
                  >
                    <Ionicons name="close-circle" size={17} color={accent + "AA"} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Input row */}
              <View
                style={[
                  s.inputRow,
                  {
                    borderTopColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <AvatarCircle
                  uri={profile?.avatar_url ?? null}
                  name={profile?.display_name || "You"}
                  size={34}
                  accent={accent}
                />

                <View style={{ flex: 1, position: "relative" }}>
                  <TextInput
                    ref={inputRef}
                    style={[
                      s.input,
                      {
                        color: colors.text,
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                    placeholder={
                      replyingTo
                        ? `Reply to @${replyingTo.profile.handle}…`
                        : "Add a comment…"
                    }
                    placeholderTextColor={colors.textMuted}
                    value={text}
                    onChangeText={setText}
                    multiline
                    maxLength={500}
                  />
                  {text.length > 400 && (
                    <Text
                      style={[
                        s.charCount,
                        { color: charLeft < 20 ? "#FF2D55" : colors.textMuted },
                      ]}
                    >
                      {charLeft}
                    </Text>
                  )}
                </View>

                <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                  <TouchableOpacity
                    onPress={sendComment}
                    disabled={!text.trim() || sending}
                    style={[
                      s.sendBtn,
                      { backgroundColor: text.trim() ? accent : colors.border },
                    ]}
                    activeOpacity={0.8}
                  >
                    {sending ? (
                      <ActivityIndicator size={14} color="#fff" />
                    ) : (
                      <Ionicons name="arrow-up" size={17} color="#fff" />
                    )}
                  </TouchableOpacity>
                </Animated.View>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={s.signInWrap}
              onPress={() => {
                onClose();
                setTimeout(() => router.push("/(auth)/login"), 200);
              }}
              activeOpacity={0.8}
            >
              <View
                style={[
                  s.signInPill,
                  {
                    borderColor: accent + "55",
                    backgroundColor: accent + "15",
                  },
                ]}
              >
                <Ionicons name="person-circle-outline" size={18} color={accent} />
                <Text style={[s.signInText, { color: accent }]}>Sign in to comment</Text>
                <Ionicons name="chevron-forward" size={14} color={accent + "99"} />
              </View>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.2,
    shadowRadius: 22,
    elevation: 26,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 11,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: "700", letterSpacing: -0.3 },
  sortRow: { flexDirection: "row", gap: 6 },
  sortPill: {
    paddingHorizontal: 13,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  sortPillText: { fontSize: 12, fontWeight: "600" },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  skeletonWrap: { padding: 18, gap: 20 },
  skeletonRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  skeletonAvatar: { width: 36, height: 36, borderRadius: 18, flexShrink: 0 },
  skeletonLine: { height: 11, borderRadius: 6 },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 52,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  row: {
    flexDirection: "row",
    gap: 11,
    paddingVertical: 12,
    paddingRight: 16,
    alignItems: "flex-start",
  },
  nameLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  name: { fontSize: 13, fontWeight: "700" },
  time: { fontSize: 12 },
  content: { fontSize: 14, lineHeight: 20 },
  actRow: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 8 },
  actBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actCount: { fontSize: 12, fontWeight: "600" },
  actLabel: { fontSize: 12 },
  emojiBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  emojiBtn: { flex: 1, alignItems: "center", paddingVertical: 4 },
  emojiText: { fontSize: 19 },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderTopWidth: 1,
  },
  replyBannerText: { fontSize: 13, flex: 1 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    maxHeight: 100,
    minHeight: 42,
  },
  charCount: {
    position: "absolute",
    right: 14,
    bottom: 10,
    fontSize: 10,
    fontWeight: "600",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  signInWrap: { paddingVertical: 16, alignItems: "center" },
  signInPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 26,
    borderWidth: 1,
  },
  signInText: { fontSize: 14, fontWeight: "600" },
});
