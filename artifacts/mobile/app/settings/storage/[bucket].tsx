import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import {
  deleteUserFile,
  formatBytes,
  listUserFiles,
  type StoredFile,
} from "@/lib/mediaUpload";
import { bucketMeta } from "./index";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { showAlert } from "@/lib/alert";

const VIDEO_BUCKETS = new Set(["videos", "stories"]);
const IMAGE_BUCKETS = new Set([
  "post-images",
  "avatars",
  "banners",
  "group-avatars",
  "shop-media",
  "match-photos",
  "chat-media",
]);
const AUDIO_BUCKETS = new Set(["voice-messages"]);

function fileKindFromBucket(bucket: string, key: string) {
  const ext = key.split(".").pop()?.toLowerCase() || "";
  if (["mp4", "mov", "webm", "avi"].includes(ext)) return "video";
  if (["mp3", "m4a", "aac", "wav", "ogg", "caf"].includes(ext)) return "audio";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (VIDEO_BUCKETS.has(bucket)) return "video";
  if (AUDIO_BUCKETS.has(bucket)) return "audio";
  if (IMAGE_BUCKETS.has(bucket)) return "image";
  return "file";
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: sameYear ? undefined : "numeric",
    });
  } catch {
    return "";
  }
}

export default function StorageBucketScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ bucket: string }>();
  const bucket = String(params.bucket || "");
  const meta = bucketMeta(bucket);

  const [files, setFiles] = useState<StoredFile[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const totalBytes = useMemo(
    () => files.reduce((acc, f) => acc + (f.size || 0), 0),
    [files],
  );

  const load = useCallback(
    async (mode: "initial" | "refresh" | "more" = "initial") => {
      if (mode === "initial") setLoading(true);
      if (mode === "more") setLoadingMore(true);
      try {
        const token = mode === "more" ? nextToken || undefined : undefined;
        const res = await listUserFiles(bucket, token);
        if (!res) {
          setError(
            "Couldn't load this category. Pull down to retry, or check your connection.",
          );
          return;
        }
        setError(null);
        if (mode === "more") {
          setFiles((prev) => [...prev, ...res.items]);
        } else {
          setFiles(res.items);
        }
        setNextToken(res.nextToken);
      } catch (e: any) {
        setError(e?.message || "Couldn't load files");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [bucket, nextToken],
  );

  useEffect(() => {
    load("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket]);

  const onRefresh = () => {
    setRefreshing(true);
    load("refresh");
  };

  const confirmAndDelete = useCallback(
    (file: StoredFile) => {
      const niceName = file.key.split("/").pop() || file.key;
      const bodyText = `Permanently delete "${niceName}" (${formatBytes(
        file.size,
      )}) from your CDN storage?\n\nIf this file is used in a post, story, message or your profile, that content will be removed too.`;

      const doDelete = async () => {
        setDeletingKeys((s) => {
          const next = new Set(s);
          next.add(file.key);
          return next;
        });
        const { ok, error: err } = await deleteUserFile(file.key);
        setDeletingKeys((s) => {
          const next = new Set(s);
          next.delete(file.key);
          return next;
        });
        if (!ok) {
          showAlert("Couldn't delete", err || "Please try again.");
          return;
        }
        setFiles((prev) => prev.filter((f) => f.key !== file.key));
      };

      showAlert("Delete file?", bodyText, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    },
    [],
  );

  const confirmDeleteAll = useCallback(() => {
    if (files.length === 0 || busy) return;
    const bodyText = `Delete all ${files.length} ${
      files.length === 1 ? "file" : "files"
    } in ${meta.label} (${formatBytes(totalBytes)})? Linked posts, stories, messages or profile media will also be removed.\n\nThis cannot be undone.`;

    const run = async () => {
      setBusy(true);
      const snapshot = [...files];
      let failures = 0;
      for (const f of snapshot) {
        // eslint-disable-next-line no-await-in-loop
        const { ok } = await deleteUserFile(f.key);
        if (ok) {
          setFiles((prev) => prev.filter((x) => x.key !== f.key));
        } else {
          failures += 1;
        }
      }
      setBusy(false);
      if (failures > 0) {
        const msg = `Could not delete ${failures} ${
          failures === 1 ? "file" : "files"
        }. Pull down to refresh.`;
        showAlert("Some files remain", msg);
      }
    };

    showAlert("Delete everything?", bodyText, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete all", style: "destructive", onPress: run },
    ]);
  }, [files, busy, meta.label, totalBytes]);

  const renderItem = ({ item }: { item: StoredFile }) => {
    const kind = fileKindFromBucket(bucket, item.key);
    const isDeleting = deletingKeys.has(item.key);
    const niceName = item.key.split("/").pop() || item.key;
    return (
      <View
        style={[
          styles.row,
          { backgroundColor: colors.surface, opacity: isDeleting ? 0.4 : 1 },
        ]}
      >
        <View
          style={[
            styles.thumb,
            { backgroundColor: colors.backgroundTertiary },
          ]}
        >
          {kind === "image" && item.url ? (
            <Image
              source={{ uri: item.url }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <Ionicons
              name={
                kind === "video"
                  ? "videocam"
                  : kind === "audio"
                    ? "musical-notes"
                    : "document"
              }
              size={22}
              color={colors.textMuted}
            />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[styles.rowName, { color: colors.text }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {niceName}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
            {formatBytes(item.size)}
            {item.last_modified ? ` · ${formatDate(item.last_modified)}` : ""}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => confirmAndDelete(item)}
          disabled={isDeleting || busy}
          hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
          style={styles.deleteBtn}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color="#FF3B30" />
          ) : (
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const headerEl = (
    <View style={styles.header}>
      <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
        <View style={styles.summaryRow}>
          <View style={[styles.iconWrap, { backgroundColor: meta.color }]}>
            <Ionicons name={meta.icon} size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>
              {meta.label}
            </Text>
            <Text style={[styles.summarySub, { color: colors.textMuted }]}>
              {files.length.toLocaleString()}{" "}
              {files.length === 1 ? "file" : "files"} · {formatBytes(totalBytes)}
              {nextToken ? "+" : ""}
            </Text>
          </View>
          {files.length > 0 ? (
            <TouchableOpacity
              onPress={confirmDeleteAll}
              disabled={busy}
              style={[
                styles.deleteAllBtn,
                {
                  backgroundColor: busy ? colors.border : "#FF3B30",
                  opacity: busy ? 0.6 : 1,
                },
              ]}
            >
              <Text style={styles.deleteAllBtnText}>
                {busy ? "Deleting…" : "Delete all"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
        },
      ]}
    >
      <GlassHeader
        title={meta.label}
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={styles.skeletonWrap}>
          {[...Array(8)].map((_, i) => (
            <ListRowSkeleton key={i} />
          ))}
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.errorText, { color: colors.textMuted }]}>{error}</Text>
          <TouchableOpacity
            onPress={() => load("initial")}
            style={[styles.retryBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.retryBtnText, { color: colors.text }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(f) => f.key}
          renderItem={renderItem}
          ListHeaderComponent={headerEl}
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.surface }]}>
                <Ionicons name={meta.icon} size={32} color={colors.textMuted} />
              </View>
              <Text style={[styles.emptyText, { color: colors.text }]}>No files yet</Text>
              <Text style={[styles.emptySubText, { color: colors.textMuted }]}>
                Files you upload to {meta.label.toLowerCase()} will appear here.
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => (
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          )}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ padding: 16, alignItems: "center" }}>
                <ActivityIndicator color={colors.textMuted} size="small" />
              </View>
            ) : null
          }
          onEndReached={nextToken ? () => load("more") : undefined}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.textMuted}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  skeletonWrap: { flex: 1, paddingTop: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },

  header: { padding: 16, paddingBottom: 8 },
  summaryCard: { borderRadius: 16, padding: 16 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  iconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  summaryTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  summarySub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  deleteAllBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  deleteAllBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  rowName: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 2 },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  deleteBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 76 },

  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  retryBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptySubText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
});
