import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { RichText } from "@/components/ui/RichText";
import Colors from "@/constants/colors";

const { width } = Dimensions.get("window");

type SavedPost = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  bookmarked_at: string;
  profile: { display_name: string; handle: string; avatar_url: string | null };
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function SavedPostCard({ item, onUnsave, index }: { item: SavedPost; onUnsave: (id: string) => void; index: number }) {
  const { colors } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay: index * 60, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface }]}
        onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
        activeOpacity={0.85}
      >
        <View style={styles.cardHeader}>
          <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}>
            <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={38} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardName, { color: colors.text }]}>{item.profile.display_name}</Text>
            <Text style={[styles.cardTime, { color: colors.textMuted }]}>
              @{item.profile.handle} · {formatRelative(item.created_at)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onUnsave(item.id); }}
            hitSlop={8}
          >
            <Ionicons name="bookmark" size={20} color={Colors.gold} />
          </TouchableOpacity>
        </View>

        <RichText style={[styles.cardContent, { color: colors.text }]} numberOfLines={4}>
          {item.content}
        </RichText>

        {item.image_url && (
          <Image
            source={{ uri: item.image_url }}
            style={[styles.img, { width: width - 64 }]}
            resizeMode="cover"
          />
        )}

        <View style={styles.savedBadge}>
          <Ionicons name="time-outline" size={11} color={colors.textMuted} />
          <Text style={[styles.savedBadgeText, { color: colors.textMuted }]}>
            Saved {formatRelative(item.bookmarked_at)}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function SavedPostsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSaved = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("post_bookmarks")
      .select(`
        created_at,
        posts(
          id, author_id, content, image_url, created_at,
          profiles!posts_author_id_fkey(display_name, handle, avatar_url)
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      const mapped = data
        .filter((b: any) => b.posts)
        .map((b: any) => ({
          id: b.posts.id,
          author_id: b.posts.author_id,
          content: b.posts.content || "",
          image_url: b.posts.image_url,
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
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  async function unsavePost(postId: string) {
    if (!user) return;
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    await supabase.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", user.id);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Saved Posts</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.brand} size="large" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <SavedPostCard item={item} onUnsave={unsavePost} index={index} />
          )}
          contentContainerStyle={{ gap: 8, paddingVertical: 12, paddingHorizontal: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSaved(); }} tintColor={Colors.brand} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name="bookmark-outline" size={40} color={Colors.gold} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No saved posts yet</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Tap the bookmark icon on any post to save it here
              </Text>
              <TouchableOpacity
                style={styles.discoverBtn}
                onPress={() => router.back()}
              >
                <Text style={styles.discoverBtnText}>Browse Discover</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  cardName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardContent: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 8 },
  img: { height: 180, borderRadius: 10, marginBottom: 10 },
  savedBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  savedBadgeText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingTop: 80 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40 },
  discoverBtn: { backgroundColor: Colors.brand, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  discoverBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
