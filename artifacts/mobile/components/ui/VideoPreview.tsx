import React, { useEffect } from "react";
import { VideoView, useVideoPlayer } from "expo-video";
import type { StyleProp, ViewStyle } from "react-native";
import { safePause, safePlay } from "@/lib/safeMedia";

type ContentFit = "contain" | "cover" | "fill";

interface VideoPreviewProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: ContentFit;
  shouldPlay?: boolean;
  isLooping?: boolean;
  isMuted?: boolean;
  volume?: number;
  nativeControls?: boolean;
  /** Playback speed multiplier: 0.5 = slow-mo, 1 = normal, 2 = fast-forward */
  playbackRate?: number;
}

export default function VideoPreview({
  uri,
  style,
  contentFit = "cover",
  shouldPlay = true,
  isLooping = true,
  isMuted = false,
  volume = 1,
  nativeControls = false,
  playbackRate = 1,
}: VideoPreviewProps) {
  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.loop = isLooping;
    p.muted = isMuted;
    p.volume = volume;
    p.playbackRate = playbackRate;
    if (shouldPlay) safePlay(p);
  });

  useEffect(() => {
    if (!uri) return;
    // useVideoPlayer recreates the player when uri changes. Calling
    // replaceAsync here as well causes expo-video's web adapter to start a
    // second load while the first play promise is pending, which surfaces as
    // "The play() request was interrupted by a new load request."
    player.loop = isLooping;
    player.muted = isMuted;
    player.volume = volume;
    player.playbackRate = playbackRate;
    if (shouldPlay) safePlay(player); else safePause(player);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  useEffect(() => {
    if (shouldPlay) safePlay(player); else safePause(player);
  }, [shouldPlay]);

  useEffect(() => { player.muted = isMuted; }, [isMuted]);
  useEffect(() => { player.volume = Math.max(0, Math.min(1, volume)); }, [volume]);
  useEffect(() => { player.loop = isLooping; }, [isLooping]);
  useEffect(() => {
    try { player.playbackRate = playbackRate; } catch {}
  }, [playbackRate]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit={contentFit}
      nativeControls={nativeControls}
    />
  );
}
