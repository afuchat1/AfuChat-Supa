import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatBytes } from "@/lib/mediaUpload";
import {
  getChatAttachmentName,
  getChatAttachmentTypeLabel,
} from "@/lib/chatAttachmentMetadata";
import { useTheme } from "@/hooks/useTheme";

type Props = {
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  caption?: string | null;
  isMe: boolean;
  isDownloaded: boolean;
  isDownloading?: boolean;
  downloadProgress?: number | null;
  uploadProgress?: number | null;
  onDownload: () => void;
  onOpen: () => void;
  onSaveOrShare: () => void;
};

export default function ChatFileAttachmentCard({
  fileName,
  mimeType,
  fileSize,
  caption,
  isMe,
  isDownloaded,
  isDownloading = false,
  downloadProgress,
  uploadProgress,
  onDownload,
  onOpen,
  onSaveOrShare,
}: Props) {
  const { colors } = useTheme();
  const title = getChatAttachmentName(fileName);
  const typeLabel = getChatAttachmentTypeLabel(title, mimeType);
  const foreground = isMe ? "#FFFFFF" : colors.text;
  const secondary = isMe ? "rgba(255,255,255,0.72)" : colors.textMuted;
  const cardBackground = isMe ? "rgba(255,255,255,0.12)" : colors.surface;
  const progress = uploadProgress ?? downloadProgress;
  const isUploading = typeof uploadProgress === "number" && uploadProgress < 1;
  const busy = isDownloading || isUploading;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: cardBackground,
          borderColor: isMe ? "rgba(255,255,255,0.18)" : colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.fileBadge, { backgroundColor: isMe ? "rgba(255,255,255,0.18)" : colors.accent + "18" }]}>
          <Ionicons
            name={typeLabel === "ZIP" || typeLabel === "7Z" || typeLabel === "RAR" ? "archive-outline" : "document-text-outline"}
            size={19}
            color={isMe ? "#FFFFFF" : colors.accent}
          />
          <Text style={[styles.extension, { color: isMe ? "#FFFFFF" : colors.accent }]} numberOfLines={1}>
            {typeLabel}
          </Text>
        </View>
        <View style={styles.details}>
          <Text style={[styles.fileName, { color: foreground }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.fileMeta, { color: secondary }]} numberOfLines={1}>
            {[typeLabel, fileSize ? formatBytes(fileSize) : null].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>

      {progress != null && (busy || progress >= 1) && (
        <View style={styles.progressArea} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
          <View style={[styles.progressTrack, { backgroundColor: isMe ? "rgba(255,255,255,0.22)" : colors.backgroundTertiary }]}>
            <View style={[styles.progressFill, { width: `${Math.max(4, Math.min(100, progress * 100))}%`, backgroundColor: isMe ? "#FFFFFF" : colors.accent }]} />
          </View>
          <Text style={[styles.progressText, { color: secondary }]}>
            {isUploading ? `Uploading ${Math.round(progress * 100)}%` : isDownloading ? `Downloading ${Math.round(progress * 100)}%` : "Downloaded"}
          </Text>
        </View>
      )}

      {caption ? <Text style={[styles.caption, { color: foreground }]}>{caption}</Text> : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isDownloaded ? `Open ${title}` : `Download ${title}`}
          disabled={busy}
          onPress={isDownloaded ? onOpen : onDownload}
          style={({ pressed }) => [
            styles.action,
            styles.primaryAction,
            { backgroundColor: isMe ? "rgba(255,255,255,0.22)" : colors.accent, opacity: busy ? 0.65 : pressed ? 0.82 : 1 },
          ]}
        >
          {busy ? (
            <ActivityIndicator size={14} color={foreground} />
          ) : (
            <Ionicons name={isDownloaded ? "open-outline" : "download-outline"} size={15} color={foreground} />
          )}
          <Text style={[styles.actionText, { color: foreground }]}>
            {isDownloading ? "Downloading" : isUploading ? "Uploading" : isDownloaded ? "Open" : "Download"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Save or share ${title}`}
          disabled={busy}
          onPress={onSaveOrShare}
          style={({ pressed }) => [
            styles.action,
            styles.secondaryAction,
            {
              backgroundColor: isMe ? "rgba(255,255,255,0.08)" : colors.backgroundTertiary,
              opacity: busy ? 0.55 : pressed ? 0.75 : 1,
            },
          ]}
        >
          <Ionicons name="share-outline" size={15} color={foreground} />
          <Text style={[styles.actionText, { color: foreground }]}>Save or share</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 272,
    maxWidth: "100%",
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    gap: 10,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  fileBadge: {
    width: 42,
    height: 48,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  extension: { maxWidth: 36, fontSize: 8, fontFamily: "Inter_700Bold" },
  details: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 13, lineHeight: 17, fontFamily: "Inter_600SemiBold" },
  fileMeta: { marginTop: 4, fontSize: 10, fontFamily: "Inter_400Regular" },
  progressArea: { gap: 5 },
  progressTrack: { height: 4, overflow: "hidden", borderRadius: 99 },
  progressFill: { height: "100%", borderRadius: 99 },
  progressText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  actions: { flexDirection: "row", gap: 7 },
  action: {
    minHeight: 34,
    paddingHorizontal: 9,
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  primaryAction: { flex: 1 },
  secondaryAction: { flex: 1.35 },
  actionText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
});
