import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Separator } from "@/components/ui/Separator";
import {
  getStorageUsage,
  getCachedStorageUsage,
  formatBytes,
  type StorageUsage,
} from "@/lib/mediaUpload";
import { useStorageStats } from "@/hooks/useStorageStats";
import { formatBytes as fmtBytes } from "@/hooks/useStorageStats";
import { clearMediaCache } from "@/lib/storage/mediaCache";
import { clearAllOfflineVideos } from "@/lib/videoCache";
import { clearTempCache } from "@/lib/storage/tempCache";
import { Image as ExpoImage } from "expo-image";
import { GlassHeader } from "@/components/ui/GlassHeader";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export const BUCKET_META: Record<
  string,
  { label: string; icon: IconName; color: string }
> = {
  videos: { label: "Videos", icon: "videocam", color: "#FF3B30" },
  "post-images": { label: "Photos", icon: "image", color: "#FF9500" },
  stories: { label: "Stories", icon: "camera", color: "#FF2D55" },
  "voice-messages": { label: "Voice notes", icon: "mic", color: "#5856D6" },
  "chat-media": { label: "Chat media", icon: "chatbubble-ellipses", color: "#32D74B" },
  avatars: { label: "Profile photo", icon: "person-circle", color: "#007AFF" },
  banners: { label: "Profile banner", icon: "images", color: "#0A84FF" },
  "group-avatars": { label: "Group photos", icon: "people-circle", color: "#5AC8FA" },
  "shop-media": { label: "Shop media", icon: "storefront", color: "#FFD60A" },
  "match-photos": { label: "Match photos", icon: "heart", color: "#FF375F" },
};

export function bucketMeta(key: string) {
  return (
    BUCKET_META[key] ?? {
      label: key,
      icon: "folder" as IconName,
      color: "#8E8E93",
    }
  );
}

type ClearTarget = "videos" | "media" | "imgcache" | "tempcache";

