import React, { useSyncExternalStore } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import {
  getPostUploadState,
  subscribePostUpload,
} from "@/lib/postUploadStore";

const ND = true;

function usePostUpload() {
  return useSyncExternalStore(subscribePostUpload, getPostUploadState, getPostUploadState);
}

export default function PostUploadBanner() {
  const { colors } = useTheme();
  const upload = usePostUpload();
  if (!upload) return null;

  const isDone      = upload.done;
  const isFailed    = upload.failed;
  const pct         = Math.round(upload.progress * 100);
  const isVideo     = upload.type === "video";
  const est         = upload.compressionEstimate;

  const isCompressing = !isDone && !isFailed && !!upload.label?.match(/compress/i);
  const isUploading   = !isDone && !isFailed && !isCompressing;

  const accentColor = isDone ? "#22C55E" : isFailed ? "#EF4444" : colors.accent;
  const bgColor     = isDone ? "#22C55E20" : isFailed ? "#EF444420" : colors.accent + "22";

  return (
    <View style={[s.wrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>

      {/* ── Header row ── */}
      <View style={s.row}>
        <View style={[s.iconCircle, { backgroundColor: bgColor }]}>
          <Ionicons
            name={isDone ? "checkmark-circle" : isFailed ? "alert-circle" : isVideo ? "videocam" : "image"}
            size={16}
            color={accentColor}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.label, { color: colors.text }]}>
            {isDone
              ? `${isVideo ? "Video" : "Post"} published!`
              : isFailed
              ? `${isVideo ? "Video" : "Post"} upload failed`
              : isCompressing
              ? "Compressing video…"
              : `Posting your ${isVideo ? "video" : "post"}…`}
          </Text>
          {isFailed && upload.errorMessage ? (
            <Text style={[s.caption, { color: "#EF4444" }]} numberOfLines={2}>
              {upload.errorMessage}
            </Text>
          ) : isUploading && upload.label && !upload.label.startsWith("Compressing") ? (
            <Text style={[s.caption, { color: colors.textMuted }]} numberOfLines={1}>
              {upload.label}
            </Text>
          ) : null}
        </View>
        {!isDone && !isFailed && (
          <Text style={[s.pct, { color: accentColor }]}>{pct}%</Text>
        )}
      </View>

      {/* ── Progress bar ── */}
      {!isDone && !isFailed && (
        <View style={[s.track, { backgroundColor: colors.border }]}>
          <View style={[s.fill, {
            width: `${pct}%` as any,
            backgroundColor: isCompressing ? "#FACC15" : accentColor,
          }]} />
        </View>
      )}

      {/* ── Compression card — visible during compress + upload phases ── */}
      {!isDone && !isFailed && est && isVideo && (
        <View style={[s.compressionCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={s.compressionHeader}>
            <Ionicons name="flash" size={13} color="#FACC15" />
            <Text style={[s.compressionHeaderText, { color: colors.textMuted }]}>
              {isCompressing ? "Reducing file size…" : "Optimized for upload"}
            </Text>
          </View>
          <View style={s.compressionRow}>
            <View style={s.compressionBlock}>
              <Text style={[s.compressionBlockLabel, { color: colors.textMuted }]}>Original</Text>
              <Text style={[s.compressionBlockValue, { color: colors.text }]}>{est.originalLabel}</Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color={colors.textMuted} style={{ marginTop: 12 }} />
            <View style={s.compressionBlock}>
              <Text style={[s.compressionBlockLabel, { color: "#4ADE80" }]}>After</Text>
              <Text style={[s.compressionBlockValue, { color: "#4ADE80" }]}>{est.estimatedLabel}</Text>
            </View>
            <View style={[s.savingsBadge, { borderColor: "#4ADE8055", backgroundColor: "#4ADE8015" }]}>
              <Text style={s.savingsBadgeText}>-{est.savingsPct}%</Text>
            </View>
          </View>
        </View>
      )}

    </View>
  );
}

const s = StyleSheet.create({
  wrap:              { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },
  row:               { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  iconCircle:        { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  label:             { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  caption:           { fontSize: 11, marginTop: 1 },
  pct:               { fontSize: 12, fontFamily: "Inter_600SemiBold", minWidth: 30, textAlign: "right" },
  track:             { height: 3, borderRadius: 2, overflow: "hidden", marginBottom: 8 },
  fill:              { height: 3, borderRadius: 2 },
  compressionCard:   {
    marginTop: 4, borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, gap: 6,
  },
  compressionHeader: { flexDirection: "row", alignItems: "center", gap: 5 },
  compressionHeaderText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  compressionRow:    { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  compressionBlock:  { gap: 2 },
  compressionBlockLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  compressionBlockValue: { fontSize: 17, fontFamily: "Inter_700Bold" },
  savingsBadge:      {
    marginLeft: "auto" as any, borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 9, paddingVertical: 3, alignSelf: "center",
  },
  savingsBadgeText:  { color: "#4ADE80", fontSize: 12, fontFamily: "Inter_700Bold" },
});
