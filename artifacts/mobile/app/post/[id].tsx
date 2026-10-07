/**
 * Post Detail Page — full-screen flat layout.
 * Post content is the FlatList header; comments are FlatList items.
 * Input bar is pinned to the bottom and rises above the keyboard.
 */
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
  Image as RNImage,
  Keyboard,
  Linking,
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
import Image from "@/components/ui/OptimizedImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "@/lib/haptics";

import { supabase } from "@/lib/supabase";
import {
  ACCOUNT_PROFILE_FOLLOWER_COLUMNS,
  fetchAccountProfileMap,
} from "@/lib/sharedProfiles";
import { getAfuChatBookmarkStatus, setAfuChatBookmark } from "@/lib/afuchatApi";
import { audioFocus } from "@/lib/audioFocus";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { Avatar } from "@/components/ui/Avatar";
import CachedImage from "@/components/ui/CachedImage";
import { RichText } from "@/components/ui/RichText";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import UserName from "@/components/ui/UserName";
import { ImageViewer, useImageViewer } from "@/components/ImageViewer";
import { uploadToStorage } from "@/lib/mediaUpload";
import { showAlert } from "@/lib/alert";
import {
  VideoReplyItem,
  CommentSkeleton,
  RecordingBar,
  VoicePreviewBar,
  buildReplyTree,
  formatCount,
  QUICK_EMOJIS,
  MAX_VOICE_SECS,
  type Reply,
} from "@/components/ui/VideoCommentsSheet";

