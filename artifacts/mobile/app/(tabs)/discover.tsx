import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import Colors from "@/constants/colors";

const { width } = Dimensions.get("window");

type PostItem = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  images: string[];
  created_at: string;
  view_count: number;
  is_verified: boolean;
  profile: { display_name: string; handle: string; avatar_url: string | null };
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function PostCard({ item }: { item: PostItem }) {
  const { colors } = useTheme();
  const allImages = item.images.length > 0 ? item.images : item.image_url ? [item.image_url] : [];
  const imgW = allImages.length === 1 ? width - 48 : (width - 56) / 2;

  function openPost() {
    router.push({ pathname: "/post/[id]", params: { id: item.id } });
  }

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: colors.surface }]} onPress={openPost} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <TouchableOpacity onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.author_id } })}>
          <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={40} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={[styles.cardName, { color: colors.text }]}>{item.profile.display_name}</Text>
            {item.is_verified && (
              <Ionicons name="checkmark-circle" size={13} color={Colors.brand} style={{ marginLeft: 4 }} />
            )}
          </View>
          <Text style={[styles.cardTime, { color: colors.textMuted }]}>
            @{item.profile.handle} {formatRelative(item.created_at)}
          </Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
      </View>

      <Text style={[styles.cardContent, { color: colors.text }]}>{item.content}</Text>

      {allImages.length > 0 && (
        <View style={styles.images}>
          {allImages.map((uri, i) => (
            <Image
              key={i}
              source={{ uri }}
              style={[styles.img, { width: imgW, height: imgW * 0.75 }]}
              resizeMode="cover"
            />
          ))}
        </View>
      )}

      <View style={[styles.cardFooter, { borderTopColor: colors.separator }]}>
        <TouchableOpacity
          style={styles.action}
          onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); }}
        >
          <Ionicons name="heart-outline" size={18} color={colors.textMuted} />
          <Text style={[styles.actionText, { color: colors.textMuted }]}>Like</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action} onPress={openPost}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
          <Text style={[styles.actionText, { color: colors.textMuted }]}>Reply</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action}>
          <Ionicons name="share-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.viewCount}>
          <Ionicons name="eye-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.viewText, { color: colors.textMuted }]}>{item.view_count}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPosts = useCallback(async () => {
    const { data } = await supabase
      .from("posts")
      .select(`
        id, author_id, content, image_url, created_at, view_count,
        profiles!posts_author_id_fkey(display_name, handle, avatar_url, is_verified),
        post_images(image_url, display_order)
      `)
      .eq("is_blocked", false)
      .order("created_at", { ascending: false })
      .limit(30);

    if (data) {
      const items: PostItem[] = data.map((p: any) => ({
        id: p.id,
        author_id: p.author_id,
        content: p.content || "",
        image_url: p.image_url,
        images: (p.post_images || [])
          .sort((a: any, b: any) => a.display_order - b.display_order)
          .map((i: any) => i.image_url),
        created_at: p.created_at,
        view_count: p.view_count || 0,
        is_verified: p.profiles?.is_verified || false,
        profile: {
          display_name: p.profiles?.display_name || "User",
          handle: p.profiles?.handle || "user",
          avatar_url: p.profiles?.avatar_url || null,
        },
      }));
      setPosts(items);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.text }]}>Discover</Text>
        <TouchableOpacity
          onPress={() => router.push("/moments/create")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add-circle-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PostCard item={item} />}
          contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadPosts(); }}
              tintColor={Colors.brand}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="newspaper-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No posts yet</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Share what's on your mind
              </Text>
              <TouchableOpacity
                style={styles.createBtn}
                onPress={() => router.push("/moments/create")}
              >
                <Text style={styles.createBtnText}>Create Post</Text>
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
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  card: {
    marginHorizontal: 8,
    borderRadius: 16,
    overflow: "hidden",
    paddingTop: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 10,
  },
  nameRow: { flexDirection: "row", alignItems: "center" },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardTime: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardContent: { fontSize: 15, fontFamily: "Inter_400Regular", paddingHorizontal: 14, marginBottom: 10, lineHeight: 22 },
  images: { flexDirection: "row", flexWrap: "wrap", gap: 4, paddingHorizontal: 14, marginBottom: 2 },
  img: { borderRadius: 8 },
  cardFooter: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    gap: 20,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  viewCount: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: "auto" },
  viewText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  createBtn: { backgroundColor: Colors.brand, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  createBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
