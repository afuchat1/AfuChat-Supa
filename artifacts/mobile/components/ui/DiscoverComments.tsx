import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
import VerifiedBadge from "@/components/ui/VerifiedBadge";

const IS_NATIVE = Platform.OS !== "web";
const MAX_CHARS = 500;

const QUICK_EMOJIS = ["❤️", "🔥", "😂", "😮", "👏", "💯", "😍", "🎉", "✨", "🙌", "😢", "🤯"];

const EMOJI_CATEGORIES = [
  {
    label: "Reactions",
    emojis: ["❤️","🔥","😂","😮","👏","💯","😍","🎉","✨","🙌","😢","🤯","💀","🤣","😭","🥹"],
  },
  {
    label: "Faces",
    emojis: ["😊","😎","🤔","😏","🥰","😅","😬","🤩","😤","🥺","😇","😈","🤗","😴","🤐","😋"],
  },
  {
    label: "Objects",
    emojis: ["👍","👎","✌️","🤙","💪","🙏","👀","💬","🗣️","💡","⭐","🌟","💎","🏆","🎯","🚀"],
  },
];

type CommentItem = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  parent_reply_id: string | null;
  like_count: number;
  is_pinned?: boolean;
  is_verified?: boolean;
  is_organization_verified?: boolean;
  profile: {
    display_name: string;
    handle: string;
    avatar_url: string | null;
    is_verified?: boolean;
    is_organization_verified?: boolean;
  };
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
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
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

