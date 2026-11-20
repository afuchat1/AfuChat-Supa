import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { showAlert } from "@/lib/alert";
import { listMusicTracks, purchaseMusicTrack } from "@/lib/afuMusic";
import type { AfuMusicTrack } from "@/modules/afumusic";

export type StoryMusicSelection = {
  track: AfuMusicTrack;
  startSeconds: number;
  endSeconds: number;
};

type Props = {
  visible: boolean;
  clipDurationSeconds: number;
  initialTrack?: AfuMusicTrack | null;
  initialStartSeconds?: number;
  onClose: () => void;
  onConfirm: (selection: StoryMusicSelection) => void;
};

function formatTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export default function StoryMusicPickerModal({
  visible,
  clipDurationSeconds,
  initialTrack,
  initialStartSeconds = 0,
  onClose,
  onConfirm,
}: Props) {
  const { colors } = useTheme();
  const { accent } = useAppAccent();
  const insets = useSafeAreaInsets();
  const [tracks, setTracks] = useState<AfuMusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<AfuMusicTrack | null>(initialTrack ?? null);
  const [clipStart, setClipStart] = useState(Math.max(0, initialStartSeconds));
  const [stage, setStage] = useState<"tracks" | "trim">(initialTrack ? "trim" : "tracks");
  const railWidth = useRef(1);
  const maxStartRef = useRef(0);
  const trackDurationRef = useRef(0);
  const clipStartRef = useRef(Math.max(0, initialStartSeconds));
  const dragStartRef = useRef(Math.max(0, initialStartSeconds));

  const clipDuration = Math.max(0.1, clipDurationSeconds);
  const trackDuration = selectedTrack?.durationSeconds ?? 0;
  const maxStart = Math.max(0, trackDuration - clipDuration);
  maxStartRef.current = maxStart;
  trackDurationRef.current = trackDuration;

  const setClampedStart = (value: number) => {
    const next = Math.max(0, Math.min(maxStartRef.current, value));
    clipStartRef.current = next;
    setClipStart(next);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartRef.current = clipStartRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        const delta = (gesture.dx / Math.max(1, railWidth.current)) * trackDurationRef.current;
        setClampedStart(dragStartRef.current + delta);
      },
    }),
  ).current;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    listMusicTracks()
      .then((result) => {
        if (!cancelled) setTracks(result);
      })
      .catch((error: any) => {
        if (!cancelled) showAlert("Music unavailable", error?.message || "Could not load music right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  async function chooseTrack(track: AfuMusicTrack) {
    const duration = track.durationSeconds;
    if (!duration || duration < clipDuration) {
      showAlert(
        "Track is too short",
        `Choose a track at least ${formatTime(clipDuration)} long for this story.`,
      );
      return;
    }

    setBusyTrackId(track.id);
    try {
      let availableTrack = track;
      if (track.price > 0 && !track.isOwned) {
        await purchaseMusicTrack(track.id);
        const refreshed = await listMusicTracks();
        availableTrack = refreshed.find((item) => item.id === track.id) ?? { ...track, isOwned: true };
        setTracks(refreshed);
      }
      setSelectedTrack(availableTrack);
      setClampedStart(availableTrack.id === initialTrack?.id ? initialStartSeconds : 0);
      setStage("trim");
    } catch (error: any) {
      showAlert("Could not unlock track", error?.message || "Please try again.");
    } finally {
      setBusyTrackId(null);
    }
  }

  function confirmSelection() {
    if (!selectedTrack || trackDuration < clipDuration) return;
    const startSeconds = Math.min(clipStart, maxStart);
    onConfirm({
      track: selectedTrack,
      startSeconds,
      endSeconds: startSeconds + clipDuration,
    });
    onClose();
  }

  const startPercent = trackDuration > 0 ? (clipStart / trackDuration) * 100 : 0;
  const widthPercent = trackDuration > 0 ? Math.min(100, (clipDuration / trackDuration) * 100) : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.header}>
            {stage === "trim" ? (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => setStage("tracks")}
                accessibilityRole="button"
                accessibilityLabel="Choose another track"
              >
                <Ionicons name="arrow-back" size={21} color={colors.text} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerButton} />
            )}
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>
                {stage === "trim" ? "Trim your excerpt" : "Add music"}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                {stage === "trim"
                  ? `Choose a ${formatTime(clipDuration)} story-length clip`
                  : `Pick a track for this ${formatTime(clipDuration)} story`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close music picker"
            >
              <Ionicons name="close" size={23} color={colors.text} />
            </TouchableOpacity>
          </View>

          {stage === "tracks" ? (
            loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={accent} />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading tracks</Text>
              </View>
            ) : tracks.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="musical-notes-outline" size={34} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No tracks are available right now.</Text>
              </View>
            ) : (
              <FlatList
                data={tracks}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.trackList}
                renderItem={({ item }) => {
                  const tooShort = !item.durationSeconds || item.durationSeconds < clipDuration;
                  const locked = item.price > 0 && !item.isOwned;
                  const busy = busyTrackId === item.id;
                  return (
                    <TouchableOpacity
                      style={[styles.trackRow, { borderBottomColor: colors.border }, tooShort && styles.disabledRow]}
                      onPress={() => chooseTrack(item)}
                      disabled={tooShort || !!busyTrackId}
                      activeOpacity={0.72}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.title} by ${item.artist}${tooShort ? ", too short for this story" : ""}`}
                    >
                      <View style={[styles.cover, { backgroundColor: item.coverColor || colors.backgroundSecondary }]}>
                        {item.coverUrl ? (
                          <Image source={{ uri: item.coverUrl }} style={styles.coverImage} resizeMode="cover" />
                        ) : (
                          <Ionicons name="musical-notes" size={18} color={item.accentColor || accent} />
                        )}
                      </View>
                      <View style={styles.trackText}>
                        <Text numberOfLines={1} style={[styles.trackTitle, { color: colors.text }]}>{item.title}</Text>
                        <Text numberOfLines={1} style={[styles.trackArtist, { color: colors.textMuted }]}>{item.artist}</Text>
                      </View>
                      <View style={styles.trackRight}>
                        <Text style={[styles.trackDuration, { color: tooShort ? colors.textMuted : colors.text }]}>
                          {tooShort ? "Too short" : item.duration || formatTime(item.durationSeconds || 0)}
                        </Text>
                        {busy ? (
                          <ActivityIndicator size="small" color={accent} />
                        ) : (
                          <Text style={[styles.trackPrice, { color: locked ? accent : colors.textMuted }]}>
                            {locked ? `${item.price} ACoin` : "Use"}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )
          ) : selectedTrack ? (
            <View style={styles.trimContent}>
              <View style={[styles.selectedTrack, { backgroundColor: colors.backgroundSecondary }]}>
                <View style={[styles.cover, styles.selectedCover, { backgroundColor: selectedTrack.coverColor || colors.background }]}>
                  {selectedTrack.coverUrl ? (
                    <Image source={{ uri: selectedTrack.coverUrl }} style={styles.coverImage} resizeMode="cover" />
                  ) : (
                    <Ionicons name="musical-notes" size={20} color={selectedTrack.accentColor || accent} />
                  )}
                </View>
                <View style={styles.trackText}>
                  <Text numberOfLines={1} style={[styles.trackTitle, { color: colors.text }]}>{selectedTrack.title}</Text>
                  <Text numberOfLines={1} style={[styles.trackArtist, { color: colors.textMuted }]}>{selectedTrack.artist}</Text>
                </View>
                <TouchableOpacity
                  style={styles.changeTrackButton}
                  onPress={() => setStage("tracks")}
                  accessibilityRole="button"
                  accessibilityLabel="Change music track"
                >
                  <Text style={[styles.changeTrackText, { color: accent }]}>Change</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.trimHint, { color: colors.textMuted }]}>
                Drag the highlighted section to choose which part plays.
              </Text>
              <View
                style={[styles.trimRail, { backgroundColor: colors.backgroundSecondary }]}
                onLayout={(event) => { railWidth.current = event.nativeEvent.layout.width; }}
                {...panResponder.panHandlers}
                accessibilityRole="adjustable"
                accessibilityLabel="Soundtrack excerpt start"
                accessibilityValue={{ min: 0, max: maxStart, now: clipStart }}
              >
                <View
                  style={[
                    styles.trimSelection,
                    {
                      left: `${startPercent}%`,
                      width: `${widthPercent}%`,
                      backgroundColor: accent,
                    },
                  ]}
                />
                <View style={[styles.trimHandle, { left: `${startPercent}%`, backgroundColor: "#fff", borderColor: accent }]} />
              </View>
              <View style={styles.trimTimes}>
                <Text style={[styles.timeLabel, { color: colors.textMuted }]}>{formatTime(clipStart)}</Text>
                <Text style={[styles.timeLabel, { color: colors.textMuted }]}>{formatTime(clipStart + clipDuration)}</Text>
              </View>
              <View style={styles.nudgeRow}>
                <TouchableOpacity
                  style={[styles.nudgeButton, { backgroundColor: colors.backgroundSecondary }]}
                  onPress={() => setClampedStart(clipStart - 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Move excerpt earlier by one second"
                >
                  <Ionicons name="remove" size={19} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.clipLength, { color: colors.text }]}>
                  {formatTime(clipDuration)} excerpt
                </Text>
                <TouchableOpacity
                  style={[styles.nudgeButton, { backgroundColor: colors.backgroundSecondary }]}
                  onPress={() => setClampedStart(clipStart + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Move excerpt later by one second"
                >
                  <Ionicons name="add" size={19} color={colors.text} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: accent }]}
                onPress={confirmSelection}
                activeOpacity={0.82}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.confirmText}>Use this excerpt</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.56)" },
  sheet: {
    maxHeight: "82%",
    minHeight: 300,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14 },
  headerButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, alignItems: "center" },
  title: { fontSize: 17, fontWeight: "700" },
  subtitle: { marginTop: 3, fontSize: 12 },
  loading: { flex: 1, minHeight: 220, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 13 },
  empty: { flex: 1, minHeight: 220, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 24 },
  emptyText: { fontSize: 14, textAlign: "center" },
  trackList: { paddingHorizontal: 16, paddingBottom: 20 },
  trackRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  disabledRow: { opacity: 0.55 },
  cover: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  coverImage: { width: "100%", height: "100%" },
  trackText: { flex: 1, minWidth: 0 },
  trackTitle: { fontSize: 14, fontWeight: "600" },
  trackArtist: { fontSize: 12, marginTop: 4 },
  trackRight: { alignItems: "flex-end", gap: 5, minWidth: 58 },
  trackDuration: { fontSize: 11 },
  trackPrice: { fontSize: 10, fontWeight: "600" },
  trimContent: { paddingHorizontal: 18, paddingBottom: 10 },
  selectedTrack: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16 },
  selectedCover: { width: 52, height: 52 },
  changeTrackButton: { paddingHorizontal: 8, paddingVertical: 8 },
  changeTrackText: { fontSize: 12, fontWeight: "700" },
  trimHint: { fontSize: 13, marginTop: 22, marginBottom: 14, textAlign: "center" },
  trimRail: { height: 36, borderRadius: 10, justifyContent: "center", overflow: "hidden" },
  trimSelection: { position: "absolute", top: 4, bottom: 4, minWidth: 12, borderRadius: 7, opacity: 0.92 },
  trimHandle: { position: "absolute", top: 0, marginLeft: -2, width: 4, height: 36, borderRadius: 4, borderWidth: 1 },
  trimTimes: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  timeLabel: { fontSize: 12, fontVariant: ["tabular-nums"] },
  nudgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, marginTop: 18 },
  nudgeButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18 },
  clipLength: { minWidth: 110, textAlign: "center", fontSize: 13, fontWeight: "600" },
  confirmButton: { height: 48, borderRadius: 15, marginTop: 22, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  confirmText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