export default function StorageSettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { stats: deviceStats, loading: deviceLoading, refresh: refreshDevice } = useStorageStats();
  const [clearing, setClearing] = useState<ClearTarget | null>(null);

  useEffect(() => {
    let alive = true;
    getCachedStorageUsage().then((cached) => {
      if (!alive) return;
      if (cached) setUsage(cached);
      setHydrated(true);
    });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    try {
      const u = await getStorageUsage();
      if (!u) {
        setError("Couldn't load storage usage. Pull down to retry.");
      } else {
        setError(null);
        setUsage(u);
      }
    } catch (e: any) {
      setError(e?.message || "Couldn't load storage usage.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (hydrated) load();
  }, [hydrated, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
    refreshDevice();
  }, [load, refreshDevice]);

  const clearVideos = useCallback(() => {
    const { videoCount, videoBytes } = deviceStats;
    Alert.alert(
      "Clear Offline Videos",
      `This will delete all ${videoCount} cached video${videoCount === 1 ? "" : "s"} (${fmtBytes(videoBytes)}) from your device. They'll re-download when watched online.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setClearing("videos");
            await clearAllOfflineVideos();
            await refreshDevice();
            setClearing(null);
          },
        },
      ],
    );
  }, [deviceStats, refreshDevice]);

  const clearMedia = useCallback(() => {
    const { mediaCount, mediaBytes } = deviceStats;
    Alert.alert(
      "Clear Thumbnail Cache",
      `This will delete ${mediaCount} cached thumbnail${mediaCount === 1 ? "" : "s"} (${fmtBytes(mediaBytes)}). They'll be re-downloaded as you browse.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setClearing("media");
            await clearMediaCache();
            await refreshDevice();
            setClearing(null);
          },
        },
      ],
    );
  }, [deviceStats, refreshDevice]);

  const clearImageCache = useCallback(() => {
    Alert.alert(
      "Clear App Image Cache",
      "This will remove profile photos, post thumbnails, and other images stored by the app. They'll be re-downloaded automatically as you browse. Your chat attachments and offline videos are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setClearing("imgcache");
            try {
              await ExpoImage.clearDiskCache();
              await ExpoImage.clearMemoryCache();
            } catch {}
            await refreshDevice();
            setClearing(null);
          },
        },
      ],
    );
  }, [refreshDevice]);

  const clearTemp = useCallback(() => {
    const { tempCacheBytes, tempCacheCount } = deviceStats;
    Alert.alert(
      "Clear Temporary Cache",
      `This will remove ${tempCacheCount} temporary file${tempCacheCount === 1 ? "" : "s"} (${fmtBytes(tempCacheBytes)}) — upload staging, feed preloads, and previews. Nothing permanent is deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Cache",
          style: "destructive",
          onPress: async () => {
            setClearing("tempcache");
            await clearTempCache();
            await refreshDevice();
            setClearing(null);
          },
        },
      ],
    );
  }, [deviceStats, refreshDevice]);

  const orderedBuckets = Object.keys(BUCKET_META);
  const breakdown = orderedBuckets.map((key) => ({
    key,
    bytes: usage?.per_bucket?.[key]?.bytes ?? 0,
    count: usage?.per_bucket?.[key]?.count ?? 0,
  }));

  const percent = usage ? Math.min(100, Math.max(0, usage.percent_used)) : 0;
  const overQuota = usage ? usage.used_bytes > usage.quota_bytes : false;
  const barColor = overQuota ? "#FF3B30" : percent > 80 ? "#FF9500" : colors.accent;
  const showSkeleton = !usage && hydrated && !error;

  const { chatAttachments } = deviceStats;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Storage" />

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {error && !usage ? (
          <View style={[styles.errorCard, { backgroundColor: colors.surface }]}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
            <Text style={[styles.errorText, { color: colors.textMuted }]}>{error}</Text>
            <TouchableOpacity
              onPress={() => { setError(null); load(); }}
              style={[styles.retryBtn, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.retryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── CDN Storage (Cloudflare R2) ──────────────────────────── */}
            <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>CDN STORAGE USED</Text>
              {usage ? (
                <Text style={[styles.summaryValue, { color: colors.text }]}>
                  {formatBytes(usage.used_bytes)}
                  <Text style={[styles.summaryQuota, { color: colors.textMuted }]}>
                    {"  of "}
                    {formatBytes(usage.quota_bytes)}
                  </Text>
                </Text>
              ) : (
                <View style={[styles.skel, { backgroundColor: colors.border, width: 180, height: 28 }]} />
              )}
              <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.barFill,
                    { backgroundColor: barColor, width: usage ? `${percent}%` : "0%" },
                  ]}
                />
              </View>
              <View style={styles.summaryFooter}>
                <Text style={[styles.summaryFooterText, { color: colors.textMuted }]}>
                  {usage ? (overQuota ? "Over quota" : `${formatBytes(usage.remaining_bytes)} free`) : "Loading…"}
                </Text>
                <View style={styles.summaryRight}>
                  {refreshing ? (
                    <ActivityIndicator size="small" color={colors.textMuted} style={{ marginRight: 6 }} />
                  ) : null}
                  <Text style={[styles.summaryFooterText, { color: colors.textMuted }]}>
                    {usage ? `${usage.used_count.toLocaleString()} ${usage.used_count === 1 ? "file" : "files"}` : ""}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              BY TYPE — TAP TO MANAGE
            </Text>
            <View style={[styles.list, { backgroundColor: colors.surface, borderRadius: 14 }]}>
              {breakdown.map((row, i) => {
                const meta = bucketMeta(row.key);
                const totalBytes = usage?.used_bytes || 1;
                const pctOfUsed = (row.bytes / totalBytes) * 100;
                const sub = usage
                  ? `${row.count.toLocaleString()} ${row.count === 1 ? "file" : "files"}${row.bytes > 0 ? ` · ${pctOfUsed < 1 ? "<1" : pctOfUsed.toFixed(0)}%` : ""}`
                  : showSkeleton ? "Loading…" : "—";
                return (
                  <React.Fragment key={row.key}>
                    {i > 0 ? <Separator indent={54} /> : null}
                    <TouchableOpacity
                      activeOpacity={0.6}
                      onPress={() => router.push(`/settings/storage/${row.key}` as any)}
                      style={styles.row}
                    >
                      <View style={[styles.iconWrap, { backgroundColor: meta.color }]}>
                        <Ionicons name={meta.icon} size={18} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowLabel, { color: colors.text }]}>{meta.label}</Text>
                        <Text style={[styles.rowSub, { color: colors.textMuted }]}>{sub}</Text>
                      </View>
                      <Text style={[styles.rowSize, { color: colors.text }]}>
                        {usage ? formatBytes(row.bytes) : "—"}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </View>
            <Text style={[styles.footnote, { color: colors.textMuted }]}>
              Files you upload to AfuChat (photos, videos, voice notes). Tap a category to view and delete individual files.
            </Text>

            {/* ── On-Device: Permanent User Data ─────────────────────── */}
            <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 24 }]}>
              ON-DEVICE · USER DATA
            </Text>
            <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
              Stored permanently — never cleared automatically by the OS
            </Text>
            <View style={[styles.list, { backgroundColor: colors.surface, borderRadius: 14 }]}>

              {/* SQLite */}
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: "#5856D6" }]}>
                  <Ionicons name="server-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Chat & Feed Database</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>Messages, conversations, posts</Text>
                </View>
                {deviceLoading ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Text style={[styles.rowSize, { color: colors.text }]}>{fmtBytes(deviceStats.sqliteBytes)}</Text>
                )}
              </View>

              <Separator indent={54} />

              {/* Offline videos */}
              <TouchableOpacity activeOpacity={0.6} style={styles.row} onPress={clearVideos}>
                <View style={[styles.iconWrap, { backgroundColor: "#FF3B30" }]}>
                  <Ionicons name="videocam-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Offline Videos</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                    {deviceLoading ? "Loading…" : `${deviceStats.videoCount} video${deviceStats.videoCount === 1 ? "" : "s"} · tap to clear`}
                  </Text>
                </View>
                {clearing === "videos" ? (
                  <ActivityIndicator size="small" color="#FF3B30" />
                ) : deviceLoading ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Text style={[styles.rowSize, { color: "#FF3B30" }]}>{fmtBytes(deviceStats.videoBytes)}</Text>
                )}
                {clearing !== "videos" && !deviceLoading && (
                  <Ionicons name="trash-outline" size={18} color="#FF3B30" style={{ marginLeft: 4 }} />
                )}
              </TouchableOpacity>

              <Separator indent={54} />

              {/* Chat images */}
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: "#32D74B" }]}>
                  <Ionicons name="image-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Chat Images</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                    {deviceLoading ? "Loading…" : `${chatAttachments.imagesCount} image${chatAttachments.imagesCount === 1 ? "" : "s"}`}
                  </Text>
                </View>
                {deviceLoading ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Text style={[styles.rowSize, { color: colors.text }]}>{fmtBytes(chatAttachments.imagesBytes)}</Text>
                )}
              </View>

              <Separator indent={54} />

              {/* Voice notes */}
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: "#AF52DE" }]}>
                  <Ionicons name="mic-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Voice Notes</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                    {deviceLoading ? "Loading…" : `${chatAttachments.audioCount} recording${chatAttachments.audioCount === 1 ? "" : "s"}`}
                  </Text>
                </View>
                {deviceLoading ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Text style={[styles.rowSize, { color: colors.text }]}>{fmtBytes(chatAttachments.audioBytes)}</Text>
                )}
              </View>

              <Separator indent={54} />

              {/* Chat files */}
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: "#FF9500" }]}>
                  <Ionicons name="document-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Chat Files & GIFs</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                    {deviceLoading ? "Loading…" : `${chatAttachments.filesCount + chatAttachments.gifsCount} file${chatAttachments.filesCount + chatAttachments.gifsCount === 1 ? "" : "s"}`}
                  </Text>
                </View>
                {deviceLoading ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Text style={[styles.rowSize, { color: colors.text }]}>{fmtBytes(chatAttachments.filesBytes + chatAttachments.gifsBytes)}</Text>
                )}
              </View>

              <Separator indent={54} />

              {/* Profile / thumbnail cache */}
              <TouchableOpacity activeOpacity={0.6} style={styles.row} onPress={clearMedia}>
                <View style={[styles.iconWrap, { backgroundColor: "#007AFF" }]}>
                  <Ionicons name="person-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Profiles & Thumbnails</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                    {deviceLoading ? "Loading…" : `${deviceStats.profileCacheCount} cached · tap to clear`}
                  </Text>
                </View>
                {clearing === "media" ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : deviceLoading ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Text style={[styles.rowSize, { color: "#007AFF" }]}>{fmtBytes(deviceStats.profileCacheBytes)}</Text>
                )}
                {clearing !== "media" && !deviceLoading && (
                  <Ionicons name="trash-outline" size={18} color="#007AFF" style={{ marginLeft: 4 }} />
                )}
              </TouchableOpacity>
            </View>

            {/* User data total */}
            <View style={[styles.totalRow, { backgroundColor: colors.surface }]}>
              <Text style={[styles.totalLabel, { color: colors.textMuted }]}>Total user data</Text>
              {deviceLoading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={[styles.totalValue, { color: colors.text }]}>
                  {fmtBytes(deviceStats.totalUserDataBytes)}
                </Text>
              )}
            </View>

            {/* ── On-Device: Cache (OS can clear) ─────────────────────── */}
            <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: 24 }]}>
              ON-DEVICE · CACHE
            </Text>
            <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
              Android may clear this automatically under storage pressure
            </Text>
            <View style={[styles.list, { backgroundColor: colors.surface, borderRadius: 14 }]}>

              {/* Temp cache */}
              <TouchableOpacity activeOpacity={0.6} style={styles.row} onPress={clearTemp}>
                <View style={[styles.iconWrap, { backgroundColor: "#8E8E93" }]}>
                  <Ionicons name="folder-open-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Temp Files</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                    {deviceLoading
                      ? "Loading…"
                      : `${deviceStats.tempCacheCount} file${deviceStats.tempCacheCount === 1 ? "" : "s"}${deviceStats.tempCacheOldFiles > 0 ? ` · ${deviceStats.tempCacheOldFiles} ready to clean` : ""} · tap to clear`}
                  </Text>
                </View>
                {clearing === "tempcache" ? (
                  <ActivityIndicator size="small" color="#8E8E93" />
                ) : deviceLoading ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Text style={[styles.rowSize, { color: "#8E8E93" }]}>{fmtBytes(deviceStats.tempCacheBytes)}</Text>
                )}
                {clearing !== "tempcache" && !deviceLoading && (
                  <Ionicons name="trash-outline" size={18} color="#8E8E93" style={{ marginLeft: 4 }} />
                )}
              </TouchableOpacity>

              <Separator indent={54} />

              {/* expo-image disk cache */}
              <TouchableOpacity activeOpacity={0.6} style={styles.row} onPress={clearImageCache}>
                <View style={[styles.iconWrap, { backgroundColor: "#5AC8FA" }]}>
                  <Ionicons name="cloud-download-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Image Decode Cache</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                    Feed images, post thumbnails · tap to clear
                  </Text>
                </View>
                {clearing === "imgcache" ? (
                  <ActivityIndicator size="small" color="#5AC8FA" />
                ) : (
                  <Ionicons name="trash-outline" size={18} color="#5AC8FA" style={{ marginLeft: 4 }} />
                )}
              </TouchableOpacity>

              <Separator indent={54} />

              {/* Pending sync */}
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: "#34C759" }]}>
                  <Ionicons name="sync-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Pending Sync</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                    {deviceLoading ? "Loading…" : `${deviceStats.pendingActions} action${deviceStats.pendingActions === 1 ? "" : "s"} queued`}
                  </Text>
                </View>
                {!deviceLoading && (
                  <Text style={[styles.rowSize, { color: colors.text }]}>
                    {deviceStats.pendingActions === 0 ? "All synced" : "Pending"}
                  </Text>
                )}
              </View>
            </View>

            {/* Cache total */}
            <View style={[styles.totalRow, { backgroundColor: colors.surface }]}>
              <Text style={[styles.totalLabel, { color: colors.textMuted }]}>Total cache</Text>
              {deviceLoading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={[styles.totalValue, { color: colors.text }]}>
                  {fmtBytes(deviceStats.totalCacheBytes)}
                </Text>
              )}
            </View>

            <Text style={[styles.footnote, { color: colors.textMuted, marginTop: 8 }]}>
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>User data</Text> is what Android counts as permanent storage — chat attachments, offline videos, and your message history stay here until you delete them.{"\n\n"}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>Cache</Text> is temporary and safe to clear at any time — it'll be rebuilt automatically as you use the app. This is what Android shows under "Cache" in system storage settings.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 44, alignItems: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  body: { paddingTop: 24, paddingHorizontal: 16 },

  errorCard: {
    padding: 24,
    borderRadius: 14,
    alignItems: "center",
    gap: 12,
  },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },

  summaryCard: { padding: 18, borderRadius: 14, marginBottom: 24 },
  summaryLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  summaryValue: { fontSize: 26, fontFamily: "Inter_600SemiBold" },
  summaryQuota: { fontSize: 16, fontFamily: "Inter_400Regular" },
  skel: { borderRadius: 6, marginTop: 4 },
  barTrack: { height: 8, borderRadius: 4, marginTop: 14, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  summaryFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  summaryRight: { flexDirection: "row", alignItems: "center" },
  summaryFooterText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 2,
    paddingLeft: 4,
  },
  sectionHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
    paddingLeft: 4,
  },

  list: { overflow: "hidden", marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 14,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  rowSize: { fontSize: 14, fontFamily: "Inter_400Regular" },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  totalLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  totalValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  footnote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    paddingHorizontal: 4,
    marginTop: 4,
    marginBottom: 8,
  },
});
