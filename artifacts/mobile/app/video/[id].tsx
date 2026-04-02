import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";
import { notifyPostLike } from "@/lib/notifyUser";

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

type VideoPost = {
  id: string;
  author_id: string;
  content: string;
  video_url: string;
  created_at: string;
  view_count: number;
  profile: { display_name: string; handle: string; avatar_url: string | null };
  liked: boolean;
  likeCount: number;
  replyCount: number;
};

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function VideoItem({
  item,
  isActive,
  onLike,
}: {
  item: VideoPost;
  isActive: boolean;
  onLike: (id: string, liked: boolean) => void;
}) {
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;

  function handleLike() {
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 0.65, duration: 80, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, tension: 300, friction: 7, useNativeDriver: true }),
    ]).start();
    onLike(item.id, item.liked);
  }

  return (
    <View style={styles.item}>
      {/* Full-screen video */}
      <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={() => setPaused((p) => !p)}>
        <Video
          source={{ uri: item.video_url }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive && !paused}
          isLooping
          isMuted={muted}
        />
      </TouchableOpacity>

      {/* Pause indicator */}
      {paused && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <View style={styles.pauseCircle}>
            <Ionicons name="play" size={28} color="#fff" />
          </View>
        </View>
      )}

      {/* Bottom gradient overlay */}
      <View style={styles.overlay} pointerEvents="none" />

      {/* Author + caption */}
      <View style={styles.bottomArea}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}
          style={styles.authorRow}
        >
          <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={36} />
          <View>
            <Text style={styles.authorHandle}>@{item.profile.handle}</Text>
            <Text style={styles.authorName}>{item.profile.display_name}</Text>
          </View>
        </TouchableOpacity>
        {!!item.content && (
          <Text style={styles.caption} numberOfLines={3}>{item.content}</Text>
        )}
      </View>

      {/* Right actions */}
      <View style={styles.rightCol}>
        {/* Like */}
        <Animated.View style={[styles.actionItem, { transform: [{ scale: heartScale }] }]}>
          <TouchableOpacity onPress={handleLike} hitSlop={10}>
            <Ionicons
              name={item.liked ? "heart" : "heart-outline"}
              size={32}
              color={item.liked ? "#FF3B30" : "#fff"}
            />
          </TouchableOpacity>
          <Text style={styles.actionLabel}>{formatCount(item.likeCount)}</Text>
        </Animated.View>

        {/* Comment */}
        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
          hitSlop={10}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={30} color="#fff" />
          <Text style={styles.actionLabel}>{formatCount(item.replyCount)}</Text>
        </TouchableOpacity>

        {/* Mute */}
        <TouchableOpacity style={styles.actionItem} onPress={() => setMuted((m) => !m)} hitSlop={10}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function VideoPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();

  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const initialScrollDone = useRef(false);

  const fetchVideos = useCallback(async () => {
    const { data } = await supabase
      .from("posts")
      .select(`
        id, author_id, content, video_url, created_at, view_count,
        profiles!posts_author_id_fkey(display_name, handle, avatar_url)
      `)
      .eq("post_type", "video")
      .eq("visibility", "public")
      .eq("is_blocked", false)
      .not("video_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data && data.length > 0) {
      const postIds = data.map((p: any) => p.id);
      const [{ data: likesData }, { data: repliesData }, { data: myLikes }] = await Promise.all([
        supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds),
        supabase.from("post_replies").select("post_id").in("post_id", postIds),
        user
          ? supabase.from("post_acknowledgments").select("post_id").in("post_id", postIds).eq("user_id", user.id)
          : { data: [] },
      ]);

      const likeMap: Record<string, number> = {};
      for (const l of (likesData || [])) likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1;
      const replyMap: Record<string, number> = {};
      for (const r of (repliesData || [])) replyMap[r.post_id] = (replyMap[r.post_id] || 0) + 1;
      const myLikeSet = new Set((myLikes || []).map((l: any) => l.post_id));

      const mapped: VideoPost[] = data.map((p: any) => ({
        id: p.id,
        author_id: p.author_id,
        content: p.content || "",
        video_url: p.video_url,
        created_at: p.created_at,
        view_count: p.view_count || 0,
        profile: { display_name: p.profiles?.display_name || "User", handle: p.profiles?.handle || "user", avatar_url: p.profiles?.avatar_url || null },
        liked: myLikeSet.has(p.id),
        likeCount: likeMap[p.id] || 0,
        replyCount: replyMap[p.id] || 0,
      }));
      setVideos(mapped);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  // Scroll to the tapped video after data loads
  useEffect(() => {
    if (!loading && videos.length > 0 && id && !initialScrollDone.current) {
      const idx = videos.findIndex((v) => v.id === id);
      if (idx > 0) {
        setActiveIndex(idx);
        setTimeout(() => {
          listRef.current?.scrollToIndex({ index: idx, animated: false });
        }, 50);
      }
      initialScrollDone.current = true;
    }
  }, [loading, videos, id]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setActiveIndex(viewableItems[0].index);
    }
  }, []);

  async function handleLike(postId: string, currentlyLiked: boolean) {
    if (!user) { router.push("/(auth)/login"); return; }
    const post = videos.find((v) => v.id === postId);
    if (!post) return;
    if (currentlyLiked) {
      await supabase.from("post_acknowledgments").delete().eq("post_id", postId).eq("user_id", user.id);
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: false, likeCount: Math.max(0, v.likeCount - 1) } : v));
    } else {
      await supabase.from("post_acknowledgments").insert({ post_id: postId, user_id: user.id });
      setVideos((prev) => prev.map((v) => v.id === postId ? { ...v, liked: true, likeCount: v.likeCount + 1 } : v));
      if (post.author_id !== user.id) {
        notifyPostLike({ postAuthorId: post.author_id, likerName: profile?.display_name || "Someone", likerUserId: user.id, postId });
      }
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.brand} size="large" />
      </View>
    );
  }

  if (videos.length === 0) {
    return (
      <View style={styles.center}>
        <TouchableOpacity style={styles.backBtnEmpty} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Ionicons name="videocam-off-outline" size={56} color="rgba(255,255,255,0.4)" />
        <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 16, fontFamily: "Inter_500Medium", marginTop: 16 }}>
          No videos yet
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Back button */}
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={() => router.back()}
        hitSlop={10}
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Video counter */}
      <View style={[styles.counter, { top: insets.top + 12 }]}>
        <Text style={styles.counterText}>{activeIndex + 1} / {videos.length}</Text>
      </View>

      <FlatList
        ref={listRef}
        data={videos}
        keyExtractor={(v) => v.id}
        renderItem={({ item, index }) => (
          <VideoItem item={item} isActive={index === activeIndex} onLike={handleLike} />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({ length: SCREEN_H, offset: SCREEN_H * index, index })}
        decelerationRate="fast"
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 300);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  item: { width: SCREEN_W, height: SCREEN_H, backgroundColor: "#000" },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 320,
    ...(Platform.OS === "web"
      ? { backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.80) 0%, transparent 100%)" }
      : { backgroundColor: "transparent" }),
  } as any,
  pauseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  pauseCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  bottomArea: { position: "absolute", bottom: 100, left: 16, right: 80, gap: 10 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  authorHandle: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  authorName: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  caption: { color: "#fff", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  rightCol: { position: "absolute", right: 12, bottom: 110, gap: 22, alignItems: "center" },
  actionItem: { alignItems: "center", gap: 4 },
  actionLabel: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  backBtn: { position: "absolute", left: 14, zIndex: 20, backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 20, padding: 8 },
  backBtnEmpty: { position: "absolute", top: 60, left: 16, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, padding: 10 },
  counter: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 20 },
  counterText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
