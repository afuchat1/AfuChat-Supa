import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  StyleSheet,
  Text,
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
  const [mediaDims, setMediaDims] = useState<{ [key: string]: { w: number; h: number } }>({});
  const fetchedDimsRef = useRef<Set<string>>(new Set());

  const isOwner = user?.id === userId;

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("stories")
      .select("id, media_url, media_type, caption, created_at, view_count, user_id, profiles!stories_user_id_fkey(display_name, avatar_url, handle, is_verified, is_organization_verified)")
      .eq("user_id", userId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) {
          setStories(data.map((s: any) => ({ ...s, profile: s.profiles })));
        }
      });
  }, [userId]);

  useEffect(() => {
    stories.forEach((s) => {
      if (s.media_type !== "video" && s.media_url && !fetchedDimsRef.current.has(s.id)) {
        fetchedDimsRef.current.add(s.id);
        Image.getSize(
          s.media_url,
          (w, h) => {
            if (w > 0 && h > 0) setMediaDims((prev) => ({ ...prev, [s.id]: { w, h } }));
          },
          () => {}
        );
      }
    });
  }, [stories]);

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
    }
  }, [index, stories]);

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

  const { width: screenW, height: screenH } = useWindowDimensions();

  if (!story) return <View style={[styles.root, { backgroundColor: "#0D0D0D" }]} />;

  const elapsed = Math.floor((Date.now() - new Date(story.created_at).getTime()) / 3600000);
  const timeLabel = elapsed < 1 ? "just now" : `${elapsed}h ago`;

  const panelHeight = screenH * 0.45;
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [panelHeight, 0],
  });

  const dims = mediaDims[story.id];
  const isVideo = story.media_type === "video";
  const availW = screenW;
  const availH = screenH - insets.top - insets.bottom;

  let mediaW = availW;
  let mediaH = availH;
  let mediaRadius = 0;

  if (!isVideo && dims && dims.w > 0 && dims.h > 0 && isFinite(dims.w) && isFinite(dims.h)) {
    const imgAspect = dims.w / dims.h;

    mediaW = dims.w;
    mediaH = dims.h;

    if (mediaW > availW) {
      mediaW = availW;
      mediaH = mediaW / imgAspect;
    }
    if (mediaH > availH) {
      mediaH = availH;
      mediaW = mediaH * imgAspect;
    }

    const MIN_SIZE = 200;
    if (mediaW < MIN_SIZE && dims.w < availW) {
      mediaW = Math.min(MIN_SIZE, availW);
      mediaH = mediaW / imgAspect;
    }
    if (mediaH < MIN_SIZE && dims.h < availH) {
      mediaH = Math.min(MIN_SIZE, availH);
      mediaW = mediaH * imgAspect;
    }

    mediaRadius = mediaW < availW || mediaH < availH ? 16 : 0;
  }

  return (
    <View style={[styles.root, { backgroundColor: "#0D0D0D" }]}>
      <View style={styles.mediaContainer}>
        {isVideo ? (
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
          <Image
            source={{ uri: story.media_url }}
            style={{
              width: mediaW,
              height: mediaH,
              borderRadius: mediaRadius,
            }}
            resizeMode="contain"
          />
        )}
      </View>

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
        <TouchableOpacity onPress={() => { setPaused(true); shareStory({ userName: story.profile.display_name, userId: story.user_id }).finally(() => setPaused(false)); }}>
          <Ionicons name="share-outline" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#fff" />
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
        <View style={[styles.captionBar, { paddingBottom: insets.bottom + (isOwner ? 56 : 16) }]}>
          <Text style={styles.captionText}>{story.caption}</Text>
        </View>
      ) : null}

      {isOwner ? (
        <TouchableOpacity
          style={[styles.viewersTrigger, { bottom: insets.bottom + 12 }]}
          onPress={openViewers}
          activeOpacity={0.7}
        >
          <Ionicons name="eye-outline" size={18} color="#fff" />
          <Text style={styles.viewersTriggerText}>{story.view_count || 0}</Text>
          <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      ) : null}

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
  mediaContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  media: { ...StyleSheet.absoluteFillObject },
  progressBar: { flexDirection: "row", gap: 3, paddingHorizontal: 8, position: "absolute", left: 0, right: 0 },
  progressSegment: { flex: 1, height: 3, borderRadius: 1.5, overflow: "hidden" },
  progressBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 1.5 },
  progressFill: { position: "absolute", top: 0, left: 0, bottom: 0, backgroundColor: "#fff", borderRadius: 1.5 },
  topBar: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 10 },
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
});
