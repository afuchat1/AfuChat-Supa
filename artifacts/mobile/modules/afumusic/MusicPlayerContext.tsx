import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Ionicons } from "@expo/vector-icons";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { showAlert } from "@/lib/alert";
import type { AfuMusicTrack } from "./index";

type PlayerSource = "library" | "shot";

type PlayerContextValue = {
  track: AfuMusicTrack | null;
  queue: AfuMusicTrack[];
  queueTitle: string;
  visible: boolean;
  source: PlayerSource;
  volume: number;
  isPlaying: boolean;
  togglePlayback: () => Promise<void>;
  registerPlaybackToggle: (toggle: (() => Promise<void>) | null) => void;
  setPlaybackState: (isPlaying: boolean) => void;
  play: (
    track: AfuMusicTrack,
    queue?: AfuMusicTrack[],
    queueTitle?: string,
    options?: { source?: PlayerSource; showPlayer?: boolean; volume?: number },
  ) => Promise<void>;
  setVolume: (volume: number) => void;
  setQueue: (next: AfuMusicTrack[] | ((current: AfuMusicTrack[]) => AfuMusicTrack[])) => void;
  minimize: () => void;
  open: () => void;
  stop: () => void;
  stopShot: (trackId: string) => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function useAfuMusicPlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("useAfuMusicPlayer must be used inside AfuMusicPlayerProvider.");
  return value;
}

export function AfuMusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [track, setTrack] = useState<AfuMusicTrack | null>(null);
  const [queue, setQueue] = useState<AfuMusicTrack[]>([]);
  const [queueTitle, setQueueTitle] = useState("AfuMusic");
  const [visible, setVisible] = useState(false);
  const [source, setSource] = useState<PlayerSource>("library");
  const [volume, setVolume] = useState(0.75);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackToggleRef = useRef<(() => Promise<void>) | null>(null);
  const accountRef = useRef<string | null>(user?.id ?? null);
  const playerRef = useRef({ track, source });
  playerRef.current = { track, source };

  const stop = useCallback(() => {
    setVisible(false);
    setTrack(null);
    setQueue([]);
    setQueueTitle("AfuMusic");
    setSource("library");
    setIsPlaying(false);
  }, []);

  const registerPlaybackToggle = useCallback((toggle: (() => Promise<void>) | null) => {
    playbackToggleRef.current = toggle;
  }, []);

  const togglePlayback = useCallback(async () => {
    await playbackToggleRef.current?.();
  }, []);

  useEffect(() => {
    if (accountRef.current !== user?.id) {
      accountRef.current = user?.id ?? null;
      stop();
    }
  }, [stop, user?.id]);

  const play = useCallback(async (
    nextTrack: AfuMusicTrack,
    nextQueue: AfuMusicTrack[] = [nextTrack],
    nextTitle = "AfuMusic",
    options: { source?: PlayerSource; showPlayer?: boolean; volume?: number } = {},
  ) => {
    if (nextTrack.price > 0 && !nextTrack.isOwned) {
      throw new Error("Purchase this track before playing it.");
    }
    const { getMusicPlaybackUri } = await import("@/lib/afuMusic");
    const audioUrl = await getMusicPlaybackUri(nextTrack);
    if (!audioUrl) throw new Error("This track is not available for playback.");
    setQueue(nextQueue);
    setQueueTitle(nextTitle);
    setSource(options.source ?? "library");
    setVisible(options.showPlayer ?? options.source !== "shot");
    setIsPlaying(false);
    if (typeof options.volume === "number") setVolume(Math.max(0, Math.min(1, options.volume)));
    setTrack({ ...nextTrack, audioUrl });
  }, []);

  const stopShot = useCallback((trackId: string) => {
    if (playerRef.current.source === "shot" && playerRef.current.track?.id === trackId) stop();
  }, [stop]);

  const value = useMemo<PlayerContextValue>(() => ({
    track,
    queue,
    queueTitle,
    visible,
    source,
    volume,
    isPlaying,
    togglePlayback,
    registerPlaybackToggle,
    setPlaybackState: setIsPlaying,
    play,
    setVolume,
    setQueue,
    minimize: () => setVisible(false),
    open: () => {
      if (track && source === "library") setVisible(true);
    },
    stop,
    stopShot,
  }), [isPlaying, play, queue, queueTitle, registerPlaybackToggle, source, stop, stopShot, togglePlayback, track, visible, volume]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <GlobalPlayerHost />
    </PlayerContext.Provider>
  );
}

