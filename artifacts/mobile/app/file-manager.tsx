import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";

type MediaType = "images" | "videos" | "documents" | "links" | "voice" | "pinned";

type MediaItem = {
  id: string;
  url: string;
  type: "image" | "video" | "document" | "link" | "voice";
  name: string;
  size?: string;
  date: string;
  sender_name: string;
  chat_id?: string;
  is_pinned?: boolean;
};

const TAB_DEFS: { key: MediaType; label: string; icon: string }[] = [
  { key: "images", label: "Images", icon: "image" },
  { key: "videos", label: "Videos", icon: "film" },
  { key: "documents", label: "Docs", icon: "document-text" },
  { key: "links", label: "Links", icon: "link" },
  { key: "voice", label: "Voice", icon: "mic" },
  { key: "pinned", label: "Pinned", icon: "pin" },
];

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    if (diff < 604800000) return d.toLocaleDateString("en-US", { weekday: "short" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return ""; }
}

export default function FileManagerScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<MediaType>("images");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSize, setTotalSize] = useState("—");
  const [pinning, setPinning] = useState<string | null>(null);

  const loadMedia = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    if (activeTab === "pinned") {
      const { data } = await supabase
        .from("pinned_media")
        .select("id, url, media_type, name, file_size, created_at, sender_name, chat_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40);

      setItems((data || []).map((d: any) => ({
        id: d.id, url: d.url, type: d.media_type, name: d.name || "File",
        size: d.file_size, date: d.created_at, sender_name: d.sender_name || "You",
        chat_id: d.chat_id, is_pinned: true,
      })));
    } else {
      const mediaTypeMap: Record<MediaType, string> = {
        images: "image", videos: "video", documents: "document", links: "link", voice: "voice", pinned: "image",
      };
      const mType = mediaTypeMap[activeTab];

      const { data } = await supabase
        .from("chat_media")
        .select("id, url, media_type, file_name, file_size, created_at, sender_id, chat_id, profiles!chat_media_sender_id_fkey(display_name)")
        .eq("receiver_id", user.id)
        .eq("media_type", mType)
        .order("created_at", { ascending: false })
        .limit(60);

      setItems((data || []).map((d: any) => ({
        id: d.id, url: d.url, type: d.media_type, name: d.file_name || d.url?.split("/").pop() || "File",
        size: d.file_size ? `${Math.round(d.file_size / 1024)}KB` : undefined,
        date: d.created_at, sender_name: d.profiles?.display_name || "User",
        chat_id: d.chat_id, is_pinned: false,
      })));
    }

    setLoading(false);
  }, [user, activeTab]);

  useEffect(() => { loadMedia(); }, [loadMedia]);

  async function pinItem(item: MediaItem) {
    if (!user) return;
    setPinning(item.id);
    await supabase.from("pinned_media").upsert({
      user_id: user.id, url: item.url, media_type: item.type,
      name: item.name, chat_id: item.chat_id, sender_name: item.sender_name,
    }, { onConflict: "user_id,url" });
    showAlert("Pinned!", `${item.name} added to Pinned`);
    setPinning(null);
  }

  async function unpinItem(item: MediaItem) {
    if (!user) return;
    await supabase.from("pinned_media").delete().eq("url", item.url).eq("user_id", user.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  const renderImageItem = ({ item }: { item: MediaItem }) => (
    <View style={styles.imgCell}>
      <Image source={{ uri: item.url }} style={styles.imgThumb} resizeMode="cover" />
      <TouchableOpacity style={styles.imgPin} onPress={() => item.is_pinned ? unpinItem(item) : pinItem(item)} disabled={pinning === item.id}>
        {pinning === item.id
          ? <ActivityIndicator size="small" color="#fff" />
          : <Ionicons name={item.is_pinned ? "pin" : "pin-outline"} size={14} color="#fff" />}
      </TouchableOpacity>
    </View>
  );

  const renderListItem = ({ item }: { item: MediaItem }) => (
    <View style={[styles.listRow, { backgroundColor: colors.surface }]}>
      <View style={[styles.fileIconWrap, { backgroundColor: Colors.brand + "18" }]}>
        <Ionicons
          name={item.type === "document" ? "document-text" : item.type === "link" ? "link" : item.type === "voice" ? "mic" : "film"}
          size={24}
          color={Colors.brand}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.fileMeta, { color: colors.textMuted }]}>
          {item.sender_name} · {formatDate(item.date)}{item.size ? ` · ${item.size}` : ""}
        </Text>
      </View>
      <TouchableOpacity hitSlop={10} onPress={() => item.is_pinned ? unpinItem(item) : pinItem(item)} disabled={pinning === item.id}>
        {pinning === item.id
          ? <ActivityIndicator size="small" color={Colors.brand} />
          : <Ionicons name={item.is_pinned ? "pin" : "pin-outline"} size={18} color={item.is_pinned ? Colors.brand : colors.textMuted} />}
      </TouchableOpacity>
    </View>
  );

  const isGrid = activeTab === "images" || activeTab === "videos";
  const numCols = isGrid ? 3 : 1;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>File Manager</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>All your shared media & documents</Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/search" as any)} hitSlop={10}>
          <Ionicons name="search-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Storage summary */}
      <View style={[styles.storageBanner, { backgroundColor: Colors.brand + "18" }]}>
        <Ionicons name="cloud-outline" size={18} color={Colors.brand} />
        <Text style={[styles.storageText, { color: Colors.brand }]}>
          {items.length} {activeTab} shared with you
        </Text>
        {activeTab === "pinned" && <Text style={[styles.storageText, { color: Colors.brand }]}> · Pinned items</Text>}
      </View>

      {/* Type tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
        {TAB_DEFS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.typeTab, { backgroundColor: activeTab === t.key ? Colors.brand : colors.surface }]}
            onPress={() => setActiveTab(t.key)}
          >
            <Ionicons name={t.icon as any} size={14} color={activeTab === t.key ? "#fff" : colors.textMuted} />
            <Text style={[styles.typeTabText, { color: activeTab === t.key ? "#fff" : colors.textMuted }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name={TAB_DEFS.find((t) => t.key === activeTab)?.icon as any || "folder-outline"} size={56} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No {activeTab} yet</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {activeTab === "pinned" ? "Pin important media from chats to find them here" : "Files shared in chats appear here"}
          </Text>
        </View>
      ) : (
        <FlatList
          key={numCols}
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={numCols}
          renderItem={isGrid ? renderImageItem : renderListItem}
          contentContainerStyle={isGrid ? { padding: 2, paddingBottom: 40 } : { paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  storageBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  storageText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  typeTab: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  typeTabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  imgCell: { flex: 1 / 3, aspectRatio: 1, margin: 1.5, position: "relative" },
  imgThumb: { flex: 1, borderRadius: 4 },
  imgPin: { position: "absolute", top: 5, right: 5, backgroundColor: "#00000077", borderRadius: 10, padding: 4 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ffffff08" },
  fileIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  fileName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  fileMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
});
