import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  GestureResponderEvent,
  LayoutChangeEvent,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isExpoGo } from "@/lib/expoEnvironment";
import { audioFocus } from "@/lib/audioFocus";
// expo-av: lazy-load on native only.
// Do NOT gate on NativeModules.ExponentAV — in Expo SDK 55 + New Architecture
// production builds expo-av uses TurboModules/JSI and is absent from NativeModules,
// so that check always returns null and silently disables all audio.
let Audio: typeof import("expo-av").Audio | null = null;
if (Platform.OS !== "web" && !isExpoGo()) {
  try { Audio = require("expo-av").Audio; } catch {}
}
type AVPlaybackStatus = import("expo-av").AVPlaybackStatus;
type AudioSound = import("expo-av/build/Audio/Sound").Sound;

interface AudioPlayerProps {
  uri: string;
  tintColor?: string;
  waveColor?: string;
  backgroundColor?: string;
  onError?: () => void;
}

const SPEEDS = [1, 1.5, 2] as const;
type Speed = (typeof SPEEDS)[number];

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

const BARS = 28;

function buildWaveBars(bars: number): number[] {
  return Array.from({ length: bars }, (_, i) => {
    const base = 0.3 + Math.sin(i * 0.85) * 0.25 + Math.cos(i * 1.4 + 0.6) * 0.15;
    return Math.max(0.15, Math.min(0.95, base));
  });
}

const WAVE_SHAPE = buildWaveBars(BARS);

type VoicePlaybackController = {
  activate: () => void;
  deactivate: () => void;
};

let voicePlayerSequence = 0;
let activeVoicePlayerId: string | null = null;
const voicePlayers = new Map<string, VoicePlaybackController>();

const voicePlaybackCoordinator = {
  register(controller: VoicePlaybackController): string {
    const id = `voice-player-${++voicePlayerSequence}`;
    voicePlayers.set(id, controller);
    return id;
  },
  unregister(id: string) {
    voicePlayers.delete(id);
    if (activeVoicePlayerId === id) activeVoicePlayerId = null;
  },
  play(id: string) {
    if (activeVoicePlayerId === id) return;
    if (activeVoicePlayerId) voicePlayers.get(activeVoicePlayerId)?.deactivate();
    activeVoicePlayerId = id;
    voicePlayers.get(id)?.activate();
  },
  finished(id: string) {
    if (activeVoicePlayerId !== id) return;
    activeVoicePlayerId = null;
  },
};

function AudioPlayerIdle({
  onPlay,
  tintColor,
  waveColor,
  backgroundColor,
}: {
  onPlay: () => void;
  tintColor: string;
  waveColor?: string;
  backgroundColor?: string;
}) {
  const barColor = waveColor || tintColor;
  return (
    <View style={[s.row, backgroundColor && { backgroundColor }]}>
      <TouchableOpacity onPress={onPlay} hitSlop={8}>
        <Ionicons name="play" size={18} color={tintColor} />
      </TouchableOpacity>
      <View style={s.waveContainer}>
        {WAVE_SHAPE.map((h, i) => (
          <View
            key={i}
            style={[s.bar, { height: `${h * 100}%`, backgroundColor: `${barColor}40` }]}
          />
        ))}
      </View>
      <Text style={[s.speed, { color: tintColor, opacity: 0.45 }]}>1×</Text>
      <Text style={[s.time, { color: tintColor, opacity: 0.55 }]}>-:--</Text>
    </View>
  );
}