// ─── Audio lazy import (safe on web + Expo Go SDK 55) ─────────────────────────
// expo-av: lazy-load on native only.
// Do NOT gate on NativeModules.ExponentAV — in Expo SDK 55 + New Architecture
// production builds expo-av uses TurboModules/JSI and is absent from NativeModules,
// so that check always returns null and silently disables all audio.
let Audio: typeof import("expo-av").Audio | null = null;
type AudioRecording = import("expo-av/build/Audio/Recording").Recording;
import { Platform as _AvPlatform } from "react-native";
import { isExpoGo } from "@/lib/expoEnvironment";
if (_AvPlatform.OS !== "web" && !isExpoGo()) {
  try { Audio = require("expo-av").Audio; } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (!n || n < 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, "") + "M";
  if (n >= 10_000) return Math.round(n / 1_000) + "K";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function compactTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff) || diff < 0) return "";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y`;
}

const URL_RE = /https?:\/\/[^\s<)"'\]]+/g;
function extractFirstUrl(text: string): string | null {
  return text.match(URL_RE)?.[0] ?? null;
}

// ─── OG link preview ──────────────────────────────────────────────────────────
type OgData = { image: string | null; title: string | null };
const ogCache: Record<string, OgData> = {};
async function fetchOgData(url: string): Promise<OgData> {
  if (url in ogCache) return ogCache[url];
  const empty: OgData = { image: null, title: null };
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AfuChatBot/1.0)" } });
    const html = await res.text();
    const img = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
    const ttl = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim()
      ?? html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim()
      ?? null;
    const data: OgData = { image: img, title: ttl };
    ogCache[url] = data;
    return data;
  } catch {
    ogCache[url] = empty;
    return empty;
  }
}

function LinkPreviewCard({ url, colors }: { url: string; colors: any }) {
  const [ogImage, setOgImage] = useState<string | null>(null);
  const [ogTitle, setOgTitle] = useState<string | null>(null);
  let domain = url;
  try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  const faviconUri = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  useEffect(() => {
    fetchOgData(url).then((d) => { setOgImage(d.image); setOgTitle(d.title); }).catch(() => {});
  }, [url]);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[st.linkCard, { backgroundColor: colors.card }]}
      onPress={() => { Linking.openURL(url).catch(() => {}); }}
    >
      <View style={[st.linkThumb, { backgroundColor: colors.backgroundSecondary }]}>
        {ogImage
          ? <CachedImage uri={ogImage} style={StyleSheet.absoluteFill} contentFit="cover" />
          : <CachedImage uri={faviconUri} style={{ width: 36, height: 36 }} contentFit="contain" />}
      </View>
      <View style={st.linkBody}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <CachedImage uri={faviconUri} style={{ width: 13, height: 13, borderRadius: 2 }} contentFit="contain" />
          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textMuted, flex: 1 }} numberOfLines={1}>{domain}</Text>
        </View>
        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.text, lineHeight: 18 }} numberOfLines={2}>
          {ogTitle || domain}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Image carousel ───────────────────────────────────────────────────────────
const IMG_RATIO_MIN = 9 / 16;
const IMG_RATIO_MAX = 5 / 4;

function PostImageCarousel({ images, width, onPress, onDoubleTap }: {
  images: string[]; width: number;
  onPress: (index: number) => void; onDoubleTap: () => void;
}) {
  const { isDark } = useTheme();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [imgRatio, setImgRatio] = useState<number | null>(null);
  const ratio = imgRatio ?? IMG_RATIO_MIN;
  const imgH = Math.round(width * ratio);
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(0.3)).current;
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashHeart() {
    heartOpacity.setValue(0); heartScale.setValue(0.3);
    Animated.parallel([
      Animated.timing(heartOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, speed: 50, bounciness: 14, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => Animated.timing(heartOpacity, { toValue: 0, duration: 380, useNativeDriver: true }).start(), 500);
    });
    onDoubleTap();
  }

  function handleTap(idx: number) {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
      lastTap.current = 0;
      flashHeart();
    } else {
      lastTap.current = now;
      tapTimer.current = setTimeout(() => { tapTimer.current = null; onPress(idx); }, 320);
    }
  }

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ borderRadius: 14, overflow: "hidden", width, height: imgH, backgroundColor: isDark ? "#1a1a1a" : "#e8e0d0" }}>
        <ScrollView
          horizontal pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          nestedScrollEnabled
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentIdx(Math.max(0, Math.min(idx, images.length - 1)));
          }}
        >
          {images.map((uri, i) => (
            <TouchableOpacity key={i} activeOpacity={0.95} onPress={() => handleTap(i)} style={{ width, height: imgH }}>
              <CachedImage
                uri={uri} style={{ width, height: imgH }} contentFit="cover"
                priority={i === 0 ? "high" : "normal"}
                onLoad={i === 0 ? (e) => {
                  const { width: sw, height: sh } = (e as any).source ?? {};
                  if (sw > 0 && sh > 0) setImgRatio(Math.min(Math.max(sh / sw, IMG_RATIO_MIN), IMG_RATIO_MAX));
                } : undefined}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Animated.View style={{ position: "absolute", alignSelf: "center", top: imgH / 2 - 44, opacity: heartOpacity, transform: [{ scale: heartScale }], pointerEvents: "none" } as any}>
          <Ionicons name="heart" size={88} color="#FF3B30" />
        </Animated.View>
        {images.length > 1 && (
          <View style={{ position: "absolute", top: 8, right: 10, backgroundColor: "rgba(0,0,0,0.52)", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{currentIdx + 1}/{images.length}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Post = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  like_count: number;
  post_type: string;
  is_verified: boolean;
  is_organization_verified: boolean;
  profile: { display_name: string; handle: string; avatar_url: string | null };
};

type RecordState = "idle" | "recording" | "recorded";

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function PostDetailScreen() {
  const { id, org } = useLocalSearchParams<{ id: string; org?: string }>();
  const { colors, isDark } = useTheme();
  const { accent } = useAppAccent();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const insetsRef = useRef(insets);
  useEffect(() => { insetsRef.current = insets; }, [insets]);
  const { width: screenW } = useWindowDimensions();

  // ── Post state ──────────────────────────────────────────────────────────────
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;

  // ── Comment state ────────────────────────────────────────────────────────────
  const [replies, setReplies] = useState<Reply[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [sortMode, setSortMode] = useState<"recent" | "top">("recent");
  const [newCommentIds, setNewCommentIds] = useState<Set<string>>(new Set());

  // ── Input state ──────────────────────────────────────────────────────────────
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Reply | null>(null);
  const [attachedImage, setAttachedImage] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  // ── Mention suggestions ──────────────────────────────────────────────────────
  const [mentionSuggestions, setMentionSuggestions] = useState<Array<{
    id: string; handle: string; display_name: string; avatar_url: string | null;
  }>>([]);
  const mentionQueryRef = useRef<string | null>(null);

  // ── Recording state ──────────────────────────────────────────────────────────
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [recordingObj, setRecordingObj] = useState<AudioRecording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Animated values ──────────────────────────────────────────────────────────
  const kbAnim = useRef(new Animated.Value(insets.bottom)).current;
  const sendScale = useRef(new Animated.Value(1)).current;

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const { images: viewerImages, index: viewerIndex, visible: viewerOpen, meta: viewerMeta, openViewer, closeViewer } = useImageViewer();

  // ── Keyboard listener ────────────────────────────────────────────────────────
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e) => {
      const h = e.endCoordinates.height;
      const dur = Platform.OS === "ios" ? (e.duration ?? 250) : 220;
      setKbHeight(h);
      Animated.timing(kbAnim, { toValue: Math.max(h, insetsRef.current.bottom), duration: dur, useNativeDriver: false }).start();
    });
    const hide = Keyboard.addListener(hideEvent, (e) => {
      const dur = Platform.OS === "ios" ? (e.duration ?? 200) : 180;
      setKbHeight(0);
      Animated.timing(kbAnim, { toValue: insetsRef.current.bottom, duration: dur, useNativeDriver: false }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── Fetch post ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let data: any;
        if (org === "1") {
          const { data: orgPost } = await supabase
            .from("organization_page_posts")
            .select("id, content, image_url, created_at, author_id, likes, page_id")
            .eq("id", id)
            .maybeSingle();
          const { data: page } = orgPost?.page_id
            ? await supabase
                .from("organization_pages")
                .select("name, slug, logo_url, is_verified")
                .eq("id", orgPost.page_id)
                .maybeSingle()
            : { data: null };
          data = orgPost
            ? {
                ...orgPost,
                view_count: 0,
                like_count: orgPost.likes ?? 0,
                post_type: "text",
                profiles: {
                  display_name: page?.name ?? "Company",
                  handle: page?.slug ?? "company",
                  avatar_url: page?.logo_url ?? null,
                  is_verified: false,
                  is_organization_verified: page?.is_verified ?? false,
                },
                post_images: orgPost.image_url
                  ? [{ image_url: orgPost.image_url, display_order: 0 }]
                  : [],
              }
            : null;
        } else {
          const { data: postRow } = await supabase
            .from("posts")
            .select("id, author_id, content, image_url, created_at, view_count, like_count, post_type")
            .eq("id", id)
            .maybeSingle();
          if (postRow) {
            const [{ profiles }, { data: imageRows }] = await Promise.all([
              fetchAccountProfileMap(
                [postRow.author_id],
                ACCOUNT_PROFILE_FOLLOWER_COLUMNS,
              ),
              supabase
                .from("post_images")
                .select("post_id, image_url, display_order")
                .eq("post_id", postRow.id)
                .order("display_order", { ascending: true }),
            ]);
            data = {
              ...postRow,
              profiles: profiles.get(postRow.author_id) || null,
              post_images: imageRows || [],
            };
          } else {
            data = null;
          }
        }

        if (!data || cancelled) { setLoading(false); return; }

        const imgs: string[] = ((data.post_images as any[]) ?? [])
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
          .map((r) => r.image_url);
        const prof = (data.profiles as any) ?? {};

        if (!cancelled) {
          setPost({
            id: data.id,
            author_id: data.author_id,
            content: data.content ?? "",
            image_url: (data as any).image_url ?? null,
            images: imgs,
            created_at: data.created_at,
            view_count: (data as any).view_count ?? 0,
            like_count: data.like_count ?? 0,
            post_type: data.post_type ?? "text",
            is_verified: prof.is_verified ?? false,
            is_organization_verified: prof.is_organization_verified ?? false,
            profile: {
              display_name: prof.display_name ?? "",
              handle: prof.handle ?? "",
              avatar_url: prof.avatar_url ?? null,
            },
          });
          setLikeCount(data.like_count ?? 0);
        }

        if (user && !cancelled) {
          const [likeRes, bmRes] = await Promise.all([
            supabase.from("post_acknowledgments").select("post_id").eq("post_id", id).eq("user_id", user.id).maybeSingle(),
            getAfuChatBookmarkStatus(id),
          ]);
          if (!cancelled) {
            setLiked(!!likeRes.data);
            if (bmRes.error) showAlert("Could not load saved status", bmRes.error.message);
            else setBookmarked(!!bmRes.data);
          }
        }
      } catch {
        // fetch failed — show empty state
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, user]);

  // ── Fetch comments ───────────────────────────────────────────────────────────
  const loadReplies = useCallback(() => {
    if (!id) return;
    Promise.resolve(supabase
      .from("post_replies")
      .select("id, author_id, content, created_at, parent_reply_id, voice_url, voice_duration, image_url")
      .eq("post_id", id)
      .order("created_at", { ascending: true })
      .limit(100))
      .then(async ({ data, error }) => {
        if (error) console.error("[PostDetail] loadReplies:", error.message);
        if (data) {
          const { profiles } = await fetchAccountProfileMap(
            data.map((reply: any) => reply.author_id),
            ACCOUNT_PROFILE_FOLLOWER_COLUMNS,
          );
          const replyIds = data.map((r: any) => r.id);
          const [likesRes, myLikesRes] = await Promise.all([
            replyIds.length > 0
              ? supabase.from("post_reply_likes").select("reply_id").in("reply_id", replyIds)
              : { data: [] as any[] },
            replyIds.length > 0 && user
              ? supabase.from("post_reply_likes").select("reply_id").in("reply_id", replyIds).eq("user_id", user.id)
              : { data: [] as any[] },
          ]);
          const likeCountMap: Record<string, number> = {};
          for (const l of likesRes.data || []) {
            likeCountMap[l.reply_id] = (likeCountMap[l.reply_id] || 0) + 1;
          }
          setLikedIds(new Set<string>((myLikesRes.data || []).map((l: any) => l.reply_id as string)));
          setReplies(data.map((r: any) => ({
            id: r.id,
            author_id: r.author_id,
            content: r.content || "",
            created_at: r.created_at,
            parent_reply_id: r.parent_reply_id || null,
            like_count: likeCountMap[r.id] || 0,
            voice_url: r.voice_url || null,
            voice_duration: r.voice_duration ?? null,
            image_url: r.image_url || null,
            profile: {
              display_name: profiles.get(r.author_id)?.display_name || "User",
              handle: profiles.get(r.author_id)?.handle || "user",
              avatar_url: profiles.get(r.author_id)?.avatar_url ?? null,
            },
          })));
        }
        setCommentsLoading(false);
      })
      .catch(() => { setCommentsLoading(false); });
  }, [id, user?.id]);

  useEffect(() => {
    if (!id) return;
    setCommentsLoading(true);
    loadReplies();
  }, [id, loadReplies]);

  // Realtime subscription
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`post-detail-comments:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_replies", filter: `post_id=eq.${id}` }, loadReplies)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "post_replies", filter: `post_id=eq.${id}` }, loadReplies)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, loadReplies]);

  // ── Like toggle ───────────────────────────────────────────────────────────────
  const toggleLike = useCallback(async () => {
    if (!user || !post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    heartScale.setValue(1);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: true, speed: 50, bounciness: 14 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 4 }),
    ]).start();
    if (liked) {
      setLiked(false); setLikeCount((n) => Math.max(0, n - 1));
      try {
        const { error } = await supabase.from("post_acknowledgments").delete().eq("post_id", post.id).eq("user_id", user.id);
        if (org === "1") {
          const { error: orgError } = await supabase
            .from("organization_page_posts")
            .update({ likes: Math.max(0, likeCount - 1) })
            .eq("id", post.id);
          if (orgError) throw orgError;
        }
        if (error) throw error;
      } catch { setLiked(true); setLikeCount((n) => n + 1); }
    } else {
      setLiked(true); setLikeCount((n) => n + 1);
      try {
        const { error } = await supabase.from("post_acknowledgments").upsert({ post_id: post.id, user_id: user.id }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
        if (org === "1") {
          const { error: orgError } = await supabase
            .from("organization_page_posts")
            .update({ likes: likeCount + 1 })
            .eq("id", post.id);
          if (orgError) throw orgError;
        }
        if (error) throw error;
      } catch { setLiked(false); setLikeCount((n) => Math.max(0, n - 1)); }
    }
  }, [user, post, liked, heartScale, org]);

  // ── Bookmark toggle ───────────────────────────────────────────────────────────
  const toggleBookmark = useCallback(async () => {
    if (!user || !post) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (bookmarked) {
      setBookmarked(false);
      const { error } = await setAfuChatBookmark(post.id, false, user.id);
      if (error) {
        setBookmarked(true);
        showAlert("Could not remove saved post", error.message);
      }
    } else {
      setBookmarked(true);
      const { error } = await setAfuChatBookmark(post.id, true, user.id);
      if (error) {
        setBookmarked(false);
        showAlert("Could not save post", error.message);
      }
    }
  }, [user, post, bookmarked]);

  // ── Mention suggestions ──────────────────────────────────────────────────────
  async function fetchMentionSuggestions(query: string) {
    try {
      const q = supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url")
        .limit(8);
      if (query.length > 0) q.ilike("handle", `${query}%`);
      const { data } = await q;
      if (data && mentionQueryRef.current !== null) {
        setMentionSuggestions(data as any);
      }
    } catch {}
  }

  function handleTextChange(val: string) {
    setText(val);
    const match = val.match(/@(\w*)$/);
    if (match) {
      const query = match[1];
      mentionQueryRef.current = query;
      fetchMentionSuggestions(query);
    } else {
      mentionQueryRef.current = null;
      if (mentionSuggestions.length > 0) setMentionSuggestions([]);
    }
  }

  function insertMention(handle: string) {
    const q = mentionQueryRef.current ?? "";
    setText((prev) => prev.replace(new RegExp(`@${q}$`), `@${handle} `));
    mentionQueryRef.current = null;
    setMentionSuggestions([]);
    inputRef.current?.focus();
  }

  // ── Comment interactions ─────────────────────────────────────────────────────
  function handleReplyTo(reply: Reply) {
    setReplyingTo(reply);
    setText("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handleReplyLike(id: string, wasLiked: boolean) {
    if (!user) return;
    if (wasLiked) {
      setLikedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setReplies((prev) => prev.map((r) => r.id === id ? { ...r, like_count: Math.max(0, r.like_count - 1) } : r));
      (supabase.from("post_reply_likes").delete().eq("reply_id", id).eq("user_id", user.id) as unknown as Promise<any>).then(() => {}).catch(() => {});
    } else {
      setLikedIds((prev) => new Set([...prev, id]));
      setReplies((prev) => prev.map((r) => r.id === id ? { ...r, like_count: r.like_count + 1 } : r));
      (supabase.from("post_reply_likes").insert({ reply_id: id, user_id: user.id }) as unknown as Promise<any>).then(() => {}).catch(() => {});
    }
  }

  const sortedTree = useMemo(() => {
    const tree = buildReplyTree(replies);
    if (sortMode === "top") {
      return [...tree].sort((a, b) => {
        const aScore = (a.children?.length ?? 0) * 2 + a.like_count;
        const bScore = (b.children?.length ?? 0) * 2 + b.like_count;
        return bScore - aScore;
      });
    }
    return [...tree].reverse();
  }, [replies, sortMode]);

  // ── Recording ────────────────────────────────────────────────────────────────
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function discardRecording() {
    stopTimer();
    if (recordingObj) {
      recordingObj.stopAndUnloadAsync().catch(() => {});
      setRecordingObj(null);
      // Restore audio session so playback (voice messages, video) works normally.
      // Without this reset, iOS stays in .playAndRecord category and routes
      // subsequent audio through the earpiece at near-zero volume.
      Audio?.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }).catch(() => {});
    }
    setRecordState("idle"); setRecordedUri(null); setRecordedDuration(0); setRecordElapsed(0);
  }

  async function startRecording() {
    if (!Audio) { showAlert("Not supported", "Audio recording is not available here."); return; }
    audioFocus.claimRecording();
    let granted = false;
    try {
      const result = await Audio.requestPermissionsAsync();
      granted = result.granted;
    } catch {
      showAlert("Microphone access needed", "Please enable microphone access in Settings.");
      return;
    }
    if (!granted) { showAlert("Microphone access needed", "Please enable microphone access in Settings."); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecordingObj(recording);
      setRecordElapsed(0);
      setRecordState("recording");
      timerRef.current = setInterval(async () => {
        setRecordElapsed((prev) => {
          const next = prev + 1;
          if (next >= MAX_VOICE_SECS) stopRecording(recording, next);
          return next;
        });
      }, 1000);
    } catch (e: any) {
      showAlert("Could not start recording", e?.message || "Please try again.");
    }
  }

  async function stopRecording(rec?: AudioRecording | null, elapsed?: number) {
    stopTimer();
    const activeRec = rec ?? recordingObj;
    if (!activeRec) { setRecordState("idle"); return; }
    try {
      const status = await activeRec.getStatusAsync();
      await activeRec.stopAndUnloadAsync();
      const uri = activeRec.getURI();
      const durationMs = (status as any).durationMillis as number | undefined;
      const durationS = durationMs ? Math.ceil(durationMs / 1000) : (elapsed ?? recordElapsed);
      setRecordingObj(null);
      if (uri && durationS > 0) {
        setRecordedUri(uri); setRecordedDuration(durationS);
        setRecordState("recorded");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setRecordState("idle"); setRecordElapsed(0);
      }
    } catch { setRecordState("idle"); setRecordElapsed(0); }
    Audio?.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }).catch(() => {});
  }

  async function pickImage() {
    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) { showAlert("Photos access needed", "Please enable photo library access in Settings."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.82, allowsEditing: false });
      if (!result.canceled && result.assets.length > 0) {
        const a = result.assets[0];
        setAttachedImage({ uri: a.uri, width: a.width, height: a.height });
      }
    } catch {
      showAlert("Could not open photos", "Please try again.");
    }
  }

  // ── Send comment ─────────────────────────────────────────────────────────────
  async function sendReply() {
    if (!post) return;
    const hasText = text.trim().length > 0;
    const hasVoice = recordState === "recorded" && !!recordedUri;
    const hasImage = !!attachedImage;
    if (!user || (!hasText && !hasVoice && !hasImage)) return;

    setSending(true);
    try {
    Animated.sequence([
      Animated.spring(sendScale, { toValue: 0.78, tension: 400, friction: 8, useNativeDriver: true }),
      Animated.spring(sendScale, { toValue: 1, tension: 400, friction: 8, useNativeDriver: true }),
    ]).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    let finalVoiceUrl: string | null = null;
    let finalImageUrl: string | null = null;

    if (hasVoice && recordedUri) {
      const path = `${user.id}/comment_${Date.now()}.m4a`;
      const { publicUrl, error } = await uploadToStorage("voice-messages", path, recordedUri, "audio/mp4");
      if (error || !publicUrl) { showAlert("Upload failed", "Could not upload voice note."); setSending(false); return; }
      finalVoiceUrl = publicUrl;
    }
    if (hasImage && attachedImage) {
      const uriLower = attachedImage.uri.toLowerCase();
      const ext = uriLower.includes(".png") ? "png" : uriLower.includes(".webp") ? "webp" : "jpg";
      const path = `${user.id}/comment_${post.id}_${Date.now()}.${ext}`;
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const { publicUrl, error } = await uploadToStorage("post-images", path, attachedImage.uri, mime);
      if (error || !publicUrl) { showAlert("Upload failed", "Could not upload image."); setSending(false); return; }
      finalImageUrl = publicUrl;
    }

    const payload: any = { post_id: post.id, author_id: user.id, content: text.trim() };
    if (replyingTo) payload.parent_reply_id = replyingTo.id;
    if (finalVoiceUrl) { payload.voice_url = finalVoiceUrl; payload.voice_duration = recordedDuration; }
    if (finalImageUrl) payload.image_url = finalImageUrl;

    const { data, error } = await supabase
      .from("post_replies")
      .insert(payload)
      .select("id, author_id, content, created_at, parent_reply_id, voice_url, voice_duration, image_url")
      .single();

    if (!error && data) {
      const newReply: Reply = {
        id: data.id, author_id: data.author_id, content: data.content || "",
        created_at: data.created_at, parent_reply_id: data.parent_reply_id || null,
        like_count: 0, voice_url: data.voice_url || null, voice_duration: data.voice_duration ?? null,
        image_url: data.image_url || null,
        profile: { display_name: profile?.display_name || "You", handle: profile?.handle || "you", avatar_url: profile?.avatar_url || null },
      };
      setReplies((prev) => [...prev, newReply]);
      setNewCommentIds((prev) => new Set([...prev, data.id]));
      const wasThreaded = !!replyingTo;
      setText(""); setReplyingTo(null); discardRecording(); setAttachedImage(null); setShowEmojiPanel(false);
      if (!wasThreaded) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    } else if (error) {
      showAlert("Comment failed", "Your comment could not be posted. Please try again.");
    }
    } catch {
      showAlert("Comment failed", "Your comment could not be posted. Please try again.");
    } finally {
      setSending(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const allImages = post ? (post.images.length > 0 ? post.images : post.image_url ? [post.image_url] : []) : [];
  const previewUrl = post && allImages.length === 0 ? extractFirstUrl(post.content ?? "") : null;
  const imgWidth = screenW - 32;
  const canSend = !sending && (text.trim().length > 0 || (recordState === "recorded" && !!recordedUri) || !!attachedImage);
  const charLeft = 500 - text.length;

  // Approximate heights for elements shown in the input area
  const replyBannerH = replyingTo ? 36 : 0;
  const imagePreviewH = attachedImage ? 72 : 0;
  const voicePreviewH = recordState === "recorded" && recordedUri ? 88 : 0;
  const emojiPanelH = showEmojiPanel ? 52 : 0;
  const mentionRowH = mentionSuggestions.length > 0 ? 56 : 0;
  const inputRowH = 72;
  const inputBarH = replyBannerH + imagePreviewH + voicePreviewH + emojiPanelH + mentionRowH + inputRowH;

  // ── Theme colours for input bar ───────────────────────────────────────────────
  const inputBg = isDark ? "rgba(255,255,255,0.08)" : "#EDE8DC";
  const inputTxt = isDark ? "#fff" : "#1A1208";
  const inputPH = isDark ? "rgba(255,255,255,0.3)" : "rgba(26,18,8,0.35)";
  const attachIconCl = isDark ? "rgba(255,255,255,0.45)" : "rgba(26,18,8,0.45)";
  const borderTopClr = isDark ? "rgba(255,255,255,0.08)" : "rgba(26,18,8,0.08)";
  const replyToTxt = isDark ? "rgba(255,255,255,0.5)" : "rgba(26,18,8,0.55)";
  const imgRmvClr = isDark ? "rgba(255,255,255,0.4)" : "rgba(26,18,8,0.4)";
  const separatorClr = isDark ? "rgba(255,255,255,0.08)" : "rgba(26,18,8,0.08)";
  const emptyIconClr = isDark ? "rgba(255,255,255,0.2)" : "rgba(26,18,8,0.2)";
  const emptyTxtClr = isDark ? "rgba(255,255,255,0.5)" : "rgba(26,18,8,0.5)";
  const emptySubClr = isDark ? "rgba(255,255,255,0.3)" : "rgba(26,18,8,0.35)";
  const sortBtnBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  // ── List header: post content + action bar + comments section header ──────────
  const listHeader = post ? (
    <View>
      {/* Author row */}
      <View style={st.authorRow}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/contact/[id]", params: { id: post.author_id } } as any)}
          activeOpacity={0.8}
        >
          <Avatar uri={post.profile.avatar_url} name={post.profile.display_name} size={44} userId={post.author_id} />
        </TouchableOpacity>
        <View style={{ flex: 1, gap: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <UserName
              userId={post.author_id}
              name={post.profile.display_name || post.profile.handle}
              style={[st.authorName, { color: colors.text }]}
              numberOfLines={1}
            />
            <VerifiedBadge isVerified={post.is_verified} isOrganizationVerified={post.is_organization_verified} size={13} />
          </View>
          <Text style={[st.authorMeta, { color: colors.textMuted }]}>
            @{post.profile.handle} · {compactTime(post.created_at)}
          </Text>
        </View>
      </View>

      {/* Content */}
      {(post.content || "").trim().length > 0 && (
        <View style={st.contentWrap}>
          <RichText style={[st.content, { color: colors.text }]} linkColor={accent}>
            {post.content}
          </RichText>
        </View>
      )}

      {/* Images */}
      {allImages.length > 0 && (
        <View style={{ paddingHorizontal: 16 }}>
          <PostImageCarousel
            images={allImages} width={imgWidth}
            onPress={(idx) => openViewer(allImages, idx, {
              postId: post.id,
              authorId: post.author_id,
              authorName: post.profile.display_name,
              authorHandle: post.profile.handle,
              authorAvatar: post.profile.avatar_url,
              isVerified: post.is_verified,
              isOrgVerified: post.is_organization_verified,
              likeCount,
              replyCount: replies.length,
              viewCount: post.view_count,
              bookmarked,
              liked,
              onToggleLike: toggleLike,
              onToggleBookmark: toggleBookmark,
            })}
            onDoubleTap={toggleLike}
          />
        </View>
      )}

      {/* Link preview */}
      {previewUrl && <LinkPreviewCard url={previewUrl} colors={colors} />}

      {/* Comments section header */}
      <View style={[st.commentsHeader, { borderBottomColor: separatorClr }]}>
        <Text style={[st.commentsTitle, { color: colors.text }]}>
          {replies.length > 0 ? `${formatCount(replies.length)} ` : ""}Comments
        </Text>
        <TouchableOpacity
          onPress={() => setSortMode((m) => m === "recent" ? "top" : "recent")}
          hitSlop={10}
          activeOpacity={0.7}
          style={[st.sortBtn, {
            backgroundColor: sortMode === "top" ? accent + "22" : sortBtnBg,
          }]}
        >
          <Ionicons name="funnel" size={13} color={sortMode === "top" ? accent : colors.textMuted} />
          <Text style={{ color: sortMode === "top" ? accent : colors.textMuted, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
            {sortMode === "recent" ? "Recent" : "Top"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  ) : null;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Floating header — overlays the scroll content, true edge-to-edge */}
      <View style={[st.header, { paddingTop: insets.top + 2, pointerEvents: "box-none" }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={st.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Body */}
      {loading ? (
        <View style={st.center}>
          <ActivityIndicator color={accent} size="large" />
        </View>
      ) : !post ? (
        <View style={st.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, marginTop: 12, fontFamily: "Inter_400Regular", fontSize: 15 }}>Post not found</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={sortedTree}
          keyExtractor={(r) => r.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: insets.top + 52, paddingBottom: inputBarH + kbHeight + insets.bottom + 16 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            commentsLoading ? (
              <CommentSkeleton isDark={isDark} />
            ) : (
              <View style={st.emptyBox}>
                <Ionicons name="chatbubble-outline" size={36} color={emptyIconClr} />
                <Text style={[st.emptyText, { color: emptyTxtClr }]}>No comments yet</Text>
                <Text style={[st.emptySub, { color: emptySubClr }]}>Be the first to comment</Text>
              </View>
            )
          }
          renderItem={({ item: r }) => (
            <View style={{ paddingHorizontal: 16 }}>
              <VideoReplyItem
                reply={r} depth={0}
                onReplyTo={handleReplyTo}
                isCreator={r.author_id === post.author_id}
                isNew={newCommentIds.has(r.id)}
                accent={accent}
                likedSet={likedIds}
                onLike={handleReplyLike}
                isDark={isDark}
              />
            </View>
          )}
        />
      )}

      {/* ── Pinned input bar ── */}
      {post && (
        <Animated.View
          style={[st.inputBar, { bottom: kbAnim }]}
        >
          {/* Expansion panels — reply, image, voice, emoji */}
          {(replyingTo || attachedImage || (recordState === "recorded" && recordedUri) || showEmojiPanel) && (
            <View style={[st.expansionWrap, {
              backgroundColor: inputBg,
              borderColor: isDark ? "rgba(255,255,255,0.13)" : "rgba(26,18,8,0.13)",
            }]}>
              {/* Reply-to banner */}
              {replyingTo && (
                <View style={[st.replyBanner, { borderBottomColor: separatorClr }]}>
                  <Text style={[st.replyBannerText, { color: replyToTxt }]}>
                    Replying to <Text style={{ color: accent }}>@{replyingTo.profile.handle}</Text>
                  </Text>
                  <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={replyToTxt} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Attached image preview */}
              {attachedImage && (
                <View style={[st.imgPreviewBar, { borderBottomColor: separatorClr }]}>
                  <View style={st.imgThumbWrap}>
                    <Image source={{ uri: attachedImage.uri }} style={st.imgThumb} resizeMode="cover" />
                    <TouchableOpacity onPress={() => setAttachedImage(null)} style={st.imgRemoveBtn}>
                      <Ionicons name="close-circle" size={18} color={imgRmvClr} />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ color: imgRmvClr, fontSize: 11, fontFamily: "Inter_400Regular" }}>Tap × to remove</Text>
                </View>
              )}

              {/* Voice note preview */}
              {recordState === "recorded" && recordedUri && (
                <View style={{ borderBottomWidth: showEmojiPanel ? 0.5 : 0, borderBottomColor: separatorClr }}>
                  <VoicePreviewBar uri={recordedUri} durationSecs={recordedDuration} onDiscard={discardRecording} accent={accent} />
                </View>
              )}

              {/* Emoji quick-bar */}
              {showEmojiPanel && (
                <View style={st.emojiBar}>
                  {QUICK_EMOJIS.map((e) => (
                    <TouchableOpacity key={e} onPress={() => setText((t) => t + e)} style={st.emojiBtn} activeOpacity={0.6}>
                      <Text style={st.emojiText}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Mention suggestion row — appears when user types @handle */}
          {mentionSuggestions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              style={[st.mentionRow, { borderColor: separatorClr }]}
              contentContainerStyle={{ paddingHorizontal: 8, gap: 6 }}
            >
              {mentionSuggestions.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => insertMention(u.handle)}
                  style={[st.mentionChip, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }]}
                  activeOpacity={0.7}
                >
                  <Avatar uri={u.avatar_url} name={u.display_name} size={28} userId={u.id} />
                  <Text style={{ color: accent, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                    @{u.handle}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Main input row */}
          {user ? (
            <View style={st.inputRow}>
              <Avatar uri={profile?.avatar_url} name={profile?.display_name || "You"} size={32} />

              {/* Glass pill — text + secondary icons + send */}
              <View style={[st.inputPill, {
                backgroundColor: inputBg,
                borderColor: isDark ? "rgba(255,255,255,0.13)" : "rgba(26,18,8,0.13)",
              }]}>
                <View style={st.inputPillInner}>
                  {recordState === "recording" ? (
                    <RecordingBar elapsed={recordElapsed} onStop={() => stopRecording()} accent={accent} />
                  ) : (
                    <>
                      <TextInput
                        ref={inputRef}
                        style={[st.textInput, { color: inputTxt }]}
                        placeholder={recordState === "recorded" ? "Add a caption… (optional)" : "Add a comment…"}
                        placeholderTextColor={inputPH}
                        value={text}
                        onChangeText={handleTextChange}
                        multiline
                        maxLength={500}
                      />
                      {text.length > 400 && (
                        <Text style={[st.charCounter, { color: charLeft < 20 ? "#FF453A" : inputPH }]}>
                          {charLeft}
                        </Text>
                      )}
                      {!canSend && (
                        <>
                          <TouchableOpacity
                            onPress={() => setShowEmojiPanel((p) => !p)} hitSlop={6} activeOpacity={0.7}
                            style={[st.iconBtn, showEmojiPanel && { backgroundColor: accent + "25" }]}
                          >
                            <Ionicons name="happy-outline" size={20} color={showEmojiPanel ? accent : attachIconCl} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={pickImage} hitSlop={6} activeOpacity={0.7}
                            style={[st.iconBtn, attachedImage && { backgroundColor: accent + "30" }]}
                          >
                            <Ionicons name="image-outline" size={20} color={attachedImage ? accent : attachIconCl} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => { setText((t) => t + "@"); setTimeout(() => inputRef.current?.focus(), 50); }}
                            hitSlop={6} activeOpacity={0.7} style={st.iconBtn}
                          >
                            <Text style={{ color: attachIconCl, fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 20 }}>@</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      {canSend && (
                        <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                          <TouchableOpacity onPress={sendReply} disabled={!canSend} style={[st.sendBtn, { backgroundColor: accent }]}>
                            {sending
                              ? <ActivityIndicator size={14} color="#fff" />
                              : <Ionicons name="arrow-up" size={16} color="#fff" />}
                          </TouchableOpacity>
                        </Animated.View>
                      )}
                    </>
                  )}
                </View>
              </View>

              {/* Mic — standalone circle button, separated from the pill */}
              <TouchableOpacity
                onPress={
                  recordState === "recording"
                    ? () => stopRecording()
                    : recordState === "recorded"
                    ? discardRecording
                    : startRecording
                }
                activeOpacity={0.75}
                style={[
                  st.micBtn,
                  {
                    backgroundColor:
                      recordState === "recording"
                        ? "#FF2D55" + "22"
                        : recordState === "recorded"
                        ? accent + "22"
                        : inputBg,
                    borderColor:
                      recordState === "recording"
                        ? "#FF2D55" + "60"
                        : recordState === "recorded"
                        ? accent + "60"
                        : isDark ? "rgba(255,255,255,0.13)" : "rgba(26,18,8,0.13)",
                  },
                ]}
              >
                <Ionicons
                  name={
                    recordState === "recording"
                      ? "stop"
                      : recordState === "recorded"
                      ? "mic"
                      : "mic-outline"
                  }
                  size={20}
                  color={
                    recordState === "recording"
                      ? "#FF2D55"
                      : recordState === "recorded"
                      ? accent
                      : attachIconCl
                  }
                />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={{ paddingVertical: 14, alignItems: "center" }}
              onPress={() => router.push("/(auth)/login")}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: accent + "50", backgroundColor: accent + "18" }}>
                <Ionicons name="person-circle" size={16} color={accent} />
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: accent }}>Sign in to comment</Text>
              </View>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* Image viewer */}
      <ImageViewer images={viewerImages} initialIndex={viewerIndex} visible={viewerOpen} onClose={closeViewer} meta={viewerMeta} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },

  // Header — absolute overlay, edge-to-edge, no bottom border
  header: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 4, paddingBottom: 8,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },

  // Post content
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, marginBottom: 14 },
  authorName: { fontSize: 15, fontFamily: "Inter_700Bold", flexShrink: 1 },
  authorMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  contentWrap: { paddingHorizontal: 16, marginBottom: 14 },
  content: { fontSize: 17, lineHeight: 26, fontFamily: "Inter_400Regular" },
  linkCard: { flexDirection: "row", alignItems: "stretch", marginHorizontal: 16, marginBottom: 10, borderRadius: 14, overflow: "hidden", minHeight: 80 },
  linkThumb: { width: 90, minHeight: 80, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  linkBody: { flex: 1, paddingHorizontal: 10, paddingVertical: 10, gap: 4, justifyContent: "center" },

  // Comments section header
  commentsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  commentsTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  sortBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },

  // Empty state
  emptyBox: { paddingVertical: 48, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular" },

  // Input bar
  inputBar: { position: "absolute", left: 0, right: 0 },
  expansionWrap: {
    marginHorizontal: 8, marginBottom: 4,
    borderRadius: 999, borderWidth: 0.5, overflow: "hidden",
  },
  replyBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5 },
  replyBannerText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  imgPreviewBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5 },
  imgThumbWrap: { position: "relative" },
  imgThumb: { width: 52, height: 52, borderRadius: 8 },
  imgRemoveBtn: { position: "absolute", top: -6, right: -6 },
  emojiBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, gap: 2 },
  emojiBtn: { flex: 1, alignItems: "center", paddingVertical: 6 },
  emojiText: { fontSize: 20 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 8 },
  micBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 0.5 },
  mentionRow: { borderTopWidth: 0.5, maxHeight: 56 },
  mentionChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  inputPill: {
    flex: 1, borderRadius: 999, borderWidth: 0.5, overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 4px 20px rgba(0,0,0,0.14)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 10 },
    }),
  },
  inputPillInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingVertical: 4, gap: 2 },
  textInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, maxHeight: 100, paddingVertical: 4, paddingHorizontal: 4 },
  charCounter: { fontSize: 10, fontFamily: "Inter_500Medium" },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  sendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginRight: 2 },
});
