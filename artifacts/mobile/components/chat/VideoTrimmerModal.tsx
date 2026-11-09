import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Image as RNImage,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import { Ionicons } from "@expo/vector-icons";
// Type-only — stripped at compile time, never triggers native module load
import type { AVPlaybackStatus } from "expo-av";

// expo-av: lazy-load on native only.
// Do NOT gate on NativeModules.ExponentAV — in Expo SDK 55 + New Architecture
// production builds expo-av uses TurboModules/JSI and is absent from NativeModules,
// so that check always returns null and silently disables all audio.
import { Platform as _AvPlatform } from "react-native";
import { isExpoGo } from "@/lib/expoEnvironment";
const _AV = (() => {
  if (_AvPlatform.OS === "web" || isExpoGo()) return null;
  try { return require("expo-av"); } catch { return null; }
})();
const _VT = (() => { try { return require("expo-video-thumbnails"); } catch { return null; } })();

const VideoComp   = _AV?.Video    ?? null;
const ResizeModeContain = _AV?.ResizeMode?.CONTAIN ?? "contain";

const { width: SW } = Dimensions.get("window");
const THUMB_COUNT = 10;
const TRACK_H = 52;
const HANDLE_W = 22;

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface TrimResult {
  trimStart: number;
  trimEnd: number;
  duration: number;
}

interface Props {
  visible: boolean;
  uri: string;
  mimeType?: string;
  onConfirm: (result: TrimResult) => void;
  onCancel: () => void;
  colors: any;
  accent: string;
}

