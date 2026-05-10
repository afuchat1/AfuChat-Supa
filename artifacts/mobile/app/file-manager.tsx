import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "@/lib/haptics";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";
import { ComingSoonView } from "@/components/ui/ComingSoonView";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "browse" | "recents" | "transfer" | "storage";
type BrowseCategory = "images" | "videos" | "audio" | "documents";
type ViewMode = "grid" | "list";

type DeviceFile = {
  id: string;
  uri: string;
  filename: string;
  mediaType: "photo" | "video" | "audio" | "document";
  fileSize?: number;
  duration?: number;
  modificationTime?: number;
  width?: number;
  height?: number;
};

type PickedFile = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
};

type TransferMode = "send" | "receive";
type SendStep = "pick" | "code" | "sharing";

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_META: Record<BrowseCategory, { label: string; icon: string; color: string; mediaType?: MediaLibrary.MediaTypeValue }> = {
  images:    { label: "Images",    icon: "image-outline",       color: "#00BCD4", mediaType: MediaLibrary.MediaType.photo },
  videos:    { label: "Videos",    icon: "film-outline",        color: "#FF3B30", mediaType: MediaLibrary.MediaType.video },
  audio:     { label: "Audio",     icon: "musical-notes-outline", color: "#AF52DE", mediaType: MediaLibrary.MediaType.audio },
  documents: { label: "Documents", icon: "document-text-outline", color: "#007AFF" },
};

