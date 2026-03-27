import React, { useEffect, useRef, useState } from "react";
import { View, TouchableOpacity, Text, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

interface AudioPlayerProps {
  uri: string;
  tintColor?: string;
  waveColor?: string;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function AudioPlayer({ uri, tintColor = "#FFFFFF", waveColor }: AudioPlayerProps) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState(false);
  const barColor = waveColor || tintColor;

  const isPlaying = status.playing;
  const duration = status.duration || 0;
  const position = status.currentTime || 0;
  const progress = duration > 0 ? position / duration : 0;

  const bars = 20;

  useEffect(() => {
    if (status.error) setError(true);
  }, [status.error]);

  function togglePlay() {
    if (error) return;
    if (isPlaying) {
      player.pause();
    } else {
      if (position >= duration && duration > 0) {
        player.seekTo(0);
      }
      player.play();
    }
  }

  if (error) {
    return (
      <View style={s.row}>
        <Ionicons name="alert-circle" size={20} color={tintColor} />
        <Text style={[s.time, { color: tintColor }]}>Audio unavailable</Text>
      </View>
    );
  }

  return (
    <View style={s.row}>
      <TouchableOpacity onPress={togglePlay} hitSlop={8}>
        <Ionicons
          name={isPlaying ? "pause" : "play"}
          size={24}
          color={tintColor}
        />
      </TouchableOpacity>

      <View style={s.waveContainer}>
        {Array.from({ length: bars }).map((_, i) => {
          const h = 6 + Math.sin(i * 0.9) * 8 + Math.cos(i * 1.3) * 4;
          const filled = i / bars <= progress;
          return (
            <View
              key={i}
              style={[
                s.bar,
                {
                  height: h,
                  backgroundColor: filled ? barColor : `${barColor}40`,
                },
              ]}
            />
          );
        })}
      </View>

      <Text style={[s.time, { color: tintColor }]}>
        {isPlaying || position > 0 ? formatTime(position) : formatTime(duration)}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 180,
    paddingVertical: 4,
  },
  waveContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 28,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    minWidth: 2,
  },
  time: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    minWidth: 32,
  },
});