export default function VideoTrimmerModal({
  visible, uri, mimeType, onConfirm, onCancel, colors, accent,
}: Props) {
  const videoRef = useRef<any>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [currentPos, setCurrentPos] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [thumbsLoading, setThumbsLoading] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const trackW = useRef(SW - 64);
  const durRef = useRef(0);
  const trimStartRef = useRef(0);
  const trimEndRef = useRef(0);

  useEffect(() => {
    if (visible) {
      setDuration(0);
      setTrimStart(0);
      setTrimEnd(0);
      setCurrentPos(0);
      setIsPlaying(false);
      setThumbs([]);
      setVideoLoaded(false);
      trimStartRef.current = 0;
      trimEndRef.current = 0;
    }
  }, [visible, uri]);

  async function generateThumbs(dur: number) {
    if (!uri || dur <= 0) return;
    setThumbsLoading(true);
    const results: string[] = [];
    for (let i = 0; i < THUMB_COUNT; i++) {
      const timeSec = (i / THUMB_COUNT) * dur;
      try {
        const { uri: tUri } = await _VT?.getThumbnailAsync(uri, {
          time: Math.floor(timeSec * 1000),
          quality: 0.4,
        }) ?? { uri: "" };
        results.push(tUri);
      } catch {
        results.push("");
      }
    }
    setThumbs(results);
    setThumbsLoading(false);
  }

  function onPlaybackStatusUpdate(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;
    setCurrentPos((status.positionMillis ?? 0) / 1000);
    setIsPlaying(status.isPlaying ?? false);
    if (status.didJustFinish || (status.positionMillis ?? 0) / 1000 >= trimEndRef.current - 0.2) {
      videoRef.current?.pauseAsync().catch(() => {});
      videoRef.current?.setPositionAsync(trimStartRef.current * 1000).catch(() => {});
    }
  }

  function onLoad(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;
    const dur = (status.durationMillis ?? 0) / 1000;
    if (dur > 0) {
      setDuration(dur);
      durRef.current = dur;
      setTrimEnd(dur);
      trimEndRef.current = dur;
      setVideoLoaded(true);
      generateThumbs(dur);
    }
  }

  async function togglePlay() {
    if (!videoLoaded) return;
    if (isPlaying) {
      await videoRef.current?.pauseAsync().catch(() => {});
    } else {
      const pos = currentPos;
      if (pos < trimStartRef.current || pos >= trimEndRef.current - 0.2) {
        await videoRef.current?.setPositionAsync(trimStartRef.current * 1000).catch(() => {});
      }
      await videoRef.current?.playAsync().catch(() => {});
    }
  }

  const startPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const dur = durRef.current;
        if (!dur) return;
        const pct = Math.max(0, Math.min(g.moveX / trackW.current, 0.98));
        const t = Math.min(pct * dur, trimEndRef.current - 0.5);
        trimStartRef.current = t;
        setTrimStart(t);
      },
      onPanResponderRelease: () => {
        videoRef.current?.setPositionAsync(trimStartRef.current * 1000).catch(() => {});
      },
    })
  ).current;

  const endPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const dur = durRef.current;
        if (!dur) return;
        const pct = Math.max(0.02, Math.min(g.moveX / trackW.current, 1));
        const t = Math.max(pct * dur, trimStartRef.current + 0.5);
        trimEndRef.current = t;
        setTrimEnd(t);
      },
      onPanResponderRelease: () => {
        videoRef.current?.setPositionAsync(trimEndRef.current * 1000 - 500).catch(() => {});
      },
    })
  ).current;

  const dur = duration || 1;
  const startPct = trimStart / dur;
  const endPct = trimEnd / dur;
  const clipDuration = Math.max(0, trimEnd - trimStart);

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onCancel} hitSlop={12} style={s.headerBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Trim Video</Text>
          <View style={s.headerBtn} />
        </View>

        {/* Video preview */}
        <View style={s.videoWrap}>
          {VideoComp ? (
            <VideoComp
              ref={videoRef}
              source={{ uri }}
              style={s.video}
              resizeMode={ResizeModeContain}
              onPlaybackStatusUpdate={onPlaybackStatusUpdate}
              onLoad={onLoad}
              progressUpdateIntervalMillis={100}
            />
          ) : (
            <View style={[s.video, { alignItems: "center", justifyContent: "center" }]}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          {!videoLoaded && (
            <View style={s.videoLoadOverlay}>
              <ActivityIndicator color={accent} size="large" />
              <Text style={{ color: "#aaa", marginTop: 10, fontSize: 13 }}>Loading video…</Text>
            </View>
          )}
        </View>

        {/* Trim info row */}
        <View style={s.infoRow}>
          <View style={s.infoBadge}>
            <Ionicons name="play-skip-back" size={12} color={accent} />
            <Text style={[s.infoTime, { color: "#fff" }]}>{fmtTime(trimStart)}</Text>
          </View>
          <View style={[s.durationBadge, { backgroundColor: accent + "22", borderColor: accent + "50" }]}>
            <Ionicons name="cut" size={13} color={accent} />
            <Text style={[s.durationText, { color: accent }]}>
              {fmtTime(clipDuration)} clip
            </Text>
          </View>
          <View style={s.infoBadge}>
            <Text style={[s.infoTime, { color: "#fff" }]}>{fmtTime(trimEnd)}</Text>
            <Ionicons name="play-skip-forward" size={12} color={accent} />
          </View>
        </View>

        {/* Timeline */}
        <View style={s.timelineWrap}>
          {/* Track background */}
          <View
            style={s.track}
            onLayout={(e) => { trackW.current = e.nativeEvent.layout.width; }}
          >
            {/* Thumbnail strip */}
            {thumbsLoading ? (
              <View style={s.thumbLoading}>
                <ActivityIndicator color={accent} size="small" />
              </View>
            ) : thumbs.length > 0 ? (
              <View style={s.thumbRow}>
                {thumbs.map((t, i) =>
                  t ? (
                    <Image key={i} source={{ uri: t }} style={s.thumb} resizeMode="cover" />
                  ) : (
                    <View key={i} style={[s.thumb, { backgroundColor: "#2a2a2a" }]} />
                  )
                )}
              </View>
            ) : (
              <View style={s.thumbPlaceholder} />
            )}

            {/* Dimmed overlay — before trim start */}
            <View style={[s.dimOverlay, { left: 0, width: `${startPct * 100}%` as any }]} />
            {/* Dimmed overlay — after trim end */}
            <View style={[s.dimOverlay, { right: 0, width: `${(1 - endPct) * 100}%` as any }]} />

            {/* Selected range highlight border */}
            <View
              style={[
                s.selBorder,
                {
                  left: `${startPct * 100}%` as any,
                  right: `${(1 - endPct) * 100}%` as any,
                  borderColor: accent,
                },
              ]}
            />

            {/* Playhead */}
            {duration > 0 && (
              <View style={[s.playhead, { left: `${(currentPos / dur) * 100}%` as any }]} />
            )}
          </View>

          {/* Draggable handles — positioned relative to the track above */}
          <View style={[s.handleRow, { pointerEvents: "box-none" } as any]}>
            <View
              {...startPan.panHandlers}
              style={[
                s.handle,
                s.handleLeft,
                { left: `${startPct * 100}%` as any, backgroundColor: accent },
              ]}
            >
              <Ionicons name="chevron-back" size={14} color="#fff" />
            </View>
            <View
              {...endPan.panHandlers}
              style={[
                s.handle,
                s.handleRight,
                { left: `${endPct * 100}%` as any, backgroundColor: accent },
              ]}
            >
              <Ionicons name="chevron-forward" size={14} color="#fff" />
            </View>
          </View>

          {/* Total duration label */}
          <Text style={s.totalDuration}>{fmtTime(duration)}</Text>
        </View>

        {/* Play / pause */}
        <TouchableOpacity
          onPress={togglePlay}
          disabled={!videoLoaded}
          style={[s.playBtn, { opacity: videoLoaded ? 1 : 0.4 }]}
        >
          <Ionicons name={isPlaying ? "pause" : "play"} size={28} color="#fff" />
        </TouchableOpacity>

        {/* Action buttons */}
        <View style={s.actionRow}>
          <TouchableOpacity onPress={onCancel} style={s.cancelBtn}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onConfirm({ trimStart, trimEnd, duration })}
            disabled={clipDuration < 0.5}
            style={[s.confirmBtn, { backgroundColor: accent, opacity: clipDuration < 0.5 ? 0.5 : 1 }]}
          >
            <Ionicons name="cut" size={18} color="#fff" />
            <Text style={s.confirmText}>Use {fmtTime(clipDuration)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: Platform.OS === "ios" ? 56 : 16, paddingBottom: 12 },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: "#fff" },
  videoWrap: { width: SW, height: SW * 0.58, backgroundColor: "#111", position: "relative" },
  video: { width: SW, height: SW * 0.58 },
  videoLoadOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  infoBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  infoTime: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  durationBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  durationText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  timelineWrap: { marginHorizontal: 16, marginBottom: 8, position: "relative" },
  track: {
    height: TRACK_H,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#1e1e1e",
    position: "relative",
  },
  thumbRow: { flexDirection: "row", position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  thumb: { flex: 1, height: TRACK_H },
  thumbLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  thumbPlaceholder: { flex: 1, backgroundColor: "#1e1e1e" },
  dimOverlay: { position: "absolute", top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.68)" },
  selBorder: { position: "absolute", top: 0, bottom: 0, borderWidth: 2, borderRadius: 4 },
  playhead: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "rgba(255,255,255,0.9)" },
  handleRow: { position: "absolute", top: 0, left: 0, right: 0, height: TRACK_H },
  handle: {
    position: "absolute",
    width: HANDLE_W,
    height: TRACK_H,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  handleLeft: { transform: [{ translateX: -HANDLE_W }] },
  handleRight: { transform: [{ translateX: 0 }] },
  totalDuration: { alignSelf: "flex-end", marginTop: 6, fontSize: 11, color: "#666", fontFamily: "Inter_400Regular" },
  playBtn: {
    alignSelf: "center",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 16,
  },
  actionRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingBottom: Platform.OS === "ios" ? 32 : 20 },
  cancelBtn: { flex: 1, height: 50, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  cancelText: { color: "#aaa", fontFamily: "Inter_500Medium", fontSize: 15 },
  confirmBtn: { flex: 2, height: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  confirmText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
});
