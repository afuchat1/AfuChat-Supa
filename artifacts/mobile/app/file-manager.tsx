import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image as RNImage,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { GlassHeader } from "@/components/ui/GlassHeader";
import AudioPlayer from "@/components/AudioPlayer";
import VideoPreview from "@/components/ui/VideoPreview";
import NearbyTransferSheet from "@/components/nearby/NearbyTransferSheet";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/context/LanguageContext";
import { showAlert } from "@/lib/alert";
import { isExpoGo } from "@/lib/expoEnvironment";
import { getMediaLibrary } from "@/lib/mediaLibrary";

type FileType = "image" | "video" | "audio" | "document";
type Filter = "all" | "image" | "video" | "audio";

type FileItem = {
  id: string;
  assetId?: string;
  name: string;
  size: number;
  type: FileType;
  mimeType?: string;
  uri: string;
  addedAt: string;
  isGallery: boolean;
};

function typeIcon(type: FileType): keyof typeof Ionicons.glyphMap {
  if (type === "image") return "image-outline";
  if (type === "video") return "videocam-outline";
  if (type === "audio") return "musical-notes-outline";
  return "document-text-outline";
}

function FileManagerBottomNav({
  filter,
  transferOpen,
  showTransfer,
  onFilterChange,
  onTransfer,
}: {
  filter: Filter;
  transferOpen: boolean;
  showTransfer: boolean;
  onFilterChange: (filter: Filter) => void;
  onTransfer: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8) + 6;
  const activeColor = colors.accent;
  const inactiveColor = colors.textSecondary;

  const items: Array<{
    key: Filter | "transfer";
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    { key: "all", label: "Library", icon: "folder" },
    { key: "image", label: "Images", icon: "images" },
    { key: "video", label: "Videos", icon: "videocam" },
    { key: "audio", label: "Audio", icon: "musical-notes" },
    ...(showTransfer
      ? [{ key: "transfer" as const, label: "Transfer", icon: "swap-horizontal" as const }]
      : []),
  ];

  return (
    <View style={[styles.fmNavWrap, { bottom }]}>
      <View
        style={[
          styles.fmNav,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        {items.map((item) => {
          const active = item.key === "transfer"
            ? transferOpen
            : !transferOpen && filter === item.key;
          const iconColor = active ? colors.bubbleText : inactiveColor;
          const labelColor = active ? activeColor : inactiveColor;
          return (
            <Pressable
              key={item.key}
              testID={`file-manager-nav-${item.key}`}
              accessibilityRole="button"
              accessibilityLabel={t(item.label)}
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (item.key === "transfer") {
                  onTransfer();
                } else {
                  onFilterChange(item.key);
                }
              }}
              style={styles.fmNavTab}
            >
              <View style={styles.fmNavIcon}>
                {active && (
                  <View
                    style={[
                      styles.fmNavActiveOval,
                      { backgroundColor: activeColor, pointerEvents: "none" },
                    ]}
                  />
                )}
                <Ionicons name={item.icon} size={21} color={iconColor} />
              </View>
              <Text style={[styles.fmNavLabel, { color: labelColor }]} numberOfLines={1}>
                {t(item.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function FileManagerScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [galleryFiles, setGalleryFiles] = useState<FileItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryPermission, setGalleryPermission] = useState<"checking" | "granted" | "denied">("checking");
  const [galleryCanAskAgain, setGalleryCanAskAgain] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFile, setTransferFile] = useState<FileItem | null>(null);
  const transferSupported = Platform.OS !== "web" && !isExpoGo();

  const loadGallery = useCallback(async (activeFilter: Filter = filter) => {
    if (Platform.OS === "web") {
      setGalleryPermission("denied");
      setGalleryLoading(false);
      return;
    }
    setGalleryLoading(true);
    try {
      const MediaLibrary = getMediaLibrary();
      if (!MediaLibrary) return;
      const current = await MediaLibrary.getPermissionsAsync();
      const hasAccess = current.granted || current.status === "granted";
      setGalleryCanAskAgain(current.canAskAgain !== false);
      if (!hasAccess) {
        setGalleryPermission("denied");
        setGalleryFiles([]);
        return;
      }

      const mediaType: ("photo" | "video" | "audio")[] = activeFilter === "image"
        ? ["photo"]
        : activeFilter === "video"
          ? ["video"]
          : activeFilter === "audio"
            ? ["audio"]
            : ["photo", "video"];
      const result = await MediaLibrary.getAssetsAsync({
        mediaType,
        first: 300,
        sortBy: [["creationTime", false]],
      });
      setGalleryFiles(result.assets.map((asset) => ({
        id: `gallery-${asset.id}`,
        assetId: asset.id,
        name: asset.filename || `${asset.mediaType}-${asset.id}`,
        size: Number((asset as any).fileSize) || 0,
         type: asset.mediaType === "photo"
          ? "image"
           : asset.mediaType === "video"
            ? "video"
            : "audio",
         mimeType: asset.mediaType === "photo"
          ? "image/*"
           : asset.mediaType === "video"
            ? "video/*"
            : "audio/*",
        uri: asset.uri,
        addedAt: new Date(asset.creationTime || Date.now()).toISOString(),
        isGallery: true,
      })));
      setGalleryPermission("granted");
    } catch {
      setGalleryPermission("denied");
      setGalleryFiles([]);
    } finally {
      setGalleryLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadGallery(filter);
  }, [filter, loadGallery]);

  const requestGalleryAccess = useCallback(async () => {
    if (Platform.OS === "web") return;
    if (galleryPermission === "denied" && !galleryCanAskAgain) {
      await Linking.openSettings();
      return;
    }
    setGalleryLoading(true);
    try {
      const MediaLibrary = getMediaLibrary();
      if (!MediaLibrary) return;
      const result = await MediaLibrary.requestPermissionsAsync();
      setGalleryCanAskAgain(result.canAskAgain !== false);
      if (result.granted || result.status === "granted") {
        setGalleryPermission("granted");
        await loadGallery(filter);
      } else {
        setGalleryPermission("denied");
      }
    } catch {
      setGalleryPermission("denied");
    } finally {
      setGalleryLoading(false);
    }
  }, [filter, galleryCanAskAgain, galleryPermission, loadGallery]);

  const filteredFiles = useMemo(
    () => galleryFiles
      .filter((file) => filter === "all" || file.type === filter)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    [filter, galleryFiles],
  );
  const selectedFiles = useMemo(
    () => galleryFiles.filter((file) => selectedIds.has(file.id)),
    [galleryFiles, selectedIds],
  );
  const selectedFile = selectedFiles[0] ?? null;
  const isGrid = filter !== "audio";

  const toggleSelected = useCallback((fileId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const changeFilter = useCallback((nextFilter: Filter) => {
    setFilter(nextFilter);
    setSelectedIds(new Set());
  }, []);

  const resolveLocalUri = useCallback(async (file: FileItem): Promise<FileItem> => {
    if (Platform.OS === "web" || !file.assetId) return file;
    try {
      const MediaLibrary = getMediaLibrary();
      if (!MediaLibrary) return file;
      const info = await MediaLibrary.getAssetInfoAsync(file.assetId, {
        shouldDownloadFromNetwork: false,
      });
      return { ...file, uri: (info as any).localUri || info.uri || file.uri };
    } catch {
      return file;
    }
  }, []);

  const openTransfer = useCallback(async () => {
    if (!selectedFile) {
      setTransferOpen(true);
      return;
    }

    // MediaLibrary may return a content URI and a zero fileSize for a
    // gallery row. Resolve the asset before opening nearby transfer so the
    // sender has a readable local URI and an accurate byte count.
    let prepared = selectedFile;
    if (Platform.OS !== "web" && selectedFile.assetId) {
      try {
        const MediaLibrary = getMediaLibrary();
        if (!MediaLibrary) return;
        const info = await MediaLibrary.getAssetInfoAsync(selectedFile.assetId);
        const localUri = (info as any).localUri || selectedFile.uri;
        let resolvedSize = Number((info as any).fileSize);
        if ((!Number.isFinite(resolvedSize) || resolvedSize <= 0) && localUri) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(localUri);
            resolvedSize = Number((fileInfo as any).size);
          } catch {
            // Some Android content providers reject getInfoAsync even though
            // copyAsync can still resolve the underlying document.
          }
        }
        prepared = {
          ...selectedFile,
          uri: localUri,
          size: Number.isFinite(resolvedSize) && resolvedSize > 0
            ? resolvedSize
            : selectedFile.size,
        };

        // Android gallery providers often expose content:// URIs that the
        // WebRTC file reader cannot seek, while also reporting size 0. Copy
        // the asset into AfuChat's private storage so the transfer always
        // receives a normal file:// URI and a real byte count.
        const needsPrivateCopy =
          /^content:\/\//i.test(localUri) ||
          !Number.isFinite(Number(prepared.size)) ||
          Number(prepared.size) <= 0;
        if (needsPrivateCopy && FileSystem.documentDirectory) {
          const directory = `${FileSystem.documentDirectory}afuchat-transfer/`;
          await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => {});
          const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "shared-file";
          const destination = `${directory}${selectedFile.assetId}-${safeName}`;
          let copiedInfo = await FileSystem.getInfoAsync(destination).catch(() => ({ exists: false }));
          if (!copiedInfo.exists || Number((copiedInfo as any).size) <= 0) {
            await FileSystem.copyAsync({ from: localUri, to: destination });
            copiedInfo = await FileSystem.getInfoAsync(destination);
          }
          const copiedSize = Number((copiedInfo as any).size);
          if (copiedInfo.exists && Number.isFinite(copiedSize) && copiedSize > 0) {
            prepared = { ...prepared, uri: destination, size: copiedSize };
          }
        }
      } catch {
        // The transfer screen will report a readable-file error if the
        // provider cannot resolve this gallery item.
      }
    }
    setTransferFile(prepared);
    setTransferOpen(true);
  }, [selectedFile]);

  const shareSelectedFiles = useCallback(async () => {
    if (selectedFiles.length === 0 || Platform.OS === "web") return;
    try {
      const prepared = await Promise.all(selectedFiles.map(resolveLocalUri));

      // Keep multiple media items together when sharing inside AfuChat. The
      // share screen then lets the user choose a chat and review all items.
      if (prepared.length > 1) {
        router.push({
          pathname: "/share",
          params: {
            files: JSON.stringify(prepared.map((file) => ({
              path: file.uri,
              name: file.name,
              mimeType: file.mimeType,
              type: file.type,
            }))),
          },
        } as any);
        return;
      }
      const file = prepared[0];
      if (!file?.uri) throw new Error("This file is not available on the device.");
      const available = await Sharing.isAvailableAsync();
      if (!available) throw new Error("System sharing is not available on this device.");
      await Sharing.shareAsync(file.uri, {
        mimeType: file.mimeType || "application/octet-stream",
        dialogTitle: `Share ${file.name}`,
        UTI: file.mimeType || "public.data",
      });
    } catch (error: any) {
      showAlert("Share failed", error?.message || "Could not open the system share sheet.");
    }
  }, [resolveLocalUri, selectedFiles]);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader
        title="File Manager"
        glassBackButton
        style={styles.header}
      />

      {galleryLoading && galleryPermission === "checking" ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : filteredFiles.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name={galleryPermission === "granted" ? "images-outline" : "folder-open-outline"} size={52} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {galleryPermission !== "granted"
              ? "Gallery access is needed"
              : galleryFiles.length === 0
                ? "Your device gallery is empty"
                : "No files in this filter"}
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
            {galleryPermission !== "granted"
              ? "Use the button below to show the photos and videos already saved on your phone."
              : galleryFiles.length === 0
                ? "Photos and videos from your phone will appear here."
                : "Choose another category to browse your phone gallery."}
          </Text>
          {galleryPermission !== "granted" ? (
            <Pressable onPress={requestGalleryAccess} style={[styles.emptyAction, { backgroundColor: colors.accent }]}>
              <Ionicons name="images-outline" size={18} color={colors.background} />
              <Text style={[styles.emptyActionText, { color: colors.background }]}>Allow gallery access</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={filteredFiles}
          keyExtractor={(item) => item.id}
          key={`file-manager-${isGrid ? "grid" : "list"}`}
          numColumns={isGrid ? 3 : 1}
          contentContainerStyle={{ paddingBottom: insets.bottom + 132, paddingTop: 4, paddingHorizontal: isGrid ? 2 : 0 }}
          columnWrapperStyle={isGrid ? styles.gridRow : undefined}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          renderItem={({ item }) => {
            const selected = selectedIds.has(item.id);
            if (isGrid) {
              return (
                <Pressable
                  testID={`file-tile-${item.id}`}
                  onPress={() => setPreviewFile(item)}
                  style={({ pressed }) => [styles.gridTile, { opacity: pressed ? 0.82 : 1 }]}
                >
                  {item.type === "image" ? (
                    <Image source={{ uri: item.uri }} style={styles.gridImage} />
                  ) : (
                    <View style={[styles.gridVideo, { backgroundColor: colors.surface }]}>
                      <Image source={{ uri: item.uri }} style={styles.gridImage} />
                      <View style={styles.gridVideoShade} />
                      <Ionicons name="play-circle" size={32} color="#fff" />
                    </View>
                  )}
                  <Pressable
                    testID={`file-select-${item.id}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={selected ? "Remove from selection" : "Add to selection"}
                    onPress={() => toggleSelected(item.id)}
                    hitSlop={8}
                    style={[styles.selectionBadge, selected && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                  >
                    {selected && <Ionicons name="checkmark" size={14} color={colors.background} />}
                  </Pressable>
                </Pressable>
              );
            }
            return (
              <Pressable
                testID={`file-row-${item.id}`}
                onPress={() => setPreviewFile(item)}
                style={[styles.fileRow, { backgroundColor: colors.surface }, selected && { borderColor: colors.accent, borderWidth: 1 }]}
              >
                <View style={[styles.fileIcon, { backgroundColor: colors.accent + "18" }]}>
                  <Ionicons name={typeIcon(item.type)} size={22} color={colors.accent} />
                </View>
                <View style={styles.fileCopy}>
                  <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.fileMeta, { color: colors.textMuted }]}>
                    {item.type} · Phone gallery · tap to play
                  </Text>
                </View>
                <Pressable
                  testID={`file-select-${item.id}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={selected ? "Remove from selection" : "Add to selection"}
                  onPress={() => toggleSelected(item.id)}
                  hitSlop={8}
                  style={[styles.selectionBadge, selected && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                >
                  {selected && <Ionicons name="checkmark" size={14} color={colors.background} />}
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}

      {Platform.OS !== "web" && selectedFiles.length > 0 && (
        <View style={[styles.actionBar, { bottom: Math.max(insets.bottom, 8) + 76 }]}>
          <Pressable
            testID="file-manager-share"
            accessibilityRole="button"
            accessibilityLabel={`Share ${selectedFiles.length} selected files`}
            onPress={shareSelectedFiles}
            style={[styles.sendBar, { backgroundColor: colors.surface, borderColor: colors.accent }]}
          >
            <Ionicons name="share-outline" size={19} color={colors.accent} />
            <Text style={[styles.sendBarText, { color: colors.accent }]}>
              Share {selectedFiles.length > 1 ? `${selectedFiles.length} files` : "file"}
            </Text>
          </Pressable>
          <Pressable
            testID="file-manager-send"
            accessibilityRole="button"
            accessibilityLabel={`Send ${selectedFile.name} offline`}
            onPress={openTransfer}
            style={[styles.sendBar, { backgroundColor: colors.accent }]}
          >
            <Ionicons name="paper-plane" size={19} color={colors.background} />
            <Text style={[styles.sendBarText, { color: colors.background }]}>Send offline</Text>
          </Pressable>
        </View>
      )}

      <FileManagerBottomNav
        filter={filter}
        transferOpen={transferOpen}
        showTransfer={transferSupported}
        onFilterChange={changeFilter}
        onTransfer={openTransfer}
      />

      <Modal
        visible={!!previewFile}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewFile(null)}
      >
        <View style={styles.previewRoot}>
          <View style={styles.previewHeader}>
            <Pressable
              onPress={() => setPreviewFile(null)}
              hitSlop={12}
              accessibilityLabel="Close preview"
              style={styles.previewClose}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {previewFile?.type === "audio" ? previewFile.name : "Preview"}
            </Text>
            <View style={styles.previewClose} />
          </View>
          {previewFile?.type === "image" && (
            <Image source={{ uri: previewFile.uri }} style={styles.fullImage} resizeMode="contain" />
          )}
          {previewFile?.type === "video" && (
            <VideoPreview
              uri={previewFile.uri}
              style={styles.fullVideo}
              contentFit="contain"
              shouldPlay
              isLooping={false}
              nativeControls
            />
          )}
          {previewFile?.type === "audio" && (
            <View style={styles.fullAudio}>
              <View style={styles.audioArtwork}>
                <Ionicons name="musical-notes" size={54} color={colors.accent} />
              </View>
              <Text style={styles.fullAudioName} numberOfLines={2}>{previewFile.name}</Text>
              <AudioPlayer
                uri={previewFile.uri}
                tintColor="#fff"
                waveColor={colors.accent}
                backgroundColor="rgba(255,255,255,0.1)"
              />
            </View>
          )}
        </View>
      </Modal>

      <NearbyTransferSheet
        visible={transferOpen}
        file={transferFile ? {
          uri: transferFile.uri,
          name: transferFile.name,
          size: transferFile.size,
          mimeType: transferFile.mimeType,
        } : null}
        onClose={() => {
          setTransferOpen(false);
          setTransferFile(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  actionBar: { position: "absolute", left: 16, right: 16, flexDirection: "row", gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyAction: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 11, marginTop: 4 },
  emptyActionText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  fileRow: { minHeight: 72, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 14, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 13 },
  thumbnail: { width: 48, height: 48, borderRadius: 13, backgroundColor: "rgba(128,128,128,0.15)" },
  fileIcon: { width: 43, height: 43, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  fileCopy: { flex: 1 },
  fileName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fileMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  gridRow: { gap: 2 },
  gridTile: { flex: 1, aspectRatio: 1, margin: 1, position: "relative", overflow: "hidden", borderRadius: 4, backgroundColor: "#222" },
  gridImage: { width: "100%", height: "100%" },
  gridVideo: { flex: 1, alignItems: "center", justifyContent: "center" },
  gridVideoShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.24)" },
  selectionBadge: { position: "absolute", top: 7, right: 7, width: 23, height: 23, borderRadius: 12, borderWidth: 2, borderColor: "#fff", backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
  sendBar: { flex: 1, minHeight: 52, borderRadius: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 12, gap: 9 },
  sendBarText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  sendBarHint: { marginLeft: "auto", fontSize: 11, fontFamily: "Inter_500Medium" },
  fmNavWrap: { position: "absolute", left: 20, right: 20, zIndex: 100, alignItems: "center" },
  fmNav: { height: 56, width: "100%", borderRadius: 999, borderWidth: 1, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", overflow: "hidden" },
  fmNavTab: { flex: 1, minWidth: 0, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  fmNavIcon: { width: 44, height: 30, alignItems: "center", justifyContent: "center", position: "relative" },
  fmNavActiveOval: { ...StyleSheet.absoluteFill, borderRadius: 9999 },
  fmNavLabel: { width: "100%", fontSize: 9, lineHeight: 10, fontFamily: "Inter_700Bold", fontWeight: "700", textAlign: "center", marginTop: 0, includeFontPadding: false },
  previewRoot: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  previewHeader: { position: "absolute", top: 50, left: 16, right: 16, zIndex: 2, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  previewClose: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  previewTitle: { flex: 1, color: "#fff", textAlign: "center", fontSize: 15, fontFamily: "Inter_600SemiBold", paddingHorizontal: 12 },
  fullImage: { width: "100%", height: "100%" },
  fullVideo: { width: "100%", height: "78%" },
  fullAudio: { width: "100%", alignItems: "center", paddingHorizontal: 22 },
  audioArtwork: { width: 150, height: 150, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)", marginBottom: 24 },
  fullAudioName: { color: "#fff", fontSize: 17, lineHeight: 23, textAlign: "center", fontFamily: "Inter_700Bold", marginBottom: 20 },
});