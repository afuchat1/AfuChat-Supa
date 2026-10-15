import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isExpoGo } from "@/lib/expoEnvironment";
import { audioFocus } from "@/lib/audioFocus";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import type { AfuMusicTrack } from "@/modules/afumusic";

let NativeAudio: typeof import("expo-av").Audio | null = null;
if (Platform.OS !== "web" && !isExpoGo()) {
  try { NativeAudio = require("expo-av").Audio; } catch {}
}
type AVPlaybackStatus = import("expo-av").AVPlaybackStatus;
type NativeSound = import("expo-av/build/Audio/Sound").Sound;

type AudioUriResolver = (track: AfuMusicTrack) => Promise<string | null>;
type ActiveMusic = {
  track: AfuMusicTrack;
  uri: string;
  queue: AfuMusicTrack[];
  queueIndex: number;
  resolveAudio?: AudioUriResolver;
};
type GlobalMusicContextValue = {
  activeMusic: ActiveMusic | null;
  playMusic: (track: AfuMusicTrack, uri: string, queue?: AfuMusicTrack[], resolveAudio?: AudioUriResolver) => void;
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

function SlidingTrackTitle({ title, color }: { title: string; color: string }) {
  const offset = useRef(new Animated.Value(0)).current;
  const [viewportWidth, setViewportWidth] = useState(0);
  const [measurement, setMeasurement] = useState({ title: "", width: 0 });
  const titleWidth = measurement.title === title ? measurement.width : 0;

  useEffect(() => {
    offset.stopAnimation();
    offset.setValue(0);
    if (viewportWidth <= 0 || titleWidth <= viewportWidth + 1) return;

    const cycleDistance = titleWidth + 28;
    const marquee = Animated.loop(Animated.sequence([
      Animated.delay(800),
      Animated.timing(offset, {
        toValue: -cycleDistance,
        duration: Math.max(4500, cycleDistance * 32),
        useNativeDriver: false,
      }),
      Animated.delay(900),
    ]));
    marquee.start();
    return () => marquee.stop();
  }, [offset, title, titleWidth, viewportWidth]);

  const measureTitle = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setMeasurement((current) => (
      current.title === title && Math.abs(current.width - width) < 1
        ? current
        : { title, width }
    ));
  };

  return (
    <View
      style={styles.titleViewport}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setViewportWidth((current) => Math.abs(current - width) < 1 ? current : width);
      }}
    >
      <Animated.View style={[styles.titleMarqueeTrack, { transform: [{ translateX: offset }] }]}>
        <Text
          numberOfLines={1}
          onLayout={measureTitle}
          style={[styles.miniTrackTitle, { color }]}
        >
          {title}
        </Text>
        {titleWidth > viewportWidth + 1 ? (
          <>
            <View style={styles.marqueeGap} />
            <Text
              numberOfLines={1}
              accessible={false}
              style={[styles.miniTrackTitle, { color }]}
            >
              {title}
            </Text>
          </>
        ) : null}
      </Animated.View>
    </View>
  );
}

function MusicTransport({
  uri,
  expanded,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  advancing,
}: {
  uri: string;
  expanded: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
  advancing: boolean;
}) {
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
    setReady(false);
    setPlaying(false);
    setPosition(0);
    setDuration(0);
    setFailed(false);
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
      if (status.didJustFinish) {
        setPlaying(false);
        onNext?.();
      }
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
            onNext?.();
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
  }, [onNext, uri]);

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

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={expanded ? styles.expandedTransport : styles.compactTransport}>
      <View style={[styles.transportControls, expanded && styles.expandedTransportControls]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play previous track"
          onPress={onPrevious}
          disabled={!hasPrevious || advancing}
          style={[styles.skipButton, expanded && styles.expandedSkipButton, (!hasPrevious || advancing) && styles.disabledControl]}
        >
          <Ionicons name="play-skip-back" size={expanded ? 20 : 17} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? "Pause music" : failed ? "Playback unavailable" : "Play music"}
          onPress={() => void togglePlayback()}
          disabled={!ready}
          style={[styles.mainPlayButton, { backgroundColor: accent }, expanded && styles.expandedPlayButton, !ready && styles.disabledControl]}
        >
          {failed ? <Ionicons name="alert-circle" size={17} color="#FFFFFF" /> :
            !ready ? <ActivityIndicator size="small" color="#FFFFFF" /> :
            <Ionicons name={playing ? "pause" : "play"} size={17} color="#FFFFFF" />}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play next track"
          onPress={onNext}
          disabled={!hasNext || advancing}
          style={[styles.skipButton, expanded && styles.expandedSkipButton, (!hasNext || advancing) && styles.disabledControl]}
        >
          {advancing ? <ActivityIndicator size="small" color={colors.textSecondary} /> :
            <Ionicons name="play-skip-forward" size={expanded ? 20 : 17} color={colors.textSecondary} />}
        </Pressable>
      </View>
      {expanded ? (
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
      ) : null}
    </View>
  );
}