function AudioPlayerActive({
  uri,
  playerId,
  tintColor = "#FFFFFF",
  waveColor,
  backgroundColor,
  onError,
}: AudioPlayerProps & { playerId: string }) {
  const soundRef = useRef<AudioSound | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const mountedRef = useRef(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const finishedRef = useRef(false);
  const trackWidth = useRef(0);
  const barColor = waveColor || tintColor;

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = audioFocus.subscribe(() => {
      // Stop immediately when the microphone takes audio focus. Unmounting
      // alone is not enough because expo-av cleanup is asynchronous.
      const sound = soundRef.current;
      if (!sound) return;
      sound.stopAsync().catch(() => {});
      soundRef.current = null;
      if (mountedRef.current) {
        setIsPlaying(false);
        setPositionMs(0);
      }
      voicePlaybackCoordinator.finished(playerId);
    });
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [playerId]);

  useEffect(() => {
    let mounted = true;
    let webAudio: HTMLAudioElement | null = null;

    async function loadAudio() {
      try {
        if (Platform.OS === "web") {
          webAudio = new window.Audio(uri);
          webAudio.preload = "metadata";
          webAudioRef.current = webAudio;
          webAudio.onloadedmetadata = () => {
            if (!mounted || !webAudio) return;
            setDurationMs(Number.isFinite(webAudio.duration) ? webAudio.duration * 1000 : 0);
            setIsLoaded(true);
            void webAudio.play().catch(() => {});
          };
          webAudio.ontimeupdate = () => {
            if (!mounted || !webAudio) return;
            setPositionMs(webAudio.currentTime * 1000);
          };
          webAudio.onplay = () => { if (mounted) setIsPlaying(true); };
          webAudio.onpause = () => { if (mounted) setIsPlaying(false); };
          webAudio.onended = () => {
            if (!mounted || !webAudio) return;
            setIsPlaying(false);
            setPositionMs(webAudio.duration * 1000);
            voicePlaybackCoordinator.finished(playerId);
          };
          webAudio.onerror = () => {
            if (mounted) { setHasError(true); onError?.(); }
          };
          webAudio.load();
          return;
        }

        if (!Audio) { if (mounted) { setHasError(true); onError?.(); } return; }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: false,
          staysActiveInBackground: false,
        }).then(() => {}, () => {});

        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, progressUpdateIntervalMillis: 80 },
          (status: AVPlaybackStatus) => {
            if (!mounted) return;
            if (status.isLoaded) {
              setIsLoaded(true);
              setIsPlaying(status.isPlaying);
              setPositionMs(status.positionMillis ?? 0);
              setDurationMs(status.durationMillis ?? 0);
              if (status.didJustFinish) {
                 if (!finishedRef.current) {
                   finishedRef.current = true;
                   setIsPlaying(false);
                   setPositionMs(status.durationMillis ?? status.positionMillis ?? 0);
                   voicePlaybackCoordinator.finished(playerId);
                 }
              }
            }
          }
        );

        if (mounted) soundRef.current = sound;
        else sound.unloadAsync().catch(() => {});
      } catch {
        // Audio load failed — notify parent so it can reset to idle (tap-to-retry).
        if (mounted) { setHasError(true); onError?.(); }
      }
    }

    loadAudio();

    return () => {
      mounted = false;
      if (webAudio) {
        webAudio.pause();
        webAudio.src = "";
        webAudioRef.current = null;
      }
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, [uri]);

  const togglePlay = useCallback(async () => {
    if (!isLoaded) return;
    try {
      if (Platform.OS === "web") {
        const audio = webAudioRef.current;
        if (!audio) return;
        if (audio.ended || (audio.duration > 0 && audio.currentTime >= audio.duration)) {
          audio.currentTime = 0;
        }
        if (audio.paused) await audio.play();
        else audio.pause();
        return;
      }
      if (!soundRef.current) return;
      if (isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        if (positionMs >= durationMs && durationMs > 0) {
          await soundRef.current.setPositionAsync(0);
          finishedRef.current = false;
        }
        await soundRef.current.playAsync();
      }
    } catch {}
  }, [isPlaying, positionMs, durationMs, isLoaded]);

  const cycleSpeed = useCallback(async () => {
    if (!isLoaded) return;
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setSpeed(next);
    try {
      if (Platform.OS === "web") {
        if (webAudioRef.current) webAudioRef.current.playbackRate = next;
        return;
      }
      if (!soundRef.current) return;
      await soundRef.current.setRateAsync(next, true);
    } catch {}
  }, [speed, isLoaded]);

  const seekFromTouch = useCallback(
    async (e: GestureResponderEvent) => {
      if (!isLoaded || durationMs === 0) return;
      const { locationX } = e.nativeEvent;
      const ratio = Math.max(0, Math.min(1, locationX / (trackWidth.current || 1)));
      try {
        if (Platform.OS === "web") {
          if (webAudioRef.current) webAudioRef.current.currentTime = ratio * durationMs / 1000;
          return;
        }
        if (!soundRef.current) return;
        await soundRef.current.setPositionAsync(ratio * durationMs);
      } catch {}
    },
    [isLoaded, durationMs]
  );

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  }, []);

  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const filled = Math.round(progress * BARS);
  const displayTime =
    isPlaying || positionMs > 0 ? formatTime(positionMs) : formatTime(durationMs);

  return (
    <View style={[s.row, backgroundColor && { backgroundColor }]}>
      <TouchableOpacity onPress={hasError ? () => setHasError(false) : togglePlay} hitSlop={8} disabled={isLoaded ? false : !hasError}>
        {hasError ? (
          <Ionicons name="refresh" size={18} color={tintColor} />
        ) : !isLoaded ? (
          <Ionicons name="ellipsis-horizontal" size={18} color={tintColor} style={{ opacity: 0.5 }} />
        ) : (
          <Ionicons name={isPlaying ? "pause" : "play"} size={18} color={tintColor} />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.85}
        style={s.waveContainer}
        onPress={seekFromTouch}
        onLayout={onTrackLayout}
      >
        {WAVE_SHAPE.map((h, i) => (
          <View
            key={i}
            style={[
              s.bar,
              {
                height: `${h * 100}%`,
                backgroundColor: i < filled ? barColor : `${barColor}40`,
              },
            ]}
          />
        ))}
      </TouchableOpacity>

      <TouchableOpacity onPress={cycleSpeed} hitSlop={8} disabled={!isLoaded}>
        <Text style={[s.speed, { color: tintColor, opacity: isLoaded ? 1 : 0.4 }]}>
          {speed}×
        </Text>
      </TouchableOpacity>

      <Text style={[s.time, { color: tintColor }]}>{displayTime}</Text>
    </View>
  );
}

