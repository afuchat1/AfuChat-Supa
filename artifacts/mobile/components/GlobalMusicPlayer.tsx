import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isExpoGo } from "@/lib/expoEnvironment";
import { audioFocus } from "@/lib/audioFocus";
import { useTheme } from "@/hooks/useTheme";
import type { AfuMusicTrack } from "@/modules/afumusic";

let NativeAudio: typeof import("expo-av").Audio | null = null;
if (Platform.OS !== "web" && !isExpoGo()) {
  try { NativeAudio = require("expo-av").Audio; } catch {}
}
type AVPlaybackStatus = import("expo-av").AVPlaybackStatus;
type NativeSound = import("expo-av/build/Audio/Sound").Sound;

type ActiveMusic = { track: AfuMusicTrack; uri: string };
type GlobalMusicContextValue = {
  activeMusic: ActiveMusic | null;
  playMusic: (track: AfuMusicTrack, uri: string) => void;
  stopMusic: () => void;
};

const GlobalMusicContext = createContext<GlobalMusicContextValue | null>(null);

export function useGlobalMusicPlayer() {
  const context = useContext(GlobalMusicContext);
  if (!context) throw new Error("useGlobalMusicPlayer must be used inside GlobalMusicPlayerProvider");
  return context;
}

function formatMusicTime(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function MusicTransport({ uri }: { uri: string }) {
  const { colors, accent } = useTheme();
  const soundRef = useRef<NativeSound | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const mountedRef = useRef(true);
  const seekWidth = useRef(1);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    let webAudio: HTMLAudioElement | null = null;

    const onNativeStatus = (status: AVPlaybackStatus) => {
      if (!mountedRef.current) return;
      if (!status.isLoaded) {
        if (status.error) setFailed(true);
        return;
      }
      setReady(true);
      setPlaying(status.isPlaying);
      setPosition(status.positionMillis ?? 0);
      setDuration(status.durationMillis ?? 0);
      if (status.didJustFinish) setPlaying(false);
    };

    const load = async () => {
      try {
        if (Platform.OS === "web") {
          webAudio = new window.Audio(uri);
          webAudio.preload = "auto";
          webAudioRef.current = webAudio;
          webAudio.onloadedmetadata = () => {
            if (!mountedRef.current || !webAudio) return;
            setDuration(Number.isFinite(webAudio.duration) ? webAudio.duration * 1000 : 0);
            setReady(true);
            void webAudio.play().catch(() => setPlaying(false));
          };
          webAudio.ontimeupdate = () => {
            if (mountedRef.current && webAudio) setPosition(webAudio.currentTime * 1000);
          };
          webAudio.onplay = () => { if (mountedRef.current) setPlaying(true); };
          webAudio.onpause = () => { if (mountedRef.current) setPlaying(false); };
          webAudio.onended = () => {
            if (!mountedRef.current || !webAudio) return;
            setPlaying(false);
            setPosition(Number.isFinite(webAudio.duration) ? webAudio.duration * 1000 : 0);
          };
          webAudio.onerror = () => { if (mountedRef.current) setFailed(true); };
          webAudio.load();
          return;
        }

        if (!NativeAudio) {
          if (mountedRef.current) setFailed(true);
          return;
        }
        await NativeAudio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          staysActiveInBackground: false,
        });
        const { sound } = await NativeAudio.Sound.createAsync(
          { uri },
          { shouldPlay: true, progressUpdateIntervalMillis: 250 },
          onNativeStatus,
        );
        if (mountedRef.current) soundRef.current = sound;
        else await sound.unloadAsync().catch(() => {});
      } catch {
        if (mountedRef.current) setFailed(true);
      }
    };

    void load();
    const unsubscribeFocus = audioFocus.subscribe(() => {
      webAudioRef.current?.pause();
      void soundRef.current?.pauseAsync().catch(() => {});
      if (mountedRef.current) setPlaying(false);
    });

    return () => {
      mountedRef.current = false;
      unsubscribeFocus();
      if (webAudio) {
        webAudio.pause();
        webAudio.removeAttribute("src");
        webAudio.load();
      }
      webAudioRef.current = null;
      const sound = soundRef.current;
      soundRef.current = null;
      void sound?.unloadAsync().catch(() => {});
    };
  }, [uri]);

  const togglePlayback = useCallback(async () => {
    if (!ready) return;
    try {
      if (Platform.OS === "web") {
        const audio = webAudioRef.current;
        if (!audio) return;
        if (audio.ended || (audio.duration > 0 && audio.currentTime >= audio.duration)) audio.currentTime = 0;
        if (audio.paused) await audio.play();
        else audio.pause();
        return;
      }
      const sound = soundRef.current;
      if (!sound) return;
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.didJustFinish) await sound.setPositionAsync(0);
      if (playing) await sound.pauseAsync();
      else await sound.playAsync();
    } catch {
      setFailed(true);
    }
  }, [playing, ready]);

  const seekTo = useCallback(async (milliseconds: number) => {
    const target = Math.max(0, Math.min(duration, milliseconds));
    try {
      if (Platform.OS === "web") {
        if (webAudioRef.current) webAudioRef.current.currentTime = target / 1000;
      } else {
        await soundRef.current?.setPositionAsync(target);
      }
      setPosition(target);
    } catch {}
  }, [duration]);

  const seekBy = useCallback((seconds: number) => {
    void seekTo(position + seconds * 1000);
  }, [position, seekTo]);
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={styles.transport}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pause music" : failed ? "Playback unavailable" : "Play music"}
        onPress={() => void togglePlayback()}
        disabled={!ready}
        style={[styles.mainPlayButton, { backgroundColor: accent }, !ready && styles.disabledControl]}
      >
        {failed ? <Ionicons name="alert-circle" size={17} color="#FFFFFF" /> :
          !ready ? <ActivityIndicator size="small" color="#FFFFFF" /> :
          <Ionicons name={playing ? "pause" : "play"} size={17} color="#FFFFFF" />}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Back 10 seconds" onPress={() => seekBy(-10)} hitSlop={7} style={styles.skipButton}>
        <Ionicons name="play-back" size={17} color={colors.textSecondary} />
        <Text style={[styles.skipLabel, { color: colors.textMuted }]}>10</Text>
      </Pressable>
      <View style={styles.timeline}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel="Track position"
          accessibilityValue={{ min: 0, max: duration, now: position }}
          onLayout={(event) => { seekWidth.current = event.nativeEvent.layout.width || 1; }}
          onPress={(event) => {
            if (!ready || !duration) return;
            void seekTo((event.nativeEvent.locationX / seekWidth.current) * duration);
          }}
          style={[styles.seekTrack, { backgroundColor: colors.border }]}
        >
          <View style={[styles.seekFill, { width: `${progress * 100}%`, backgroundColor: accent }]} />
          <View style={[styles.seekThumb, { left: `${progress * 100}%`, backgroundColor: accent }]} />
        </Pressable>
        <View style={styles.timeRow}>
          <Text style={[styles.timeText, { color: colors.textMuted }]}>{formatMusicTime(position)}</Text>
          <Text style={[styles.timeText, { color: colors.textMuted }]}>{duration ? formatMusicTime(duration) : "--:--"}</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Forward 10 seconds" onPress={() => seekBy(10)} hitSlop={7} style={styles.skipButton}>
        <Ionicons name="play-forward" size={17} color={colors.textSecondary} />
        <Text style={[styles.skipLabel, { color: colors.textMuted }]}>10</Text>
      </Pressable>
    </View>
  );
}