function GlobalPlayerHost() {
  const {
    track,
    queue,
    queueTitle,
    visible,
    source,
    volume,
    isPlaying,
    togglePlayback,
    registerPlaybackToggle,
    setPlaybackState,
    play,
    minimize,
    open,
    stop,
  } = useAfuMusicPlayer();
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [cached, setCached] = useState(false);

  useEffect(() => {
    setCached(!!track?.isCached);
  }, [track?.id, track?.isCached]);

  const download = useCallback(async () => {
    if (!track) return;
    setDownloading(true);
    try {
      const [{ getMusicDownloadUri }, { downloadMusicFile, getMusicDownloadFilename }] = await Promise.all([
        import("@/lib/afuMusic"),
        import("./musicFileDownload"),
      ]);
      const filename = getMusicDownloadFilename(track);
      const uri = await getMusicDownloadUri(track, filename);
      if (!uri) throw new Error("The audio file is not available for this track.");
      await downloadMusicFile(track, uri, filename);
    } catch (error) {
      showAlert("Download failed", error);
    } finally {
      setDownloading(false);
    }
  }, [track]);

  const saveOffline = useCallback(async () => {
    if (!track || saving || cached) return;
    setSaving(true);
    try {
      const { cacheMusicTrackOffline } = await import("@/lib/afuMusic");
      await cacheMusicTrackOffline(track);
      setCached(true);
    } catch (error) {
      showAlert("Could not save offline", error);
    } finally {
      setSaving(false);
    }
  }, [cached, saving, track]);

  const selectQueuedTrack = useCallback((next: AfuMusicTrack) => {
    void play(next, queue, queueTitle, { showPlayer: true }).catch((error) => {
      showAlert("Playback unavailable", error);
    });
  }, [play, queue, queueTitle]);

  if (!track) return null;
  const MusicPlayerSheet = require("./MusicPlayerSheet").default as React.ComponentType<any>;

  return (
    <>
      <MusicPlayerSheet
        track={track}
        queue={queue}
        queueTitle={queueTitle}
        visible={visible && source === "library"}
        volume={volume}
        onSelectTrack={selectQueuedTrack}
        onClose={minimize}
        onPlaybackStateChange={setPlaybackState}
        onRegisterPlaybackToggle={registerPlaybackToggle}
        onDownload={Platform.OS === "web" ? () => { void download(); } : undefined}
        downloading={downloading}
        onSaveOffline={Platform.OS !== "web" ? () => { void saveOffline(); } : undefined}
        isCached={cached}
        savingOffline={saving}
      />
      {!visible && source === "library" ? (
        <View pointerEvents="box-none" style={[styles.miniLayer, { bottom: Math.max(insets.bottom, 8) + (Platform.OS === "web" ? 14 : 78) }]}>
          <Pressable onPress={open} style={styles.miniPlayer} accessibilityRole="button" accessibilityLabel={`Open player: ${track.title}`}>
            <View style={styles.miniIcon}><Ionicons name="musical-notes" size={18} color="#FFF9F1" /></View>
            <View style={styles.miniCopy}>
              <Text style={styles.miniTitle} numberOfLines={1}>{track.title}</Text>
              <Text style={styles.miniArtist} numberOfLines={1}>{track.artist}</Text>
            </View>
            <Ionicons name="chevron-up" size={19} color="#19172F" />
          </Pressable>
          <Pressable
            onPress={() => { void togglePlayback(); }}
            style={styles.miniToggle}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Pause music" : "Resume music"}
          >
            <Ionicons name={isPlaying ? "pause" : "play"} size={19} color="#19172F" />
          </Pressable>
          <Pressable onPress={stop} style={styles.miniStop} accessibilityRole="button" accessibilityLabel="Stop music">
            <Ionicons name="close" size={18} color="#19172F" />
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  miniLayer: { position: "absolute", left: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 8, zIndex: 1000, elevation: 14 },
  miniPlayer: { flex: 1, minWidth: 0, minHeight: 58, borderRadius: 18, backgroundColor: "#FFF9F1", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, ...Platform.select({ web: { boxShadow: "0 6px 16px rgba(25,23,47,0.16)" } as any, default: { shadowColor: "#19172F", shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } } }) },
  miniIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F06451" },
  miniCopy: { flex: 1, minWidth: 0 },
  miniTitle: { color: "#19172F", fontFamily: "Inter_700Bold", fontSize: 12 },
  miniArtist: { color: "#8D847B", fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 3 },
  miniToggle: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFF9F1", alignItems: "center", justifyContent: "center" },
  miniStop: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFF9F1", alignItems: "center", justifyContent: "center" },
});
