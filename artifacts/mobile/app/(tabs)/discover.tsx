import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
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

type Moment = {
  id: string;
  user_id: string;
  content: string;
  images: string[];
  created_at: string;
  likes: number;
  comments: number;
  user_liked: boolean;
  profile: { display_name: string; avatar_url: string | null };
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function MomentCard({ item, onLike }: { item: Moment; onLike: (id: string) => void }) {
  const { colors } = useTheme();
  const imgW = item.images.length === 1 ? width - 32 : (width - 44) / 2;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.cardHeader}>
        <Avatar uri={item.profile.avatar_url} name={item.profile.display_name} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: colors.text }]}>{item.profile.display_name}</Text>
          <Text style={[styles.cardTime, { color: colors.textMuted }]}>{formatRelative(item.created_at)}</Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
      </View>

      {item.content ? (
        <Text style={[styles.cardContent, { color: colors.text }]}>{item.content}</Text>
      ) : null}

      {item.images.length > 0 && (
        <View style={styles.images}>
          {item.images.map((uri, i) => (
            <Image
              key={i}
              source={{ uri }}
              style={[styles.img, { width: imgW, height: imgW }]}
              resizeMode="cover"
            />
          ))}
        </View>
      )}

      <View style={[styles.cardFooter, { borderTopColor: colors.separator }]}>
        <TouchableOpacity
          style={styles.action}
          onPress={() => {
            Haptics.selectionAsync();
            onLike(item.id);
          }}
        >
          <Ionicons
            name={item.user_liked ? "heart" : "heart-outline"}
            size={18}
            color={item.user_liked ? "#FF3B30" : colors.textMuted}
          />
          <Text style={[styles.actionText, { color: colors.textMuted }]}>{item.likes}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
          <Text style={[styles.actionText, { color: colors.textMuted }]}>{item.comments}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.action}>
          <Ionicons name="share-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMoments = useCallback(async () => {
    const { data } = await supabase
      .from("moments")
      .select(`
        id, user_id, content, images, created_at, likes, comments,
        profiles!moments_user_id_fkey(display_name, avatar_url)
      `)
      .order("created_at", { ascending: false })
      .limit(30);

    if (data) {
      const items: Moment[] = data.map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        content: m.content || "",
        images: m.images || [],
        created_at: m.created_at,
        likes: m.likes || 0,
        comments: m.comments || 0,
        user_liked: false,
        profile: {
          display_name: m.profiles?.display_name || "User",
          avatar_url: m.profiles?.avatar_url || null,
        },
      }));
      setMoments(items);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadMoments(); }, [loadMoments]);

  async function handleLike(id: string) {
    setMoments((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, user_liked: !m.user_liked, likes: m.likes + (m.user_liked ? -1 : 1) }
          : m
      )
    );
    await supabase.rpc("toggle_moment_like", { moment_id: id, liker_id: user?.id });
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.text }]}>Moments</Text>
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
          data={moments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MomentCard item={item} onLike={handleLike} />}
          contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingBottom: 90 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadMoments(); }}
              tintColor={Colors.brand}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="images-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No moments yet</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Share what's on your mind
              </Text>
              <TouchableOpacity
                style={styles.createBtn}
                onPress={() => router.push("/moments/create")}
              >
                <Text style={styles.createBtnText}>Create Moment</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  createBtn: { backgroundColor: Colors.brand, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  createBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
