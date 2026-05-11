import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { RichText } from "@/components/ui/RichText";
import Colors from "@/constants/colors";
import { encodeId } from "@/lib/shortId";
import { PostSkeleton, ListRowSkeleton } from "@/components/ui/Skeleton";

type Tab = "all" | "posts" | "messages" | "collections";

type SavedPost = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  images: string[];
  post_type: string;
  video_url: string | null;
  article_title: string | null;
  created_at: string;
  bookmarked_at: string;
  profile: { display_name: string; handle: string; avatar_url: string | null };
};

type StarredMessage = {
  id: string;
  message_id: string;
  chat_id: string;
  content: string;
  sender_id: string;
  sender_name: string;
  sender_avatar: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  starred_at: string;
};

type Collection = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  item_count: number;
  created_at: string;
  is_private: boolean;
};

function fmtRel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function PostTypeTag({ type, colors }: { type: string; colors: any }) {
  if (type === "video") return (
    <View style={[st.typeTag, { backgroundColor: "#FF3B30" + "20" }]}>
      <Ionicons name="videocam" size={10} color="#FF3B30" />
      <Text style={[st.typeTagText, { color: "#FF3B30" }]}>Video</Text>
    </View>
  );
  if (type === "article") return (
    <View style={[st.typeTag, { backgroundColor: "#007AFF" + "20" }]}>
      <Ionicons name="newspaper-outline" size={10} color="#007AFF" />
      <Text style={[st.typeTagText, { color: "#007AFF" }]}>Article</Text>
    </View>
  );
  if (type === "photo" || type === "image") return (
    <View style={[st.typeTag, { backgroundColor: "#FF9500" + "20" }]}>
      <Ionicons name="image-outline" size={10} color="#FF9500" />
      <Text style={[st.typeTagText, { color: "#FF9500" }]}>Photo</Text>
    </View>
  );
  return null;
}

