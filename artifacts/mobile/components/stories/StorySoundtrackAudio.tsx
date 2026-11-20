import React, { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";

type Props = {
  uri: string | null;
  startSeconds: number;
  endSeconds: number;
  active: boolean;
};

export default function StorySoundtrackAudio({ uri, startSeconds, endSeconds, active }: Props) {
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const webAudioRef = useRef<any>(null);
  const [nativeReady, setNativeReady] = useState(false);
  const [webReady, setWebReady] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    setWebReady(false);
    if (!uri) {
      webAudioRef.current = null;
      return;
    }

    const AudioConstructor = (globalThis as any).Audio;
    if (!AudioConstructor) return;
    const audio = new AudioConstructor(uri);
    audio.preload = "auto";
    audio.onloadedmetadata = () => {
      const safeStart = Math.min(startSeconds, Math.max(0, audio.duration - 0.1));
      audio.currentTime = safeStart;
      setWebReady(true);
    };
    audio.ontimeupdate = () => {
      const actualEnd = Number.isFinite(audio.duration) ? Math.min(endSeconds, audio.duration) : endSeconds;
      if (audio.currentTime >= actualEnd - 0.08) {
        audio.pause();
        audio.currentTime = Math.min(startSeconds, Math.max(0, audio.duration - 0.1));
      }
    };
    audio.onerror = () => setWebReady(false);
    webAudioRef.current = audio;
    return () => {
      audio.pause();
      audio.onloadedmetadata = null;
      audio.ontimeupdate = null;
      audio.onerror = null;
      audio.src = "";
      webAudioRef.current = null;
      setWebReady(false);
    };
  }, [uri, startSeconds, endSeconds]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    player.pause();
    player.replace(null);
    setNativeReady(false);
    if (!uri) return;

    let mounted = true;
    let initialized = false;
    let safeStart = startSeconds;
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (!mounted || !status.isLoaded) return;
      if (!initialized) {
        initialized = true;
        safeStart = Math.min(startSeconds, Math.max(0, status.duration - 0.1));
        void player.seekTo(safeStart).then(() => {
          if (mounted) setNativeReady(true);
        }).catch(() => {});
      }
      const actualEnd = status.duration > 0 ? Math.min(endSeconds, status.duration) : endSeconds;
      if (initialized && status.currentTime >= actualEnd - 0.08) {
        player.pause();
        void player.seekTo(safeStart).catch(() => {});
      }
    });
    player.replace({ uri });

    return () => {
      mounted = false;
      subscription.remove();
      player.pause();
      player.replace(null);
      setNativeReady(false);
    };
  }, [uri, startSeconds, endSeconds, player]);

  useEffect(() => {
    if (Platform.OS === "web") {
      const audio = webAudioRef.current;
      if (!audio) return;
      if (!active) {
        audio.pause();
      } else if (webReady) {
        void audio.play().catch(() => {});
      }
      return;
    }

    if (!active || !nativeReady) {
      player.pause();
      return;
    }
    let cancelled = false;
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
      shouldPlayInBackground: false,
    }).then(() => {
      if (!cancelled && activeRef.current) player.play();
    }).catch(() => {});
    return () => {
      cancelled = true;
      player.pause();
    };
  }, [active, nativeReady, webReady, player, uri]);

  return null;
}
