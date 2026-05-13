import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import { shareStory } from "@/lib/share";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { markStoriesViewed } from "@/lib/storyViewedStore";

const STORY_DURATION = 5000;

type Story = {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  view_count: number;
  like_count: number;
  user_id: string;
  profile: {
    display_name: string;
    avatar_url: string | null;
    handle: string;
    is_verified?: boolean;
    is_organization_verified?: boolean;
  };
};

type Viewer = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  handle: string;
  viewed_at: string;
  is_verified?: boolean;
  is_organization_verified?: boolean;
};

export default function ViewStoryScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const { isDesktop } = useIsDesktop();

  const [stories, setStories] = useState<Story[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Viewers sheet
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Share sheet
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [chatList, setChatList] = useState<{ id: string; name: string; avatar_url: string | null }[]>([]);

  // Comment
  const [commentText, setCommentText] = useState("");
  const [sendingComment, setSendingComment] = useState(false);

  // Like state — per story id: { liked: boolean, count: number }
  const [likeState, setLikeState] = useState<Record<string, { liked: boolean; count: number }>>({});
  const likeInFlight = useRef(new Set<string>());

  // Progress animation
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Always compute panelH/translateY before any early return — the React
  // Compiler must never see these inside a conditional branch.  A stable
  // useRef prevents the Compiler from re-creating the interpolation on every
  // render (which briefly produces transform:null and triggers _validateTransforms).
  const panelH = (screenH || 812) * 0.52;
  const translateYRef = useRef(
    slideAnim.interpolate({ inputRange: [0, 1], outputRange: [panelH, 0] })
  );
  const translateY = translateYRef.current;

  const isOwner = user?.id === userId;

  useEffect(() => {
    if (isDesktop) router.replace("/");
  }, [isDesktop]);
  if (isDesktop) return null;

  // ── Load stories ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("stories")
      .select("id, media_url, media_type, caption, privacy, created_at, view_count, user_id, profiles!stories_user_id_fkey(display_name, avatar_url, handle, is_verified, is_organization_verified)")
      .eq("user_id", userId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) {
          const visible = data.filter((s: any) => {
            const p = s.privacy || "everyone";
            if (p === "only_me" && s.user_id !== user?.id) return false;
            if (p === "close_friends" && s.user_id !== user?.id) return false;
            return true;
          });
          const mapped = visible.map((s: any) => ({
            ...s,
            profile: s.profiles,
            like_count: 0,
          }));
          setStories(mapped);

          // Initialise like state for each story
          const storyIds = mapped.map((s: any) => s.id);
          if (storyIds.length > 0) loadLikeState(storyIds);
        }
      });
  }, [userId]);

  // ── Fetch like counts + my likes for all stories ────────────────────────────
  async function loadLikeState(storyIds: string[]) {
    try {
      const [{ data: counts }, { data: myLikes }] = await Promise.all([
        supabase
          .from("story_likes")
          .select("story_id")
          .in("story_id", storyIds),
        user
          ? supabase
              .from("story_likes")
              .select("story_id")
              .in("story_id", storyIds)
              .eq("user_id", user.id)
          : Promise.resolve({ data: [] }),
      ]);

      const countMap: Record<string, number> = {};
      for (const l of counts || []) {
        countMap[l.story_id] = (countMap[l.story_id] || 0) + 1;
      }
      const likedSet = new Set((myLikes || []).map((l: any) => l.story_id));

      const next: Record<string, { liked: boolean; count: number }> = {};
      for (const id of storyIds) {
        next[id] = { liked: likedSet.has(id), count: countMap[id] || 0 };
      }
      setLikeState(next);
    } catch {
      // story_likes table may not exist yet — graceful no-op
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  const story = stories[index];
  const isVideoStory = story?.media_type === "video";

  const goNext = useCallback(() => {
    if (index < stories.length - 1) {
      setIndex((i) => i + 1);
    } else {
      router.back();
    }
  }, [index, stories.length]);

  const goPrev = useCallback(() => {
    if (index > 0) setIndex((i) => i - 1);
  }, [index]);

  // ── Progress bar animation ───────────────────────────────────────────────────
  useEffect(() => {
    if (stories.length === 0 || paused || isVideoStory || showViewers) return;

    progressAnim.setValue(0);
    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) goNext();
    });
    return () => anim.stop();
  }, [index, stories.length, paused, isVideoStory, showViewers, goNext, progressAnim]);

  // ── Record view ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = stories[index];
    if (!s) return;

    if (user && s.user_id !== user.id) {
      supabase
        .from("story_views")
        .select("id")
        .eq("story_id", s.id)
        .eq("viewer_id", user.id)
        .maybeSingle()
        .then(({ data: existing }) => {
          if (!existing) {
            supabase.from("story_views").insert({ story_id: s.id, viewer_id: user.id }).then(() => {
              supabase.from("stories").update({ view_count: (s.view_count || 0) + 1 }).eq("id", s.id);
              setStories((prev) =>
                prev.map((st) =>
                  st.id === s.id ? { ...st, view_count: (st.view_count || 0) + 1 } : st
                )
              );
              import("../../lib/rewardXp").then(({ rewardXp }) => rewardXp("story_viewed")).catch(() => {});
            });
          }
        });
      markStoriesViewed(s.user_id);
    }
    if (user && s.user_id === user.id) {
      markStoriesViewed(s.user_id);
    }
  }, [index, stories.length]);

  // ── Like a story ────────────────────────────────────────────────────────────
  const handleLike = useCallback(async () => {
    if (!user || !story) {
      if (!user) router.push("/(auth)/login" as any);
      return;
    }
    const storyId = story.id;
    if (likeInFlight.current.has(storyId)) return;
    likeInFlight.current.add(storyId);

    const current = likeState[storyId] ?? { liked: false, count: 0 };
    const nextLiked = !current.liked;
    const nextCount = nextLiked
      ? current.count + 1
      : Math.max(0, current.count - 1);

    // Optimistic update
    setLikeState((prev) => ({
      ...prev,
      [storyId]: { liked: nextLiked, count: nextCount },
    }));

    try {
      if (nextLiked) {
        await supabase
          .from("story_likes")
          .insert({ story_id: storyId, user_id: user.id });
      } else {
        await supabase
          .from("story_likes")
          .delete()
          .eq("story_id", storyId)
          .eq("user_id", user.id);
      }
    } catch {
      // Revert on failure
      setLikeState((prev) => ({
        ...prev,
        [storyId]: current,
      }));
    } finally {
      likeInFlight.current.delete(storyId);
    }
  }, [user, story, likeState]);

  // ── Comment ─────────────────────────────────────────────────────────────────
  const sendComment = useCallback(async () => {
    const s = stories[index];
    if (!s || !user || !commentText.trim()) return;
    setSendingComment(true);
    setPaused(true);

    const trimmed = commentText.trim();
    await supabase.from("story_replies").insert({
      story_id: s.id,
      user_id: user.id,
      content: trimmed,
    });

    if (s.user_id !== user.id) {
      const { data: chatId } = await supabase.rpc("get_or_create_direct_chat", {
        other_user_id: s.user_id,
      });
      if (chatId) {
        await supabase.from("messages").insert({
          chat_id: chatId,
          sender_id: user.id,
          encrypted_content: `storyUserId:${s.user_id}|${trimmed}`,
          attachment_url: s.media_url,
          attachment_type: "story_reply",
        });
      }
    }

    setCommentText("");
    setSendingComment(false);
    setPaused(false);
  }, [index, stories, user, commentText]);

  // ── Share sheet ─────────────────────────────────────────────────────────────
  const openShareSheet = useCallback(async () => {
    if (!story) return;
    setPaused(true);
    setShowShareSheet(true);
    const { data } = await supabase
      .from("chats")
      .select("id, is_group, is_channel, name, chat_members!inner(user_id, profiles!chat_members_user_id_fkey(display_name, avatar_url))")
      .eq("is_channel", false)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (data) {
      const items = (data as any[]).map((c) => {
        if (c.is_group) return { id: c.id, name: c.name || "Group", avatar_url: null };
        const other = (c.chat_members || []).find((m: any) => m.user_id !== user?.id);
        return {
          id: c.id,
          name: other?.profiles?.display_name || c.name || "Chat",
          avatar_url: other?.profiles?.avatar_url || null,
        };
      });
      setChatList(items);
    }
  }, [story, user]);

  const closeShareSheet = useCallback(() => {
    setShowShareSheet(false);
    setPaused(false);
  }, []);

  const sendStoryToChat = useCallback(async (chatId: string) => {
    if (!story || !user) return;
    closeShareSheet();
    const caption = story.caption ? `"${story.caption}"` : "Shared a story";
    await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: user.id,
      encrypted_content: `storyUserId:${story.user_id}|${caption}`,
      attachment_url: story.media_url,
      attachment_type: "story_reply",
    });
  }, [story, user, closeShareSheet]);

  // ── Viewers sheet ────────────────────────────────────────────────────────────
  const openViewers = useCallback(async () => {
    if (!story || !isOwner) return;
    setPaused(true);
    setShowViewers(true);
    setLoadingViewers(true);
    Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, friction: 10 }).start();

    const { data } = await supabase
      .from("story_views")
      .select("viewed_at, profiles!story_views_viewer_id_fkey(id, display_name, avatar_url, handle, is_verified, is_organization_verified)")
      .eq("story_id", story.id)
      .order("viewed_at", { ascending: false });

    const list: Viewer[] = (data || []).map((v: any) => ({
      id: v.profiles?.id || "",
      display_name: v.profiles?.display_name || "User",
      avatar_url: v.profiles?.avatar_url || null,
      handle: v.profiles?.handle || "",
      viewed_at: v.viewed_at,
      is_verified: v.profiles?.is_verified,
      is_organization_verified: v.profiles?.is_organization_verified,
    }));
    setViewers(list);
    setLoadingViewers(false);
  }, [story, isOwner, slideAnim]);

  const closeViewers = useCallback(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 10 }).start(() => {
      setShowViewers(false);
      setPaused(false);
    });
  }, [slideAnim]);

  if (!story) return <View style={[styles.root, { backgroundColor: "#0D0D0D" }]} />;

  const elapsed = Math.floor((Date.now() - new Date(story.created_at).getTime()) / 3600000);
  const timeLabel = elapsed < 1 ? "just now" : `${elapsed}h ago`;

  const storyLike = likeState[story.id] ?? { liked: false, count: 0 };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.root, { backgroundColor: "#0D0D0D" }]}
    >
      {/* ── Media ─────────────────────────────────────────────────────────── */}
      {isVideoStory ? (
        <Video
          source={{ uri: story.media_url }}
          style={styles.media}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={!paused}
          isLooping={false}
          isMuted={false}
          onPlaybackStatusUpdate={(status: any) => {
            if (status.isLoaded && status.durationMillis) {
              progressAnim.setValue(status.positionMillis / status.durationMillis);
            }
            if (status.didJustFinish) goNext();
          }}
        />
      ) : (
        <Image source={{ uri: story.media_url }} style={styles.media} resizeMode="contain" />
      )}

      {/* ── Progress segments ────────────────────────────────────────────── */}
      <View style={[styles.progressBar, { top: insets.top + 8 }]}>
        {stories.map((_, i) => (
          <View key={i} style={styles.progressSegment}>
            <View style={styles.progressBg} />
            <Animated.View
              style={[
                styles.progressFill,
                i < index
                  ? { width: "100%" }
                  : i === index
                  ? {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0%", "100%"],
                      }),
                    }
                  : { width: "0%" },
              ]}
            />
          </View>
        ))}
      </View>

      {/* ── Top bar — avatar, name, time, share, close ───────────────────── */}
      <View style={[styles.topBar, { top: insets.top + 20 }]}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/contact/[id]", params: { id: story.user_id, init_name: story.profile.display_name, init_handle: story.profile.handle, init_avatar: story.profile.avatar_url ?? "" } })}
          activeOpacity={0.8}
        >
          <Avatar uri={story.profile.avatar_url} name={story.profile.display_name} size={36} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={styles.storyName}>{story.profile.display_name}</Text>
            <VerifiedBadge
              isVerified={story.profile.is_verified}
              isOrganizationVerified={story.profile.is_organization_verified}
              size={14}
            />
          </View>
          <Text style={styles.storyTime}>{timeLabel}</Text>
        </View>
        <TouchableOpacity style={styles.topBtn} onPress={openShareSheet} activeOpacity={0.8}>
          <Ionicons name="share-social-outline" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Tap zones — prev / next ──────────────────────────────────────── */}
      {!showViewers && (
        <View style={styles.tapZones}>
          <TouchableOpacity
            style={styles.tapLeft}
            onPress={goPrev}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            activeOpacity={1}
          />
          <TouchableOpacity
            style={styles.tapRight}
            onPress={goNext}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            activeOpacity={1}
          />
        </View>
      )}

      {/* ── Caption ──────────────────────────────────────────────────────── */}
      {story.caption ? (
        <View style={styles.captionBar}>
          <Text style={styles.captionText}>{story.caption}</Text>
        </View>
      ) : null}

      {/* ── Bottom action row — always visible ───────────────────────────── */}
      {!showViewers && !showShareSheet && (
        <View style={[styles.bottomRow, { paddingBottom: insets.bottom + 12 }]}>

          {/* Owner: viewer pill + count (tappable to open sheet) */}
          {isOwner ? (
            <TouchableOpacity
              style={styles.viewerPill}
              onPress={openViewers}
              activeOpacity={0.75}
            >
              <Ionicons name="eye" size={15} color="rgba(255,255,255,0.85)" />
              <Text style={styles.viewerPillCount}>{story.view_count || 0}</Text>
              {storyLike.count > 0 && (
                <>
                  <View style={styles.pillDivider} />
                  <Ionicons name="heart" size={13} color="#FF2D55" />
                  <Text style={styles.viewerPillCount}>{storyLike.count}</Text>
                </>
              )}
              <Ionicons name="chevron-up" size={13} color="rgba(255,255,255,0.45)" />
            </TouchableOpacity>
          ) : (
            /* Non-owner: viewer count display (read-only) */
            <View style={styles.viewerPill} pointerEvents="none">
              <Ionicons name="eye" size={15} color="rgba(255,255,255,0.65)" />
              <Text style={styles.viewerPillCount}>{story.view_count || 0}</Text>
            </View>
          )}

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* Like button — all users (owner can like their own story too) */}
          <TouchableOpacity
            style={[styles.actionBtn, storyLike.liked && styles.actionBtnActive]}
            onPress={handleLike}
            activeOpacity={0.75}
          >
            <Ionicons
              name={storyLike.liked ? "heart" : "heart-outline"}
              size={22}
              color={storyLike.liked ? "#FF2D55" : "#fff"}
            />
            {storyLike.count > 0 && (
              <Text style={[styles.actionBtnLabel, storyLike.liked && { color: "#FF2D55" }]}>
                {storyLike.count}
              </Text>
            )}
          </TouchableOpacity>

          {/* Comment input — non-owners only */}
          {!isOwner && (
            <>
              <View style={styles.commentInputWrap}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Reply…"
                  placeholderTextColor="rgba(255,255,255,0.38)"
                  value={commentText}
                  onChangeText={setCommentText}
                  onFocus={() => setPaused(true)}
                  onBlur={() => { if (!commentText.trim()) setPaused(false); }}
                  returnKeyType="send"
                  onSubmitEditing={sendComment}
                  maxLength={500}
                />
              </View>
              {commentText.trim() ? (
                <TouchableOpacity
                  onPress={sendComment}
                  disabled={sendingComment}
                  style={[styles.actionBtn, { opacity: sendingComment ? 0.4 : 1 }]}
                >
                  <Ionicons name="send" size={20} color="#fff" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.actionBtn} onPress={openShareSheet} activeOpacity={0.8}>
                  <Ionicons name="share-social" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}

      {/* ── Share sheet ──────────────────────────────────────────────────── */}
      {showShareSheet && (
        <>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeShareSheet} />
          <View style={[styles.panel, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.panelHandle} />
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Share Story</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={closeShareSheet}>
                <Ionicons name="close-circle" size={26} color="rgba(255,255,255,0.45)" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.shareOptionRow}
              activeOpacity={0.75}
              onPress={() => {
                closeShareSheet();
                shareStory({ userName: story.profile.display_name, userId: story.user_id });
              }}
            >
              <View style={[styles.shareOptionIcon, { backgroundColor: "#0088FF22" }]}>
                <Ionicons name="link-outline" size={20} color="#0088FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareOptionLabel}>Share Link</Text>
                <Text style={styles.shareOptionSub}>Copy or send via any app</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
            </TouchableOpacity>

            {chatList.length > 0 && (
              <>
                <Text style={styles.shareContactsLabel}>Send to a contact</Text>
                <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                  {chatList.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.shareContactRow}
                      activeOpacity={0.75}
                      onPress={() => sendStoryToChat(c.id)}
                    >
                      <Avatar uri={c.avatar_url} name={c.name} size={40} />
                      <Text style={styles.shareContactName} numberOfLines={1}>{c.name}</Text>
                      <View style={styles.shareContactSend}>
                        <Ionicons name="send" size={14} color="#fff" />
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </>
      )}

      {/* ── Viewers sheet — owner only ────────────────────────────────────── */}
      {showViewers && (
        <>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeViewers} />
          <Animated.View
            style={[
              styles.viewersPanel,
              { height: panelH, paddingBottom: insets.bottom, transform: [{ translateY }] },
            ]}
          >
            <View style={styles.panelHandle} />
            <View style={styles.panelHeader}>
              <Ionicons name="eye" size={18} color="rgba(255,255,255,0.7)" />
              <Text style={styles.panelTitle}>
                Viewers · {story.view_count || 0}
              </Text>
              {storyLike.count > 0 && (
                <>
                  <View style={styles.pillDivider} />
                  <Ionicons name="heart" size={15} color="#FF2D55" />
                  <Text style={[styles.panelTitle, { color: "#FF2D55" }]}>
                    {storyLike.count}
                  </Text>
                </>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={closeViewers}>
                <Ionicons name="close-circle" size={26} color="rgba(255,255,255,0.45)" />
              </TouchableOpacity>
            </View>

            {loadingViewers ? (
              <View style={styles.centeredMsg}>
                <Text style={styles.mutedText}>Loading…</Text>
              </View>
            ) : viewers.length === 0 ? (
              <View style={styles.centeredMsg}>
                <Ionicons name="eye-off-outline" size={36} color="rgba(255,255,255,0.2)" />
                <Text style={[styles.mutedText, { marginTop: 8 }]}>No viewers yet</Text>
              </View>
            ) : (
              <FlatList
                data={viewers}
                keyExtractor={(v) => v.id}
                contentContainerStyle={{ paddingHorizontal: 16 }}
                renderItem={({ item }) => {
                  const ago = Math.floor((Date.now() - new Date(item.viewed_at).getTime()) / 60000);
                  const label = ago < 1 ? "just now" : ago < 60 ? `${ago}m ago` : `${Math.floor(ago / 60)}h ago`;
                  return (
                    <View style={styles.viewerRow}>
                      <Avatar uri={item.avatar_url} name={item.display_name} size={40} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Text style={styles.viewerName}>{item.display_name}</Text>
                          <VerifiedBadge
                            isVerified={item.is_verified}
                            isOrganizationVerified={item.is_organization_verified}
                            size={13}
                          />
                        </View>
                        <Text style={styles.viewerHandle}>@{item.handle}</Text>
                      </View>
                      <Text style={styles.viewerTime}>{label}</Text>
                    </View>
                  );
                }}
              />
            )}
          </Animated.View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  media: { ...StyleSheet.absoluteFillObject },

  // Progress
  progressBar: {
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 8,
    position: "absolute",
    left: 0,
    right: 0,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    overflow: "hidden",
  },
  progressBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.28)",
    borderRadius: 1.5,
  },
  progressFill: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderRadius: 1.5,
  },

  // Top bar
  topBar: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  storyName: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  storyTime: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  topBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Tap zones
  tapZones: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
  },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2 },

  // Caption
  captionBar: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.42)",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  captionText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },

  // Bottom action row — always visible
  bottomRow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },

  // Viewer pill — inline count visible without opening sheet
  viewerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  viewerPillCount: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  pillDivider: {
    width: 1,
    height: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginHorizontal: 2,
  },

  // Action buttons (like, send, share)
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    gap: 4,
  },
  actionBtnActive: {
    borderColor: "rgba(255,45,85,0.4)",
    backgroundColor: "rgba(255,45,85,0.12)",
  },
  actionBtnLabel: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },

  // Comment input
  commentInputWrap: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  commentInput: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  // Shared panel styles
  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(20,20,20,0.97)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  viewersPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(20,20,20,0.97)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  panelHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.28)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  panelTitle: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },

  // Viewers
  viewerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  viewerName: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  viewerHandle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  viewerTime: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  centeredMsg: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mutedText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },

  // Share sheet
  shareOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  shareOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  shareOptionLabel: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  shareOptionSub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  shareContactsLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  shareContactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  shareContactName: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  shareContactSend: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
});
