import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image as RNImage,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { safeRouter } from "@/lib/navUtils";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";
import Colors from "@/constants/colors";
import { ListRowSkeleton } from "@/components/ui/Skeleton";

type Collection = {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  post_count: number;
  is_public: boolean;
  created_at: string;
};

export default function AfuCollectionsApp() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("collections")
      .select("id,title,description,cover_url,post_count,is_public,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setCollections((data as Collection[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  function renderItem({ item }: { item: Collection }) {
    return (
      <TouchableOpacity style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => showAlert(item.title, item.description || "No description")} activeOpacity={0.8}>
        {item.cover_url ? (
          <Image source={{ uri: item.cover_url }} style={s.cover} resizeMode="cover" />
        ) : (
          <View style={[s.coverPlaceholder, { backgroundColor: "#BF5AF222" }]}>
            <Ionicons name="albums" size={32} color="#BF5AF2" />
          </View>
        )}
        <View style={s.cardBody}>
          <Text style={[s.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[s.cardSub, { color: colors.textMuted }]}>{item.post_count || 0} posts</Text>
            <View style={[s.pill, { backgroundColor: item.is_public ? "#34C75918" : colors.inputBg }]}>
              <Ionicons name={item.is_public ? "earth" : "lock-closed"} size={10} color={item.is_public ? "#34C759" : colors.textMuted} />
              <Text style={[s.pillText, { color: item.is_public ? "#34C759" : colors.textMuted }]}>{item.is_public ? "Public" : "Private"}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { borderBottomColor: colors.border, paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => safeRouter.back("/apps")} hitSlop={10} style={{ width: 34, height: 40, alignItems: "center", justifyContent: "center" }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Collections</Text>
        <TouchableOpacity style={[s.addBtn, { backgroundColor: "#BF5AF2" }]} onPress={() => showAlert("New Collection", "Collection creation coming soon!")}>
          <Ionicons name="add" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={{ padding: 8, gap: 4 }}>
          {[1,2,3,4,5,6].map(i => <ListRowSkeleton key={i} />)}
        </View>
      ) : collections.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="albums-outline" size={56} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.text }]}>No collections yet</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>Create themed collections to organise and share your favourite posts.</Text>
          <TouchableOpacity style={[s.createBtn, { backgroundColor: "#BF5AF2" }]} onPress={() => showAlert("New Collection", "Collection creation coming soon!")}>
            <Text style={s.createBtnText}>Create Collection</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={collections}
          keyExtractor={c => c.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 32, gap: 10 }}
          showsVerticalScrollIndicator={false}
          bounces={false}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  addBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  card: { flex: 1, borderRadius: 16, borderWidth: 0.5, overflow: "hidden" },
  cover: { width: "100%", height: 100 },
  coverPlaceholder: { width: "100%", height: 100, alignItems: "center", justifyContent: "center" },
  cardBody: { padding: 10, gap: 5 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  pill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  pillText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  createBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginTop: 4 },
  createBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