function SavedPostCard({ item, onUnsave, index }: { item: SavedPost; onUnsave: (id: string) => void; index: number }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const allImages = item.images.length > 0 ? item.images : item.image_url ? [item.image_url] : [];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, delay: index * 50, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, delay: index * 50, useNativeDriver: true }),
    ]).start();
  }, []);

  function handlePress() {
    if (item.post_type === "video") router.push({ pathname: "/video/[id]", params: { id: item.id } });
    else router.push({ pathname: "/p/[id]", params: { id: encodeId(item.id) } });
  }

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity
        style={[st.card, { backgroundColor: colors.surface }]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <View style={st.cardHeader}>
          <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}>
            <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={36} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[st.cardName, { color: colors.text }]} numberOfLines={1}>{item.profile.display_name}</Text>
              <PostTypeTag type={item.post_type} colors={colors} />
            </View>
            <Text style={[st.cardTime, { color: colors.textMuted }]}>@{item.profile.handle} · {fmtRel(item.created_at)}</Text>
          </View>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onUnsave(item.id); }}
            hitSlop={8}
          >
            <Ionicons name="bookmark" size={20} color={Colors.gold} />
          </TouchableOpacity>
        </View>

        {item.article_title && item.post_type === "article" && (
          <Text style={[st.articleTitle, { color: colors.text }]} numberOfLines={2}>{item.article_title}</Text>
        )}

        {!!item.content && (
          <RichText style={[st.cardContent, { color: colors.text }]} numberOfLines={4}>
            {item.content}
          </RichText>
        )}

        {item.post_type === "video" && (
          <View style={[st.videoThumb, { width: width - 64 }]}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="videocam" size={32} color="rgba(255,255,255,0.6)" />
              </View>
            )}
            <View style={st.videoOverlay}>
              <Ionicons name="play-circle" size={36} color="#fff" />
            </View>
          </View>
        )}

        {allImages.length > 0 && item.post_type !== "video" && (
          <View style={{ flexDirection: "row", gap: 4, marginBottom: 8 }}>
            {allImages.slice(0, 3).map((uri, i) => (
              <Image
                key={i}
                source={{ uri }}
                style={[st.thumb, { width: allImages.length === 1 ? width - 64 : (width - 80) / Math.min(allImages.length, 3) }]}
                resizeMode="cover"
              />
            ))}
            {allImages.length > 3 && (
              <View style={[st.moreOverlay, { backgroundColor: colors.backgroundSecondary }]}>
                <Text style={[st.moreText, { color: colors.text }]}>+{allImages.length - 3}</Text>
              </View>
            )}
          </View>
        )}

        <View style={st.savedBadge}>
          <Ionicons name="bookmark-outline" size={11} color={Colors.gold} />
          <Text style={[st.savedBadgeText, { color: colors.textMuted }]}>Saved {fmtRel(item.bookmarked_at)}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function StarredMessageCard({ item, onUnstar, index }: { item: StarredMessage; onUnstar: (id: string) => void; index: number }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const isPhoto = item.attachment_type === "image" || item.attachment_type === "photo";
  const isAudio = item.attachment_type === "audio";
  const isFile = item.attachment_type === "file";

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, delay: index * 50, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, delay: index * 50, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity
        style={[st.card, { backgroundColor: colors.surface }]}
        onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.chat_id } })}
        activeOpacity={0.85}
      >
        <View style={st.cardHeader}>
          <Avatar uri={item.sender_avatar} name={item.sender_name} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={[st.cardName, { color: colors.text }]}>{item.sender_name}</Text>
            <Text style={[st.cardTime, { color: colors.textMuted }]}>{fmtRel(item.starred_at)}</Text>
          </View>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onUnstar(item.id); }}
            hitSlop={8}
          >
            <Ionicons name="star" size={18} color={Colors.gold} />
          </TouchableOpacity>
        </View>

        {!!item.content && !["📷 Photo", "🎥 Video", "GIF"].includes(item.content) && (
          <View style={[st.msgBubble, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[st.msgText, { color: colors.text }]} numberOfLines={5}>{item.content}</Text>
          </View>
        )}

        {isPhoto && item.attachment_url && (
          <Image source={{ uri: item.attachment_url }} style={[st.thumb, { width: width - 64 }]} resizeMode="cover" />
        )}

        {isAudio && (
          <View style={[st.attachRow, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="mic-outline" size={18} color={colors.accent} />
            <Text style={[st.attachLabel, { color: colors.textSecondary }]}>Voice message</Text>
          </View>
        )}

        {isFile && (
          <View style={[st.attachRow, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="document-outline" size={18} color={colors.accent} />
            <Text style={[st.attachLabel, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.attachment_url?.split("/").pop() || "File"}
            </Text>
          </View>
        )}

        <View style={st.savedBadge}>
          <Ionicons name="star-outline" size={11} color={Colors.gold} />
          <Text style={[st.savedBadgeText, { color: colors.textMuted }]}>Starred · tap to open chat</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function CollectionCard({ item, index }: { item: Collection; index: number }) {
  const { colors } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 250, delay: index * 60, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <TouchableOpacity
        style={[st.collectionCard, { backgroundColor: colors.surface }]}
        onPress={() => router.push("/collections")}
        activeOpacity={0.82}
      >
        <View style={[st.collectionIcon, { backgroundColor: item.color + "22" }]}>
          <Text style={{ fontSize: 28 }}>{item.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text style={[st.collectionName, { color: colors.text }]}>{item.name}</Text>
            {item.is_private && <Ionicons name="lock-closed" size={12} color={colors.textMuted} />}
          </View>
          <Text style={[st.collectionSub, { color: colors.textMuted }]}>
            {item.item_count} item{item.item_count !== 1 ? "s" : ""}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

function EmptyState({ icon, color, title, sub, onAction, actionLabel }: {
  icon: string; color: string; title: string; sub: string; onAction?: () => void; actionLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={st.emptyWrap}>
      <View style={[st.emptyIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name={icon as any} size={38} color={color} />
      </View>
      <Text style={[st.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[st.emptySub, { color: colors.textSecondary }]}>{sub}</Text>
      {onAction && (
        <TouchableOpacity style={[st.emptyBtn, { backgroundColor: colors.accent }]} onPress={onAction}>
          <Text style={st.emptyBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function SavedScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>((params.tab as Tab) ?? "all");
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [messages, setMessages] = useState<StarredMessage[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const [bkRes, msgRes, colRes] = await Promise.all([
      supabase
        .from("post_bookmarks")
        .select(`
          created_at,
          posts(
            id, author_id, content, image_url, created_at, post_type, video_url, article_title,
            profiles!posts_author_id_fkey(display_name, handle, avatar_url),
            post_images(image_url, display_order)
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),

      supabase
        .from("starred_messages")
        .select("id, message_id, chat_id, content, sender_id, sender_name, sender_avatar, attachment_url, attachment_type, starred_at")
        .eq("user_id", user.id)
        .order("starred_at", { ascending: false })
        .limit(100),

      supabase
        .from("collections")
        .select("id, name, emoji, color, item_count, created_at, is_private")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (bkRes.data) {
      const mapped = bkRes.data
        .filter((b: any) => b.posts)
        .map((b: any) => ({
          id: b.posts.id,
          author_id: b.posts.author_id,
          content: b.posts.content || "",
          image_url: b.posts.image_url,
          images: (b.posts.post_images || [])
            .sort((a: any, z: any) => a.display_order - z.display_order)
            .map((i: any) => i.image_url),
          post_type: b.posts.post_type || "post",
          video_url: b.posts.video_url || null,
          article_title: b.posts.article_title || null,
          created_at: b.posts.created_at,
          bookmarked_at: b.created_at,
          profile: {
            display_name: b.posts.profiles?.display_name || "User",
            handle: b.posts.profiles?.handle || "user",
            avatar_url: b.posts.profiles?.avatar_url || null,
          },
        }));
      setPosts(mapped);
    }

    if (msgRes.data) setMessages(msgRes.data as StarredMessage[]);
    if (colRes.data) setCollections(colRes.data as Collection[]);

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function unsavePost(postId: string) {
    if (!user) return;
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    await supabase.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", user.id);
  }

  async function unstarMessage(starId: string) {
    if (!user) return;
    setMessages((prev) => prev.filter((m) => m.id !== starId));
    await supabase.from("starred_messages").delete().eq("id", starId).eq("user_id", user.id);
  }

  const TABS: { key: Tab; label: string; icon: string; count: number }[] = [
    { key: "all", label: "All", icon: "layers-outline", count: posts.length + messages.length + collections.length },
    { key: "posts", label: "Posts", icon: "newspaper-outline", count: posts.length },
    { key: "messages", label: "Messages", icon: "star-outline", count: messages.length },
    { key: "collections", label: "Collections", icon: "albums-outline", count: collections.length },
  ];

  type FeedItem =
    | { kind: "post"; data: SavedPost; ts: string }
    | { kind: "message"; data: StarredMessage; ts: string }
    | { kind: "collection"; data: Collection; ts: string };

  const allFeed: FeedItem[] = [
    ...posts.map((p) => ({ kind: "post" as const, data: p, ts: p.bookmarked_at })),
    ...messages.map((m) => ({ kind: "message" as const, data: m, ts: m.starred_at })),
    ...collections.map((c) => ({ kind: "collection" as const, data: c, ts: c.created_at })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const totalCount = posts.length + messages.length + collections.length;

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader
        title="Saved"
        subtitle={!loading && totalCount > 0 ? `${totalCount} item${totalCount !== 1 ? "s" : ""}` : undefined}
        right={
          <TouchableOpacity onPress={() => router.push("/collections")} hitSlop={12}>
            <Ionicons name="add-circle-outline" size={24} color={colors.accent} />
          </TouchableOpacity>
        }
      />

      <View style={[st.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tabBarInner}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[st.tabBtn, active && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
                onPress={() => setTab(t.key)}
                activeOpacity={0.75}
              >
                <Ionicons name={t.icon as any} size={15} color={active ? colors.accent : colors.textMuted} />
                <Text style={[st.tabLabel, { color: active ? colors.accent : colors.textMuted, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                  {t.label}
                </Text>
                {t.count > 0 && (
                  <View style={[st.tabCount, { backgroundColor: active ? colors.accent : colors.backgroundSecondary }]}>
                    <Text style={[st.tabCountText, { color: active ? "#fff" : colors.textMuted }]}>{t.count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ padding: 10, gap: 10 }}>
          {tab === "collections"
            ? [1, 2, 3].map((i) => <ListRowSkeleton key={i} />)
            : [1, 2, 3].map((i) => <PostSkeleton key={i} />)
          }
        </View>
      ) : (
        <FlatList
          data={
            tab === "all" ? allFeed :
            tab === "posts" ? posts.map((p) => ({ kind: "post" as const, data: p, ts: p.bookmarked_at })) :
            tab === "messages" ? messages.map((m) => ({ kind: "message" as const, data: m, ts: m.starred_at })) :
            collections.map((c) => ({ kind: "collection" as const, data: c, ts: c.created_at }))
          }
          keyExtractor={(item) => `${item.kind}-${item.data.id}`}
          contentContainerStyle={{ gap: 8, paddingVertical: 10, paddingHorizontal: 8, paddingBottom: 50 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadAll(); }}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item, index }) => {
            if (item.kind === "post") return <SavedPostCard item={item.data as SavedPost} onUnsave={unsavePost} index={index} />;
            if (item.kind === "message") return <StarredMessageCard item={item.data as StarredMessage} onUnstar={unstarMessage} index={index} />;
            return <CollectionCard item={item.data as Collection} index={index} />;
          }}
          ListEmptyComponent={
            tab === "all" ? (
              <EmptyState
                icon="bookmark-outline"
                color={Colors.gold}
                title="Nothing saved yet"
                sub={"Bookmark posts, star messages,\nand create collections — they all appear here."}
                onAction={() => router.back()}
                actionLabel="Browse Discover"
              />
            ) : tab === "posts" ? (
              <EmptyState
                icon="newspaper-outline"
                color="#007AFF"
                title="No saved posts"
                sub="Tap the bookmark icon on any post to save it here"
                onAction={() => router.back()}
                actionLabel="Browse Discover"
              />
            ) : tab === "messages" ? (
              <EmptyState
                icon="star-outline"
                color={Colors.gold}
                title="No starred messages"
                sub={"Long-press any message in a chat\nand tap Star to save it here"}
              />
            ) : (
              <EmptyState
                icon="albums-outline"
                color="#BF5AF2"
                title="No collections yet"
                sub="Create themed collections to organise posts, links, and images"
                onAction={() => router.push("/collections")}
                actionLabel="Create Collection"
              />
            )
          }
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabBarInner: { flexDirection: "row", paddingHorizontal: 8 },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 2,
  },
  tabLabel: { fontSize: 13 },
  tabCount: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: "center" },
  tabCountText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  card: { borderRadius: 16, overflow: "hidden", padding: 14 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  cardName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  cardContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, marginBottom: 8 },
  articleTitle: { fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 21, marginBottom: 6 },

  typeTag: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typeTagText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  thumb: { height: 150, borderRadius: 10, marginBottom: 8 },
  moreOverlay: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 8,
    width: 50,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { fontSize: 16, fontFamily: "Inter_700Bold" },

  videoThumb: { height: 160, borderRadius: 10, marginBottom: 8, overflow: "hidden", backgroundColor: "#111" },
  videoOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },

  msgBubble: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  msgText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },

  attachRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  attachLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },

  savedBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  savedBadgeText: { fontSize: 11, fontFamily: "Inter_400Regular" },

  collectionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 14,
  },
  collectionIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  collectionName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  collectionSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  emptyWrap: { alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 4 },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
