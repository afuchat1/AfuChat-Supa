// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { ImageViewer, useImageViewer } from "@/components/ImageViewer";
import Colors from "@/constants/colors";
import { showAlert } from "@/lib/alert";
import { ComingSoonView } from "@/components/ui/ComingSoonView";

type MediaType = "all" | "images" | "videos" | "documents" | "voice" | "links" | "pinned";

type MediaItem = {
  id: string;
  url: string;
  type: "image" | "video" | "document" | "link" | "voice";
  name: string;
  size?: number;
  date: string;
  sender_name: string;
  chat_id?: string;
  is_pinned?: boolean;
  duration?: string;
  mime?: string;
};

const TABS: { key: MediaType; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "grid-outline" },
  { key: "images", label: "Images", icon: "image-outline" },
  { key: "videos", label: "Videos", icon: "film-outline" },
  { key: "documents", label: "Docs", icon: "document-text-outline" },
  { key: "voice", label: "Voice", icon: "mic-outline" },
  { key: "links", label: "Links", icon: "link-outline" },
  { key: "pinned", label: "Pinned", icon: "pin-outline" },
];

const ATTACH_TYPES: Record<MediaType, string[]> = {
  all: ["image", "photo", "video", "document", "file", "pdf", "link", "url", "audio", "voice"],
  images: ["image", "photo"],
  videos: ["video"],
  documents: ["document", "file", "pdf"],
  links: ["link", "url"],
  voice: ["audio", "voice"],
  pinned: [],
};

const TYPE_COLORS: Record<string, string> = {
  image: "#00BCD4", video: "#FF2D55", document: "#007AFF",
  link: "#34C759", voice: "#AF52DE", default: "#8E8E93",
};