export function GlobalMusicPlayerProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors, accent } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [activeMusic, setActiveMusic] = useState<ActiveMusic | null>(null);
  const activeMusicRef = useRef<ActiveMusic | null>(activeMusic);
  activeMusicRef.current = activeMusic;
  const advanceRequestRef = useRef(0);
  const advancingRef = useRef(false);
  const [advancing, setAdvancing] = useState(false);
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

  const playMusic = useCallback((
    track: AfuMusicTrack,
    uri: string,
    queueTracks?: AfuMusicTrack[],
    resolveAudio?: AudioUriResolver,
  ) => {
    const queue = queueTracks?.length ? [...queueTracks] : [track];
    let queueIndex = queue.findIndex((item) => item.id === track.id);
    if (queueIndex < 0) {
      queue.unshift(track);
      queueIndex = 0;
    }
    const next = { track, uri, queue, queueIndex, resolveAudio };
    advanceRequestRef.current += 1;
    advancingRef.current = false;
    activeMusicRef.current = next;
    setAdvancing(false);
    setActiveMusic(next);
    setExpanded(false);
    setMinimized(false);
  }, []);

  const advanceMusic = useCallback(async (direction: -1 | 1) => {
    const current = activeMusicRef.current;
    if (!current?.resolveAudio || advancingRef.current) return;
    const queueIndex = current.queueIndex + direction;
    const track = current.queue[queueIndex];
    if (!track) return;

    const requestId = ++advanceRequestRef.current;
    advancingRef.current = true;
    setAdvancing(true);
    try {
      const uri = await current.resolveAudio(track);
      if (!uri) throw new Error("Audio is not available for this track yet.");
      if (requestId !== advanceRequestRef.current || activeMusicRef.current !== current) return;
      const next = { ...current, track, uri, queueIndex };
      activeMusicRef.current = next;
      setActiveMusic(next);
    } catch (error) {
      if (requestId === advanceRequestRef.current) showAlert("Playback unavailable", error);
    } finally {
      if (requestId === advanceRequestRef.current) {
        advancingRef.current = false;
        setAdvancing(false);
      }
    }
  }, []);

  const playNext = useCallback(() => { void advanceMusic(1); }, [advanceMusic]);
  const playPrevious = useCallback(() => { void advanceMusic(-1); }, [advanceMusic]);
  const stopMusic = useCallback(() => {
    advanceRequestRef.current += 1;
    advancingRef.current = false;
    activeMusicRef.current = null;
    setAdvancing(false);
    setActiveMusic(null);
    setExpanded(false);
    setMinimized(false);
  }, []);
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
              {
                left: Math.max(10, (windowWidth - 460) / 2),
                right: Math.max(10, (windowWidth - 460) / 2),
                bottom: Math.max(insets.bottom, 8) + 68,
              },
              minimized && styles.hiddenOverlay,
            ]}
          >
              <View style={[
                styles.player,
                { backgroundColor: colors.surface, borderColor: colors.border },
                expanded ? styles.playerExpanded : styles.playerCompact,
              ]}>
              <View style={[styles.expandedInfo, !expanded && styles.collapsedInfo]}>
                {expanded ? (
                  <>
                    <View style={styles.sheetTopBar}>
                      <Text style={[styles.sheetKicker, { color: colors.textMuted }]}>NOW PLAYING</Text>
                      <View style={styles.sheetActions}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Collapse player"
                          onPress={() => setExpanded(false)}
                          hitSlop={8}
                          style={styles.action}
                        >
                          <Ionicons name="chevron-down" size={19} color={colors.textMuted} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Minimize to floating player"
                          onPress={() => { setExpanded(false); setMinimized(true); }}
                          hitSlop={8}
                          style={styles.action}
                        >
                          <Ionicons name="contract-outline" size={18} color={colors.textMuted} />
                        </Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel="Stop music" onPress={stopMusic} hitSlop={8} style={styles.action}>
                          <Ionicons name="close" size={18} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.songSheet}>
                      <View style={[styles.largeArt, { backgroundColor: activeMusic.track.coverColor || "#19172F" }]}>
                        <Ionicons name="musical-notes" size={42} color={activeMusic.track.accentColor || accent} />
                      </View>
                      <Text numberOfLines={2} style={[styles.sheetTitle, { color: colors.text }]}>{activeMusic.track.title}</Text>
                      <Text numberOfLines={1} style={[styles.sheetArtist, { color: colors.textMuted }]}>{activeMusic.track.artist}</Text>
                    </View>
                  </>
                ) : null}
              </View>
              <View style={[styles.playerControlsRow, expanded && styles.playerControlsRowExpanded]}>
                <View style={[styles.compactInfoSlot, expanded && styles.hiddenControlSlot]}>
                  {!expanded ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open player for ${activeMusic.track.title}`}
                      onPress={() => { setExpanded(true); setMinimized(false); }}
                      style={styles.compactTrackInfo}
                    >
                      <View style={[styles.art, { backgroundColor: activeMusic.track.coverColor || "#19172F" }]}>
                        <Ionicons name="musical-notes" size={18} color={activeMusic.track.accentColor || accent} />
                      </View>
                      <SlidingTrackTitle title={activeMusic.track.title} color={colors.text} />
                    </Pressable>
                  ) : null}
                </View>
                <MusicTransport
                  key={activeMusic.track.id}
                  uri={activeMusic.uri}
                  expanded={expanded}
                  onNext={playNext}
                  onPrevious={playPrevious}
                  hasNext={Boolean(activeMusic.resolveAudio && activeMusic.queueIndex < activeMusic.queue.length - 1)}
                  hasPrevious={Boolean(activeMusic.resolveAudio && activeMusic.queueIndex > 0)}
                  advancing={advancing}
                />
              </View>
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
  playerCompact: { gap: 0, paddingHorizontal: 10, paddingVertical: 7 },
  playerExpanded: { gap: 10, paddingVertical: 10 },
  expandedInfo: { gap: 2 },
  collapsedInfo: { height: 0, opacity: 0, overflow: "hidden" },
  sheetTopBar: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetKicker: { fontSize: 9, fontWeight: "700", letterSpacing: 1.3 },
  sheetActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  action: { padding: 4 },
  playerControlsRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 42 },
  playerControlsRowExpanded: { flexDirection: "column", alignItems: "stretch", paddingHorizontal: 8, paddingBottom: 3 },
  compactInfoSlot: { flex: 1, minWidth: 0, height: 42, justifyContent: "center" },
  compactTrackInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9, minWidth: 0 },
  titleViewport: { flex: 1, minWidth: 0, overflow: "hidden", justifyContent: "center" },
  titleMarqueeTrack: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", flexShrink: 0 },
  miniTrackTitle: { flexGrow: 0, flexShrink: 0, fontSize: 12, fontWeight: "700" },
  marqueeGap: { width: 28 },
  hiddenControlSlot: { width: 0, height: 0, opacity: 0, overflow: "hidden" },
  compactTransport: { width: 110, flex: 0, justifyContent: "center" },
  expandedTransport: { width: "100%", gap: 13 },
  transportControls: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  expandedTransportControls: { gap: 22 },
  mainPlayButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  expandedPlayButton: { width: 48, height: 48, borderRadius: 24 },
  disabledControl: { opacity: 0.68 },
  skipButton: { width: 30, height: 34, alignItems: "center", justifyContent: "center" },
  expandedSkipButton: { width: 42, height: 42 },
  timeline: { width: "100%", justifyContent: "center", gap: 6 },
  seekTrack: { height: 4, borderRadius: 2, justifyContent: "center" },
  seekFill: { position: "absolute", left: 0, height: 4, borderRadius: 2 },
  seekThumb: { position: "absolute", top: -3, width: 10, height: 10, borderRadius: 5, marginLeft: -5 },
  timeRow: { flexDirection: "row", justifyContent: "space-between" },
  timeText: { fontSize: 9, fontVariant: ["tabular-nums"] },
  songSheet: { alignItems: "center", paddingTop: 3, paddingBottom: 6 },
  largeArt: { width: 170, height: 170, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: "700", textAlign: "center", maxWidth: "95%" },
  sheetArtist: { fontSize: 13, marginTop: 5 },
  art: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
