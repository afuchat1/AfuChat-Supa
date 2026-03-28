import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

type Collection = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  item_count: number;
  created_at: string;
  is_private: boolean;
};

type CollectionItem = {
  id: string;
  item_type: "post" | "link" | "image" | "file";
  item_id: string;
  url?: string;
  title?: string;
  preview?: string;
  added_at: string;
};

const PALETTE = ["#4ECDC4", "#BF5AF2", "#FF9500", "#34C759", "#007AFF", "#FF3B30", "#D4A853", "#AF52DE"];
const EMOJIS = ["📁", "⭐", "💡", "📌", "🔖", "🎯", "🧠", "❤️", "🔥", "✨", "🎵", "📚"];

export default function CollectionsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmoji, setCreateEmoji] = useState("📁");
  const [createColor, setCreateColor] = useState(Colors.brand);
  const [createPrivate, setCreatePrivate] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadCollections = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("collections")
      .select("id, name, emoji, color, item_count, created_at, is_private")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setCollections(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  async function openCollection(col: Collection) {
    setSelectedCollection(col);
    setLoadingItems(true);
    const { data } = await supabase
      .from("collection_items")
      .select("id, item_type, item_id, url, title, preview, added_at")
      .eq("collection_id", col.id)
      .order("added_at", { ascending: false });
    setCollectionItems(data || []);
    setLoadingItems(false);
  }

  async function createCollection() {
    if (!user || !createName.trim()) { showAlert("Required", "Enter a collection name"); return; }
    setCreating(true);
    const { data, error } = await supabase.from("collections").insert({
      user_id: user.id, name: createName.trim(), emoji: createEmoji,
      color: createColor, is_private: createPrivate, item_count: 0,
    }).select().single();
    setCreating(false);
    if (error) { showAlert("Error", error.message); return; }
    setCollections((prev) => [data, ...prev]);
    setShowCreate(false);
    setCreateName(""); setCreateEmoji("📁"); setCreateColor(Colors.brand); setCreatePrivate(false);
    showAlert("Created!", `${createEmoji} ${createName} is ready`);
  }

  async function deleteCollection(col: Collection) {
    showAlert("Delete Collection?", `This will remove "${col.name}" and all its saved items.`, [
      { text: "Cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await supabase.from("collection_items").delete().eq("collection_id", col.id);
          await supabase.from("collections").delete().eq("id", col.id);
          setCollections((prev) => prev.filter((c) => c.id !== col.id));
        },
      },
    ]);
  }

  async function removeFromCollection(item: CollectionItem) {
    await supabase.from("collection_items").delete().eq("id", item.id);
    if (selectedCollection) {
      await supabase.from("collections").update({ item_count: Math.max(0, selectedCollection.item_count - 1) }).eq("id", selectedCollection.id);
    }
    setCollectionItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  const itemTypeIcon = (type: string) => {
    const m: Record<string, any> = { post: "newspaper-outline", link: "link-outline", image: "image-outline", file: "document-outline" };
    return m[type] || "bookmark-outline";
  };

  // Detail view
  if (selectedCollection) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setSelectedCollection(null)} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.colHeaderEmoji}>{selectedCollection.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{selectedCollection.name}</Text>
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              {selectedCollection.item_count} items · {selectedCollection.is_private ? "🔒 Private" : "Public"}
            </Text>
          </View>
          <TouchableOpacity onPress={() => deleteCollection(selectedCollection)} hitSlop={10}>
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          </TouchableOpacity>
        </View>

        {loadingItems ? (
          <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} />
        ) : collectionItems.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>{selectedCollection.emoji}</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Collection is empty</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>Save posts, links, and media here from anywhere in the app</Text>
          </View>
        ) : (
          <FlatList
            data={collectionItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => (
              <View style={[styles.itemRow, { backgroundColor: colors.surface }]}>
                <View style={[styles.itemIcon, { backgroundColor: selectedCollection.color + "18" }]}>
                  <Ionicons name={itemTypeIcon(item.item_type)} size={20} color={selectedCollection.color} />
                </View>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => item.url && router.push(item.url as any)}
                >
                  <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={2}>{item.title || item.url || "Saved item"}</Text>
                  <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
                    {item.item_type} · {new Date(item.added_at).toLocaleDateString()}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeFromCollection(item)} hitSlop={10}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>
    );
  }

  // Main grid view
  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Collections</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>Save posts, links & media in folders</Text>
        </View>
        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: Colors.brand }]}
          onPress={() => setShowCreate(true)}
        >
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} />
      ) : collections.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No collections yet</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Organize your saved content into folders</Text>
          <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: Colors.brand }]} onPress={() => setShowCreate(true)}>
            <Text style={styles.emptyBtnText}>Create Collection</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={collections}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
          columnWrapperStyle={{ gap: 10 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.colCard, { backgroundColor: colors.surface, flex: 1 }]}
              onPress={() => openCollection(item)}
              onLongPress={() => deleteCollection(item)}
            >
              <View style={[styles.colCardTop, { backgroundColor: item.color + "18" }]}>
                <Text style={styles.colEmoji}>{item.emoji}</Text>
                {item.is_private && <Ionicons name="lock-closed" size={12} color={item.color} style={{ position: "absolute", top: 8, right: 8 }} />}
              </View>
              <View style={styles.colCardBottom}>
                <Text style={[styles.colName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.colCount, { color: colors.textMuted }]}>{item.item_count} items</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Create collection modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Collection</Text>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Emoji</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 16 }}>
              {EMOJIS.map((e) => (
                <TouchableOpacity key={e} style={[styles.emojiBtn, createEmoji === e && { backgroundColor: Colors.brand + "33", borderColor: Colors.brand, borderWidth: 2 }]} onPress={() => setCreateEmoji(e)}>
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Name</Text>
            <View style={[styles.inputField, { backgroundColor: colors.backgroundTertiary }]}>
              <TextInput style={[styles.inputText, { color: colors.text }]} placeholder="Collection name" placeholderTextColor={colors.textMuted} value={createName} onChangeText={setCreateName} />
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Color</Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
              {PALETTE.map((c) => (
                <TouchableOpacity key={c} style={[styles.colorDot, { backgroundColor: c }, createColor === c && styles.colorDotSelected]} onPress={() => setCreateColor(c)} />
              ))}
            </View>

            <View style={styles.privateRow}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
              <Text style={[styles.privateLabel, { color: colors.text }]}>Private collection</Text>
              <TouchableOpacity
                style={[styles.toggle, { backgroundColor: createPrivate ? Colors.brand : colors.backgroundTertiary }]}
                onPress={() => setCreatePrivate((p) => !p)}
              >
                <View style={[styles.toggleThumb, { transform: [{ translateX: createPrivate ? 20 : 2 }] }]} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowCreate(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: Colors.brand, opacity: creating ? 0.7 : 1 }]} onPress={createCollection} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  colHeaderEmoji: { fontSize: 26 },
  createBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold" },
  colCard: { borderRadius: 16, overflow: "hidden" },
  colCardTop: { aspectRatio: 1.4, alignItems: "center", justifyContent: "center", position: "relative" },
  colEmoji: { fontSize: 40 },
  colCardBottom: { padding: 12 },
  colName: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 2 },
  colCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ffffff08" },
  itemIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  itemTitle: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 19 },
  itemMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 20 },
  inputLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 8 },
  emojiBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff0a" },
  inputField: { borderRadius: 12, paddingHorizontal: 14, height: 50, justifyContent: "center", marginBottom: 16 },
  inputText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorDotSelected: { borderWidth: 3, borderColor: "#fff" },
  privateRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 24 },
  privateLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  toggle: { width: 44, height: 24, borderRadius: 12, position: "relative", justifyContent: "center" },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", position: "absolute" },
  modalBtns: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  saveBtn: { flex: 2, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  saveBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
