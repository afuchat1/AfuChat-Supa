import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  formatBytes,
  type StorageUsage,
} from "@/lib/mediaUpload";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const BUCKET_META: Record<
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

function bucketMeta(key: string) {
  return (
    BUCKET_META[key] ?? {
      label: key,
      icon: "folder" as IconName,
      color: "#8E8E93",
    }
  );
}

export default function StorageSettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const u = await getStorageUsage();
      if (!u) {
        setError("Couldn't load storage usage. Pull down to retry.");
        setUsage(null);
      } else {
        setError(null);
        setUsage(u);
      }
    } catch (e: any) {
      setError(e?.message || "Couldn't load storage usage.");
      setUsage(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // Sort buckets by size desc, hide empty ones unless everything is empty.
  const breakdown = (() => {
    if (!usage) return [];
    const entries = Object.entries(usage.per_bucket).map(([k, v]) => ({
      key: k,
      bytes: v.bytes,
      count: v.count,
    }));
    const nonEmpty = entries.filter((e) => e.bytes > 0);
    const sorted = (nonEmpty.length ? nonEmpty : entries).sort(
      (a, b) => b.bytes - a.bytes,
    );
    return sorted;
  })();

  const percent = usage
    ? Math.min(100, Math.max(0, usage.percent_used * 100))
    : 0;
  const overQuota = usage ? usage.used_bytes > usage.quota_bytes : false;
  const barColor = overQuota
    ? "#FF3B30"
    : percent > 80
      ? "#FF9500"
      : colors.accent;

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 10,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Storage</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <View
            style={[styles.errorCard, { backgroundColor: colors.surface }]}
          >
            <Ionicons
              name="cloud-offline-outline"
              size={28}
              color={colors.textMuted}
            />
            <Text style={[styles.errorText, { color: colors.textMuted }]}>
              {error}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setLoading(true);
                load();
              }}
              style={[styles.retryBtn, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.retryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : usage ? (
          <>
            {/* Usage summary card */}
            <View
              style={[styles.summaryCard, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
                Used
              </Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {formatBytes(usage.used_bytes)}
                <Text style={[styles.summaryQuota, { color: colors.textMuted }]}>
                  {"  of "}
                  {formatBytes(usage.quota_bytes)}
                </Text>
              </Text>

              <View
                style={[
                  styles.barTrack,
                  { backgroundColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.barFill,
                    {
                      backgroundColor: barColor,
                      width: `${percent}%`,
                    },
                  ]}
                />
              </View>

              <View style={styles.summaryFooter}>
                <Text style={[styles.summaryFooterText, { color: colors.textMuted }]}>
                  {overQuota
                    ? "Over quota"
                    : `${formatBytes(usage.remaining_bytes)} free`}
                </Text>
                <Text style={[styles.summaryFooterText, { color: colors.textMuted }]}>
                  {usage.used_count.toLocaleString()}{" "}
                  {usage.used_count === 1 ? "file" : "files"}
                </Text>
              </View>
            </View>

            {/* Per-bucket breakdown */}
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
              BY TYPE
            </Text>
            <View
              style={[
                styles.list,
                { backgroundColor: colors.surface, borderRadius: 14 },
              ]}
            >
              {breakdown.map((row, i) => {
                const meta = bucketMeta(row.key);
                const totalBytes = usage.used_bytes || 1;
                const pctOfUsed = (row.bytes / totalBytes) * 100;
                return (
                  <React.Fragment key={row.key}>
                    {i > 0 ? <Separator indent={54} /> : null}
                    <View style={styles.row}>
                      <View
                        style={[styles.iconWrap, { backgroundColor: meta.color }]}
                      >
                        <Ionicons name={meta.icon} size={18} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowLabel, { color: colors.text }]}>
                          {meta.label}
                        </Text>
                        <Text
                          style={[styles.rowSub, { color: colors.textMuted }]}
                        >
                          {row.count.toLocaleString()}{" "}
                          {row.count === 1 ? "file" : "files"}
                          {row.bytes > 0
                            ? ` · ${pctOfUsed < 1 ? "<1" : pctOfUsed.toFixed(0)}%`
                            : ""}
                        </Text>
                      </View>
                      <Text style={[styles.rowSize, { color: colors.text }]}>
                        {formatBytes(row.bytes)}
                      </Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>

            <Text style={[styles.footnote, { color: colors.textMuted }]}>
              Stories and disappearing chat media are auto-deleted after 30
              days. Pull down to refresh.
            </Text>
          </>
        ) : null}
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

  loadingWrap: { paddingVertical: 60, alignItems: "center" },

  errorCard: {
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

  summaryCard: { padding: 18, borderRadius: 14, marginBottom: 24 },
  summaryLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  summaryValue: { fontSize: 26, fontFamily: "Inter_600SemiBold" },
  summaryQuota: { fontSize: 16, fontFamily: "Inter_400Regular" },
  barTrack: {
    height: 8,
    borderRadius: 4,
    marginTop: 14,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 4 },
  summaryFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  summaryFooterText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingLeft: 4,
  },
  list: { overflow: "hidden", marginBottom: 16 },
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
  rowLabel: { fontSize: 16, fontFamily: "Inter_400Regular" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  rowSize: { fontSize: 15, fontFamily: "Inter_500Medium" },

  footnote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 6,
    marginTop: 4,
    lineHeight: 18,
  },
});
