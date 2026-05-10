import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
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
          if (Platform.OS === "web") {
            // eslint-disable-next-line no-alert
            window.alert(err || "Could not delete this file.");
          } else {
            Alert.alert("Couldn't delete", err || "Please try again.");
          }
          return;
        }
        // Optimistic UI update — remove the row.
        setFiles((prev) => prev.filter((f) => f.key !== file.key));
      };

      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        if (window.confirm(bodyText)) doDelete();
      } else {
        Alert.alert("Delete file?", bodyText, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: doDelete },
        ]);
      }
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
        if (Platform.OS === "web") {
          // eslint-disable-next-line no-alert
          window.alert(msg);
        } else {
          Alert.alert("Some files remain", msg);
        }
      }
    };

    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm(bodyText)) run();
    } else {
      Alert.alert("Delete everything?", bodyText, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete all", style: "destructive", onPress: run },
      ]);
    }
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

  const emptyEl = !loading ? (
    <View style={styles.emptyWrap}>
      <Ionicons
        name={meta.icon}
        size={42}
        color={colors.textMuted}
        style={{ opacity: 0.4 }}
      />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        Nothing here yet
      </Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>
        You haven't uploaded any {meta.label.toLowerCase()} yet.
      </Text>
    </View>
  ) : null;

  const errorEl = error ? (
    <View style={[styles.errorCard, { backgroundColor: colors.surface }]}>
      <Ionicons
        name="cloud-offline-outline"
        size={28}
        color={colors.textMuted}
      />
      <Text style={[styles.errorText, { color: colors.textMuted }]}>
        {error}
      </Text>
      <TouchableOpacity
        onPress={() => load("initial")}
        style={[styles.retryBtn, { backgroundColor: colors.accent }]}
      >
        <Text style={styles.retryBtnText}>Try again</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title={meta.label} />

      {loading && files.length === 0 && !error ? (
        <>
          {headerEl}
          <View style={{ padding: 12, gap: 10 }}>{[1,2,3,4,5].map(i => <ListRowSkeleton key={i} />)}</View>
        </>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(it) => it.key}
          renderItem={renderItem}
          ListHeaderComponent={
            <>
              {headerEl}
              {errorEl}
            </>
          }
          ListEmptyComponent={errorEl ? null : emptyEl}
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: colors.border,
                marginLeft: 80,
              }}
            />
          )}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 40,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (nextToken && !loadingMore && !loading) load("more");
          }}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <View style={{ width: 56, height: 4, borderRadius: 2, backgroundColor: "#E5E5EA" }} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topbar: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 44, alignItems: "center" },
  topbarTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    textAlign: "center",
  },

  header: { paddingHorizontal: 16, paddingTop: 16 },
  summaryCard: { padding: 14, borderRadius: 14 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  summarySub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  deleteAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteAllBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },

  loadingWrap: { paddingVertical: 60, alignItems: "center" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  deleteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },

  emptyWrap: {
    paddingVertical: 60,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginTop: 6 },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  errorCard: {
    margin: 16,
    padding: 24,
    borderRadius: 14,
    alignItems: "center",
    gap: 12,
  },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