export function GlobalMusicPlayerProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors, accent } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [activeMusic, setActiveMusic] = useState<ActiveMusic | null>(null);
  const [floatingPosition, setFloatingPosition] = useState({
    x: Math.max(8, windowWidth - 72),
    y: Math.max(insets.top + 12, windowHeight - insets.bottom - 190),
  });
  const floatingPositionRef = useRef(floatingPosition);
  floatingPositionRef.current = floatingPosition;
  const [floatingDrag] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const floatingPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
    onPanResponderGrant: () => {
      floatingDrag.setOffset(floatingPositionRef.current);
      floatingDrag.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: Animated.event(
      [null, { dx: floatingDrag.x, dy: floatingDrag.y }],
      { useNativeDriver: false },
    ),
    onPanResponderRelease: (_event, gesture) => {
      floatingDrag.flattenOffset();
      const next = {
        x: Math.max(8, Math.min(windowWidth - 64, floatingPositionRef.current.x + gesture.dx)),
        y: Math.max(insets.top + 8, Math.min(windowHeight - insets.bottom - 64, floatingPositionRef.current.y + gesture.dy)),
      };
      floatingPositionRef.current = next;
      setFloatingPosition(next);
      floatingDrag.setValue(next);
    },
    onPanResponderTerminate: () => {
      floatingDrag.flattenOffset();
      const current = floatingPositionRef.current;
      floatingDrag.setValue(current);
    },
  }), [floatingDrag, insets.bottom, insets.top, windowHeight, windowWidth]);
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const playMusic = useCallback((track: AfuMusicTrack, uri: string) => {
    setActiveMusic({ track, uri });
    setExpanded(false);
    setMinimized(false);
  }, []);
  const stopMusic = useCallback(() => { setActiveMusic(null); setExpanded(false); setMinimized(false); }, []);
  const value = useMemo(() => ({ activeMusic, playMusic, stopMusic }), [activeMusic, playMusic, stopMusic]);

  return (
    <GlobalMusicContext.Provider value={value}>
      {children}
      {activeMusic ? (
        <>
          <View
            pointerEvents={minimized ? "none" : "box-none"}
            style={[
              styles.overlay,
              { bottom: Math.max(insets.bottom, 8) + 68 },
              minimized && styles.hiddenOverlay,
            ]}
          >
            <View style={[styles.player, { backgroundColor: colors.surface, borderColor: colors.border }, expanded && styles.playerExpanded]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={expanded ? "Current song details" : "Open current song"}
                onPress={() => { setExpanded((value) => !value); setMinimized(false); }}
                style={styles.trackHeader}
              >
                <View style={[styles.art, { backgroundColor: activeMusic.track.coverColor || "#19172F" }]}>
                  <Ionicons name="musical-notes" size={18} color={activeMusic.track.accentColor || accent} />
                </View>
                <View style={styles.trackCopy}>
                   <Text numberOfLines={1} style={[styles.trackTitle, { color: colors.text }]}>{activeMusic.track.title}</Text>
                   <Text numberOfLines={1} style={[styles.artist, { color: colors.textMuted }]}>{activeMusic.track.artist}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Minimize player to floating button" onPress={() => { setExpanded(false); setMinimized(true); }} hitSlop={8} style={styles.action}>
                  <Ionicons name="chevron-down" size={19} color={colors.textMuted} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Stop music" onPress={stopMusic} hitSlop={8} style={styles.action}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              </Pressable>
              <View style={styles.controls}>
                <MusicTransport key={activeMusic.track.id} uri={activeMusic.uri} />
              </View>
              {expanded && !minimized ? (
                <View style={styles.songSheet}>
                  <View style={[styles.largeArt, { backgroundColor: activeMusic.track.coverColor || "#19172F" }]}>
                    <Ionicons name="musical-notes" size={42} color={activeMusic.track.accentColor || accent} />
                  </View>
                  <Text numberOfLines={2} style={[styles.sheetTitle, { color: colors.text }]}>{activeMusic.track.title}</Text>
                  <Text numberOfLines={1} style={[styles.sheetArtist, { color: colors.textMuted }]}>{activeMusic.track.artist}</Text>
                  <Text style={[styles.sheetHint, { color: accent }]}>Now playing on AfuMusic</Text>
                </View>
              ) : null}
            </View>
          </View>
          {minimized ? (
            <Animated.View
              {...floatingPanResponder.panHandlers}
              pointerEvents="box-none"
              style={[styles.floatingPlayer, { transform: floatingDrag.getTranslateTransform() }]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open current song: ${activeMusic.track.title}`}
                onPress={() => { setExpanded(true); setMinimized(false); }}
                style={[styles.floatingButton, { backgroundColor: activeMusic.track.coverColor || "#19172F" }]}
              >
                <Ionicons name="musical-notes" size={23} color={activeMusic.track.accentColor || accent} />
                <View style={[styles.floatingIndicator, { backgroundColor: accent }]} />
              </Pressable>
            </Animated.View>
          ) : null}
        </>
      ) : null}
    </GlobalMusicContext.Provider>
  );
}

const styles = StyleSheet.create({
  floatingPlayer: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 1100,
    elevation: 16,
  },
  floatingButton: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  floatingIndicator: {
    position: "absolute",
    right: 7,
    bottom: 7,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#1F95FF",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  overlay: {
    position: "absolute",
    left: 10,
    right: 10,
    zIndex: 1000,
    elevation: 12,
  },
  hiddenOverlay: {
    height: 0,
    opacity: 0,
    overflow: "hidden",
  },
  player: {
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 8px 24px rgba(0,0,0,0.18)" } as any,
      default: { elevation: 8 },
    }),
  },
  playerExpanded: { paddingTop: 10, paddingBottom: 14 },
  action: { padding: 4 },
  controls: { opacity: 1 },
  transport: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 8 },
  mainPlayButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  disabledControl: { opacity: 0.68 },
  skipButton: { width: 30, height: 34, alignItems: "center", justifyContent: "center" },
  skipLabel: { fontSize: 8, fontWeight: "700", marginTop: -5 },
  timeline: { flex: 1, minWidth: 45, justifyContent: "center", gap: 5 },
  seekTrack: { height: 4, borderRadius: 2, justifyContent: "center" },
  seekFill: { position: "absolute", left: 0, height: 4, borderRadius: 2 },
  seekThumb: { position: "absolute", top: -3, width: 10, height: 10, borderRadius: 5, marginLeft: -5 },
  timeRow: { flexDirection: "row", justifyContent: "space-between" },
  timeText: { fontSize: 9, fontVariant: ["tabular-nums"] },
  songSheet: { alignItems: "center", paddingTop: 14, paddingBottom: 6 },
  largeArt: { width: 170, height: 170, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: "700", textAlign: "center", maxWidth: "95%" },
  sheetArtist: { fontSize: 13, marginTop: 5 },
  sheetHint: { fontSize: 11, marginTop: 10 },
  trackHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  art: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  trackCopy: { flex: 1, minWidth: 55 },
  trackTitle: { fontSize: 13, fontWeight: "700" },
  artist: { fontSize: 11, marginTop: 2 },
  close: { padding: 3 },
});