const FILE_ICON: Record<string, string> = {
  pdf: "document-text", doc: "document-text", docx: "document-text",
  xls: "grid", xlsx: "grid", csv: "grid",
  ppt: "easel", pptx: "easel",
  zip: "archive", rar: "archive", tar: "archive",
  mp3: "musical-notes", m4a: "musical-notes", wav: "musical-notes",
  txt: "reader-outline", json: "code-slash", xml: "code-slash",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtSize(bytes?: number): string {
  if (!bytes || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDuration(secs?: number): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtDate(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

function getExt(name: string): string {
  return (name || "").split(".").pop()?.toLowerCase() || "";
}

function getFileIcon(name: string): string {
  return FILE_ICON[getExt(name)] || "document-outline";
}

function genCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ─── Permission Gate ──────────────────────────────────────────────────────────

function PermissionGate({ onGranted }: { onGranted: () => void }) {
  const { colors } = useTheme();
  const [requesting, setRequesting] = useState(false);

  async function request() {
    setRequesting(true);
    const { status } = await MediaLibrary.requestPermissionsAsync();
    setRequesting(false);
    if (status === "granted") onGranted();
    else showAlert("Permission Required", "AfuChat needs media access to show your device files. Please enable it in Settings.");
  }

  return (
    <View style={pg.wrap}>
      <View style={[pg.iconRing, { backgroundColor: colors.accent + "18" }]}>
        <Ionicons name="folder-open-outline" size={48} color={colors.accent} />
      </View>
      <Text style={[pg.title, { color: colors.text }]}>Access Your Files</Text>
      <Text style={[pg.sub, { color: colors.textSecondary }]}>
        Allow AfuChat Files to access your device media library to browse, manage, and transfer files — all offline.
      </Text>
      <TouchableOpacity
        style={[pg.btn, { backgroundColor: colors.accent }]}
        onPress={request}
        disabled={requesting}
      >
        {requesting ? <ActivityIndicator color="#fff" /> : (
          <Text style={pg.btnText}>Allow Access</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
const pg = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 36, paddingBottom: 60 },
  iconRing: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  btn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 28, marginTop: 8 },
  btnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
});

// ─── Storage Bar ──────────────────────────────────────────────────────────────

function StorageBar({ usedBytes, totalBytes, colors }: { usedBytes: number; totalBytes: number; colors: any }) {
  const pct = totalBytes > 0 ? usedBytes / totalBytes : 0;
  const barColor = pct > 0.9 ? "#FF3B30" : pct > 0.7 ? "#FF9500" : colors.accent;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 800, useNativeDriver: false }).start();
  }, [pct]);

  return (
    <View style={sb.wrap}>
      <View style={[sb.track, { backgroundColor: colors.backgroundSecondary }]}>
        <Animated.View
          style={[sb.fill, { backgroundColor: barColor, width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}
        />
      </View>
      <View style={sb.labels}>
        <Text style={[sb.label, { color: colors.textMuted }]}>{fmtSize(usedBytes)} used</Text>
        <Text style={[sb.label, { color: colors.textMuted }]}>{fmtSize(totalBytes - usedBytes)} free</Text>
      </View>
    </View>
  );
}
const sb = StyleSheet.create({
  wrap: { gap: 6 },
  track: { height: 10, borderRadius: 5, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 5 },
  labels: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontSize: 12, fontFamily: "Inter_400Regular" },
});

// ─── Category Chip ────────────────────────────────────────────────────────────

function CategoryChip({ cat, active, count, onPress, colors }: {
  cat: BrowseCategory; active: boolean; count: number; onPress: () => void; colors: any;
}) {
  const meta = CATEGORY_META[cat];
  return (
    <TouchableOpacity
      style={[cc.chip, {
        backgroundColor: active ? meta.color : colors.surface,
        borderColor: active ? meta.color : colors.border,
      }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Ionicons name={meta.icon as any} size={14} color={active ? "#fff" : colors.textMuted} />
      <Text style={[cc.label, { color: active ? "#fff" : colors.textMuted }]}>{meta.label}</Text>
      {count > 0 && (
        <View style={[cc.badge, { backgroundColor: active ? "rgba(255,255,255,0.25)" : colors.backgroundSecondary }]}>
          <Text style={[cc.badgeText, { color: active ? "#fff" : colors.textMuted }]}>{count > 999 ? "999+" : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
const cc = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
});

// ─── File Grid Cell ───────────────────────────────────────────────────────────

function GridCell({ file, cellSize, selected, selectMode, onPress, onLongPress, colors }: {
  file: DeviceFile; cellSize: number; selected: boolean; selectMode: boolean;
  onPress: () => void; onLongPress: () => void; colors: any;
}) {
  const meta = CATEGORY_META[file.mediaType === "photo" ? "images" : file.mediaType === "video" ? "videos" : "audio"];
  return (
    <TouchableOpacity
      style={[{ width: cellSize, height: cellSize, margin: 1, position: "relative" }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.85}
    >
      {file.mediaType === "photo" || file.mediaType === "video" ? (
        <Image source={{ uri: file.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: (meta?.color || "#8E8E93") + "22", alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name={(meta?.icon || "document-outline") as any} size={30} color={meta?.color || "#8E8E93"} />
        </View>
      )}
      {file.mediaType === "video" && (
        <View style={gc.videoBadge}>
          <Ionicons name="play" size={10} color="#fff" />
          {!!file.duration && <Text style={gc.videoDur}>{fmtDuration(file.duration)}</Text>}
        </View>
      )}
      {selectMode && (
        <View style={[StyleSheet.absoluteFill, selected && gc.selectedOverlay]}>
          <View style={[gc.checkCircle, selected && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
            {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}
const gc = StyleSheet.create({
  videoBadge: { position: "absolute", bottom: 4, right: 4, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
  videoDur: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  selectedOverlay: { backgroundColor: "rgba(0,122,255,0.35)" },
  checkCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#fff", margin: 5, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
});

// ─── File List Row ────────────────────────────────────────────────────────────

function ListRow({ file, selected, selectMode, onPress, onLongPress, colors }: {
  file: DeviceFile; selected: boolean; selectMode: boolean;
  onPress: () => void; onLongPress: () => void; colors: any;
}) {
  const cat = file.mediaType === "photo" ? "images" : file.mediaType === "video" ? "videos" : file.mediaType === "audio" ? "audio" : "documents";
  const meta = CATEGORY_META[cat];

  return (
    <TouchableOpacity
      style={[lr.row, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
    >
      {selectMode && (
        <View style={[lr.selectCircle, selected && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
          {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
        </View>
      )}
      {(file.mediaType === "photo" || file.mediaType === "video") ? (
        <Image source={{ uri: file.uri }} style={lr.thumb} resizeMode="cover" />
      ) : (
        <View style={[lr.iconBox, { backgroundColor: meta.color + "18" }]}>
          <Ionicons name={file.mediaType === "audio" ? "musical-notes" : getFileIcon(file.filename) as any} size={22} color={meta.color} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[lr.name, { color: colors.text }]} numberOfLines={1}>{file.filename}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {!!file.fileSize && <Text style={[lr.meta, { color: colors.textMuted }]}>{fmtSize(file.fileSize)}</Text>}
          {!!file.duration && <Text style={[lr.meta, { color: colors.textMuted }]}>· {fmtDuration(file.duration)}</Text>}
          {!!file.modificationTime && <Text style={[lr.meta, { color: colors.textMuted }]}>· {fmtDate(file.modificationTime)}</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}
const lr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  selectCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#aaa", alignItems: "center", justifyContent: "center" },
  thumb: { width: 48, height: 48, borderRadius: 8 },
  iconBox: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
});

// ─── Browse Tab ───────────────────────────────────────────────────────────────

function BrowseTab({ colors, width }: { colors: any; width: number }) {
  const [permStatus, setPermStatus] = useState<MediaLibrary.PermissionStatus | null>(null);
  const [category, setCategory] = useState<BrowseCategory>("images");
  const [files, setFiles] = useState<DeviceFile[]>([]);
  const [counts, setCounts] = useState<Record<BrowseCategory, number>>({ images: 0, videos: 0, audio: 0, documents: 0 });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name" | "size">("date");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);

  const CELL = Math.floor((width - 4) / 3);

  useEffect(() => {
    MediaLibrary.getPermissionsAsync().then(({ status }) => setPermStatus(status));
  }, []);

  const loadFiles = useCallback(async (cat: BrowseCategory) => {
    if (permStatus !== "granted") return;
    setLoading(true);
    try {
      if (cat === "documents") {
        setFiles([]);
        setLoading(false);
        return;
      }
      const meta = CATEGORY_META[cat];
      if (!meta.mediaType) { setLoading(false); return; }
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: meta.mediaType,
        first: 200,
        sortBy: [[MediaLibrary.SortBy.modificationTime, false]],
      });
      const mapped: DeviceFile[] = result.assets.map((a) => ({
        id: a.id,
        uri: a.uri,
        filename: a.filename || a.id,
        mediaType: cat === "images" ? "photo" : cat === "videos" ? "video" : "audio",
        fileSize: (a as any).fileSize,
        duration: a.duration || undefined,
        modificationTime: a.modificationTime,
        width: a.width,
        height: a.height,
      }));
      setFiles(mapped);

      if (counts.images === 0) {
        const [imgRes, vidRes, audRes] = await Promise.all([
          MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.photo, first: 1 }),
          MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.video, first: 1 }),
          MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.audio, first: 1 }),
        ]);
        setCounts({ images: imgRes.totalCount, videos: vidRes.totalCount, audio: audRes.totalCount, documents: 0 });
      }
    } catch { /* permission may have changed */ }
    setLoading(false);
    setRefreshing(false);
  }, [permStatus, counts.images]);

  useEffect(() => { if (permStatus === "granted") loadFiles(category); }, [category, permStatus]);

  const filtered = useMemo(() => {
    let out = files;
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((f) => f.filename.toLowerCase().includes(q));
    }
    return [...out].sort((a, b) => {
      if (sortBy === "name") return a.filename.localeCompare(b.filename);
      if (sortBy === "size") return (b.fileSize || 0) - (a.fileSize || 0);
      return (b.modificationTime || 0) - (a.modificationTime || 0);
    });
  }, [files, search, sortBy]);

  function toggleSelect(id: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  async function shareSelected() {
    const sel = Array.from(selected);
    if (sel.length === 0) return;
    const selFiles = files.filter((f) => sel.includes(f.id));
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) { showAlert("Not supported", "Sharing is not available on this device."); setSharing(false); return; }
      for (const f of selFiles) {
        await Sharing.shareAsync(f.uri, { UTI: f.mediaType === "photo" ? "public.image" : undefined });
      }
    } catch { showAlert("Error", "Could not share selected files."); }
    setSharing(false);
    setSelectMode(false);
    setSelected(new Set());
  }

  async function pickAndShareDoc() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: false, multiple: true });
      if (result.canceled) return;
      for (const asset of result.assets) {
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(asset.uri);
      }
    } catch { showAlert("Error", "Could not pick file."); }
  }

  if (permStatus === null) return <ActivityIndicator style={{ marginTop: 40 }} />;
  if (permStatus !== MediaLibrary.PermissionStatus.GRANTED) return <PermissionGate onGranted={() => setPermStatus(MediaLibrary.PermissionStatus.GRANTED)} />;

  const isGridView = viewMode === "grid" && (category === "images" || category === "videos");

  return (
    <View style={{ flex: 1 }}>
      <View style={[bt.toolbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[bt.searchWrap, { backgroundColor: colors.backgroundSecondary }]}>
          <Ionicons name="search-outline" size={15} color={colors.textMuted} />
          <TextInput
            style={[bt.searchInput, { color: colors.text }]}
            placeholder="Search files…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}><Ionicons name="close-circle" size={15} color={colors.textMuted} /></TouchableOpacity>}
        </View>
        <TouchableOpacity onPress={() => setSortBy((s) => s === "date" ? "name" : s === "name" ? "size" : "date")} style={[bt.sortBtn, { borderColor: colors.border }]} hitSlop={8}>
          <Ionicons name="swap-vertical-outline" size={14} color={colors.accent} />
          <Text style={[bt.sortText, { color: colors.accent }]}>{sortBy === "date" ? "Date" : sortBy === "name" ? "Name" : "Size"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setViewMode((v) => v === "grid" ? "list" : "grid")} hitSlop={10}>
          <Ionicons name={viewMode === "grid" ? "list-outline" : "grid-outline"} size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
        {(Object.keys(CATEGORY_META) as BrowseCategory[]).map((cat) => (
          <CategoryChip key={cat} cat={cat} active={category === cat} count={counts[cat]} onPress={() => { setCategory(cat); setSelectMode(false); setSelected(new Set()); }} colors={colors} />
        ))}
      </ScrollView>

      {selectMode && (
        <View style={[bt.selBar, { backgroundColor: colors.accent }]}>
          <TouchableOpacity onPress={() => { setSelectMode(false); setSelected(new Set()); }} hitSlop={8}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={bt.selBarText}>{selected.size} selected</Text>
          <View style={{ flex: 1 }} />
          {sharing ? <ActivityIndicator color="#fff" size="small" /> : (
            <TouchableOpacity onPress={shareSelected} disabled={selected.size === 0} style={[bt.selBtn, { opacity: selected.size === 0 ? 0.5 : 1 }]}>
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={bt.selBtnText}>Share / Send</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {category === "documents" ? (
        <View style={bt.docPick}>
          <View style={[bt.docIconWrap, { backgroundColor: colors.surface }]}>
            <Ionicons name="document-text-outline" size={48} color="#007AFF" />
          </View>
          <Text style={[bt.docTitle, { color: colors.text }]}>Pick a Document</Text>
          <Text style={[bt.docSub, { color: colors.textSecondary }]}>
            Browse all files on your device and share them nearby via AirDrop, Bluetooth, or Nearby Share — no internet needed.
          </Text>
          <TouchableOpacity style={[bt.docBtn, { backgroundColor: "#007AFF" }]} onPress={pickAndShareDoc}>
            <Ionicons name="folder-open-outline" size={18} color="#fff" />
            <Text style={bt.docBtnText}>Browse & Share Files</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={{ color: colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 14 }}>Loading files…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={bt.empty}>
          <Ionicons name={CATEGORY_META[category].icon as any} size={44} color={CATEGORY_META[category].color + "88"} />
          <Text style={[bt.emptyTitle, { color: colors.text }]}>{search ? "No results" : `No ${CATEGORY_META[category].label.toLowerCase()} found`}</Text>
        </View>
      ) : isGridView ? (
        <FlatList
          key={`grid-${category}`}
          data={filtered}
          keyExtractor={(f) => f.id}
          numColumns={3}
          renderItem={({ item }) => (
            <GridCell
              file={item}
              cellSize={CELL}
              selected={selected.has(item.id)}
              selectMode={selectMode}
              colors={colors}
              onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSelectMode(true); toggleSelect(item.id); }}
              onPress={() => {
                if (selectMode) { toggleSelect(item.id); return; }
              }}
            />
          )}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadFiles(category); }} tintColor={colors.accent} />}
        />
      ) : (
        <FlatList
          key={`list-${category}`}
          data={filtered}
          keyExtractor={(f) => f.id}
          renderItem={({ item }) => (
            <ListRow
              file={item}
              selected={selected.has(item.id)}
              selectMode={selectMode}
              colors={colors}
              onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSelectMode(true); toggleSelect(item.id); }}
              onPress={() => {
                if (selectMode) { toggleSelect(item.id); return; }
                Sharing.isAvailableAsync().then((ok) => { if (ok) Sharing.shareAsync(item.uri); });
              }}
            />
          )}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadFiles(category); }} tintColor={colors.accent} />}
        />
      )}
    </View>
  );
}
const bt = StyleSheet.create({
  toolbar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  sortBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  sortText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  selBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  selBarText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
  selBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  selBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  docPick: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 36, paddingBottom: 60 },
  docIconWrap: { width: 100, height: 100, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  docSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  docBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 28, marginTop: 4 },
  docBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingBottom: 60 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});

// ─── Recents Tab ──────────────────────────────────────────────────────────────

function RecentsTab({ colors, width }: { colors: any; width: number }) {
  const [permStatus, setPermStatus] = useState<MediaLibrary.PermissionStatus | null>(null);
  const [files, setFiles] = useState<DeviceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const CELL = Math.floor((width - 4) / 3);

  useEffect(() => {
    MediaLibrary.getPermissionsAsync().then(({ status }) => { setPermStatus(status); if (status === "granted") load(); else setLoading(false); });
  }, []);

  async function load() {
    setLoading(true);
    const result = await MediaLibrary.getAssetsAsync({
      first: 60,
      sortBy: [[MediaLibrary.SortBy.modificationTime, false]],
    });
    const mapped: DeviceFile[] = result.assets.map((a) => ({
      id: a.id, uri: a.uri, filename: a.filename || a.id,
      mediaType: a.mediaType === "photo" ? "photo" : a.mediaType === "video" ? "video" : "audio",
      duration: a.duration || undefined,
      modificationTime: a.modificationTime,
      width: a.width, height: a.height,
    }));
    setFiles(mapped);
    setLoading(false);
  }

  if (permStatus === null || loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.accent} size="large" /></View>;
  if (permStatus !== MediaLibrary.PermissionStatus.GRANTED) return <PermissionGate onGranted={() => { setPermStatus(MediaLibrary.PermissionStatus.GRANTED); load(); }} />;

  return (
    <FlatList
      key="recents"
      data={files}
      keyExtractor={(f) => f.id}
      numColumns={3}
      renderItem={({ item }) => (
        <TouchableOpacity style={{ width: CELL, height: CELL, margin: 1 }} activeOpacity={0.85}>
          {item.mediaType === "photo" || item.mediaType === "video" ? (
            <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#AF52DE22", alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="musical-notes" size={28} color="#AF52DE" />
            </View>
          )}
          {item.mediaType === "video" && (
            <View style={gc.videoBadge}><Ionicons name="play" size={10} color="#fff" /></View>
          )}
          <View style={rt.dateBadge}>
            <Text style={rt.dateBadgeText}>{fmtDate(item.modificationTime)}</Text>
          </View>
        </TouchableOpacity>
      )}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View style={{ alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 10 }}>
          <Ionicons name="time-outline" size={44} color={colors.textMuted} />
          <Text style={{ color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 16 }}>No recent files</Text>
        </View>
      }
    />
  );
}
const rt = StyleSheet.create({
  dateBadge: { position: "absolute", bottom: 3, left: 3, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 },
  dateBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_500Medium" },
});

// ─── Transfer Tab ─────────────────────────────────────────────────────────────

function TransferTab({ colors, user }: { colors: any; user: any }) {
  const [mode, setMode] = useState<TransferMode>("send");
  const [sendStep, setSendStep] = useState<SendStep>("pick");
  const [pickedFiles, setPickedFiles] = useState<PickedFile[]>([]);
  const [transferCode, setTransferCode] = useState("");
  const [receiveCode, setReceiveCode] = useState("");
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  async function pickFiles() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: true });
      if (result.canceled) return;
      const files: PickedFile[] = result.assets.map((a) => ({ uri: a.uri, name: a.name || "file", mimeType: a.mimeType || undefined, size: a.size || undefined }));
      setPickedFiles(files);
    } catch { showAlert("Error", "Could not pick files."); }
  }

  async function pickFromGallery() {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") { showAlert("Permission needed", "Allow media access to pick photos and videos."); return; }
    const result = await MediaLibrary.getAssetsAsync({ first: 1, sortBy: [[MediaLibrary.SortBy.modificationTime, false]] });
    if (result.assets.length === 0) { showAlert("No files", "No media found on device."); return; }
    showAlert("Tip", "Long-press any file in the Browse tab to multi-select, then tap Share / Send to transfer nearby.");
  }

  async function shareNearby() {
    if (pickedFiles.length === 0) return;
    try {
      const ok = await Sharing.isAvailableAsync();
      if (!ok) { showAlert("Not available", "Sharing is not available on this device."); return; }
      for (const f of pickedFiles) await Sharing.shareAsync(f.uri, { mimeType: f.mimeType });
      setPickedFiles([]);
    } catch { showAlert("Error", "Could not share file."); }
  }

  async function createAfuChatCode() {
    if (!user || pickedFiles.length === 0) return;
    if (pickedFiles.length > 1) { showAlert("Limit", "AfuChat Transfer Code supports one file at a time. Use Nearby Share for multiple files."); return; }
    const file = pickedFiles[0];
    setUploading(true);
    setUploadProgress(0);
    try {
      const code = genCode();
      const ext = getExt(file.name) || "bin";
      const path = `transfers/${user.id}/${code}.${ext}`;
      const content = await (FileSystem as any).readAsStringAsync(file.uri, { encoding: "base64" });
      setUploadProgress(50);
      const binary = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
      const { error } = await supabase.storage.from("chat-attachments").upload(path, binary, { contentType: file.mimeType || "application/octet-stream", upsert: true });
      setUploadProgress(100);
      if (error) throw error;
      setTransferCode(code);
      setSendStep("code");
    } catch (e: any) {
      showAlert("Upload failed", e?.message || "Could not create transfer code. Check your connection.");
    }
    setUploading(false);
  }

  async function receiveByCode() {
    if (!receiveCode.trim() || receiveCode.trim().length < 6) { showAlert("Invalid", "Enter the 6-character code from the sender."); return; }
    setDownloading(true);
    try {
      const code = receiveCode.trim().toUpperCase();
      const { data: list, error: listErr } = await supabase.storage.from("chat-attachments").list(`transfers`, { search: code });
      if (listErr || !list || list.length === 0) { showAlert("Not found", "No file found for that code. Check the code and try again."); setDownloading(false); return; }
      const match = list.find((f) => f.name.startsWith(code));
      if (!match) { showAlert("Not found", "No file found for that code."); setDownloading(false); return; }
      const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(`transfers/${match.name}`);
      const dest = ((FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || "") + match.name;
      await FileSystem.downloadAsync(urlData.publicUrl, dest);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(dest);
      else showAlert("Downloaded", `File saved to: ${dest}`);
      setReceiveCode("");
    } catch (e: any) {
      showAlert("Error", e?.message || "Could not download file.");
    }
    setDownloading(false);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
      <View style={[tt.modeRow, { backgroundColor: colors.surface, borderRadius: 14, padding: 4 }]}>
        {(["send", "receive"] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[tt.modeBtn, mode === m && { backgroundColor: colors.accent }]}
            onPress={() => { setMode(m); setSendStep("pick"); setPickedFiles([]); setTransferCode(""); setReceiveCode(""); }}
          >
            <Ionicons name={m === "send" ? "share-outline" : "download-outline"} size={16} color={mode === m ? "#fff" : colors.textMuted} />
            <Text style={[tt.modeBtnText, { color: mode === m ? "#fff" : colors.textMuted }]}>{m === "send" ? "Send Files" : "Receive Files"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === "send" && (
        <>
          <View style={[tt.section, { backgroundColor: colors.surface }]}>
            <View style={tt.sectionHeader}>
              <View style={[tt.badge, { backgroundColor: "#34C75918" }]}>
                <Ionicons name="wifi-outline" size={16} color="#34C759" />
                <Text style={[tt.badgeText, { color: "#34C759" }]}>100% Offline</Text>
              </View>
              <Text style={[tt.sectionTitle, { color: colors.text }]}>Nearby Share</Text>
              <Text style={[tt.sectionSub, { color: colors.textSecondary }]}>
                Transfer files peer-to-peer via AirDrop (iOS), Nearby Share (Android), or Bluetooth — no internet required.
              </Text>
            </View>

            {pickedFiles.length === 0 ? (
              <View style={{ gap: 10 }}>
                <TouchableOpacity style={[tt.pickBtn, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]} onPress={pickFiles}>
                  <Ionicons name="document-outline" size={20} color={colors.accent} />
                  <Text style={[tt.pickBtnText, { color: colors.accent }]}>Pick Files from Device</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[tt.pickBtn, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]} onPress={pickFromGallery}>
                  <Ionicons name="images-outline" size={20} color={colors.accent} />
                  <Text style={[tt.pickBtnText, { color: colors.accent }]}>Select from Browse Tab</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {pickedFiles.map((f, i) => (
                  <View key={i} style={[tt.fileChip, { backgroundColor: colors.backgroundSecondary }]}>
                    <Ionicons name={getFileIcon(f.name) as any} size={18} color={colors.accent} />
                    <Text style={[tt.fileChipName, { color: colors.text }]} numberOfLines={1}>{f.name}</Text>
                    {!!f.size && <Text style={[tt.fileChipSize, { color: colors.textMuted }]}>{fmtSize(f.size)}</Text>}
                    <TouchableOpacity onPress={() => setPickedFiles((p) => p.filter((_, j) => j !== i))} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={[tt.addMore, { borderColor: colors.border }]} onPress={pickFiles}>
                  <Ionicons name="add" size={16} color={colors.textMuted} />
                  <Text style={[{ color: colors.textMuted, fontSize: 13, fontFamily: "Inter_500Medium" }]}>Add more files</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[tt.sendBtn, { backgroundColor: "#34C759" }]} onPress={shareNearby}>
                  <Ionicons name="share-outline" size={18} color="#fff" />
                  <Text style={tt.sendBtnText}>Send Nearby</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={[tt.section, { backgroundColor: colors.surface }]}>
            <View style={tt.sectionHeader}>
              <View style={[tt.badge, { backgroundColor: "#007AFF18" }]}>
                <Ionicons name="cloud-outline" size={16} color="#007AFF" />
                <Text style={[tt.badgeText, { color: "#007AFF" }]}>Requires Internet</Text>
              </View>
              <Text style={[tt.sectionTitle, { color: colors.text }]}>AfuChat Transfer Code</Text>
              <Text style={[tt.sectionSub, { color: colors.textSecondary }]}>
                Upload a file and get a 6-character code. The recipient enters the code to download it instantly — works across any distance.
              </Text>
            </View>

            {sendStep === "pick" && (
              <View style={{ gap: 10 }}>
                {pickedFiles.length === 0 ? (
                  <TouchableOpacity style={[tt.pickBtn, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]} onPress={pickFiles}>
                    <Ionicons name="cloud-upload-outline" size={20} color="#007AFF" />
                    <Text style={[tt.pickBtnText, { color: "#007AFF" }]}>Pick File to Upload</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    {pickedFiles.slice(0, 1).map((f, i) => (
                      <View key={i} style={[tt.fileChip, { backgroundColor: colors.backgroundSecondary }]}>
                        <Ionicons name={getFileIcon(f.name) as any} size={18} color="#007AFF" />
                        <Text style={[tt.fileChipName, { color: colors.text }]} numberOfLines={1}>{f.name}</Text>
                        {!!f.size && <Text style={[tt.fileChipSize, { color: colors.textMuted }]}>{fmtSize(f.size)}</Text>}
                      </View>
                    ))}
                    <TouchableOpacity style={[tt.sendBtn, { backgroundColor: "#007AFF", opacity: uploading ? 0.6 : 1 }]} onPress={createAfuChatCode} disabled={uploading}>
                      {uploading ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <ActivityIndicator color="#fff" size="small" />
                          <Text style={tt.sendBtnText}>Uploading {uploadProgress}%…</Text>
                        </View>
                      ) : (
                        <>
                          <Ionicons name="key-outline" size={18} color="#fff" />
                          <Text style={tt.sendBtnText}>Create Transfer Code</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {sendStep === "code" && (
              <View style={{ alignItems: "center", gap: 12 }}>
                <Text style={[tt.codeLabel, { color: colors.textMuted }]}>Share this code with the recipient</Text>
                <View style={[tt.codeBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.accent + "44" }]}>
                  <Text style={[tt.codeText, { color: colors.accent }]}>{transferCode}</Text>
                </View>
                <Text style={[{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" }]}>
                  Code expires in 1 hour · One-time use
                </Text>
                <TouchableOpacity style={[tt.sendBtn, { backgroundColor: colors.backgroundSecondary, width: "100%" }]} onPress={() => { setSendStep("pick"); setPickedFiles([]); setTransferCode(""); }}>
                  <Text style={[tt.sendBtnText, { color: colors.text }]}>Send Another File</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </>
      )}

      {mode === "receive" && (
        <View style={[tt.section, { backgroundColor: colors.surface }]}>
          <View style={tt.sectionHeader}>
            <Text style={[tt.sectionTitle, { color: colors.text }]}>Receive a File</Text>
            <Text style={[tt.sectionSub, { color: colors.textSecondary }]}>
              Ask the sender for their 6-character AfuChat Transfer Code and enter it below to download the file.
            </Text>
          </View>
          <TextInput
            style={[tt.codeInput, { color: colors.text, backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
            placeholder="Enter 6-character code"
            placeholderTextColor={colors.textMuted}
            value={receiveCode}
            onChangeText={(v) => setReceiveCode(v.toUpperCase())}
            autoCapitalize="characters"
            maxLength={6}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[tt.sendBtn, { backgroundColor: colors.accent, opacity: (receiveCode.length < 6 || downloading) ? 0.5 : 1 }]}
            onPress={receiveByCode}
            disabled={receiveCode.length < 6 || downloading}
          >
            {downloading ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="download-outline" size={18} color="#fff" />
                <Text style={tt.sendBtnText}>Download File</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={[tt.infoBox, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="wifi-outline" size={18} color="#34C759" />
            <Text style={[tt.infoText, { color: colors.textSecondary }]}>
              For fully offline transfers (AirDrop / Nearby Share / Bluetooth), ask the sender to use "Send Nearby" on their device.
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
const tt = StyleSheet.create({
  modeRow: { flexDirection: "row", gap: 4 },
  modeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 11 },
  modeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  section: { borderRadius: 18, padding: 16, gap: 14 },
  sectionHeader: { gap: 6 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sectionSub: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, alignSelf: "flex-start" },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  pickBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, paddingVertical: 14 },
  pickBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fileChip: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  fileChipName: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  fileChipSize: { fontSize: 11, fontFamily: "Inter_400Regular" },
  addMore: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderStyle: "dashed", borderRadius: 10, paddingVertical: 10 },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14 },
  sendBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
  codeLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  codeBox: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 14, width: "100%", alignItems: "center" },
  codeText: { fontSize: 36, fontFamily: "Inter_700Bold", letterSpacing: 10 },
  codeInput: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: 6 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 12, marginTop: 4 },
  infoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 19 },
});

// ─── Storage Tab ──────────────────────────────────────────────────────────────

function StorageTab({ colors }: { colors: any }) {
  const [totalBytes, setTotalBytes] = useState(0);
  const [freeBytes, setFreeBytes] = useState(0);
  const [counts, setCounts] = useState({ images: 0, videos: 0, audio: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [total, free] = await Promise.all([
          (FileSystem as any).getTotalDiskCapacityAsync?.() ?? Promise.resolve(0),
          (FileSystem as any).getFreeDiskStorageAsync?.() ?? Promise.resolve(0),
        ]);
        setTotalBytes(total || 0);
        setFreeBytes(free || 0);
      } catch { /* not available on web */ }
      try {
        const { status } = await MediaLibrary.getPermissionsAsync();
        if (status === "granted") {
          const [imgRes, vidRes, audRes] = await Promise.all([
            MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.photo, first: 1 }),
            MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.video, first: 1 }),
            MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.audio, first: 1 }),
          ]);
          setCounts({ images: imgRes.totalCount, videos: vidRes.totalCount, audio: audRes.totalCount });
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  const usedBytes = totalBytes - freeBytes;
  const categories = [
    { label: "Images",    count: counts.images, icon: "image-outline",         color: "#00BCD4" },
    { label: "Videos",    count: counts.videos, icon: "film-outline",           color: "#FF3B30" },
    { label: "Audio",     count: counts.audio,  icon: "musical-notes-outline",  color: "#AF52DE" },
  ];

  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.accent} size="large" /></View>;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
      <View style={[st2.card, { backgroundColor: colors.surface }]}>
        <Text style={[st2.cardTitle, { color: colors.text }]}>Device Storage</Text>
        {totalBytes > 0 ? (
          <>
            <StorageBar usedBytes={usedBytes} totalBytes={totalBytes} colors={colors} />
            <View style={st2.statRow}>
              <View style={st2.statItem}>
                <View style={[st2.statDot, { backgroundColor: colors.accent }]} />
                <Text style={[st2.statLabel, { color: colors.textSecondary }]}>Used</Text>
                <Text style={[st2.statVal, { color: colors.text }]}>{fmtSize(usedBytes)}</Text>
              </View>
              <View style={st2.statItem}>
                <View style={[st2.statDot, { backgroundColor: "#34C759" }]} />
                <Text style={[st2.statLabel, { color: colors.textSecondary }]}>Free</Text>
                <Text style={[st2.statVal, { color: colors.text }]}>{fmtSize(freeBytes)}</Text>
              </View>
              <View style={st2.statItem}>
                <View style={[st2.statDot, { backgroundColor: colors.backgroundSecondary }]} />
                <Text style={[st2.statLabel, { color: colors.textSecondary }]}>Total</Text>
                <Text style={[st2.statVal, { color: colors.text }]}>{fmtSize(totalBytes)}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={[st2.noStats, { color: colors.textMuted }]}>Storage stats not available on this platform.</Text>
        )}
      </View>

      <View style={[st2.card, { backgroundColor: colors.surface }]}>
        <Text style={[st2.cardTitle, { color: colors.text }]}>Media Library</Text>
        {categories.map((cat) => (
          <View key={cat.label} style={[st2.catRow, { borderBottomColor: colors.border }]}>
            <View style={[st2.catIcon, { backgroundColor: cat.color + "18" }]}>
              <Ionicons name={cat.icon as any} size={20} color={cat.color} />
            </View>
            <Text style={[st2.catLabel, { color: colors.text }]}>{cat.label}</Text>
            <Text style={[st2.catCount, { color: colors.textMuted }]}>{cat.count.toLocaleString()} files</Text>
          </View>
        ))}
      </View>

      <View style={[st2.card, { backgroundColor: colors.surface }]}>
        <Text style={[st2.cardTitle, { color: colors.text }]}>Quick Actions</Text>
        {[
          { icon: "share-outline", label: "Share files nearby", sub: "Offline via AirDrop or Nearby Share", onPress: () => {} },
          { icon: "cloud-upload-outline", label: "Create transfer code", sub: "Send to anyone with AfuChat", onPress: () => {} },
        ].map((action) => (
          <TouchableOpacity key={action.label} style={[st2.actionRow, { borderBottomColor: colors.border }]} onPress={action.onPress} activeOpacity={0.75}>
            <View style={[st2.actionIcon, { backgroundColor: colors.accent + "18" }]}>
              <Ionicons name={action.icon as any} size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st2.actionLabel, { color: colors.text }]}>{action.label}</Text>
              <Text style={[st2.actionSub, { color: colors.textMuted }]}>{action.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
const st2 = StyleSheet.create({
  card: { borderRadius: 18, padding: 16, gap: 14 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statRow: { flexDirection: "row", justifyContent: "space-around" },
  statItem: { alignItems: "center", gap: 4 },
  statDot: { width: 10, height: 10, borderRadius: 5 },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statVal: { fontSize: 15, fontFamily: "Inter_700Bold" },
  noStats: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 8 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  catIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  catLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  catCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  actionSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "browse",   label: "Browse",   icon: "folder-outline"  },
  { key: "recents",  label: "Recents",  icon: "time-outline"    },
  { key: "transfer", label: "Transfer", icon: "swap-horizontal-outline" },
  { key: "storage",  label: "Storage",  icon: "pie-chart-outline" },
];

export default function FileManagerScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>("browse");

  if (Platform.OS === "web") {
    return <ComingSoonView title="File Manager" description="The AfuChat File Manager is available on mobile. Use the iOS or Android app to browse, manage, and transfer files." />;
  }

  return (
    <View style={[ms.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[ms.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[ms.headerTitle, { color: colors.text }]}>File Manager</Text>
          <Text style={[ms.headerSub, { color: colors.textMuted }]}>Works offline</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ flex: 1 }}>
        {tab === "browse"   && <BrowseTab   colors={colors} width={width} />}
        {tab === "recents"  && <RecentsTab  colors={colors} width={width} />}
        {tab === "transfer" && <TransferTab colors={colors} user={user} />}
        {tab === "storage"  && <StorageTab  colors={colors} />}
      </View>

      <View style={[ms.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom || 8 }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={ms.tabItem}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
            >
              <View style={active ? [ms.activeIndicator, { backgroundColor: colors.accent + "18" }] : null}>
                <Ionicons name={t.icon as any} size={22} color={active ? colors.accent : colors.textMuted} />
              </View>
              <Text style={[ms.tabLabel, { color: active ? colors.accent : colors.textMuted, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const ms = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  tabBar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, gap: 3 },
  tabLabel: { fontSize: 10, textAlign: "center" },
  activeIndicator: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
});