export default function AudioPlayer({ uri, tintColor = "#FFFFFF", waveColor, backgroundColor }: AudioPlayerProps) {
  const [active, setActive] = useState(false);
  const playerIdRef = useRef<string | null>(null);

  useEffect(() => {
    const id = voicePlaybackCoordinator.register({
      activate: () => setActive(true),
      deactivate: () => setActive(false),
    });
    playerIdRef.current = id;
    return () => {
      voicePlaybackCoordinator.unregister(id);
    };
  }, []);

  if (!active) {
    return (
      <AudioPlayerIdle
        onPlay={() => {
          if (playerIdRef.current) voicePlaybackCoordinator.play(playerIdRef.current);
        }}
        tintColor={tintColor}
        waveColor={waveColor}
        backgroundColor={backgroundColor}
      />
    );
  }

  // onError resets to idle so the user can tap play again to retry.
  return (
    <AudioPlayerActive
      uri={uri}
      playerId={playerIdRef.current ?? ""}
      tintColor={tintColor}
      waveColor={waveColor}
      backgroundColor={backgroundColor}
      onError={() => setActive(false)}
    />
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 210,
    height: 42,
    paddingHorizontal: 11,
    borderRadius: 21,
  },
  waveContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 26,
    paddingVertical: 1,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    marginHorizontal: 1,
    minWidth: 2,
  },
  speed: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    minWidth: 20,
    textAlign: "center",
  },
  time: {
    fontSize: 10,
    fontVariant: ["tabular-nums"],
    minWidth: 30,
    textAlign: "right",
  },
});
