import React, { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import * as MediaLibrary from "expo-media-library/legacy";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

const { width: SCREEN_W } = Dimensions.get("window");
const COLS = 3;
const THUMB = Math.floor((SCREEN_W - (COLS + 1) * 2) / COLS);
const PAGE = 60;

type MediaTab = "all" | "photos" | "videos" | "audio";

export interface GalleryAsset {
  id: string;
  uri: string;
  mediaType: MediaLibrary.MediaTypeValue;
  duration: number;
  filename: string;
  width: number;
  height: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (assets: GalleryAsset[]) => void;
  maxSelection?: number;
  initialTab?: MediaTab;
  title?: string;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const TABS: { key: MediaTab; label: string; icon: ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "all",    label: "All",    icon: "grid"          },
  { key: "photos", label: "Photos", icon: "image"         },
  { key: "videos", label: "Videos", icon: "videocam"      },
  { key: "audio",  label: "Audio",  icon: "musical-notes" },
] as any;

export default function MediaGalleryPicker({
  visible,
  onClose,
  onSelect,
  maxSelection = 1,
  initialTab = "all",
  title = "Select Media",
}: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<MediaTab>(initialTab);
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [selected, setSelected] = useState<Map<string, GalleryAsset>>(new Map());
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [permission, setPermission] = useState<"checking" | "granted" | "denied">("checking");
  const [resolving, setResolving] = useState(false);
  const loadingMoreRef = useRef(false);

  const mediaTypesForTab = useCallback((t: MediaTab): MediaLibrary.MediaTypeValue[] => {
    switch (t) {
      case "photos": return [MediaLibrary.MediaType.photo];
      case "videos": return [MediaLibrary.MediaType.video];
      // audio requires READ_MEDIA_AUDIO which is not declared in AndroidManifest
      // — exclude it from "all" and handle the audio tab separately.
      case "audio":  return [MediaLibrary.MediaType.audio];
      default:       return [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video];
    }
  }, []);

  async function fetchAssets(reset: boolean) {
    if (!reset && loadingMoreRef.current) return;
    if (reset) loadingMoreRef.current = false;
    setLoading(true);
    try {
      let permStatus: string;
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        permStatus = status;
      } catch {
        // READ_MEDIA_AUDIO not in AndroidManifest — treat as denied for audio
        setPermission("denied");
        return;
      }
      if (permStatus !== "granted") { setPermission("denied"); return; }
      setPermission("granted");
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: mediaTypesForTab(tab),
        first: PAGE,
        after: reset ? undefined : cursor,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      const mapped: GalleryAsset[] = result.assets.map((a) => ({
        id: a.id, uri: a.uri, mediaType: a.mediaType,
        duration: a.duration, filename: a.filename,
        width: a.width, height: a.height,
      }));
      setAssets((prev) => reset ? mapped : [...prev, ...mapped]);
      setHasMore(result.hasNextPage);
      setCursor(result.endCursor);
    } finally {
      setLoading(false);
      loadingMoreRef.current = false;
    }
  }

  useEffect(() => {
    if (!visible) { setSelected(new Map()); return; }
    setAssets([]); setCursor(undefined); setHasMore(false);
    fetchAssets(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tab]);

  function toggleSelect(asset: GalleryAsset) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else if (next.size < maxSelection) {
        next.set(asset.id, asset);
      } else if (maxSelection === 1) {
        next.clear();
        next.set(asset.id, asset);
      }
      return next;
    });
  }

  async function handleDone() {
    if (resolving) return;
    setResolving(true);
    try {
      const selectedAssets = Array.from(selected.values());

      // Android 13+ returns content:// URIs from getAssetsAsync. These cannot
      // be rendered by React Native Image at full size or copied by FileSystem.
      // Resolve each one to a file:// localUri via getAssetInfoAsync first.
      const resolved = await Promise.all(
        selectedAssets.map(async (asset) => {
          if (Platform.OS !== "android" || !asset.uri.startsWith("content://")) {
            return asset;
          }
          try {
            const info = await MediaLibrary.getAssetInfoAsync(asset.id, {
              shouldDownloadFromNetwork: false,
            });
            const localUri = info.localUri;
            if (localUri) return { ...asset, uri: localUri };
          } catch {}
          return asset;
        }),
      );

      onSelect(resolved);
      onClose();
    } finally {
      setResolving(false);
    }
  }

  function loadMore() {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    fetchAssets(false);
  }

  const selectedCount = selected.size;
  const bg = isDark ? "#0d0d0d" : colors.background;
  const headerBg = isDark ? "#141414" : colors.surface;
  const tabActiveBorder = colors.accent;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[s.root, { backgroundColor: bg, paddingTop: insets.top }]}>

        {/* ── Header ── */}
        <View style={[s.header, { backgroundColor: headerBg, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={s.headerSide}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>{title}</Text>
          {selectedCount > 0 ? (
            <TouchableOpacity
              onPress={handleDone}
              disabled={resolving}
              style={[s.doneBtn, { backgroundColor: colors.accent, opacity: resolving ? 0.6 : 1 }]}
            >
              {resolving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.doneTxt}>
                  Done{maxSelection > 1 ? ` (${selectedCount})` : ""}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={s.headerSide} />
          )}
        </View>

        {/* ── Tab bar ── */}
        <View style={[s.tabBar, { backgroundColor: headerBg, borderBottomColor: colors.border }]}>
          {TABS.map((t: any) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[s.tabItem, active && { borderBottomColor: tabActiveBorder, borderBottomWidth: 2.5 }]}
              >
                <Ionicons
                  name={t.icon}
                  size={17}
                  color={active ? colors.accent : colors.textMuted ?? "#888"}
                />
                <Text style={[s.tabLabel, { color: active ? colors.accent : colors.textMuted ?? "#888" }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── States ── */}
        {permission === "denied" && (
          <View style={s.center}>
            <Ionicons name="lock-closed" size={48} color={colors.textMuted ?? "#888"} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>Permission Required</Text>
            <Text style={[s.emptyBody, { color: colors.textMuted ?? "#888" }]}>
              Allow AfuChat to access your media library in your device settings.
            </Text>
          </View>
        )}

        {permission !== "denied" && loading && assets.length === 0 && (
          <View style={s.center}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={[s.emptyBody, { color: colors.textMuted ?? "#888", marginTop: 12 }]}>Loading media…</Text>
          </View>
        )}

        {permission === "granted" && !loading && assets.length === 0 && (
          <View style={s.center}>
            <Ionicons name="images" size={48} color={colors.textMuted ?? "#888"} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>Nothing here</Text>
            <Text style={[s.emptyBody, { color: colors.textMuted ?? "#888" }]}>
              No {tab === "all" ? "media files" : tab} found on this device.
            </Text>
          </View>
        )}

        {/* ── Grid ── */}
        {assets.length > 0 && (
          <FlatList
            data={assets}
            keyExtractor={(a) => a.id}
            key={`gallery-${COLS}`}
            numColumns={COLS}
            contentContainerStyle={{ padding: 2, paddingBottom: insets.bottom + 24 }}
            columnWrapperStyle={{ gap: 2 }}
            showsVerticalScrollIndicator={false}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loading ? (
                <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
              ) : null
            }
            renderItem={({ item }) => {
              const isSelected = selected.has(item.id);
              const selIdx = isSelected
                ? Array.from(selected.keys()).indexOf(item.id) + 1
                : -1;
              const isVideo = item.mediaType === MediaLibrary.MediaType.video;
              const isAudio = item.mediaType === MediaLibrary.MediaType.audio;

              return (
                <Pressable
                  onPress={() => toggleSelect(item)}
                  style={({ pressed }) => [
                    s.thumb,
                    { width: THUMB, height: THUMB, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  {isAudio ? (
                    <View style={[s.audioBox, { backgroundColor: isDark ? "#1e1e2e" : "#f4f4f8" }]}>
                      <Ionicons name="musical-note" size={30} color={colors.accent} />
                      <Text style={[s.audioName, { color: colors.text }]} numberOfLines={3}>
                        {item.filename.replace(/\.[^.]+$/, "")}
                      </Text>
                      <Text style={[s.audioDur, { color: colors.textMuted ?? "#888" }]}>
                        {formatDuration(item.duration)}
                      </Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: item.uri }}
                      style={s.thumbImg}
                      resizeMode="cover"
                    />
                  )}

                  {/* Video duration badge */}
                  {isVideo && (
                    <View style={s.vidBadge}>
                      <Ionicons name="play" size={9} color="#fff" />
                      <Text style={s.vidDur}>{formatDuration(item.duration)}</Text>
                    </View>
                  )}

                  {/* Audio waveform icon for audio on top of image (shouldn't happen but guard) */}
                  {isAudio && !isSelected && (
                    <View style={[s.typePill, { backgroundColor: colors.accent + "cc" }]}>
                      <Ionicons name="musical-note" size={10} color="#fff" />
                    </View>
                  )}

                  {/* Selection overlay */}
                  {isSelected && (
                    <View style={[s.selOverlay, { borderColor: colors.accent }]}>
                      <View style={[s.selBadge, { backgroundColor: colors.accent }]}>
                        {maxSelection > 1 ? (
                          <Text style={s.selNum}>{selIdx}</Text>
                        ) : (
                          <Ionicons name="checkmark" size={13} color="#fff" />
                        )}
                      </View>
                    </View>
                  )}

                  {/* Dim unselected when something else is chosen (multi-select) */}
                  {maxSelection > 1 && selectedCount > 0 && !isSelected && (
                    <View style={s.dimOverlay} />
                  )}
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 12,
    
  },
  headerSide: { width: 44, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  doneBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  doneTxt: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  tabBar: {
    flexDirection: "row",
    
  },
  tabItem: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 10,
  },
  tabLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyBody: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },

  thumb: { margin: 1, overflow: "hidden", borderRadius: 2, backgroundColor: "#111" },
  thumbImg: { width: "100%", height: "100%" },

  audioBox: {
    width: "100%", height: "100%",
    alignItems: "center", justifyContent: "center",
    padding: 8, gap: 4,
  },
  audioName: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  audioDur: { fontSize: 9, fontFamily: "Inter_400Regular" },

  vidBadge: {
    position: "absolute", bottom: 5, left: 5,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
  },
  vidDur: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },

  typePill: {
    position: "absolute", top: 5, left: 5,
    borderRadius: 8, padding: 3,
  },

  selOverlay: {
    ...StyleSheet.absoluteFill,
    borderWidth: 3, borderRadius: 2,
  },
  selBadge: {
    position: "absolute", top: 5, right: 5,
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
  },
  selNum: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },

  dimOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
});
