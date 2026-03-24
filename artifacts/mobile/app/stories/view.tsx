import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";

const { width, height } = Dimensions.get("window");
const STORY_DURATION = 5000;

type Story = {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  view_count: number;
  user_id: string;
  profile: { display_name: string; avatar_url: string | null; handle: string };
};

export default function ViewStoryScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [stories, setStories] = useState<Story[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("stories")
      .select("id, media_url, media_type, caption, created_at, view_count, user_id, profiles!stories_user_id_fkey(display_name, avatar_url, handle)")
      .eq("user_id", userId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) {
          setStories(data.map((s: any) => ({ ...s, profile: s.profiles })));
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

  const isVideoStory = story?.media_type === "video";

  useEffect(() => {
    if (stories.length === 0 || paused || isVideoStory) return;

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
  }, [index, stories.length, paused, isVideoStory, goNext, progressAnim]);

  useEffect(() => {
    const story = stories[index];
    if (story && user && story.user_id !== user.id) {
      supabase.from("story_views").select("id").eq("story_id", story.id).eq("viewer_id", user.id).maybeSingle().then(({ data: existing }) => {
        if (!existing) {
          supabase.from("story_views").insert({ story_id: story.id, viewer_id: user.id }).then(() => {
            supabase.from("stories").update({ view_count: (story.view_count || 0) + 1 }).eq("id", story.id);
          });
        }
      });
    }
  }, [index, stories]);

  const story = stories[index];
  if (!story) return <View style={[styles.root, { backgroundColor: "#0D0D0D" }]} />;

  const elapsed = Math.floor((Date.now() - new Date(story.created_at).getTime()) / 3600000);
  const timeLabel = elapsed < 1 ? "just now" : `${elapsed}h ago`;

  return (
    <View style={[styles.root, { backgroundColor: "#0D0D0D" }]}>
      {story.media_type === "video" ? (
        <Video
          source={{ uri: story.media_url }}
          style={styles.media}
          resizeMode={ResizeMode.COVER}
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
        <Image source={{ uri: story.media_url }} style={styles.media} resizeMode="cover" />
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
          <Text style={styles.storyName}>{story.profile.display_name}</Text>
          <Text style={styles.storyTime}>{timeLabel}</Text>
        </View>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

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

      {story.caption ? (
        <View style={[styles.captionBar, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.captionText}>{story.caption}</Text>
        </View>
      ) : null}

      <View style={[styles.viewCount, { bottom: insets.bottom + (story.caption ? 60 : 16) }]}>
        <Ionicons name="eye-outline" size={14} color="rgba(255,255,255,0.7)" />
        <Text style={styles.viewCountText}>{story.view_count || 0}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  media: { width, height, position: "absolute" },
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
  viewCount: { position: "absolute", left: 16, flexDirection: "row", alignItems: "center", gap: 4 },
  viewCountText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular" },
});
