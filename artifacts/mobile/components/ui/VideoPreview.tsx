import React, { useEffect } from "react";
import { VideoView, useVideoPlayer } from "expo-video";
import type { StyleProp, ViewStyle } from "react-native";
import { safePause, safePlay } from "@/lib/safeMedia";
import { toAfuCloudMediaUrl } from "@/lib/afuCloudMedia";

type ContentFit = "contain" | "cover" | "fill";

interface VideoPreviewProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: ContentFit;
  shouldPlay?: boolean;
  isLooping?: boolean;
  isMuted?: boolean;
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
  nativeControls = false,
  playbackRate = 1,
}: VideoPreviewProps) {
  const resolvedUri = toAfuCloudMediaUrl(uri) || uri;
  const player = useVideoPlayer(resolvedUri ? { uri: resolvedUri } : null, (p) => {
    p.loop = isLooping;
    p.muted = isMuted;
    p.playbackRate = playbackRate;
    if (shouldPlay) safePlay(p);
  });

  useEffect(() => {
    if (!resolvedUri) return;
    // useVideoPlayer recreates the player when uri changes. Calling
    // replaceAsync here as well causes expo-video's web adapter to start a
    // second load while the first play promise is pending, which surfaces as
    // "The play() request was interrupted by a new load request."
    player.loop = isLooping;
    player.muted = isMuted;
    player.playbackRate = playbackRate;
    if (shouldPlay) safePlay(player); else safePause(player);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedUri]);

  useEffect(() => {
    if (shouldPlay) safePlay(player); else safePause(player);
  }, [shouldPlay]);

  useEffect(() => { player.muted = isMuted; }, [isMuted]);
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
