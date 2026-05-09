import React, { useEffect, useRef, useState, useCallback } from "react";
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
import { Audio, AVPlaybackStatus } from "expo-av";

interface AudioPlayerProps {
  uri: string;
  tintColor?: string;
  waveColor?: string;
}

const SPEEDS = [1, 1.5, 2] as const;
type Speed = typeof SPEEDS[number];

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

export default function AudioPlayer({ uri, tintColor = "#FFFFFF", waveColor }: AudioPlayerProps) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [speed, setSpeed] = useState<Speed>(1);
  const barColor = waveColor || tintColor;
  const trackWidth = useRef(0);

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  useEffect(() => {
    let mounted = true;

    async function loadSound() {
      try {
        if (Platform.OS !== "web") {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            allowsRecordingIOS: false,
            shouldDuckAndroid: false,
            staysActiveInBackground: false,
            playThroughEarpieceAndroid: false,
          });
        }

        const { sound, status: initialStatus } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false, progressUpdateIntervalMillis: 80 },
          (s: AVPlaybackStatus) => {
            if (!mounted) return;
            if (s.isLoaded) {
              setPosition(s.positionMillis || 0);
              if (s.durationMillis) setDuration(s.durationMillis);
              setIsPlaying(s.isPlaying);
              if (s.didJustFinish) {
                setIsPlaying(false);
                setPosition(0);
                sound.setPositionAsync(0).catch(() => {});
              }
            }
          }
        );

        if (!mounted) {
          sound.unloadAsync();
          return;
        }

        soundRef.current = sound;
        if (initialStatus.isLoaded && initialStatus.durationMillis) {
          setDuration(initialStatus.durationMillis);
        }
        setStatus("ready");
      } catch {
        if (mounted) setStatus("error");
      }
    }

    loadSound();

    return () => {
      mounted = false;
      soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, [uri]);

  const togglePlay = useCallback(async () => {
    if (!soundRef.current || status !== "ready") return;
    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
        if (position >= duration && duration > 0) {
          await soundRef.current.setPositionAsync(0);
        }
        await soundRef.current.setRateAsync(speed, true);
        await soundRef.current.playAsync();
      }
    } catch {}
  }, [isPlaying, position, duration, status, speed]);

  const cycleSpeed = useCallback(async () => {
    if (!soundRef.current || status !== "ready") return;
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setSpeed(next);
    try {
      await soundRef.current.setRateAsync(next, true);
    } catch {}
  }, [speed, status]);

  const seekFromTouch = useCallback(async (e: GestureResponderEvent) => {
    if (!soundRef.current || status !== "ready" || duration === 0) return;
    const { locationX } = e.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / (trackWidth.current || 1)));
    const seekMs = Math.floor(ratio * duration);
    setPosition(seekMs);
    try {
      await soundRef.current.setPositionAsync(seekMs);
    } catch {}
  }, [status, duration]);

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  }, []);

  if (status === "error") {
    return (
      <View style={s.row}>
        <Ionicons name="alert-circle" size={20} color={tintColor} />
        <Text style={[s.time, { color: tintColor }]}>Audio unavailable</Text>
      </View>
    );
  }

  const displayTime = isPlaying || position > 0 ? formatTime(position) : formatTime(duration);
  const filled = Math.round(progress * BARS);

  return (
    <View style={s.row}>
      <TouchableOpacity onPress={togglePlay} hitSlop={8} disabled={status === "loading"}>
        {status === "loading" ? (
          <Ionicons name="ellipsis-horizontal" size={24} color={tintColor} style={{ opacity: 0.5 }} />
        ) : (
          <Ionicons name={isPlaying ? "pause" : "play"} size={24} color={tintColor} />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.9}
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
                backgroundColor: i < filled ? barColor : `${barColor}38`,
              },
            ]}
          />
        ))}
      </TouchableOpacity>

      <TouchableOpacity onPress={cycleSpeed} hitSlop={8} disabled={status === "loading"}>
        <Text style={[s.speed, { color: tintColor, opacity: status === "loading" ? 0.4 : 1 }]}>
          {speed}×
        </Text>
      </TouchableOpacity>

      <Text style={[s.time, { color: tintColor }]}>{displayTime}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 200,
    paddingVertical: 4,
  },
  waveContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 30,
    paddingVertical: 2,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    marginHorizontal: 1,
    minWidth: 2,
  },
  speed: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    minWidth: 24,
    textAlign: "center",
  },
  time: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    minWidth: 34,
    textAlign: "right",
  },
});
