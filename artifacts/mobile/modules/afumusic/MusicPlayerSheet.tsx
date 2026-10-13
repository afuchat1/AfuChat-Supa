import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AfuMusicTrack } from "@/modules/afumusic";

let NativeAudio: typeof import("expo-av").Audio | null = null;
if (Platform.OS !== "web") {
  try {
    NativeAudio = require("expo-av").Audio;
  } catch {
    NativeAudio = null;
  }
}

type AVPlaybackStatus = import("expo-av").AVPlaybackStatus;
type AudioSound = import("expo-av/build/Audio/Sound").Sound;
type RepeatMode = "off" | "all" | "one";

type Props = {
  track: AfuMusicTrack;
  queue: AfuMusicTrack[];
  queueTitle: string;
  visible?: boolean;
  volume?: number;
  onSelectTrack: (track: AfuMusicTrack) => void;
  onClose: () => void;
  onDownload?: () => void;
  downloading?: boolean;
  onSaveOffline?: () => void;
  isCached?: boolean;
  savingOffline?: boolean;
};

function formatTime(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function Artwork({ track }: { track: AfuMusicTrack }) {
  return (
    <View style={[styles.artwork, { backgroundColor: track.coverColor || "#19172F" }]}>
      <View style={[styles.artworkOrb, { backgroundColor: track.accentColor || "#F06451" }]} />
      <Text style={styles.artworkText}>{initials(track.artist)}</Text>
      <Ionicons name="musical-notes" size={20} color="#FFF9F1" style={styles.artworkIcon} />
    </View>
  );
}

export default function MusicPlayerSheet({
  track,
  queue,
  queueTitle,
  visible = true,
  volume = 0.75,
  onSelectTrack,
  onClose,
  onDownload,
  downloading = false,
  onSaveOffline,
  isCached = false,
  savingOffline = false,
}: Props) {
  const audioUri = track.audioUrl || null;
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const soundRef = useRef<AudioSound | null>(null);
  const seekWidth = useRef(0);
  const finishedRef = useRef(false);
  const onEndedRef = useRef<() => void>(() => {});
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [queueOpen, setQueueOpen] = useState(false);

  const restartCurrent = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        const audio = webAudioRef.current;
        if (!audio) return;
        audio.currentTime = 0;
        await audio.play();
      } else if (soundRef.current) {
        await soundRef.current.setPositionAsync(0);
        await soundRef.current.playAsync();
      }
      finishedRef.current = false;
      setIsPlaying(true);
      setPositionMs(0);
    } catch {
      setIsPlaying(false);
    }
  }, []);

  const moveToNext = useCallback((allowWrap: boolean) => {
    if (!queue.length) return;
    const currentIndex = queue.findIndex((item) => item.id === track.id);
    let nextTrack: AfuMusicTrack | undefined;
    if (shuffle && queue.length > 1) {
      const candidates = queue.filter((item) => item.id !== track.id);
      nextTrack = candidates[Math.floor(Math.random() * candidates.length)];
    } else if (currentIndex >= 0 && currentIndex < queue.length - 1) {
      nextTrack = queue[currentIndex + 1];
    } else if (allowWrap) {
      nextTrack = queue[0];
    }
    if (nextTrack) {
      finishedRef.current = false;
      onSelectTrack(nextTrack);
    } else {
      setIsPlaying(false);
    }
  }, [onSelectTrack, queue, shuffle, track.id]);

  const handleEnded = useCallback(() => {
    if (repeatMode === "one" || (repeatMode === "all" && queue.length === 1)) {
      void restartCurrent();
      return;
    }
    moveToNext(repeatMode === "all");
  }, [moveToNext, queue.length, repeatMode, restartCurrent]);
  onEndedRef.current = handleEnded;

  useEffect(() => {
    let active = true;
    let webAudio: HTMLAudioElement | null = null;
    let nativeSound: AudioSound | null = null;
    finishedRef.current = false;
    setIsLoaded(false);
    setIsLoading(true);
    setIsPlaying(false);
    setPositionMs(0);
    setDurationMs(0);
    setLoadError(false);

    const fail = () => {
      if (!active) return;
      setIsLoading(false);
      setIsLoaded(false);
      setIsPlaying(false);
      setLoadError(true);
    };

    const load = async () => {
      if (!audioUri) {
        fail();
        return;
      }
      try {
        if (Platform.OS === "web") {
          if (typeof window === "undefined") {
            fail();
            return;
          }
          webAudio = new window.Audio(audioUri);
          webAudio.volume = Math.max(0, Math.min(1, volume));
          webAudio.preload = "metadata";
          webAudioRef.current = webAudio;
          webAudio.onloadedmetadata = () => {
            if (!active || !webAudio) return;
            setIsLoaded(true);
            setIsLoading(false);
            setDurationMs(Number.isFinite(webAudio.duration) ? webAudio.duration * 1000 : 0);
            void webAudio.play().then(
              () => { if (active) setIsPlaying(true); },
              () => { if (active) setIsPlaying(false); },
            );
          };
          webAudio.ontimeupdate = () => {
            if (active && webAudio) setPositionMs(webAudio.currentTime * 1000);
          };
          webAudio.onplay = () => { if (active) setIsPlaying(true); };
          webAudio.onpause = () => { if (active) setIsPlaying(false); };
          webAudio.onended = () => {
            if (!active || !webAudio) return;
            setPositionMs(Number.isFinite(webAudio.duration) ? webAudio.duration * 1000 : 0);
            setIsPlaying(false);
            if (!finishedRef.current) {
              finishedRef.current = true;
              onEndedRef.current();
            }
          };
          webAudio.onerror = fail;
          webAudio.load();
          return;
        }

        if (!NativeAudio) throw new Error("Audio playback is not available on this device.");
        try {
          await NativeAudio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            staysActiveInBackground: false,
          });
        } catch {
          // Continue to create the sound; some Expo Go versions reject optional audio-mode fields.
        }
        const created = await NativeAudio.Sound.createAsync(
          { uri: audioUri },
          { shouldPlay: true, progressUpdateIntervalMillis: 350, volume: Math.max(0, Math.min(1, volume)) },
          (status: AVPlaybackStatus) => {
            if (!active) return;
            if (status.isLoaded) {
              setIsLoaded(true);
              setIsLoading(false);
              setIsPlaying(status.isPlaying);
              setPositionMs(status.positionMillis ?? 0);
              setDurationMs(status.durationMillis ?? 0);
              if (status.didJustFinish && !finishedRef.current) {
                finishedRef.current = true;
                setIsPlaying(false);
                onEndedRef.current();
              }
            } else if ("error" in status && status.error) {
              fail();
            }
          },
        );
        nativeSound = created.sound;
        if (!active) {
          nativeSound.unloadAsync().catch(() => {});
          return;
        }
        soundRef.current = created.sound;
      } catch {
        fail();
      }
    };

    void load();
    return () => {
      active = false;
      if (webAudio) {
        webAudio.pause();
        webAudio.removeAttribute("src");
        webAudio.load();
      }
      if (webAudioRef.current === webAudio) webAudioRef.current = null;
      if (soundRef.current === nativeSound) soundRef.current = null;
      nativeSound?.unloadAsync().catch(() => {});
    };
  }, [audioUri, retryKey, track.id]);

  useEffect(() => {
    const nextVolume = Math.max(0, Math.min(1, volume));
    if (webAudioRef.current) webAudioRef.current.volume = nextVolume;
    soundRef.current?.setVolumeAsync(nextVolume).catch(() => {});
  }, [volume]);

  const togglePlayback = useCallback(async () => {
    if (!isLoaded) return;
    try {
      if (Platform.OS === "web") {
        const audio = webAudioRef.current;
        if (!audio) return;
        if (audio.ended || (audio.duration > 0 && audio.currentTime >= audio.duration)) {
          audio.currentTime = 0;
          finishedRef.current = false;
        }
        if (audio.paused) await audio.play();
        else audio.pause();
      } else if (soundRef.current) {
        if (isPlaying) {
          await soundRef.current.pauseAsync();
        } else {
          if (durationMs > 0 && positionMs >= durationMs) {
            await soundRef.current.setPositionAsync(0);
            finishedRef.current = false;
          }
          await soundRef.current.playAsync();
        }
      }
    } catch {
      setLoadError(true);
      setIsPlaying(false);
    }
  }, [durationMs, isLoaded, isPlaying, positionMs]);

  const seek = useCallback(async (event: GestureResponderEvent) => {
    if (!isLoaded || durationMs <= 0) return;
    const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / Math.max(1, seekWidth.current)));
    const nextPosition = ratio * durationMs;
    try {
      if (Platform.OS === "web" && webAudioRef.current) {
        webAudioRef.current.currentTime = nextPosition / 1000;
      } else if (soundRef.current) {
        await soundRef.current.setPositionAsync(nextPosition);
      }
      finishedRef.current = false;
      setPositionMs(nextPosition);
    } catch {
      // Seeking is best-effort while the remote stream is buffering.
    }
  }, [durationMs, isLoaded]);

  const onSeekLayout = useCallback((event: LayoutChangeEvent) => {
    seekWidth.current = event.nativeEvent.layout.width;
  }, []);

  const previousTrack = useCallback(() => {
    if (positionMs > 3000) {
      void restartCurrent();
      return;
    }
    const currentIndex = queue.findIndex((item) => item.id === track.id);
    const previous = currentIndex > 0 ? queue[currentIndex - 1] : repeatMode === "all" ? queue[queue.length - 1] : null;
    if (previous) onSelectTrack(previous);
    else void restartCurrent();
  }, [onSelectTrack, positionMs, queue, repeatMode, restartCurrent, track.id]);

  const nextTrack = useCallback(() => moveToNext(repeatMode === "all"), [moveToNext, repeatMode]);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((mode) => mode === "off" ? "all" : mode === "all" ? "one" : "off");
  }, []);

  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>AFUMUSIC · NOW PLAYING</Text>
            <Text style={styles.queueTitle} numberOfLines={1}>{queueTitle || "Your playlist"}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close music player">
            <Ionicons name="chevron-down" size={25} color="#19172F" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Artwork track={track} />
          <View style={styles.trackInfo}>
            <Text style={styles.title} numberOfLines={2}>{track.title}</Text>
            <Text style={styles.artist} numberOfLines={1}>{track.artist} · {track.genre}</Text>
          </View>

          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Seek through track"
            onPress={seek}
            onLayout={onSeekLayout}
            style={styles.seekTrack}
          >
            <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
          </Pressable>
          <View style={styles.timeRow}>
            <Text style={styles.time}>{formatTime(positionMs)}</Text>
            <Text style={styles.time}>{durationMs > 0 ? formatTime(durationMs) : track.duration || "—:—"}</Text>
          </View>

          <View style={styles.transport}>
            <Pressable
              onPress={() => setShuffle((value) => !value)}
              hitSlop={10}
              accessibilityLabel={shuffle ? "Turn shuffle off" : "Turn shuffle on"}
            >
              <Ionicons name="shuffle" size={21} color={shuffle ? "#F06451" : "#8D847B"} />
            </Pressable>
            <Pressable onPress={previousTrack} hitSlop={12} accessibilityLabel="Play previous track">
              <Ionicons name="play-skip-back" size={27} color="#19172F" />
            </Pressable>
            <Pressable
              onPress={() => {
                if (loadError) setRetryKey((key) => key + 1);
                else void togglePlayback();
              }}
              disabled={!isLoaded && !loadError}
              style={styles.playButton}
              accessibilityLabel={loadError ? "Retry loading track" : isPlaying ? "Pause track" : "Play track"}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF9F1" />
              ) : (
                <Ionicons name={loadError ? "refresh" : isPlaying ? "pause" : "play"} size={27} color="#FFF9F1" />
              )}
            </Pressable>
            <Pressable onPress={nextTrack} hitSlop={12} accessibilityLabel="Play next track">
              <Ionicons name="play-skip-forward" size={27} color="#19172F" />
            </Pressable>
            <Pressable onPress={cycleRepeat} hitSlop={10} accessibilityLabel={`Repeat ${repeatMode}`}>
              <View style={styles.repeatControl}>
                <Ionicons name={repeatMode === "off" ? "repeat-outline" : "repeat"} size={21} color={repeatMode === "off" ? "#8D847B" : "#F06451"} />
                {repeatMode === "one" ? <Text style={styles.repeatOne}>1</Text> : null}
              </View>
            </Pressable>
          </View>

          <View style={styles.actionRow}>
            {Platform.OS === "web" && onDownload ? (
              <Pressable onPress={onDownload} disabled={downloading} style={styles.actionButton}>
                {downloading ? <ActivityIndicator size="small" color="#F06451" /> : <Ionicons name="download-outline" size={17} color="#F06451" />}
                <Text style={styles.actionText}>{downloading ? "Preparing file" : "Download file"}</Text>
              </Pressable>
            ) : null}
            {Platform.OS !== "web" && onSaveOffline ? (
              <Pressable onPress={onSaveOffline} disabled={savingOffline} style={styles.actionButton}>
                {savingOffline ? <ActivityIndicator size="small" color="#F06451" /> : <Ionicons name={isCached ? "checkmark-circle" : "arrow-down-circle-outline"} size={18} color="#F06451" />}
                <Text style={styles.actionText}>{savingOffline ? "Saving in app" : isCached ? "Saved in app" : "Save offline in app"}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setQueueOpen((open) => !open)} style={styles.actionButton}>
              <Ionicons name={queueOpen ? "list" : "list-outline"} size={18} color="#19172F" />
              <Text style={styles.actionText}>Playlist · {queue.length}</Text>
              <Ionicons name={queueOpen ? "chevron-up" : "chevron-down"} size={14} color="#8D847B" />
            </Pressable>
          </View>

          {queueOpen ? (
            <View style={styles.queuePanel}>
              {queue.length ? queue.map((item, index) => (
                <Pressable
                  key={`${item.id}-${index}`}
                  onPress={() => onSelectTrack(item)}
                  style={[styles.queueItem, item.id === track.id && styles.queueItemActive]}
                >
                  <Text style={[styles.queueIndex, item.id === track.id && styles.queueTextActive]}>
                    {item.id === track.id ? "♫" : String(index + 1).padStart(2, "0")}
                  </Text>
                  <View style={styles.queueItemCopy}>
                    <Text style={[styles.queueTrackTitle, item.id === track.id && styles.queueTextActive]} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.queueArtist} numberOfLines={1}>{item.artist}</Text>
                  </View>
                  {item.id === track.id ? <Ionicons name="volume-high" size={16} color="#F06451" /> : null}
                </Pressable>
              )) : (
                <Text style={styles.emptyQueue}>Add tracks from AfuMusic to build a playlist.</Text>
              )}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: "#F7F1E9", paddingHorizontal: 23, paddingTop: 9, paddingBottom: 18 },
  handle: { width: 38, height: 4, borderRadius: 3, backgroundColor: "#D4C7BC", alignSelf: "center", marginBottom: 18 },
  header: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  headerCopy: { flex: 1, minWidth: 0, marginRight: 16 },
  eyebrow: { color: "#F06451", fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1.25 },
  queueTitle: { color: "#8D847B", fontFamily: "Inter_600SemiBold", fontSize: 11, marginTop: 4 },
  scrollContent: { alignItems: "center", paddingBottom: 26 },
  artwork: { width: 232, height: 232, borderRadius: 28, overflow: "hidden", alignItems: "center", justifyContent: "center", marginTop: 5 },
  artworkOrb: { width: 164, height: 164, borderRadius: 90, position: "absolute", right: -40, top: -28, opacity: 0.9 },
  artworkText: { color: "#FFF9F1", fontFamily: "Inter_700Bold", fontSize: 52, letterSpacing: 1, zIndex: 1 },
  artworkIcon: { position: "absolute", bottom: 19, left: 18, opacity: 0.85 },
  trackInfo: { width: "100%", alignItems: "center", marginTop: 20, marginBottom: 20 },
  title: { color: "#19172F", fontFamily: "Inter_700Bold", fontSize: 23, letterSpacing: -0.4, textAlign: "center" },
  artist: { color: "#8D847B", fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 6 },
  seekTrack: { width: "100%", height: 5, borderRadius: 5, backgroundColor: "#E5DACE", overflow: "hidden" },
  seekFill: { height: "100%", borderRadius: 5, backgroundColor: "#F06451" },
  timeRow: { width: "100%", flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  time: { color: "#8D847B", fontFamily: "Inter_500Medium", fontSize: 10, fontVariant: ["tabular-nums"] },
  transport: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 17, paddingHorizontal: 8 },
  playButton: { width: 62, height: 62, borderRadius: 32, backgroundColor: "#F06451", alignItems: "center", justifyContent: "center" },
  repeatControl: { position: "relative", alignItems: "center", justifyContent: "center" },
  repeatOne: { position: "absolute", top: 4, right: -3, color: "#F06451", fontSize: 8, fontFamily: "Inter_700Bold" },
  actionRow: { width: "100%", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginTop: 18, gap: 9 },
  actionButton: { minHeight: 37, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 11, borderRadius: 13, backgroundColor: "#EFE7DE" },
  actionText: { color: "#19172F", fontFamily: "Inter_600SemiBold", fontSize: 10 },
  queuePanel: { alignSelf: "stretch", marginTop: 10, padding: 8, borderRadius: 16, backgroundColor: "#FFF9F1", maxHeight: 260 },
  queueItem: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 9, borderRadius: 11 },
  queueItemActive: { backgroundColor: "#F5E8DB" },
  queueIndex: { width: 22, color: "#8D847B", fontFamily: "Inter_600SemiBold", fontSize: 10, textAlign: "center" },
  queueItemCopy: { flex: 1, minWidth: 0 },
  queueTrackTitle: { color: "#19172F", fontFamily: "Inter_600SemiBold", fontSize: 11 },
  queueArtist: { color: "#8D847B", fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 3 },
  queueTextActive: { color: "#F06451" },
  emptyQueue: { color: "#8D847B", fontFamily: "Inter_500Medium", fontSize: 11, textAlign: "center", paddingVertical: 18 },
});