function parseText(text: string, accent: string): React.ReactNode[] {
  return text.split(/(@\w[\w.]*|#\w+)/g).map((part, i) => {
    if (/^@/.test(part))
      return <Text key={i} style={{ color: accent, fontFamily: "Inter_600SemiBold" }}>{part}</Text>;
    if (/^#/.test(part))
      return <Text key={i} style={{ color: accent + "CC", fontFamily: "Inter_600SemiBold" }}>{part}</Text>;
    return <Text key={i}>{part}</Text>;
  });
}

function CharRing({ value, max, accent }: { value: number; max: number; accent: string }) {
  const pct = value / max;
  const size = 24;
  const r = 9;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - pct);
  const color = pct > 0.9 ? "#FF3B30" : pct > 0.7 ? "#FF9500" : accent;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* SVG-like using border — React Native doesn't have SVG inline here, use border trick */}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2.5,
          borderColor: color + "30",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: size - 7,
            height: size - 7,
            borderRadius: (size - 7) / 2,
            borderWidth: 2.5,
            borderColor: color,
            borderTopColor: "transparent",
            borderRightColor: pct > 0.25 ? color : "transparent",
            borderBottomColor: pct > 0.5 ? color : "transparent",
            borderLeftColor: pct > 0.75 ? color : "transparent",
          }}
        />
      </View>
      {max - value <= 30 && (
        <Text
          style={{
            position: "absolute",
            fontSize: 7,
            fontFamily: "Inter_700Bold",
            color,
          }}
        >
          {max - value}
        </Text>
      )}
    </View>
  );
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
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", flexShrink: 0 }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View
          style={{
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: accent + "22", alignItems: "center", justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: size * 0.4, color: accent, fontFamily: "Inter_700Bold" }}>
            {(name || "U").slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

const CommentRow = React.memo(function CommentRow({
  c, colors, accent, likedIds, currentUserId, postAuthorId,
  onLike, onReply, onDelete, onPin, newIds, depth,
}: {
  c: CommentItem; colors: any; accent: string;
  likedIds: Set<string>; currentUserId?: string; postAuthorId: string;
  onLike: (id: string) => void; onReply: (c: CommentItem) => void;
  onDelete: (id: string) => void; onPin: (id: string) => void;
  newIds: Set<string>; depth: number;
}) {
  const liked = likedIds.has(c.id);
  const isOwn = c.author_id === currentUserId;
  const isAuthor = c.author_id === postAuthorId;
  const isNew = newIds.has(c.id);
  const avatarSize = depth > 0 ? 26 : 38;

  const heartScale = useRef(new Animated.Value(1)).current;
  const heartColor = useRef(new Animated.Value(liked ? 1 : 0)).current;
  const entranceY = useRef(new Animated.Value(isNew ? 16 : 0)).current;
  const entranceOp = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const [collapsed, setCollapsed] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const actionScale = useRef(new Animated.Value(0)).current;
  const actionOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isNew) {
      Animated.parallel([
        Animated.spring(entranceY, { toValue: 0, tension: 180, friction: 10, useNativeDriver: IS_NATIVE }),
        Animated.timing(entranceOp, { toValue: 1, duration: 250, useNativeDriver: IS_NATIVE }),
      ]).start();
    }
  }, []);

  useEffect(() => {
    if (showActions) {
      Animated.parallel([
        Animated.spring(actionScale, { toValue: 1, tension: 240, friction: 10, useNativeDriver: IS_NATIVE }),
        Animated.timing(actionOp, { toValue: 1, duration: 180, useNativeDriver: IS_NATIVE }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(actionScale, { toValue: 0, duration: 140, useNativeDriver: IS_NATIVE }),
        Animated.timing(actionOp, { toValue: 0, duration: 140, useNativeDriver: IS_NATIVE }),
      ]).start();
    }
  }, [showActions]);

  function handleLike() {
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.7, tension: 400, friction: 5, useNativeDriver: IS_NATIVE }),
      Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 8, useNativeDriver: IS_NATIVE }),
    ]).start();
    Animated.timing(heartColor, {
      toValue: liked ? 0 : 1, duration: 180, useNativeDriver: false,
    }).start();
    void Haptics.impactAsync("light");
    onLike(c.id);
  }

  const indentLeft = depth * 36 + 14;
  const hasChildren = (c.children || []).length > 0;

  return (
    <Animated.View style={{ opacity: entranceOp, transform: [{ translateY: entranceY }] }}>
      {/* Thread line */}
      {depth > 0 && (
        <View
          style={{
            position: "absolute",
            left: (depth - 1) * 36 + 14 + avatarSize / 2 + 14,
            top: 0, bottom: hasChildren ? 0 : 16, width: 1.5,
            backgroundColor: accent + "25", borderRadius: 1,
          }}
        />
      )}

      <Pressable
        onLongPress={() => { void Haptics.impactAsync("medium"); setShowActions((v) => !v); }}
        delayLongPress={380}
        style={[
          st.row,
          { paddingLeft: indentLeft },
          depth === 0 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + "55" },
          c.is_pinned && { backgroundColor: accent + "08" },
        ]}
      >
        {/* Avatar */}
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/contact/[id]", params: { id: c.author_id, init_name: c.profile.display_name, init_handle: c.profile.handle, init_avatar: c.profile.avatar_url ?? "" } })}
          activeOpacity={0.8}
          style={{ marginTop: 3 }}
        >
          <AvatarCircle uri={c.profile.avatar_url} name={c.profile.display_name} size={avatarSize} accent={accent} />
        </TouchableOpacity>

        {/* Body */}
        <View style={{ flex: 1, gap: 3 }}>
          {/* Pinned indicator */}
          {c.is_pinned && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 1 }}>
              <Ionicons name="pin" size={10} color={accent} />
              <Text style={{ fontSize: 10, color: accent, fontFamily: "Inter_600SemiBold" }}>Pinned</Text>
            </View>
          )}

          {/* Name row */}
          <View style={st.nameLine}>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/contact/[id]", params: { id: c.author_id, init_name: c.profile.display_name, init_handle: c.profile.handle, init_avatar: c.profile.avatar_url ?? "" } })}
              activeOpacity={0.8}
            >
              <Text style={[st.name, { color: colors.text }]} numberOfLines={1}>{c.profile.display_name}</Text>
            </TouchableOpacity>

            {/* Verified badge inline */}
            {(c.profile.is_verified || c.profile.is_organization_verified) && (
              <VerifiedBadge
                isVerified={c.profile.is_verified}
                isOrganizationVerified={c.profile.is_organization_verified}
                size={13}
              />
            )}

            {/* Author badge */}
            {isAuthor && (
              <View style={[st.authorBadge, { backgroundColor: accent + "18", borderColor: accent + "40" }]}>
                <Text style={[st.authorBadgeText, { color: accent }]}>Author</Text>
              </View>
            )}

            <Text style={[st.time, { color: colors.textMuted }]}>{fmtRel(c.created_at)}</Text>

            {/* Delete / Pin actions */}
            <View style={{ marginLeft: "auto" as any, flexDirection: "row", gap: 8, alignItems: "center" }}>
              {currentUserId === postAuthorId && depth === 0 && (
                <TouchableOpacity onPress={() => onPin(c.id)} hitSlop={8} activeOpacity={0.6}>
                  <Ionicons name={c.is_pinned ? "pin" : "pin-outline"} size={12} color={c.is_pinned ? accent : colors.textMuted + "80"} />
                </TouchableOpacity>
              )}
              {isOwn && (
                <TouchableOpacity onPress={() => onDelete(c.id)} hitSlop={8} activeOpacity={0.6}>
                  <Ionicons name="trash-outline" size={12} color={colors.textMuted + "80"} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Content */}
          <Text style={[st.content, { color: colors.text }]}>
            {parseText(c.content, accent)}
          </Text>

          {/* Action row */}
          <View style={st.actRow}>
            {/* Like */}
            <TouchableOpacity onPress={handleLike} style={st.actBtn} activeOpacity={0.7}>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons
                  name={liked ? "heart" : "heart-outline"}
                  size={14}
                  color={liked ? "#FF2D55" : colors.textMuted}
                />
              </Animated.View>
              {c.like_count > 0 && (
                <Text style={[st.actCount, { color: liked ? "#FF2D55" : colors.textMuted }]}>
                  {fmtNum(c.like_count)}
                </Text>
              )}
            </TouchableOpacity>

            {/* Reply */}
            <TouchableOpacity onPress={() => onReply(c)} style={st.actBtn} activeOpacity={0.7}>
              <Ionicons name="return-down-forward-outline" size={13} color={colors.textMuted} />
              <Text style={[st.actLabel, { color: colors.textMuted }]}>Reply</Text>
            </TouchableOpacity>

            {/* Collapse thread */}
            {hasChildren && depth === 0 && (
              <TouchableOpacity
                onPress={() => setCollapsed((v) => !v)}
                style={st.actBtn}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={collapsed ? "chevron-down-outline" : "chevron-up-outline"}
                  size={13}
                  color={colors.textMuted}
                />
                <Text style={[st.actLabel, { color: colors.textMuted }]}>
                  {collapsed ? `${c.children!.length} repl${c.children!.length === 1 ? "y" : "ies"}` : "Hide"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Long-press action tray */}
          {showActions && (
            <Animated.View
              style={[
                st.actionTray,
                { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: "#000" },
                { opacity: actionOp, transform: [{ scale: actionScale }] },
              ]}
            >
              {["❤️", "🔥", "😂", "😮", "👏", "💯"].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={st.actionTrayEmoji}
                  onPress={() => {
                    setShowActions(false);
                    /* future: react with emoji */
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
              <View style={[st.actionTrayDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity
                style={[st.actionTrayBtn]}
                onPress={() => { setShowActions(false); onReply(c); }}
              >
                <Ionicons name="return-down-forward-outline" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </Pressable>

      {/* Nested children */}
      {!collapsed &&
        (c.children || []).map((child) => (
          <CommentRow
            key={child.id}
            c={child}
            colors={colors}
            accent={accent}
            likedIds={likedIds}
            currentUserId={currentUserId}
            postAuthorId={postAuthorId}
            onLike={onLike}
            onReply={onReply}
            onDelete={onDelete}
            onPin={onPin}
            newIds={newIds}
            depth={depth + 1}
          />
        ))}
    </Animated.View>
  );
});

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
  const [inputFocused, setInputFocused] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);
  const [keyboardH, setKeyboardH] = useState(0);

  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // Animations
  const sheetY = useRef(new Animated.Value(400)).current;
  const inputExpand = useRef(new Animated.Value(0)).current;
  const sendScale = useRef(new Animated.Value(1)).current;
  const emojiPickerH = useRef(new Animated.Value(0)).current;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Sheet entrance / exit
  useEffect(() => {
    if (visible) {
      Animated.spring(sheetY, {
        toValue: 0, tension: 100, friction: 14, useNativeDriver: IS_NATIVE,
      }).start();
    } else {
      Animated.timing(sheetY, {
        toValue: 600, duration: 260, useNativeDriver: IS_NATIVE,
      }).start();
    }
  }, [visible]);

  // Input focus expand
  useEffect(() => {
    Animated.spring(inputExpand, {
      toValue: inputFocused ? 1 : 0, tension: 180, friction: 12, useNativeDriver: false,
    }).start();
  }, [inputFocused]);

  // Emoji picker height
  useEffect(() => {
    Animated.spring(emojiPickerH, {
      toValue: showEmojiPicker ? 1 : 0, tension: 180, friction: 12, useNativeDriver: false,
    }).start();
    if (showEmojiPicker) {
      Keyboard.dismiss();
    }
  }, [showEmojiPicker]);

  // Keyboard tracking
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardH(e.endCoordinates.height);
      setShowEmojiPicker(false);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const loadComments = useCallback(async () => {
    if (!postId) return;
    try {
      const { data: replies, error } = await supabase
        .from("post_replies")
        .select("id, author_id, content, created_at, parent_reply_id, is_pinned, profiles(display_name, handle, avatar_url, is_verified, is_organization_verified)")
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
      for (const l of allLikes || []) {
        likeCounts[l.reply_id] = (likeCounts[l.reply_id] || 0) + 1;
      }

      setLikedIds(new Set((userLikes || []).map((l: any) => l.reply_id)));
      setComments(
        (replies as any[]).map((r) => ({
          id: r.id,
          author_id: r.author_id,
          content: r.content || "",
          created_at: r.created_at,
          parent_reply_id: r.parent_reply_id || null,
          like_count: likeCounts[r.id] || 0,
          is_pinned: r.is_pinned || false,
          profile: {
            display_name: r.profiles?.display_name || "User",
            handle: r.profiles?.handle || "user",
            avatar_url: r.profiles?.avatar_url || null,
            is_verified: r.profiles?.is_verified || false,
            is_organization_verified: r.profiles?.is_organization_verified || false,
          },
        }))
      );
    } catch (e) {
      console.warn("[Comments] Load failed:", e);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [postId, user?.id]);

  useEffect(() => {
    if (!visible || !postId) return;
    setComments([]); setLoading(true);
    setText(""); setLikedIds(new Set());
    setReplyingTo(null); setSortMode("recent");
    setNewIds(new Set()); setShowEmojiPicker(false);
    loadComments();
  }, [visible, postId, loadComments]);

  useEffect(() => {
    if (!visible || !postId) return;
    const ch = supabase
      .channel(`dc-comments:${postId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_replies", filter: `post_id=eq.${postId}` }, loadComments)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "post_replies", filter: `post_id=eq.${postId}` }, loadComments)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [visible, postId, loadComments]);

  function handleLike(id: string) {
    if (!user) return;
    const wasLiked = likedIds.has(id);
    setLikedIds((prev) => { const n = new Set(prev); wasLiked ? n.delete(id) : n.add(id); return n; });
    setComments((prev) =>
      prev.map((c) => c.id === id ? { ...c, like_count: Math.max(0, c.like_count + (wasLiked ? -1 : 1)) } : c)
    );
    if (wasLiked) {
      supabase.from("post_reply_likes").delete().eq("reply_id", id).eq("user_id", user.id).then(({ error }) => {
        if (error && mounted.current) {
          setLikedIds((prev) => { const n = new Set(prev); n.add(id); return n; });
          setComments((prev) => prev.map((c) => c.id === id ? { ...c, like_count: c.like_count + 1 } : c));
        }
      });
    } else {
      supabase.from("post_reply_likes").insert({ reply_id: id, user_id: user.id }).then(({ error }) => {
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

  async function handlePin(id: string) {
    const target = comments.find((c) => c.id === id);
    if (!target) return;
    const next = !target.is_pinned;
    // Optimistic
    setComments((prev) => prev.map((c) => ({
      ...c,
      is_pinned: c.id === id ? next : (next ? false : c.is_pinned),
    })));
    await supabase.from("post_replies").update({ is_pinned: next }).eq("id", id);
  }

  function handleReplyTo(c: CommentItem) {
    setReplyingTo(c);
    setText("");
    setShowEmojiPicker(false);
    void Haptics.impactAsync("light");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function sendComment() {
    if (!user || !text.trim()) return;
    setSending(true);
    Animated.sequence([
      Animated.spring(sendScale, { toValue: 0.7, tension: 400, friction: 8, useNativeDriver: IS_NATIVE }),
      Animated.spring(sendScale, { toValue: 1, tension: 300, friction: 8, useNativeDriver: IS_NATIVE }),
    ]).start();
    void Haptics.impactAsync("medium");

    const payload: any = { post_id: postId, author_id: user.id, content: text.trim() };
    if (replyingTo) payload.parent_reply_id = replyingTo.id;

    const { data, error } = await supabase
      .from("post_replies")
      .insert(payload)
      .select("id, author_id, content, created_at, parent_reply_id")
      .single();

    if (!error && data && mounted.current) {
      const newC: CommentItem = {
        id: data.id, author_id: data.author_id,
        content: data.content, created_at: data.created_at,
        parent_reply_id: data.parent_reply_id || null, like_count: 0,
        is_pinned: false,
        profile: {
          display_name: profile?.display_name || "You",
          handle: profile?.handle || "you",
          avatar_url: profile?.avatar_url || null,
          is_verified: false, is_organization_verified: false,
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
      setText(""); setReplyingTo(null);
      if (!wasThread) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 180);
    } else if (error && mounted.current) {
      showAlert("Comment failed", "Could not post your comment. Please try again.", [{ text: "OK" }]);
    }
    if (mounted.current) setSending(false);
  }

  const tree = useMemo(() => {
    const roots = buildTree(comments);
    const pinned = roots.filter((r) => r.is_pinned);
    const rest = roots.filter((r) => !r.is_pinned);
    const sorted = sortMode === "top"
      ? [...rest].sort((a, b) => (b.like_count + (b.children?.length ?? 0) * 2) - (a.like_count + (a.children?.length ?? 0) * 2))
      : [...rest].reverse();
    return [...pinned, ...sorted];
  }, [comments, sortMode]);

  const totalCount = comments.length;
  const charLeft = MAX_CHARS - text.length;
  const sheetMaxH = Math.min(screenH * 0.92, 760);

  const inputMinH = inputExpand.interpolate({ inputRange: [0, 1], outputRange: [42, 42] });
  const floatingBottom = keyboardH > 0
    ? keyboardH - insets.bottom
    : Math.max(insets.bottom, 8);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <Pressable
        style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.54)" }]}
        onPress={() => { Keyboard.dismiss(); onClose(); }}
      />

      {/* Sheet */}
      <Animated.View
        style={[
          st.sheet,
          {
            backgroundColor: colors.surface,
            maxHeight: sheetMaxH,
            transform: [{ translateY: sheetY }],
          },
        ]}
      >
        {/* Drag handle */}
        <View style={[st.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={st.header}>
          <View style={{ flex: 1 }}>
            <Text style={[st.headerTitle, { color: colors.text }]}>
              Comments
              {totalCount > 0 && (
                <Text style={{ color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 14 }}>
                  {" · "}{fmtNum(totalCount)}
                </Text>
              )}
            </Text>
          </View>

          {/* Sort pills */}
          <View style={st.sortRow}>
            {(["recent", "top"] as const).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setSortMode(m)}
                style={[
                  st.sortPill,
                  { borderColor: sortMode === m ? accent + "55" : colors.border },
                  sortMode === m && { backgroundColor: accent + "18" },
                ]}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={m === "recent" ? "time-outline" : "flame-outline"}
                  size={11}
                  color={sortMode === m ? accent : colors.textMuted}
                />
                <Text style={[st.sortPillText, { color: sortMode === m ? accent : colors.textMuted }]}>
                  {m === "recent" ? "Recent" : "Top"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={onClose}
            hitSlop={10}
            style={[st.closeBtn, { backgroundColor: colors.border + "60" }]}
          >
            <Ionicons name="close" size={17} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

        {/* Comment list */}
        {loading ? (
          <View style={st.skeletonWrap}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={[st.skeletonRow, { opacity: 1 - i * 0.18 }]}>
                <View style={[st.skeletonAvatar, { backgroundColor: colors.border }]} />
                <View style={{ flex: 1, gap: 8 }}>
                  <View style={[st.skeletonLine, { width: "50%", backgroundColor: colors.border }]} />
                  <View style={[st.skeletonLine, { width: "88%", backgroundColor: colors.border }]} />
                  <View style={[st.skeletonLine, { width: "35%", backgroundColor: colors.border, height: 9 }]} />
                </View>
              </View>
            ))}
          </View>
        ) : tree.length === 0 ? (
          <View style={st.empty}>
            <View style={[st.emptyIcon, { backgroundColor: accent + "14" }]}>
              <Ionicons name="chatbubbles-outline" size={36} color={accent} />
            </View>
            <Text style={[st.emptyTitle, { color: colors.text }]}>No comments yet</Text>
            <Text style={[st.emptySub, { color: colors.textMuted }]}>
              Be the first to share your thoughts
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={tree}
            keyExtractor={(c) => c.id}
            renderItem={({ item: c }) => (
              <CommentRow
                c={c} colors={colors} accent={accent}
                likedIds={likedIds} currentUserId={user?.id}
                postAuthorId={postAuthorId}
                onLike={handleLike} onReply={handleReplyTo}
                onDelete={handleDelete} onPin={handlePin}
                newIds={newIds} depth={0}
              />
            )}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: user ? 130 : 60 }}
            showsVerticalScrollIndicator={false}
            onRefresh={loadComments}
            refreshing={loading}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* ── FLOATING INPUT BAR ── */}
        {user ? (
          <View
            style={[
              st.floatingWrap,
              { bottom: floatingBottom },
            ]}
          >
            {/* Quick emoji strip */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[st.quickEmojiStrip, { backgroundColor: colors.surface + "F0", borderColor: colors.border }]}
              contentContainerStyle={{ paddingHorizontal: 10, gap: 2, alignItems: "center" }}
              keyboardShouldPersistTaps="always"
            >
              {QUICK_EMOJIS.map((e) => (
                <TouchableOpacity
                  key={e}
                  onPress={() => setText((t) => t + e)}
                  style={st.quickEmojiBtn}
                  activeOpacity={0.6}
                >
                  <Text style={st.quickEmojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
              <View style={[st.emojiStripDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity
                onPress={() => setShowEmojiPicker((v) => !v)}
                style={[
                  st.quickEmojiBtn,
                  showEmojiPicker && { backgroundColor: accent + "18" },
                ]}
                activeOpacity={0.7}
              >
                <Ionicons name={showEmojiPicker ? "close" : "happy-outline"} size={20} color={showEmojiPicker ? accent : colors.textMuted} />
              </TouchableOpacity>
            </ScrollView>

            {/* Reply-to banner */}
            {replyingTo && (
              <View style={[st.replyBanner, { backgroundColor: accent + "12", borderColor: accent + "35" }]}>
                <Ionicons name="return-down-forward" size={13} color={accent} />
                <Text style={[st.replyBannerText, { color: accent }]} numberOfLines={1}>
                  Replying to{" "}
                  <Text style={{ fontFamily: "Inter_700Bold" }}>@{replyingTo.profile.handle}</Text>
                  {replyingTo.content ? (
                    <Text style={{ fontFamily: "Inter_400Regular", opacity: 0.7 }}>
                      {" · "}{replyingTo.content.slice(0, 36)}{replyingTo.content.length > 36 ? "…" : ""}
                    </Text>
                  ) : null}
                </Text>
                <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={10} style={{ marginLeft: "auto" as any }}>
                  <Ionicons name="close-circle" size={17} color={accent + "AA"} />
                </TouchableOpacity>
              </View>
            )}

            {/* Main input pill */}
            <Animated.View
              style={[
                st.inputPill,
                {
                  backgroundColor: colors.surface,
                  borderColor: inputFocused ? accent + "60" : colors.border,
                  shadowColor: "#000",
                },
              ]}
            >
              <AvatarCircle
                uri={profile?.avatar_url ?? null}
                name={profile?.display_name || "You"}
                size={32}
                accent={accent}
              />

              <View style={{ flex: 1 }}>
                <TextInput
                  ref={inputRef}
                  style={[
                    st.textInput,
                    {
                      color: colors.text,
                      minHeight: 36,
                      maxHeight: inputFocused ? 120 : 42,
                    },
                  ]}
                  placeholder={
                    replyingTo
                      ? `Reply to @${replyingTo.profile.handle}…`
                      : "Add a comment…"
                  }
                  placeholderTextColor={colors.textMuted}
                  value={text}
                  onChangeText={(v) => { if (v.length <= MAX_CHARS) setText(v); }}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  multiline
                  maxLength={MAX_CHARS}
                  returnKeyType="default"
                />
              </View>

              {/* Char ring — only when near limit */}
              {text.length > MAX_CHARS * 0.7 && (
                <CharRing value={text.length} max={MAX_CHARS} accent={accent} />
              )}

              {/* Send button */}
              <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                <TouchableOpacity
                  onPress={sendComment}
                  disabled={!text.trim() || sending}
                  style={[
                    st.sendBtn,
                    { backgroundColor: text.trim() ? accent : colors.border + "80" },
                  ]}
                  activeOpacity={0.8}
                >
                  {sending ? (
                    <ActivityIndicator size={15} color="#fff" />
                  ) : (
                    <Ionicons name="arrow-up" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>

            {/* Full emoji picker */}
            <Animated.View
              style={[
                st.emojiPickerWrap,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  maxHeight: emojiPickerH.interpolate({ inputRange: [0, 1], outputRange: [0, 220] }),
                  opacity: emojiPickerH,
                  overflow: "hidden",
                },
              ]}
            >
              {/* Category tabs */}
              <View style={[st.emojiCatRow, { borderBottomColor: colors.border }]}>
                {EMOJI_CATEGORIES.map((cat, i) => (
                  <TouchableOpacity
                    key={cat.label}
                    onPress={() => setEmojiCategory(i)}
                    style={[
                      st.emojiCatBtn,
                      emojiCategory === i && { borderBottomColor: accent, borderBottomWidth: 2 },
                    ]}
                  >
                    <Text style={[st.emojiCatLabel, { color: emojiCategory === i ? accent : colors.textMuted }]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Emojis grid */}
              <View style={st.emojiGrid}>
                {EMOJI_CATEGORIES[emojiCategory].emojis.map((e) => (
                  <TouchableOpacity
                    key={e}
                    onPress={() => { setText((t) => t + e); void Haptics.selectionAsync(); }}
                    style={st.emojiGridBtn}
                    activeOpacity={0.6}
                  >
                    <Text style={st.emojiGridText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          </View>
        ) : (
          <TouchableOpacity
            style={[st.signInWrap, { paddingBottom: Math.max(insets.bottom, 16) }]}
            onPress={() => { onClose(); setTimeout(() => router.push("/(auth)/login"), 220); }}
            activeOpacity={0.8}
          >
            <View style={[st.signInPill, { borderColor: accent + "50", backgroundColor: accent + "14" }]}>
              <Ionicons name="person-circle-outline" size={19} color={accent} />
              <Text style={[st.signInText, { color: accent }]}>Sign in to comment</Text>
              <Ionicons name="chevron-forward" size={14} color={accent + "90"} />
            </View>
          </TouchableOpacity>
        )}
      </Animated.View>
    </Modal>
  );
}

const st = StyleSheet.create({
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    shadowColor: "#000", shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.22, shadowRadius: 24, elevation: 28,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: "center", marginTop: 12, marginBottom: 8,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 18, paddingVertical: 10, gap: 10,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  sortRow: { flexDirection: "row", gap: 6 },
  sortPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 11, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  sortPillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
  },

  skeletonWrap: { padding: 18, gap: 22 },
  skeletonRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  skeletonAvatar: { width: 38, height: 38, borderRadius: 19, flexShrink: 0 },
  skeletonLine: { height: 12, borderRadius: 6 },

  empty: {
    alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 60, paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  // Comment row
  row: {
    flexDirection: "row", gap: 11,
    paddingVertical: 11, paddingRight: 14,
    alignItems: "flex-start",
  },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  name: { fontSize: 13, fontFamily: "Inter_700Bold" },
  time: { fontSize: 11, fontFamily: "Inter_400Regular" },
  authorBadge: {
    paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 8, borderWidth: 1,
  },
  authorBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  content: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  actRow: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 6 },
  actBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actCount: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  actLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },

  // Long-press action tray
  actionTray: {
    flexDirection: "row", alignItems: "center",
    marginTop: 8, borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 6, gap: 2,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 10, elevation: 8,
    alignSelf: "flex-start",
  },
  actionTrayEmoji: { paddingHorizontal: 6, paddingVertical: 4 },
  actionTrayDivider: { width: 1, height: 22, marginHorizontal: 4 },
  actionTrayBtn: { paddingHorizontal: 8, paddingVertical: 4 },

  // Floating input
  floatingWrap: {
    position: "absolute", left: 0, right: 0,
    paddingHorizontal: 10, gap: 0,
  },
  quickEmojiStrip: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    maxHeight: 44,
  },
  quickEmojiBtn: {
    paddingHorizontal: 4, paddingVertical: 6,
    borderRadius: 10, alignItems: "center", justifyContent: "center",
    minWidth: 36,
  },
  quickEmojiText: { fontSize: 20 },
  emojiStripDivider: { width: 1, height: 22, marginHorizontal: 6 },

  replyBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderTopWidth: 0, borderBottomWidth: 0,
  },
  replyBannerText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  inputPill: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14, shadowRadius: 16, elevation: 12,
  },
  textInput: {
    fontSize: 14, fontFamily: "Inter_400Regular",
    padding: 0, margin: 0, lineHeight: 20,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },

  emojiPickerWrap: {
    borderWidth: 1, borderTopWidth: 0,
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
  },
  emojiCatRow: {
    flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emojiCatBtn: {
    flex: 1, alignItems: "center", paddingVertical: 9,
  },
  emojiCatLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emojiGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 6, paddingVertical: 8, gap: 2,
  },
  emojiGridBtn: {
    width: "11%" as any, alignItems: "center",
    paddingVertical: 6, borderRadius: 8,
  },
  emojiGridText: { fontSize: 24 },

  signInWrap: { paddingVertical: 16, alignItems: "center" },
  signInPill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 24, paddingVertical: 13,
    borderRadius: 28, borderWidth: 1,
  },
  signInText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
