import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";

type FileItem = {
  id: string;
  name: string;
  size: number;
  type: "image" | "video" | "audio" | "document";
  url: string;
  created_at: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function typeIcon(type: FileItem["type"]): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "image": return "image-outline";
    case "video": return "videocam-outline";
    case "audio": return "musical-notes-outline";
    default: return "document-outline";
  }
}

function typeColor(type: FileItem["type"]): string {
  switch (type) {
    case "image": return "#00BCD4";
    case "video": return "#9C27B0";
    case "audio": return "#FF9800";
    default: return "#607D8B";
  }
}

export default function FileManagerScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFiles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: posts } = await supabase
        .from("posts")
        .select("id, image_url, video_url, post_type, created_at")
        .eq("author_id", user.id)
        .not("image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);

      const items: FileItem[] = (posts ?? []).flatMap((p: any) => {
        const result: FileItem[] = [];
        if (p.image_url) {
          result.push({
            id: p.id + "-img",
            name: p.image_url.split("/").pop() ?? "image.jpg",
            size: 0,
            type: "image",
            url: p.image_url,
            created_at: p.created_at,
          });
        }
        if (p.video_url) {
          result.push({
            id: p.id + "-vid",
            name: p.video_url.split("/").pop() ?? "video.mp4",
            size: 0,
            type: "video",
            url: p.video_url,
            created_at: p.created_at,
          });
        }
        return result;
      });

      setFiles(items);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="File Manager" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="folder-open-outline" size={52} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No files yet</Text>
          <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
            Files from your posts and messages will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 12 }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => (
            <View style={[styles.sep, { backgroundColor: colors.border }]} />
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.surface }]}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, { backgroundColor: typeColor(item.type) + "22" }]}>
                <Ionicons name={typeIcon(item.type)} size={22} color={typeColor(item.type)} />
              </View>
              <View style={styles.info}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {item.type} · {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  iconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  info: { flex: 1 },
  name: { fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 2 },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
});
