import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { showAlert } from "@/lib/alert";
import { useSafeAreaInsets, useSafeAreaInsets as useCardInsets } from "react-native-safe-area-context";
import { router, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { ImageViewer, useImageViewer } from "@/components/ImageViewer";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { RichText } from "@/components/ui/RichText";
import Colors from "@/constants/colors";
import { PostSkeleton } from "@/components/ui/Skeleton";
import { VideoThumbnail } from "@/components/ui/VideoThumbnail";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { cacheMoments, getCachedMoments, cacheFeedTab, getCachedFeedTab, cacheFeedCursor, isOnline, onConnectivityChange } from "@/lib/offlineStore";
import { notifyPostLike } from "@/lib/notifyUser";
import { sharePost, shareVideo } from "@/lib/share";
import { matchInterestsWeighted, recordInteraction, getLearnedInterestBoosts, computeFeedScore, diversifyFeed, type FeedSignals } from "@/lib/feedAlgorithm";
import { useLanguage } from "@/context/LanguageContext";
import { translateText, LANG_LABELS } from "@/lib/translate";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { DesktopFeedLayout, FEED_COLUMN_MAX_WIDTH } from "@/components/desktop/DesktopFeedLayout";
import { encodeId } from "@/lib/shortId";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import SignInPromptModal from "@/components/ui/SignInPromptModal";

let ViewShot: any = ({ children, style, ...rest }: any) => <View style={style} {...rest}>{children}</View>;
try {
  ViewShot = require("react-native-view-shot").default;
} catch (_) {}

type PostItem = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  visibility: string;
  is_verified: boolean;
  is_organization_verified: boolean;
  profile: { display_name: string; handle: string; avatar_url: string | null };
  liked: boolean;
  likeCount: number;
  replyCount: number;
  score: number;
  bookmarked: boolean;
  post_type: string;
  article_title: string | null;
  article_body: string | null;
  video_url: string | null;
  duration_seconds: number | null;
  isFollowing: boolean;
  org_page_id?: string;
  org_slug?: string;
  org_type?: string;
  org_verified?: boolean;
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatNum(n: number): string {
  if (!n || n < 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, "") + "M";
  if (n >= 10_000) return Math.round(n / 1_000) + "K";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function RecentCommenters({ postId, replyCount, bgColor }: { postId: string; replyCount: number; bgColor: string }) {
  const [avatars, setAvatars] = useState<{ avatar_url: string | null; display_name: string }[]>([]);
  useEffect(() => {
    if (replyCount === 0) { setAvatars([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      supabase
        .from("post_replies")
        .select("author_id, profiles!post_replies_author_id_fkey(avatar_url, display_name)")
        .eq("post_id", postId)
        .order("created_at", { ascending: false })
        .limit(5)
        .then(({ data }) => {
          if (!cancelled && data) {
            const seen = new Set<string>();
            const unique = data
              .filter((r: any) => {
                const id = r.author_id;
                if (!id || seen.has(id)) return false;
                seen.add(id);
                return true;
              })
              .slice(0, 3)
              .map((r: any) => ({
                avatar_url: r.profiles?.avatar_url || null,
                display_name: r.profiles?.display_name || "U",
              }));
            setAvatars(unique);
          }
        });
    }, 300 + Math.random() * 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [postId, replyCount]);

  if (avatars.length === 0) return null;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 3 }}>
      {avatars.map((a, i) => (
        <View
          key={i}
          style={{
            marginLeft: i === 0 ? 0 : -6,
            zIndex: 3 - i,
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: bgColor,
            overflow: "hidden",
            backgroundColor: "#ccc",
          }}
        >
          {a.avatar_url ? (
            <ExpoImage source={{ uri: a.avatar_url }} style={{ width: 20, height: 20 }} contentFit="cover" />
          ) : (
            <View style={{ width: 20, height: 20, backgroundColor: "#00BCD440", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 8, color: "#00BCD4", fontFamily: "Inter_700Bold" }}>{(a.display_name || "U").slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

type CommentItem = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  profile: { display_name: string; handle: string; avatar_url: string | null };
};

function DiscoverCommentsSheet({
  visible,
  onClose,
  postId,
  onReplyCountChange,
}: {
  visible: boolean;
  onClose: () => void;
  postId: string;
  onReplyCountChange: (postId: string, delta: number) => void;
}) {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const loadComments = useCallback(() => {
    if (!postId) return;
    supabase
      .from("post_replies")
      .select("id, author_id, content, created_at, profiles!post_replies_author_id_fkey(display_name, handle, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (data) {
          setComments(data.map((r: any) => ({
            id: r.id,
            author_id: r.author_id,
            content: r.content || "",
            created_at: r.created_at,
            profile: {
              display_name: r.profiles?.display_name || "User",
              handle: r.profiles?.handle || "user",
              avatar_url: r.profiles?.avatar_url || null,
            },
          })));
        }
        setLoading(false);
      });
  }, [postId]);

  useEffect(() => {
    if (!visible || !postId) return;
    setComments([]);
    setLoading(true);
    setText("");
    loadComments();
  }, [visible, postId, loadComments]);

  useEffect(() => {
    if (!visible || !postId) return;
    const channel = supabase
      .channel(`discover-comments:${postId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_replies", filter: `post_id=eq.${postId}` }, loadComments)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "post_replies", filter: `post_id=eq.${postId}` }, loadComments)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [visible, postId, loadComments]);

  async function sendComment() {
    if (!user || !text.trim()) return;
    setSending(true);
    const { data, error } = await supabase
      .from("post_replies")
      .insert({ post_id: postId, author_id: user.id, content: text.trim() })
      .select("id, author_id, content, created_at")
      .single();
    if (!error && data) {
      setComments((prev) => [...prev, {
        id: data.id,
        author_id: data.author_id,
        content: data.content,
        created_at: data.created_at,
        profile: {
          display_name: profile?.display_name || "You",
          handle: profile?.handle || "you",
          avatar_url: profile?.avatar_url || null,
        },
      }]);
      onReplyCountChange(postId, 1);
      setText("");
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
    setSending(false);
  }

  const timeDiff = (iso: string) => formatRelative(iso);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1 }} onPress={onClose}>
          <Pressable onPress={() => {}} style={[dcStyles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]}>
            {/* Handle */}
            <View style={[dcStyles.handle, { backgroundColor: colors.border }]} />
            {/* Header */}
            <View style={dcStyles.sheetHeader}>
              <Text style={[dcStyles.sheetTitle, { color: colors.text }]}>
                Comments{comments.length > 0 ? ` · ${formatNum(comments.length)}` : ""}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {/* Divider */}
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
            {/* List */}
            <View style={{ flex: 1 }}>
              {loading ? (
                <View style={{ padding: 24, alignItems: "center" }}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : comments.length === 0 ? (
                <View style={dcStyles.emptyBox}>
                  <Ionicons name="chatbubble-outline" size={36} color={colors.textMuted} />
                  <Text style={[dcStyles.emptyText, { color: colors.textMuted }]}>No comments yet</Text>
                  <Text style={[dcStyles.emptySub, { color: colors.textMuted }]}>Be the first to comment</Text>
                </View>
              ) : (
                <FlatList
                  ref={listRef}
                  data={comments}
                  keyExtractor={(c) => c.id}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ padding: 12, gap: 14 }}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item: c }) => (
                    <View style={dcStyles.commentRow}>
                      <View style={dcStyles.commentAvatar}>
                        {c.profile.avatar_url ? (
                          <ExpoImage source={{ uri: c.profile.avatar_url }} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
                        ) : (
                          <View style={[dcStyles.commentAvatarFallback, { backgroundColor: colors.accent + "22" }]}>
                            <Text style={[dcStyles.commentAvatarLetter, { color: colors.accent }]}>
                              {(c.profile.display_name || "U").slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={[dcStyles.commentBubble, { backgroundColor: colors.backgroundTertiary ?? colors.background }]}>
                          <Text style={[dcStyles.commentName, { color: colors.text }]}>{c.profile.display_name}</Text>
                          <Text style={[dcStyles.commentText, { color: colors.text }]}>{c.content}</Text>
                        </View>
                        <Text style={[dcStyles.commentTime, { color: colors.textMuted }]}>{timeDiff(c.created_at)}</Text>
                      </View>
                    </View>
                  )}
                />
              )}
            </View>
            {/* Input */}
            <View style={[dcStyles.inputRow, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
              {profile?.avatar_url ? (
                <ExpoImage source={{ uri: profile.avatar_url }} style={dcStyles.inputAvatar} contentFit="cover" />
              ) : (
                <View style={[dcStyles.inputAvatar, { backgroundColor: colors.accent + "22", alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ fontSize: 13, color: colors.accent, fontFamily: "Inter_700Bold" }}>
                    {(profile?.display_name || "U").slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              <TextInput
                ref={inputRef}
                style={[dcStyles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholder="Add a comment…"
                placeholderTextColor={colors.textMuted}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={sendComment}
              />
              <TouchableOpacity
                onPress={sendComment}
                disabled={!text.trim() || sending}
                style={[dcStyles.sendBtn, { backgroundColor: text.trim() ? colors.accent : colors.border }]}
              >
                {sending
                  ? <ActivityIndicator size={14} color="#fff" />
                  : <Ionicons name="send" size={15} color="#fff" />
                }
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function BookmarkButton({ bookmarked, onPress }: { bookmarked: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  function handlePress() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.7, duration: 100, useNativeDriver: Platform.OS !== "web" }),
      Animated.spring(scale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
    onPress();
  }
  return (
    <Animated.View style={{ transform: [{ scale }], marginLeft: "auto" }}>
      <TouchableOpacity onPress={handlePress} hitSlop={8}>
        <Ionicons name={bookmarked ? "bookmark" : "bookmark-outline"} size={18} color={bookmarked ? Colors.gold : "#8E8E93"} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const PostCard = React.memo(function PostCard({ item, onToggleLike, onToggleBookmark, onToggleFollow, onImagePress, onRequireAuth, colWidth, onOpenComments }: { item: PostItem; onToggleLike: (postId: string) => void; onToggleBookmark: (postId: string) => void; onToggleFollow: (authorId: string) => void; onImagePress?: (images: string[], index: number) => void; onRequireAuth?: () => void; colWidth?: number; onOpenComments: (postId: string) => void }) {
  const { colors } = useTheme();
  const { preferredLang } = useLanguage();
  const { width: screenW } = useWindowDimensions();
  const cardInsets = useCardInsets();
  const { user: currentUser } = useAuth();
  const { isDesktop } = useIsDesktop();
  const watchedFraction = useVideoProgress(item.post_type === "video" ? item.id : "");
  const [displayContent, setDisplayContent] = useState(item.content);
  const [isTranslated, setIsTranslated] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const cardRef = useRef<any>(null);
  const isOwnPost = currentUser?.id === item.author_id;
  const showFollowBtn = !isOwnPost && !item.isFollowing;

  const allImages = item.images.length > 0 ? item.images : item.image_url ? [item.image_url] : [];
  const effectiveW = colWidth ?? screenW;
  // 16px padding on each side so images never touch card edges
  const singleImgW = effectiveW - 32;
  const multiImgW = (effectiveW - 44) / 2;
  const imgW = allImages.length === 1 ? singleImgW : multiImgW;

  useEffect(() => {
    if (!preferredLang || !item.content?.trim()) { setDisplayContent(item.content); setIsTranslated(false); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      translateText(item.content, preferredLang).then((result) => {
        if (!cancelled && result && result !== item.content) {
          setDisplayContent(result);
          setIsTranslated(true);
        }
      });
    }, Math.random() * 800);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [preferredLang, item.content]);

  function openPost() {
    if (item.org_page_id) {
      router.push(`/company/${item.org_slug}` as any);
      return;
    }
    if (item.post_type === "article") {
      router.push({ pathname: "/article/[id]", params: { id: item.id } });
      return;
    }
    if (item.post_type === "video") {
      if (isDesktop) return;
      router.push({ pathname: "/video/[id]", params: { id: item.id } });
      return;
    }
    router.push({ pathname: "/p/[id]", params: { id: encodeId(item.id) } });
  }

  async function capturePostImage() {
    setMenuVisible(false);
    if (!cardRef.current) return;
    setCapturing(true);
    try {
      if (Platform.OS === "web") {
        const html2canvas = (await import("html2canvas")).default;
        let el: HTMLElement | null = null;
        if (typeof document !== "undefined") {
          el = document.querySelector("[data-post-card=\"" + item.id + "\"]") as HTMLElement | null;
        }
        if (!el) {
          showAlert("Error", "Capture not available.");
          setCapturing(false);
          return;
        }
        const canvas = await html2canvas(el as HTMLElement, {
          useCORS: true,
          allowTaint: false,
          backgroundColor: null,
          scale: 2,
        });
        const dataUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `afuchat-post-${Date.now()}.png`;
        link.click();
      } else {
        if (typeof (cardRef.current as any).capture !== "function") {
          showAlert("Error", "Capture not available.");
          setCapturing(false);
          return;
        }
        const uri = await (cardRef.current as any).capture();
        const Sharing = require("expo-sharing");
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Save Post Image" });
        } else {
          showAlert("Not available", "Sharing is not available on this device.");
        }
      }
    } catch (err) {
      showAlert("Error", "Could not capture post image.");
    }
    setCapturing(false);
  }

  return (
    <>
      <ViewShot ref={cardRef} options={{ format: "png", quality: 1, result: "tmpfile" }}>
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.background }]}
          onPress={openPost}
          activeOpacity={0.97}
          {...(Platform.OS === "web" ? { dataSet: { postCard: item.id } } as any : {})}
        >
          {/* ── Header ── */}
          <View style={styles.cardHeader}>
            {item.org_page_id ? (
              <TouchableOpacity
                onPress={() => router.push(`/company/${item.org_slug}` as any)}
                activeOpacity={0.8}
              >
                <View style={{ width: isDesktop ? 44 : 40, height: isDesktop ? 44 : 40, borderRadius: 8, backgroundColor: "#00BCD420", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {item.profile.avatar_url
                    ? <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={isDesktop ? 44 : 40} square />
                    : <Text style={{ color: "#00BCD4", fontFamily: "Inter_700Bold", fontSize: isDesktop ? 18 : 16 }}>{(item.profile.display_name || "O").slice(0, 1).toUpperCase()}</Text>
                  }
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}
                activeOpacity={0.8}
              >
                <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={isDesktop ? 44 : 40} square={!!(item.is_organization_verified)} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.nameRow}>
                <TouchableOpacity
                  onPress={() => item.org_page_id ? router.push(`/company/${item.org_slug}` as any) : undefined}
                  activeOpacity={item.org_page_id ? 0.7 : 1}
                >
                  <Text style={[styles.cardName, { color: colors.text, fontSize: isDesktop ? 17 : 15 }]} numberOfLines={1}>
                    {item.profile.display_name}
                  </Text>
                </TouchableOpacity>
                {item.org_page_id ? (
                  item.org_verified ? <VerifiedBadge isVerified={false} isOrganizationVerified size={isDesktop ? 15 : 13} /> : null
                ) : (
                  <VerifiedBadge isVerified={item.is_verified} isOrganizationVerified={item.is_organization_verified} size={isDesktop ? 15 : 13} />
                )}
              </View>
              {item.org_page_id ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ backgroundColor: "#00BCD415", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#00BCD4", textTransform: "capitalize" }}>
                      {item.org_type?.replace(/\s*\/.*$/, "") || "Company"}
                    </Text>
                  </View>
                  <Text style={[styles.cardMeta, { color: colors.textMuted, fontSize: isDesktop ? 13 : 12 }]}>
                    · {formatRelative(item.created_at)}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.cardMeta, { color: colors.textMuted, fontSize: isDesktop ? 13 : 12 }]} numberOfLines={1}>
                  @{item.profile.handle} · {formatRelative(item.created_at)}
                </Text>
              )}
            </View>
            {!item.org_page_id && showFollowBtn && (
              <TouchableOpacity
                style={[styles.followBtn, { backgroundColor: colors.accent }]}
                onPress={() => { if (!currentUser) { onRequireAuth?.(); return; } onToggleFollow(item.author_id); }}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={15} color="#fff" />
                <Text style={styles.followBtnText}>Follow</Text>
              </TouchableOpacity>
            )}
            {item.org_page_id ? (
              <TouchableOpacity
                style={[styles.followBtn, { backgroundColor: "#00BCD415", borderWidth: 1, borderColor: "#00BCD430" }]}
                onPress={() => router.push(`/company/${item.org_slug}` as any)}
                activeOpacity={0.7}
              >
                <Ionicons name="business-outline" size={14} color="#00BCD4" />
                <Text style={[styles.followBtnText, { color: "#00BCD4" }]}>View Page</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync?.(); setMenuVisible(true); }}
                hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* ── VIDEO: thumbnail preview card ── */}
          {item.post_type === "video" && item.video_url && (
            isDesktop ? (
              <View style={styles.videoCard}>
                <View style={styles.videoThumb}>
                  <VideoThumbnail
                    videoUrl={item.video_url!}
                    fallbackImageUrl={item.image_url}
                    style={StyleSheet.absoluteFill}
                    lowData={true}
                    durationSeconds={item.duration_seconds}
                    watchedFraction={null}
                  />
                  <View style={styles.videoBadge}>
                    <Ionicons name="videocam" size={11} color="#fff" />
                    <Text style={styles.videoBadgeText}>Video</Text>
                  </View>
                  <View style={[styles.playCircle, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
                    <Ionicons name="phone-portrait-outline" size={18} color="rgba(255,255,255,0.7)" />
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => router.push({ pathname: "/video/[id]", params: { id: item.id } })}
                style={styles.videoCard}
              >
                <View style={styles.videoThumb}>
                  <VideoThumbnail
                    videoUrl={item.video_url!}
                    fallbackImageUrl={item.image_url}
                    style={StyleSheet.absoluteFill}
                    lowData={false}
                    durationSeconds={item.duration_seconds}
                    watchedFraction={watchedFraction}
                  />
                  <View style={styles.playCircle}>
                    <Ionicons name="play" size={22} color="#fff" />
                  </View>
                  <View style={styles.videoBadge}>
                    <Ionicons name="videocam" size={11} color="#fff" />
                    <Text style={styles.videoBadgeText}>Video</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )
          )}

          {/* ── ARTICLE: distinctive card ── */}
          {item.post_type === "article" ? (
            <View style={[styles.articleCard, { backgroundColor: colors.surface }]}>
              {allImages.length > 0 && (
                <ExpoImage
                  source={{ uri: allImages[0] }}
                  style={styles.articleCover}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  priority="normal"
                />
              )}
              <View style={styles.articleCardBody}>
                <View style={[styles.articleBadgeRow, { backgroundColor: colors.accent + "15" }]}>
                  <Ionicons name="document-text" size={11} color={colors.accent} />
                  <Text style={[styles.articleBadgeText, { color: colors.accent }]}>Article</Text>
                  {item.article_title && (
                    <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginLeft: 4 }}>
                      {Math.max(1, Math.round((item.article_body || item.content || "").trim().split(/\s+/).filter(Boolean).length / 200))} min read
                    </Text>
                  )}
                </View>
                {item.article_title ? (
                  <Text style={[styles.articleTitle, { color: colors.text }]} numberOfLines={2}>{item.article_title}</Text>
                ) : null}
                {(displayContent || "").trim().length > 0 && (
                  <Text style={[styles.articleExcerpt, { color: colors.textSecondary }]} numberOfLines={2}>
                    {displayContent}
                  </Text>
                )}
                <TouchableOpacity onPress={openPost} style={[styles.articleReadBtn, { backgroundColor: colors.accent }]}>
                  <Ionicons name="book-outline" size={13} color="#fff" />
                  <Text style={styles.articleReadBtnText}>Read article</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {/* ── Content text ── */}
              {(displayContent || "").trim().length > 0 && (
                <RichText style={[styles.cardContent, { color: colors.text, fontSize: isDesktop ? 17 : 15, lineHeight: isDesktop ? 27 : 23 }]}>
                  {displayContent}
                </RichText>
              )}
            </>
          )}

          {isTranslated && (
            <View style={styles.translatedBadge}>
              <Ionicons name="language" size={11} color={colors.textMuted} />
              <Text style={[styles.translatedText, { color: colors.textMuted }]}>
                {`Translated · ${LANG_LABELS[preferredLang || ""] ?? preferredLang}`}
              </Text>
            </View>
          )}

          {/* ── Images ── */}
          {allImages.length > 0 && item.post_type !== "video" && item.post_type !== "article" && (
            <View style={styles.images}>
              {/* First image — padded, rounded */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={(e) => { e.stopPropagation(); onImagePress?.(allImages, 0); }}
                style={{ marginHorizontal: 16 }}
              >
                <ExpoImage
                  source={{ uri: allImages[0] }}
                  style={{ width: singleImgW, height: Math.round(singleImgW * 0.62), borderRadius: 12 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  priority="high"
                  transition={150}
                />
              </TouchableOpacity>
              {/* Remaining images — horizontal scroll with consistent padding */}
              {allImages.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 6 }}
                  contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
                >
                  {allImages.slice(1).map((uri, i) => (
                    <TouchableOpacity
                      key={i + 1}
                      activeOpacity={0.9}
                      onPress={(e) => { e.stopPropagation(); onImagePress?.(allImages, i + 1); }}
                    >
                      <ExpoImage
                        source={{ uri }}
                        style={{ width: multiImgW, height: Math.round(multiImgW * 0.75), borderRadius: 10 }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        priority="normal"
                        transition={150}
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {/* ── Footer ── */}
          <View style={styles.cardFooter}>
            {/* Likes */}
            <TouchableOpacity
              style={styles.footerStat}
              onPress={() => { if (!currentUser) { onRequireAuth?.(); return; } onToggleLike(item.id); }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.liked ? "heart" : "heart-outline"}
                size={19}
                color={item.liked ? "#FF3B30" : colors.textMuted}
              />
              <Text style={[styles.footerStatNum, { color: item.liked ? "#FF3B30" : colors.textMuted }]}>
                {formatNum(item.likeCount)}
              </Text>
            </TouchableOpacity>

            {/* Comments */}
            <TouchableOpacity
              style={styles.footerStat}
              onPress={() => { if (!currentUser) { onRequireAuth?.(); return; } onOpenComments(item.id); }}
              activeOpacity={0.7}
            >
              <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
              <RecentCommenters postId={item.id} replyCount={item.replyCount} bgColor={colors.background} />
              <Text style={[styles.footerStatNum, { color: colors.textMuted }]}>{formatNum(item.replyCount)}</Text>
            </TouchableOpacity>

            {/* Share */}
            <TouchableOpacity
              style={styles.footerStat}
              onPress={() => { if (!currentUser) { onRequireAuth?.(); return; } item.post_type === "video"
                ? shareVideo({ postId: item.id, authorName: item.profile.display_name, caption: item.content })
                : sharePost({ postId: item.id, authorName: item.profile.display_name, content: item.content }); }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-redo-outline" size={18} color={colors.textMuted} />
              <Text style={[styles.footerStatNum, { color: colors.textMuted }]}>Share</Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            {/* Views */}
            <View style={styles.footerStat}>
              <Ionicons name="eye-outline" size={15} color={colors.textMuted} />
              <Text style={[styles.footerStatNum, { color: colors.textMuted }]}>{formatNum(item.view_count)}</Text>
            </View>

            {/* Bookmark */}
            <BookmarkButton bookmarked={item.bookmarked} onPress={() => { if (!currentUser) { onRequireAuth?.(); return; } onToggleBookmark(item.id); }} />
          </View>

          {/* AfuChat watermark — only rendered during image capture */}
          {capturing && (
            <View style={[styles.watermarkBar, { backgroundColor: colors.accent }]}>
              <Ionicons name="chatbubble-ellipses" size={13} color="#fff" />
              <Text style={styles.watermarkText}>AfuChat · afuchat.com</Text>
            </View>
          )}
        </TouchableOpacity>
      </ViewShot>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuSheet, { backgroundColor: colors.surface, paddingBottom: cardInsets.bottom + 12 }]}>
            <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuVisible(false); item.post_type === "video" ? shareVideo({ postId: item.id, authorName: item.profile.display_name, caption: item.content }) : sharePost({ postId: item.id, authorName: item.profile.display_name, content: item.content }); }}
            >
              <Ionicons name="share-outline" size={22} color={colors.accent} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Share Post</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={capturePostImage} disabled={capturing}>
              {capturing
                ? <ActivityIndicator size={22} color={colors.accent} />
                : <Ionicons name="image-outline" size={22} color={colors.accent} />
              }
              <Text style={[styles.menuItemText, { color: colors.text }]}>Save as Image</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
              <Ionicons name="close-outline" size={22} color={colors.textMuted} />
              <Text style={[styles.menuItemText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}, (prev, next) =>
  prev.item.id === next.item.id &&
  prev.item.liked === next.item.liked &&
  prev.item.likeCount === next.item.likeCount &&
  prev.item.replyCount === next.item.replyCount &&
  prev.item.bookmarked === next.item.bookmarked &&
  prev.item.view_count === next.item.view_count &&
  prev.item.isFollowing === next.item.isFollowing &&
  prev.item.content === next.item.content &&
  prev.colWidth === next.colWidth
);

export default function DiscoverScreen() {
  "use no memo";
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { isDesktop } = useIsDesktop();
  const navigation = useNavigation();
  // Shorts now lives at /shorts (which redirects to /video/[id]). Any URL like
  // ?tab=shorts is forwarded there so existing links keep working.
  const [feedTab, setFeedTab] = useState<"for_you" | "following">(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get("tab");
      if (t === "following" || t === "for_you") return t as any;
    }
    return "for_you";
  });
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("tab") === "shorts") {
        router.replace("/shorts" as any);
      }
    }
  }, []);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreatePicker, setShowCreatePicker] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [followingEmpty, setFollowingEmpty] = useState(false);
  const [bgRefreshing, setBgRefreshing] = useState(false);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const PAGE_SIZE = 30;
  const imgViewer = useImageViewer();

  const onOpenComments = useCallback((postId: string) => {
    setCommentPostId(postId);
  }, []);

  const onCommentReplyCountChange = useCallback((postId: string, delta: number) => {
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, replyCount: Math.max(0, p.replyCount + delta) } : p));
  }, []);

  const fabRef = useRef<TouchableOpacity>(null);

  const tabPostsCache = useRef<Record<"for_you" | "following", PostItem[]>>({ for_you: [], following: [] });
  const tabCacheTimestamp = useRef<Record<"for_you" | "following", number>>({ for_you: 0, following: 0 });
  const learnedWeightsRef = useRef<Record<string, number>>({});
  const postsRef = useRef<PostItem[]>([]);
  const feedTabRef = useRef<"for_you" | "following">("for_you");
  const flatListRef = useRef<FlatList>(null);
  const recordedViewsRef = useRef<Set<string>>(new Set());

  // ── Scroll-aware header ──────────────────────────────────────────────────
  // Uses Animated.event (not a plain onScroll function) so FlatList's internal
  // scroll tracking for onEndReached is never overridden.
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerOffset = useRef(new Animated.Value(0)).current;
  const scrollYAnim = useRef(new Animated.Value(0)).current;
  const prevScrollYRef = useRef(0);
  const headerVisibleRef = useRef(true);
  // useNativeDriver:false because headerOffset target changes dynamically
  // and web doesn't support native driver for transforms driven this way.
  const DRIVER = false;

  function revealHeader() {
    if (headerVisibleRef.current) return;
    headerVisibleRef.current = true;
    Animated.spring(headerOffset, {
      toValue: 0,
      useNativeDriver: DRIVER,
      tension: 220,
      friction: 28,
    }).start();
  }

  function hideHeader(height: number) {
    if (!headerVisibleRef.current || height === 0) return;
    headerVisibleRef.current = false;
    Animated.spring(headerOffset, {
      toValue: -height,
      useNativeDriver: DRIVER,
      tension: 220,
      friction: 28,
    }).start();
  }

  // Attach a JS listener to the animated scroll value so we can decide
  // when to show/hide the header without touching FlatList's onScroll.
  useEffect(() => {
    const id = scrollYAnim.addListener(({ value }) => {
      const dy = value - prevScrollYRef.current;
      prevScrollYRef.current = value;
      if (value <= 20) { revealHeader(); return; }
      if (dy > 4)  hideHeader(headerHeight);
      else if (dy < -4) revealHeader();
    });
    return () => scrollYAnim.removeListener(id);
  }, [headerHeight]);   // re-subscribe when headerHeight is known

  // The Animated.event passed to FlatList — compatible with onEndReached.
  const onFeedScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollYAnim } } }],
    { useNativeDriver: DRIVER }
  );
  // ────────────────────────────────────────────────────────────────────────
  const viewabilityConfig = useRef({ minimumViewTime: 800, itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {});
  onViewableItemsChangedRef.current = ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!user) return;
    for (const vi of viewableItems) {
      const postId = vi.item?.id as string | undefined;
      if (!postId || recordedViewsRef.current.has(postId)) continue;
      recordedViewsRef.current.add(postId);
      supabase.from("post_views").insert({ post_id: postId, viewer_id: user.id }).then(() => {
        setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, view_count: (p.view_count || 0) + 1 } : p));
      });
    }
  };
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    onViewableItemsChangedRef.current({ viewableItems });
  }).current;
  const [newPostAuthors, setNewPostAuthors] = useState<{ id: string; avatar_url: string | null; display_name: string }[]>([]);
  const newPostAuthorIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => { postsRef.current = posts; }, [posts]);
  useEffect(() => { feedTabRef.current = feedTab; }, [feedTab]);

  useEffect(() => {
    getLearnedInterestBoosts().then((w) => { learnedWeightsRef.current = w; });
  }, []);

  const fetchPosts = useCallback(async (offset: number, isRefresh: boolean, tab?: "for_you" | "following", background?: boolean) => {
    const activeTab = tab ?? feedTabRef.current;
    if (background) setBgRefreshing(true);
    try {
    if (!isOnline()) {
      if (!background) {
        if (isRefresh) {
          const cached = await getCachedFeedTab(activeTab);
          if (cached?.posts?.length) {
            const p = cached.posts as PostItem[];
            setPosts(p);
            tabPostsCache.current[activeTab] = p;
            tabCacheTimestamp.current[activeTab] = cached.cachedAt;
          } else {
            const legacyCached = await getCachedMoments();
            if (legacyCached.length > 0) setPosts(legacyCached as PostItem[]);
          }
        }
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
      return;
    }

    // --- Following tab ---
    if (activeTab === "following") {
      if (!user) { setLoading(false); setRefreshing(false); setLoadingMore(false); return; }

      const { data: followData } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);

      const followingIds = (followData || []).map((f: any) => f.following_id);

      if (followingIds.length === 0) {
        setFollowingEmpty(true);
        if (isRefresh) setPosts([]);
        setLoading(false); setRefreshing(false); setLoadingMore(false);
        return;
      }
      setFollowingEmpty(false);

      const followOlderThan = !isRefresh && postsRef.current.length > 0
        ? postsRef.current[postsRef.current.length - 1]?.created_at
        : null;
      const followBaseQ = supabase
        .from("posts")
        .select(`
          id, author_id, content, image_url, created_at, view_count, visibility, language_code,
          post_type, article_title, article_body, video_url,
          profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified),
          post_images(image_url, display_order),
          video_assets!posts_video_asset_id_fkey(duration_seconds)
        `)
        .in("author_id", followingIds)
        .in("visibility", ["public", "followers"])
        .order("created_at", { ascending: false });
      const { data } = await (followOlderThan
        ? followBaseQ.lt("created_at", followOlderThan).limit(PAGE_SIZE)
        : followBaseQ.limit(PAGE_SIZE));

      if (data) {
        if (data.length < PAGE_SIZE) setHasMore(false); else setHasMore(true);

        const postIds = data.map((p: any) => p.id);
        const [{ data: myLikes }, { data: replyCounts }, { data: myBookmarks }, { data: likeCounts }] = await Promise.all([
          postIds.length > 0 && user ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id) : { data: [] },
          postIds.length > 0 ? supabase.from("post_replies").select("post_id").in("post_id", postIds) : { data: [] },
          postIds.length > 0 && user ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id) : { data: [] },
          postIds.length > 0 ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds) : { data: [] },
        ]);

        const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
        const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id));
        const likeMap: Record<string, number> = {};
        for (const l of (likeCounts || [])) { likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1; }
        const replyMap: Record<string, number> = {};
        for (const r of (replyCounts || [])) { replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1; }

        const mapped: PostItem[] = data.map((p: any) => ({
          id: p.id, author_id: p.author_id, content: p.content || "",
          image_url: p.image_url,
          images: (p.post_images || []).sort((a: any, b: any) => a.display_order - b.display_order).map((i: any) => i.image_url),
          created_at: p.created_at, view_count: p.view_count || 0,
          visibility: p.visibility || "public",
          is_verified: p.profiles?.is_verified || false,
          is_organization_verified: p.profiles?.is_organization_verified || false,
          profile: { display_name: p.profiles?.display_name || "User", handle: p.profiles?.handle || "user", avatar_url: p.profiles?.avatar_url || null },
          liked: myLikeSet.has(p.id), likeCount: likeMap[p.id] || 0, replyCount: replyMap[p.id] || 0, score: 0, bookmarked: myBookmarkSet.has(p.id),
          post_type: p.post_type || "post", article_title: p.article_title || null, article_body: p.article_body || null, video_url: p.video_url || null,
          duration_seconds: (() => { const arr = Array.isArray(p.video_assets) ? p.video_assets : (p.video_assets ? [p.video_assets] : []); return arr.length > 0 ? (arr[0].duration_seconds ?? null) : null; })(),
          isFollowing: true,
        }));

        if (isRefresh) {
          setPosts(mapped);
          tabPostsCache.current[activeTab] = mapped;
          tabCacheTimestamp.current[activeTab] = Date.now();
          cacheFeedTab(activeTab, mapped);
        } else {
          setPosts((prev) => { const ids = new Set(prev.map((p) => p.id)); return [...prev, ...mapped.filter((i) => !ids.has(i.id))]; });
        }
      }
      if (!background) { setLoading(false); setRefreshing(false); setLoadingMore(false); }
      return;
    }

    // --- For You tab ---
    const userInterests: string[] = profile?.interests || [];
    const userCountry: string = profile?.country || "";

    // Cursor-based pagination newest-first — same behaviour for guests and
    // logged-in users so the feed scrolls without limit in both cases.
    const fyOlderThan =
      !isRefresh && postsRef.current.length > 0
        ? postsRef.current[postsRef.current.length - 1]?.created_at
        : null;

    const fySelect = `
      id, author_id, content, image_url, created_at, view_count, visibility, language_code,
      post_type, article_title, article_body, video_url,
      profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified, is_organization_verified, country, interests),
      post_images(image_url, display_order),
      video_assets!posts_video_asset_id_fkey(duration_seconds)
    `;

    let fyQ: any = supabase.from("posts").select(fySelect).eq("visibility", "public")
      .order("created_at", { ascending: false });
    if (fyOlderThan) fyQ = fyQ.lt("created_at", fyOlderThan);
    fyQ = fyQ.limit(PAGE_SIZE);

    const { data } = await fyQ;

    if (data) {
      if (data.length < PAGE_SIZE) setHasMore(false);
      else setHasMore(true);

      const postIds = data.map((p: any) => p.id);
      const authorIds = [...new Set(data.map((p: any) => p.author_id))];

      const [
        { data: likeCounts },
        { data: myLikes },
        { data: replyCounts },
        { data: myAuthorLikes },
        { data: followingData },
        { data: myReplies },
        { data: myBookmarks },
      ] = await Promise.all([
        postIds.length > 0
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds)
          : { data: [] },
        postIds.length > 0 && user
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id)
          : { data: [] },
        postIds.length > 0
          ? supabase.from("post_replies").select("post_id").in("post_id", postIds)
          : { data: [] },
        authorIds.length > 0 && user
          ? supabase.from("post_acknowledgments")
              .select("post_id, posts!inner(author_id)")
              .eq("user_id", user.id)
              .in("posts.author_id", authorIds)
              .limit(500)
          : { data: [] },
        authorIds.length > 0 && user
          ? supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", authorIds)
          : { data: [] },
        authorIds.length > 0 && user
          ? supabase.from("post_replies")
              .select("post_id, posts!inner(author_id)")
              .eq("author_id", user.id)
              .in("posts.author_id", authorIds)
              .limit(500)
          : { data: [] },
        postIds.length > 0 && user
          ? supabase.from("post_bookmarks").select("post_id").in("post_id", postIds).eq("user_id", user.id)
          : { data: [] },
      ]);

      const likeMap: Record<string, number> = {};
      for (const l of (likeCounts || [])) { likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1; }

      const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));
      const myBookmarkSet = new Set((myBookmarks || []).map((b: any) => b.post_id));

      const replyMap: Record<string, number> = {};
      for (const r of (replyCounts || [])) { replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1; }

      const followingSet = new Set((followingData || []).map((f: any) => f.following_id));

      const authorInteractionMap: Record<string, number> = {};
      for (const al of (myAuthorLikes || [])) {
        const authorId = (al as any).posts?.author_id;
        if (authorId) authorInteractionMap[authorId] = (authorInteractionMap[authorId] || 0) + 1;
      }
      for (const ar of (myReplies || [])) {
        const authorId = (ar as any).posts?.author_id;
        if (authorId) authorInteractionMap[authorId] = (authorInteractionMap[authorId] || 0) + 2;
      }

      const authorPostCount: Record<string, number> = {};
      for (const p of data) {
        const aid = (p as any).author_id;
        authorPostCount[aid] = (authorPostCount[aid] || 0) + 1;
      }

      const scored = data.map((p: any) => {
        const likeCount = likeMap[p.id] || 0;
        const replyCount = replyMap[p.id] || 0;
        const hasImages = (p.post_images?.length > 0) || !!p.image_url;
        const content = p.content || "";
        const authorCountry = p.profiles?.country || "";

        const interestMatches = matchInterestsWeighted(content, userInterests, learnedWeightsRef.current);

        const signals: FeedSignals = {
          likeCount,
          replyCount,
          viewCount: p.view_count || 0,
          createdAt: p.created_at,
          interestMatches,
          isFollowing: followingSet.has(p.author_id),
          authorInteractionCount: authorInteractionMap[p.author_id] || 0,
          isVerified: p.profiles?.is_verified || false,
          isOrgVerified: p.profiles?.is_organization_verified || false,
          hasImages,
          sameCountry: !!userCountry && !!authorCountry && userCountry === authorCountry,
          authorPostCountInFeed: authorPostCount[p.author_id] || 1,
          contentLength: content.length,
        };

        const score = computeFeedScore(signals);

        return {
          id: p.id,
          author_id: p.author_id,
          content,
          image_url: p.image_url,
          images: (p.post_images || [])
            .sort((a: any, b: any) => a.display_order - b.display_order)
            .map((i: any) => i.image_url),
          created_at: p.created_at,
          view_count: p.view_count || 0,
          visibility: p.visibility || "public",
          is_verified: p.profiles?.is_verified || false,
          is_organization_verified: p.profiles?.is_organization_verified || false,
          profile: {
            display_name: p.profiles?.display_name || "User",
            handle: p.profiles?.handle || "user",
            avatar_url: p.profiles?.avatar_url || null,
          },
          liked: myLikeSet.has(p.id),
          likeCount,
          replyCount,
          score,
          bookmarked: myBookmarkSet.has(p.id),
          post_type: p.post_type || "post",
          article_title: p.article_title || null,
          article_body: p.article_body || null,
          video_url: p.video_url || null,
          duration_seconds: (() => { const arr = Array.isArray(p.video_assets) ? p.video_assets : (p.video_assets ? [p.video_assets] : []); return arr.length > 0 ? (arr[0].duration_seconds ?? null) : null; })(),
          isFollowing: followingSet.has(p.author_id),
        };
      });

      const diversified = diversifyFeed(scored);

      // Fetch org page posts and splice into feed (1 per every ~5 regular posts)
      let orgPostItems: PostItem[] = [];
      try {
        const orgCursor = fyOlderThan;
        let orgQ: any = supabase
          .from("organization_page_posts")
          .select("id, content, image_url, created_at, author_id, likes, page_id, organization_pages!inner(id, slug, name, org_type, logo_url, is_verified)")
          .order("created_at", { ascending: false })
          .limit(6);
        if (orgCursor) orgQ = orgQ.lt("created_at", orgCursor);
        const { data: orgData } = await orgQ;
        if (orgData && orgData.length > 0) {
          orgPostItems = orgData.map((op: any) => {
            const pg = op.organization_pages;
            return {
              id: `org_${op.id}`,
              author_id: op.author_id || pg?.id || "",
              content: op.content || "",
              image_url: op.image_url || null,
              images: op.image_url ? [op.image_url] : [],
              created_at: op.created_at,
              view_count: 0,
              visibility: "public",
              is_verified: false,
              is_organization_verified: pg?.is_verified || false,
              profile: {
                display_name: pg?.name || "Organization",
                handle: pg?.slug || "",
                avatar_url: pg?.logo_url || null,
              },
              liked: false,
              likeCount: op.likes || 0,
              replyCount: 0,
              score: 50,
              bookmarked: false,
              post_type: "post",
              article_title: null,
              article_body: null,
              video_url: null,
              duration_seconds: null,
              isFollowing: false,
              org_page_id: pg?.id,
              org_slug: pg?.slug,
              org_type: pg?.org_type,
              org_verified: pg?.is_verified,
            } as PostItem;
          });
        }
      } catch (_) {}

      // Interleave: insert 1 org post for every 5 regular posts
      const merged: PostItem[] = [];
      let orgIdx = 0;
      for (let i = 0; i < diversified.length; i++) {
        merged.push(diversified[i] as PostItem);
        if ((i + 1) % 5 === 0 && orgIdx < orgPostItems.length) {
          merged.push(orgPostItems[orgIdx++]);
        }
      }
      // Append any remaining org posts at end
      while (orgIdx < orgPostItems.length) {
        merged.push(orgPostItems[orgIdx++]);
      }

      if (isRefresh) {
        setPosts(merged);
        tabPostsCache.current[activeTab] = merged;
        tabCacheTimestamp.current[activeTab] = Date.now();
        cacheFeedTab(activeTab, merged);
        cacheMoments(merged);
      } else {
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newItems = merged.filter((i) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
      }
    }
    } catch (err) {
      console.error("[Discover] fetchPosts error:", err);
    } finally {
      if (!background) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
      setBgRefreshing(false);
    }
  }, [user, profile]);

  const loadPosts = useCallback(
    (tab?: "for_you" | "following", background?: boolean) => fetchPosts(0, true, tab, background),
    [fetchPosts]
  );

  const loadMoreInFlight = useRef(false);
  const loadMore = useCallback(() => {
    if (loadMoreInFlight.current || !hasMore || postsRef.current.length === 0) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    fetchPosts(0, false, feedTabRef.current).finally(() => {
      loadMoreInFlight.current = false;
    });
  }, [fetchPosts, hasMore]);

  const loadPostsRef = useRef(loadPosts);
  useEffect(() => { loadPostsRef.current = loadPosts; }, [loadPosts]);

  // Tab switch — show cached posts immediately, background-refresh if stale
  useEffect(() => {
    const dataTab = feedTab;
    const STALE_MS = 3 * 60 * 1000;
    const cached = tabPostsCache.current[dataTab];
    const cacheAge = Date.now() - tabCacheTimestamp.current[dataTab];

    // Always reveal the header when switching tabs
    revealHeader();
    prevScrollYRef.current = 0;

    setHasMore(true);
    setFollowingEmpty(false);
    setNewPostAuthors([]);
    newPostAuthorIdsRef.current.clear();

    if (cached.length > 0) {
      setPosts(cached);
      setLoading(false);
      if (cacheAge >= STALE_MS) {
        loadPostsRef.current(dataTab, true);
      }
    } else {
      setPosts([]);
      setLoading(true);
      loadPostsRef.current(dataTab, false);
    }
  }, [feedTab]);

  // Mount: preload both tabs from AsyncStorage, then background-refresh For You
  useEffect(() => {
    (async () => {
      const [fyCache, flCache] = await Promise.all([
        getCachedFeedTab("for_you"),
        getCachedFeedTab("following"),
      ]);
      if (fyCache?.posts?.length) {
        const p = fyCache.posts as PostItem[];
        tabPostsCache.current.for_you = p;
        tabCacheTimestamp.current.for_you = fyCache.cachedAt;
        if (feedTabRef.current === "for_you") {
          setPosts(p);
          setLoading(false);
        }
      }
      if (flCache?.posts?.length) {
        tabPostsCache.current.following = flCache.posts as PostItem[];
        tabCacheTimestamp.current.following = flCache.cachedAt;
      }
      const hasFyCache = (fyCache?.posts?.length ?? 0) > 0;
      if (isOnline()) {
        loadPostsRef.current("for_you", hasFyCache);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth/profile change — refresh active tab in background if posts already showing
  useEffect(() => {
    if (!user && !profile) return;
    const hasPosts = tabPostsCache.current[feedTabRef.current].length > 0;
    loadPostsRef.current(feedTabRef.current, hasPosts);
  }, [user, profile]);

  // Auto-refresh on reconnect
  useEffect(() => {
    const unsub = onConnectivityChange((online) => {
      if (online) {
        const hasPosts = tabPostsCache.current[feedTabRef.current].length > 0;
        loadPostsRef.current(feedTabRef.current, hasPosts);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("discover-posts-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload: any) => {
        const newPost = payload.new;
        if (!newPost) return;
        const authorId = newPost.author_id;
        if (!authorId || authorId === user?.id) return;
        if (newPostAuthorIdsRef.current.has(authorId)) return;
        newPostAuthorIdsRef.current.add(authorId);
        supabase.from("profiles").select("display_name, avatar_url").eq("id", authorId).single()
          .then(({ data: prof }) => {
            setNewPostAuthors((prev) => {
              if (prev.length >= 5) return prev;
              return [...prev, { id: authorId, avatar_url: prof?.avatar_url || null, display_name: prof?.display_name || "User" }];
            });
          });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, (payload: any) => {
        const deletedId = payload.old?.id;
        if (deletedId) {
          setPosts((prev) => prev.filter((p) => p.id !== deletedId));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_acknowledgments" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        const evType = payload.eventType;
        if (evType !== "INSERT" && evType !== "DELETE") return;
        const isOwnAction = (evType === "INSERT" && payload.new?.user_id === user?.id) || (evType === "DELETE" && payload.old?.user_id === user?.id);
        if (isOwnAction) return;
        const delta = evType === "INSERT" ? 1 : -1;
        setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, likeCount: Math.max(0, p.likeCount + delta) } : p));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "post_replies" }, (payload: any) => {
        const postId = payload.new?.post_id || payload.old?.post_id;
        if (!postId) return;
        const evType = payload.eventType;
        const delta = evType === "INSERT" ? 1 : evType === "DELETE" ? -1 : 0;
        if (delta !== 0) {
          setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, replyCount: Math.max(0, p.replyCount + delta) } : p));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "follows" }, (payload: any) => {
        const followerId = payload.new?.follower_id;
        const followingId = payload.new?.following_id;
        if (followerId === user?.id && followingId) {
          setPosts((prev) => prev.map((p) => p.author_id === followingId ? { ...p, isFollowing: true } : p));
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "follows" }, (payload: any) => {
        const followerId = payload.old?.follower_id;
        const followingId = payload.old?.following_id;
        if (followerId === user?.id && followingId) {
          setPosts((prev) => prev.map((p) => p.author_id === followingId ? { ...p, isFollowing: false } : p));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  function handleShowNewPosts() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setNewPostAuthors([]);
    newPostAuthorIdsRef.current.clear();
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setRefreshing(true);
    setHasMore(true);
    loadPosts(feedTab);
  }

  const toggleBookmark = useCallback(async (postId: string) => {
    if (!user) { setShowSignInPrompt(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const post = postsRef.current.find((p) => p.id === postId);
    if (!post) return;
    if (post.bookmarked) {
      await supabase.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", user.id);
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, bookmarked: false } : p));
    } else {
      await supabase.from("post_bookmarks").upsert({ post_id: postId, user_id: user.id }, { onConflict: "post_id,user_id" });
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, bookmarked: true } : p));
      const content = [post.content, post.article_title].filter(Boolean).join(" ");
      recordInteraction(content, "bookmark").then(async () => {
        learnedWeightsRef.current = await getLearnedInterestBoosts();
      });
    }
  }, [user, postsRef]);

  const toggleLike = useCallback(async (postId: string) => {
    if (!user) { setShowSignInPrompt(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const post = postsRef.current.find((p) => p.id === postId);
    if (!post) return;

    if (post.liked) {
      const { error } = await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
      if (!error) {
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: false, likeCount: Math.max(0, p.likeCount - 1) } : p)
        );
      }
    } else {
      const { error } = await supabase.from("post_acknowledgments").insert({ post_id: postId, user_id: user.id });
      if (!error) {
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, liked: true, likeCount: p.likeCount + 1 } : p)
        );
        const content = [post.content, post.article_title].filter(Boolean).join(" ");
        recordInteraction(content, "like").then(async () => {
          learnedWeightsRef.current = await getLearnedInterestBoosts();
        });
        if (post.author_id !== user.id) {
          notifyPostLike({
            postAuthorId: post.author_id,
            likerName: profile?.display_name || "Someone",
            likerUserId: user.id,
            postId,
          });
        }
        try { const { rewardXp } = await import("../../lib/rewardXp"); rewardXp("post_liked"); } catch (_) {}
      }
    }
  }, [user, profile, postsRef]);

  const toggleFollow = useCallback(async (authorId: string) => {
    if (!user) { setShowSignInPrompt(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await supabase.from("follows").upsert({ follower_id: user.id, following_id: authorId }, { onConflict: "follower_id,following_id" });
    if (!error) {
      setPosts((prev) => prev.map((p) => p.author_id === authorId ? { ...p, isFollowing: true } : p));
    }
  }, [user]);

  const onRequireAuth = useCallback(() => setShowSignInPrompt(true), []);

  // The dedicated Shorts experience now lives at /shorts (which redirects to
  // /video/[id]), so there is only ONE video player implementation app-wide.
  // The Shorts pill in the discover header navigates there.

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <OfflineBanner />
      <DesktopFeedLayout>

      {/* ── Scroll-aware header (absolutely positioned so it can slide away) ── */}
      <Animated.View
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        style={[
          styles.headerBlock,
          {
            backgroundColor: colors.background,
            transform: [{ translateY: headerOffset }],
          },
        ]}
      >
        {/* Tab switcher — YouTube-style underline tabs */}
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + 8 },
          ]}
        >
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabPill, { borderBottomColor: feedTab === "for_you" ? colors.text : "transparent" }]}
              onPress={() => setFeedTab("for_you")}
            >
              <Text style={[
                styles.tabPillText,
                { color: feedTab === "for_you" ? colors.text : colors.textMuted,
                  fontFamily: feedTab === "for_you" ? "Inter_700Bold" : "Inter_500Medium" },
              ]}>
                For You
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabPill, { borderBottomColor: feedTab === "following" ? colors.text : "transparent" }]}
              onPress={() => {
                if (!user) { router.push("/(auth)/login"); return; }
                setFeedTab("following");
              }}
            >
              <Text style={[
                styles.tabPillText,
                { color: feedTab === "following" ? colors.text : colors.textMuted,
                  fontFamily: feedTab === "following" ? "Inter_700Bold" : "Inter_500Medium" },
              ]}>
                Following
              </Text>
            </TouchableOpacity>
            {!isDesktop && (
              <TouchableOpacity
                style={styles.tabPill}
                onPress={() => router.push("/shorts" as any)}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="play-circle-outline" size={15} color={colors.textMuted} />
                  <Text style={[styles.tabPillText, { color: colors.textMuted, fontFamily: "Inter_500Medium" }]}>
                    Shorts
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {!user && (
            <TouchableOpacity
              onPress={() => router.push("/(auth)/login")}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Ionicons name="log-in-outline" size={16} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Sign in</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* New posts indicator — lives inside the animated block */}
        {newPostAuthors.length > 0 && (
          <TouchableOpacity
            style={[styles.newPostsPill, { backgroundColor: colors.accent }]}
            onPress={handleShowNewPosts}
            activeOpacity={0.85}
          >
            <View style={styles.newPostsAvatars}>
              {newPostAuthors.slice(0, 3).map((a, i) => (
                <View key={a.id} style={[styles.newPostsAvatarWrap, { marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i }]}>
                  <Avatar uri={a.avatar_url} name={a.display_name} size={22} />
                </View>
              ))}
            </View>
            <Ionicons name="arrow-up" size={14} color="#fff" style={{ marginLeft: 2 }} />
            <Text style={styles.newPostsPillText}>New posts</Text>
          </TouchableOpacity>
        )}

        {/* Background refresh indicator */}
        {bgRefreshing && newPostAuthors.length === 0 && (
          <View style={[styles.bgRefreshBar, { backgroundColor: colors.accent + "18" }]}>
            <ActivityIndicator size={10} color={colors.accent} />
            <Text style={[styles.bgRefreshText, { color: colors.accent }]}>Updating feed…</Text>
          </View>
        )}
      </Animated.View>
      {/* ────────────────────────────────────────────────────────────────── */}

      {feedTab === "following" && !user ? (
        <View style={[styles.center, { paddingTop: headerHeight + 80 }]}>
          <Ionicons name="lock-closed-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Sign in to see Following</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Follow people to see their posts here</Text>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.accent }]} onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.createBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      ) : feedTab === "following" && followingEmpty ? (
        <View style={[styles.center, { paddingTop: headerHeight + 80 }]}>
          <Ionicons name="people-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No one followed yet</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Follow people to see their posts here</Text>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.accent }]} onPress={() => setFeedTab("for_you")}>
            <Text style={styles.createBtnText}>Browse For You</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={{ padding: 8, paddingTop: headerHeight + 8, gap: 8 }}>{[1,2,3].map(i => <PostSkeleton key={i} />)}</View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PostCard
              item={item}
              onToggleLike={toggleLike}
              onToggleBookmark={toggleBookmark}
              onToggleFollow={toggleFollow}
              onImagePress={imgViewer.openViewer}
              onRequireAuth={onRequireAuth}
              colWidth={isDesktop ? FEED_COLUMN_MAX_WIDTH : undefined}
              onOpenComments={onOpenComments}
            />
          )}
          contentContainerStyle={{
            gap: 8,
            paddingTop: headerHeight + 8,
            paddingBottom: insets.bottom + 52 + 80 + 50,
          }}
          showsVerticalScrollIndicator={false}
          onScroll={onFeedScroll}
          scrollEventThrottle={16}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={8}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS !== "web"}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              progressViewOffset={headerHeight}
              onRefresh={() => {
                revealHeader();
                setRefreshing(true);
                setHasMore(true);
                setNewPostAuthors([]);
                newPostAuthorIdsRef.current.clear();
                loadPosts(feedTab);
              }}
              tintColor={colors.accent}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ padding: 8, gap: 8 }}>
                {[1, 2, 3].map(i => <PostSkeleton key={i} />)}
              </View>
            ) : null
          }
        />
      )}
      </DesktopFeedLayout>
      {user && (
        <TouchableOpacity
          ref={fabRef}
          style={[styles.fab, { backgroundColor: colors.accent, bottom: insets.bottom + 52 + 16 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCreatePicker(true);
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Create type picker */}
      <Modal
        visible={showCreatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreatePicker(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setShowCreatePicker(false)}
        >
          <View style={[styles.createPickerSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.createPickerHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.createPickerTitle, { color: colors.text }]}>What would you like to create?</Text>
            {[
              { icon: "create-outline", label: "Post", desc: "Share a thought, photo, or link", route: "/moments/create", color: colors.accent },
              { icon: "videocam-outline", label: "Video", desc: "Share a short video clip", route: "/moments/create-video", color: "#FF3B30" },
              { icon: "document-text-outline", label: "Article", desc: "Write a long-form article", route: "/moments/create-article", color: "#007AFF" },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={[styles.createPickerOption, { backgroundColor: colors.backgroundTertiary }]}
                onPress={() => { setShowCreatePicker(false); setTimeout(() => router.push(opt.route as any), 150); }}
              >
                <View style={[styles.createPickerIconBox, { backgroundColor: opt.color + "18" }]}>
                  <Ionicons name={opt.icon as any} size={24} color={opt.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.createPickerLabel, { color: colors.text }]}>{opt.label}</Text>
                  <Text style={[styles.createPickerDesc, { color: colors.textMuted }]}>{opt.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      <ImageViewer
        images={imgViewer.images}
        initialIndex={imgViewer.index}
        visible={imgViewer.visible}
        onClose={imgViewer.closeViewer}
      />

      <SignInPromptModal visible={showSignInPrompt} onDismiss={() => setShowSignInPrompt(false)} />

      <DiscoverCommentsSheet
        visible={!!commentPostId}
        postId={commentPostId ?? ""}
        onClose={() => setCommentPostId(null)}
        onReplyCountChange={onCommentReplyCountChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBlock: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 0,
    gap: 12,
  },
  tabRow: { flexDirection: "row", flex: 1, gap: 8 },
  tabPill: { paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", borderBottomWidth: 3 },
  tabPillText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  card: {
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardName: { fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: -0.1 },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  followBtn: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.brand, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  followBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  cardContent: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 16,
    paddingBottom: 12,
    lineHeight: 23,
  },
  translatedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, marginBottom: 8 },
  translatedText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  images: { marginBottom: 8 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingBottom: 12,
    gap: 2,
  },
  footerStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  footerStatNum: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    letterSpacing: -0.1,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 5 },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  viewCount: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  watermarkBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: "#00BCD4",
  },
  watermarkText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  videoCard: { marginHorizontal: 16, marginBottom: 2 },
  videoThumb: {
    height: 220,
    backgroundColor: "#0a0a0a",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  playCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoBadge: {
    position: "absolute",
    bottom: 10,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  videoBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  articleCard: {
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 14,
    overflow: "hidden",
  },
  articleCover: {
    width: "100%",
    height: 140,
  },
  articleCardBody: {
    padding: 14,
    gap: 8,
  },
  articleBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  articleBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  articleExcerpt: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  articleReadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  articleReadBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  createBtn: { backgroundColor: Colors.brand, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  createBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  ellipsisBtn: { padding: 4 },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 8,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
    borderRadius: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  postTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    marginHorizontal: 13,
    marginBottom: 6,
    marginTop: 6,
  },
  postTypeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  articleTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    lineHeight: 23,
  },
  readArticleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginHorizontal: 13,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  readArticleText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  createPickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 10,
  },
  createPickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 10,
  },
  createPickerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  createPickerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
  },
  createPickerIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  createPickerLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  createPickerDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  bgRefreshBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 5,
  },
  bgRefreshText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  newPostsPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    marginVertical: 8,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  newPostsPillText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  newPostsAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  newPostsAvatarWrap: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#fff",
    overflow: "hidden",
  },
});

const dcStyles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    flex: 0,
    height: "78%",
    marginTop: "auto",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sheetTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  commentRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    flexShrink: 0,
  },
  commentAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarLetter: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  commentBubble: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 2,
  },
  commentName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 1,
  },
  commentText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  commentTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    marginLeft: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    maxHeight: 90,
    minHeight: 38,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
