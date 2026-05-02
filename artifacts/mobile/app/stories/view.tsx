import React, { useCallback, useEffect, useRef, useState } from "react";
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
  user_id: string;
  profile: { display_name: string; avatar_url: string | null; handle: string; is_verified?: boolean; is_organization_verified?: boolean };
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
  const [stories, setStories] = useState<Story[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const { isDesktop } = useIsDesktop();
  const isOwner = user?.id === userId;
  const [commentText, setCommentText] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [chatList, setChatList] = useState<{ id: string; name: string; avatar_url: string | null }[]>([]);

  useEffect(() => {
    if (isDesktop) router.replace("/");
  }, [isDesktop]);
  if (isDesktop) return null;

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
          encrypted_content: trimmed,
          attachment_url: s.media_url,
          attachment_type: "story_reply",
        });
      }
    }

    setCommentText("");
    setSendingComment(false);
    setPaused(false);
  }, [index, stories, user, commentText]);

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
          setStories(visible.map((s: any) => ({ ...s, profile: s.profiles })));
        }
      });
  }, [userId]);

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

  const story = stories[index];
  const isVideoStory = story?.media_type === "video";

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

  useEffect(() => {
    const s = stories[index];
    if (s && user && s.user_id !== user.id) {
      supabase.from("story_views").select("id").eq("story_id", s.id).eq("viewer_id", user.id).maybeSingle().then(({ data: existing }) => {
        if (!existing) {
          supabase.from("story_views").insert({ story_id: s.id, viewer_id: user.id }).then(() => {
            supabase.from("stories").update({ view_count: (s.view_count || 0) + 1 }).eq("id", s.id);
            import("../../lib/rewardXp").then(({ rewardXp }) => rewardXp("story_viewed")).catch(() => {});
          });
        }
      });
      // Notify StoriesBar to refresh the ring immediately
      markStoriesViewed(s.user_id);
    }
    // Own stories: mark viewed so ring shows as read
    if (s && user && s.user_id === user.id) {
      markStoriesViewed(s.user_id);
    }
  }, [index, stories]);

  const openShareSheet = useCallback(async () => {
    if (!story) return;
    setPaused(true);
    setShowShareSheet(true);
    // Load recent chats for "send to" list
    const { data } = await supabase
      .from("chats")
      .select("id, is_group, is_channel, name, chat_members!inner(user_id, profiles!chat_members_user_id_fkey(display_name, avatar_url))")
      .eq("is_channel", false)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (data) {
      const items = (data as any[]).map((c) => {
        if (c.is_group) {
          return { id: c.id, name: c.name || "Group", avatar_url: null };
        }
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
    await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: user.id,
      encrypted_content: story.caption ? `📖 Story: "${story.caption}"` : "📖 Shared a story",
      attachment_url: story.media_url,
      attachment_type: "story_reply",
    });
  }, [story, user, closeShareSheet]);

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

  const { height: screenH } = useWindowDimensions();

  if (!story) return <View style={[styles.root, { backgroundColor: "#0D0D0D" }]} />;

  const elapsed = Math.floor((Date.now() - new Date(story.created_at).getTime()) / 3600000);
  const timeLabel = elapsed < 1 ? "just now" : `${elapsed}h ago`;

  const panelHeight = screenH * 0.45;
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [panelHeight, 0],
  });

  return (
    <View style={[styles.root, { backgroundColor: "#0D0D0D" }]}>
      {story.media_type === "video" ? (
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

      <View style={[styles.progressBar, { top: insets.top + 8 }]}>
        {stories.map((_, i) => (
          <View key={i} style={styles.progressSegment}>
            <View style={[styles.progressBg]} />
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

      <View style={[styles.topBar, { top: insets.top + 20 }]}>
        <Avatar uri={story.profile.avatar_url} name={story.profile.display_name} size={36} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.storyName}>{story.profile.display_name}</Text>
            <VerifiedBadge isVerified={story.profile.is_verified} isOrganizationVerified={story.profile.is_organization_verified} size={14} />
          </View>
          <Text style={styles.storyTime}>{timeLabel}</Text>
        </View>
        <TouchableOpacity style={styles.topActionBtn} onPress={openShareSheet}>
          <Ionicons name="share-social-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topActionBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

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

      {story.caption ? (
        <View style={[styles.captionBar, { paddingBottom: insets.bottom + (isOwner ? 56 : 56) }]}>
          <Text style={styles.captionText}>{story.caption}</Text>
        </View>
      ) : null}

      {isOwner ? (
        <TouchableOpacity
          style={[styles.viewersTrigger, { bottom: insets.bottom + 52 }]}
          onPress={openViewers}
          activeOpacity={0.7}
        >
          <Ionicons name="eye-outline" size={18} color="#fff" />
          <Text style={styles.viewersTriggerText}>{story.view_count || 0}</Text>
          <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      ) : null}

      {!showViewers && !showShareSheet && (
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={0}
          style={[styles.commentBar, { paddingBottom: insets.bottom + 8 }]}
        >
          <TextInput
            style={styles.commentInput}
            placeholder={isOwner ? "Your story…" : "Send a comment…"}
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={commentText}
            onChangeText={setCommentText}
            onFocus={() => setPaused(true)}
            onBlur={() => { if (!commentText.trim()) setPaused(false); }}
            returnKeyType="send"
            onSubmitEditing={sendComment}
            maxLength={500}
            editable={!isOwner}
          />
          {!isOwner && (
            <TouchableOpacity
              onPress={sendComment}
              disabled={!commentText.trim() || sendingComment}
              style={[styles.commentSendBtn, (!commentText.trim() || sendingComment) && { opacity: 0.4 }]}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          )}
          {/* Share button always visible at bottom right */}
          <TouchableOpacity style={styles.shareBtn} onPress={openShareSheet} activeOpacity={0.8}>
            <Ionicons name="share-social" size={20} color="#fff" />
          </TouchableOpacity>
        </KeyboardAvoidingView>
      )}

      {showShareSheet && (
        <>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeShareSheet} />
          <View style={[styles.sharePanel, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.viewersPanelHandle} />
            <View style={styles.viewersHeader}>
              <Text style={styles.viewersTitle}>Share Story</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={closeShareSheet}>
                <Ionicons name="close-circle" size={26} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>

            {/* Native share link row */}
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

            {/* Send to contact rows */}
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

      {showViewers && (
        <>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeViewers} />
          <Animated.View
            style={[
              styles.viewersPanel,
              { height: panelHeight, paddingBottom: insets.bottom, transform: [{ translateY }] },
            ]}
          >
            <View style={styles.viewersPanelHandle} />
            <View style={styles.viewersHeader}>
              <Text style={styles.viewersTitle}>Viewers</Text>
              <Text style={styles.viewersCount}>{viewers.length}</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={closeViewers}>
                <Ionicons name="close-circle" size={26} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>
            {loadingViewers ? (
              <View style={styles.viewersLoading}>
                <Text style={styles.viewersLoadingText}>Loading...</Text>
              </View>
            ) : viewers.length === 0 ? (
              <View style={styles.viewersLoading}>
                <Text style={styles.viewersLoadingText}>No viewers yet</Text>
              </View>
            ) : (
              <FlatList
                data={viewers}
                keyExtractor={(v) => v.id}
                contentContainerStyle={{ paddingHorizontal: 16 }}
                renderItem={({ item }) => {
                  const viewedAgo = Math.floor((Date.now() - new Date(item.viewed_at).getTime()) / 60000);
                  const viewedLabel = viewedAgo < 1 ? "just now" : viewedAgo < 60 ? `${viewedAgo}m ago` : `${Math.floor(viewedAgo / 60)}h ago`;
                  return (
                    <View style={styles.viewerRow}>
                      <Avatar uri={item.avatar_url} name={item.display_name} size={40} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={styles.viewerName}>{item.display_name}</Text>
                          <VerifiedBadge isVerified={item.is_verified} isOrganizationVerified={item.is_organization_verified} size={13} />
                        </View>
                        <Text style={styles.viewerHandle}>@{item.handle}</Text>
                      </View>
                      <Text style={styles.viewerTime}>{viewedLabel}</Text>
                    </View>
                  );
                }}
              />
            )}
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  media: { ...StyleSheet.absoluteFillObject },
  progressBar: { flexDirection: "row", gap: 3, paddingHorizontal: 8, position: "absolute", left: 0, right: 0 },
  progressSegment: { flex: 1, height: 3, borderRadius: 1.5, overflow: "hidden" },
  progressBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 1.5 },
  progressFill: { position: "absolute", top: 0, left: 0, bottom: 0, backgroundColor: "#fff", borderRadius: 1.5 },
  topBar: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  topActionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  storyName: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  storyTime: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_400Regular" },
  tapZones: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, flexDirection: "row" },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2 },
  captionBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.4)", padding: 16 },
  captionText: { color: "#fff", fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  viewersTrigger: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  viewersTriggerText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  viewersPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(30,30,30,0.97)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  viewersPanelHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  viewersHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  viewersTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  viewersCount: { color: "rgba(255,255,255,0.5)", fontSize: 15, fontFamily: "Inter_400Regular" },
  viewersLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  viewersLoadingText: { color: "rgba(255,255,255,0.5)", fontSize: 14, fontFamily: "Inter_400Regular" },
  viewerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  viewerName: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  viewerHandle: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "Inter_400Regular" },
  viewerTime: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular" },
  commentBar: {
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
  commentInput: {
    flex: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 16,
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  commentSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#00BCD4",
    alignItems: "center",
    justifyContent: "center",
  },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  sharePanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(24,24,28,0.98)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  shareOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
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
  shareOptionLabel: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  shareOptionSub: { color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  shareContactsLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    textTransform: "uppercase",
  },
  shareContactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  shareContactName: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  shareContactSend: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#00BCD4",
    alignItems: "center",
    justifyContent: "center",
  },
});