const FILE_ICONS: Record<string, string> = {
  pdf: "document-text", doc: "document-text", docx: "document-text",
  xls: "grid", xlsx: "grid", ppt: "easel", txt: "reader",
  zip: "archive", mp3: "musical-notes", default: "document-outline",
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    if (diff < 604800000) return d.toLocaleDateString("en-US", { weekday: "short" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
  } catch { return ""; }
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

function getFileIcon(name: string): string {
  const ext = getExt(name);
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

export default function FileManagerScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const imgViewer = useImageViewer();

  const [activeTab, setActiveTab] = useState<MediaType>("all");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [pinning, setPinning] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "name" | "size">("date");

  const CELL = Math.floor((width - 4) / 3);

  const loadMedia = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    if (activeTab === "pinned") {
      const { data } = await supabase
        .from("pinned_media")
        .select("id, url, media_type, name, file_size, created_at, sender_name, chat_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      setItems((data || []).map((d: any) => ({
        id: d.id, url: d.url, type: d.media_type, name: d.name || "File",
        size: d.file_size ? Number(d.file_size) : undefined,
        date: d.created_at, sender_name: d.sender_name || "You",
        chat_id: d.chat_id, is_pinned: true,
      })));
    } else {
      const types = ATTACH_TYPES[activeTab];
      const [chatRes, msgRes] = await Promise.all([
        supabase.from("chat_media")
          .select("id, url, media_type, file_name, file_size, created_at, sender_id, chat_id")
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .in("media_type", types)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("messages")
          .select("id, attachment_url, attachment_type, attachment_name, attachment_size, sent_at, sender_id, chat_id, profiles!messages_sender_id_fkey(display_name)")
          .eq("sender_id", user.id)
          .not("attachment_url", "is", null)
          .in("attachment_type", types)
          .order("sent_at", { ascending: false })
          .limit(100),
      ]);

      const mapType = (raw: string): MediaItem["type"] => {
        const t = (raw || "").toLowerCase();
        if (t.includes("image") || t.includes("photo")) return "image";
        if (t.includes("video")) return "video";
        if (t.includes("audio") || t.includes("voice")) return "voice";
        if (t.includes("link") || t.includes("url")) return "link";
        return "document";
      };

      const chatItems: MediaItem[] = (chatRes.data || []).map((d: any) => ({
        id: `cm_${d.id}`, url: d.url, type: mapType(d.media_type),
        name: d.file_name || d.url?.split("/").pop() || "File",
        size: d.file_size ? Number(d.file_size) : undefined,
        date: d.created_at, sender_name: "You", chat_id: d.chat_id, is_pinned: false,
      }));

      const msgItems: MediaItem[] = (msgRes.data || [])
        .filter((m: any) => m.attachment_url)
        .map((m: any) => ({
          id: `msg_${m.id}`, url: m.attachment_url, type: mapType(m.attachment_type),
          name: m.attachment_name || m.attachment_url?.split("/").pop() || "Attachment",
          size: m.attachment_size ? Number(m.attachment_size) : undefined,
          date: m.sent_at, sender_name: m.profiles?.display_name || "You",
          chat_id: m.chat_id, is_pinned: false,
        }));

      const seen = new Set<string>();
      const merged = [...chatItems, ...msgItems].filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      });

      const counts: Record<string, number> = {};
      merged.forEach((m) => { counts[m.type] = (counts[m.type] || 0) + 1; });
      setTabCounts(counts);

      merged.sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "size") return (b.size || 0) - (a.size || 0);
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      setItems(merged);
    }
    setLoading(false);
  }, [user, activeTab, sortBy]);

  useEffect(() => { loadMedia(); }, [loadMedia]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.sender_name.toLowerCase().includes(q));
  }, [items, search]);

  async function pinItem(item: MediaItem) {
    if (!user) return;
    setPinning(item.id);
    await supabase.from("pinned_media").upsert({
      user_id: user.id, url: item.url, media_type: item.type,
      name: item.name, chat_id: item.chat_id, sender_name: item.sender_name,
    }, { onConflict: "user_id,url" });
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_pinned: true } : i));
    setPinning(null);
  }

  async function unpinItem(item: MediaItem) {
    if (!user) return;
    await supabase.from("pinned_media").delete().eq("url", item.url).eq("user_id", user.id);
    if (activeTab === "pinned") setItems((prev) => prev.filter((i) => i.id !== item.id));
    else setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_pinned: false } : i));
  }

  async function downloadFile(item: MediaItem) {
    if (Platform.OS === "web") { showAlert("Download", "Open in browser to download."); return; }
    setDownloading(item.id);
    try {
      const ext = getExt(item.name) || (item.type === "image" ? "jpg" : item.type === "video" ? "mp4" : "file");
      const dest = (FileSystem as any).documentDirectory + `${Date.now()}_${item.name || `file.${ext}`}`;
      await FileSystem.downloadAsync(item.url, dest);
      const Sharing = await import("expo-sharing");
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest);
      } else {
        showAlert("Saved", `File saved to: ${dest}`);
      }
    } catch {
      showAlert("Error", "Could not download file.");
    }
    setDownloading(null);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  async function deleteSelected() {
    showAlert("Delete Selected", `Remove ${selected.size} item(s)?`, [
      { text: "Cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          const ids = Array.from(selected);
          for (const id of ids) {
            const item = items.find((i) => i.id === id);
            if (item?.is_pinned) {
              await supabase.from("pinned_media").delete().eq("url", item.url).eq("user_id", user!.id);
            }
          }
          setItems((prev) => prev.filter((i) => !selected.has(i.id)));
          setSelected(new Set());
          setSelectMode(false);
        },
      },
    ]);
  }

  const isGrid = activeTab === "images" || activeTab === "videos" || activeTab === "all";
  const imageUrls = filtered.filter((i) => i.type === "image").map((i) => i.url);

  const renderGrid = ({ item }: { item: MediaItem }) => {
    const isSelected = selected.has(item.id);
    const isImg = item.type === "image";
    return (
      <TouchableOpacity
        style={[styles.gridCell as any, { width: CELL, height: CELL }]}
        onPress={() => {
          if (selectMode) { toggleSelect(item.id); return; }
          if (isImg) {
            const idx = imageUrls.indexOf(item.url);
            imgViewer.openViewer(imageUrls, idx >= 0 ? idx : 0);
          }
        }}
        onLongPress={() => { setSelectMode(true); toggleSelect(item.id); }}
        activeOpacity={0.85}
      >
        {isImg ? (
          <Image source={{ uri: item.url }} style={styles.gridThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.gridThumb, { backgroundColor: (TYPE_COLORS[item.type] || "#8E8E93") + "22", alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name={item.type === "video" ? "film" : item.type === "document" ? getFileIcon(item.name) as any : "link"} size={32} color={TYPE_COLORS[item.type] || "#8E8E93"} />
          </View>
        )}
        {isSelected && (
          <View style={styles.gridSelectOverlay}>
            <View style={[styles.gridCheckCircle, { backgroundColor: colors.accent }]}>
              <Ionicons name="checkmark" size={16} color="#fff" />
            </View>
          </View>
        )}
        {item.is_pinned && !selectMode && (
          <View style={[styles.pinnedDot, { backgroundColor: colors.accent }]}>
            <Ionicons name="pin" size={10} color="#fff" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderList = ({ item }: { item: MediaItem }) => {
    const color = TYPE_COLORS[item.type] || "#8E8E93";
    const isSelected = selected.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.listRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        onPress={() => selectMode ? toggleSelect(item.id) : null}
        onLongPress={() => { setSelectMode(true); toggleSelect(item.id); }}
        activeOpacity={0.85}
      >
        {selectMode && (
          <View style={[styles.selectCircle, isSelected && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
            {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
        )}
        <View style={[styles.fileIconWrap, { backgroundColor: color + "18" }]}>
          <Ionicons
            name={item.type === "document" ? getFileIcon(item.name) as any
              : item.type === "link" ? "link-outline"
              : item.type === "voice" ? "mic-outline"
              : "film-outline"}
            size={22}
            color={color}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          <View style={styles.fileMeta}>
            <Text style={[styles.fileMetaText, { color: colors.textMuted }]}>{item.sender_name}</Text>
            <Text style={[styles.fileMetaDot, { color: colors.textMuted }]}>·</Text>
            <Text style={[styles.fileMetaText, { color: colors.textMuted }]}>{formatDate(item.date)}</Text>
            {item.size ? (
              <>
                <Text style={[styles.fileMetaDot, { color: colors.textMuted }]}>·</Text>
                <Text style={[styles.fileMetaText, { color: colors.textMuted }]}>{formatSize(item.size)}</Text>
              </>
            ) : null}
          </View>
        </View>
        <View style={styles.listActions}>
          {downloading === item.id
            ? <ActivityIndicator size="small" color={colors.accent} />
            : !selectMode && (
              <>
                <TouchableOpacity hitSlop={10} onPress={() => downloadFile(item)}>
                  <Ionicons name="download-outline" size={20} color={colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity hitSlop={10} onPress={() => item.is_pinned ? unpinItem(item) : pinItem(item)} disabled={pinning === item.id}>
                  {pinning === item.id
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Ionicons name={item.is_pinned ? "pin" : "pin-outline"} size={20} color={item.is_pinned ? colors.accent : colors.textMuted} />}
                </TouchableOpacity>
              </>
            )}
        </View>
      </TouchableOpacity>
    );
  };

  const totalSize = items.reduce((sum, i) => sum + (i.size || 0), 0);

  if (Platform.OS === "web" && !profile?.is_admin) {
    return <ComingSoonView title="File Manager" description="The AfuChat File Manager is coming to web soon. Access all your shared media and files on the mobile app." />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => { if (selectMode) { setSelectMode(false); setSelected(new Set()); } else router.back(); }} hitSlop={12}>
          <Ionicons name={selectMode ? "close" : "arrow-back"} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {selectMode ? `${selected.size} selected` : "File Manager"}
        </Text>
        {selectMode ? (
          <>
            <TouchableOpacity hitSlop={10} onPress={deleteSelected} disabled={selected.size === 0}>
              <Ionicons name="trash-outline" size={22} color={selected.size > 0 ? "#FF3B30" : colors.textMuted} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              hitSlop={10}
              onPress={() => setSortBy((s) => s === "date" ? "name" : s === "name" ? "size" : "date")}
              style={[styles.sortBtn, { borderColor: colors.border }]}
            >
              <Ionicons name="swap-vertical-outline" size={14} color={colors.accent} />
              <Text style={[styles.sortBtnText, { color: colors.accent }]}>
                {sortBy === "date" ? "Date" : sortBy === "name" ? "Name" : "Size"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {!selectMode && (
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search files…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabScroll, { borderBottomColor: colors.border }]} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
        {TABS.map((t) => {
          const isActive = activeTab === t.key;
          const count = t.key === "pinned" ? undefined : t.key === "all" ? items.length : tabCounts[t.key.replace(/s$/, "")];
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, { backgroundColor: isActive ? colors.accent : colors.surface, borderColor: isActive ? colors.accent : colors.border }]}
              onPress={() => setActiveTab(t.key)}
            >
              <Ionicons name={t.icon as any} size={13} color={isActive ? "#fff" : colors.textMuted} />
              <Text style={[styles.tabText, { color: isActive ? "#fff" : colors.textMuted }]}>{t.label}</Text>
              {count !== undefined && count > 0 && (
                <View style={[styles.tabCount, { backgroundColor: isActive ? "rgba(255,255,255,0.3)" : colors.backgroundTertiary }]}>
                  <Text style={[styles.tabCountText, { color: isActive ? "#fff" : colors.textMuted }]}>{count > 99 ? "99+" : count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.accent + "18" }]}>
            <Ionicons name={TABS.find((t) => t.key === activeTab)?.icon as any || "folder-outline"} size={36} color={colors.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {search ? "No results" : `No ${activeTab === "all" ? "files" : activeTab} yet`}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {search ? "Try a different search term" : activeTab === "pinned" ? "Pin important files from chats to keep them here" : "Files you share and receive in chats will appear here"}
          </Text>
        </View>
      ) : isGrid ? (
        <FlatList
          key="grid"
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={3}
          renderItem={renderGrid}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadMedia(); setRefreshing(false); }} tintColor={colors.accent} />}
        />
      ) : (
        <FlatList
          key="list"
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderList}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadMedia(); setRefreshing(false); }} tintColor={colors.accent} />}
        />
      )}

      <ImageViewer images={imgViewer.images} initialIndex={imgViewer.index} visible={imgViewer.visible} onClose={imgViewer.closeViewer} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  sortBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  sortBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10,},
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", padding: 0 },
  tabScroll: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabCount: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  tabCountText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  gridCell: { margin: 1, position: "relative" },
  gridThumb: { flex: 1 },
  gridSelectOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,188,212,0.4)", alignItems: "flex-top", justifyContent: "flex-start", padding: 6 },
  gridCheckCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.brand, alignItems: "center", justifyContent: "center" },
  pinnedDot: { position: "absolute", top: 5, right: 5, backgroundColor: Colors.brand, borderRadius: 8, padding: 3 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  selectCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#ccc", alignItems: "center", justifyContent: "center" },
  fileIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  fileName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  fileMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  fileMetaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  fileMetaDot: { fontSize: 12 },
  listActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
