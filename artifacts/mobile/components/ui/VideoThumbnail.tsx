import React, { useEffect, useState, useRef, useCallback } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Image } from "expo-image";

const SEEK_TIME = 1.0;

type Props = {
  videoUrl: string;
  fallbackImageUrl?: string | null;
  style?: any;
  resizeMode?: "cover" | "contain" | "stretch";
  lowData?: boolean;
};

function VideoThumbnailNative({ videoUrl, fallbackImageUrl, style, lowData }: Props) {
  const [thumbUri, setThumbUri] = useState<string | null>(null);

  useEffect(() => {
    if (lowData) return;
    if (!videoUrl || videoUrl.startsWith("blob:")) return;

    let cancelled = false;
    (async () => {
      try {
        const thumbMod = await import("expo-video-thumbnails");
        const fn = thumbMod.getThumbnailAsync ?? (thumbMod as any).default?.getThumbnailAsync;
        if (!fn) return;
        const result = await fn(videoUrl, { time: SEEK_TIME * 1000, quality: 0.7 });
        if (!cancelled && result?.uri) setThumbUri(result.uri);
      } catch {
        if (!cancelled) setThumbUri(null);
      }
    })();

    return () => { cancelled = true; };
  }, [videoUrl, lowData]);

  const source = thumbUri || fallbackImageUrl;
  if (!source) return <View style={[style, { backgroundColor: "#0a0a0a" }]} />;

  return (
    <Image
      source={{ uri: source }}
      style={style}
      contentFit="cover"
      cachePolicy={lowData ? "disk" : "memory-disk"}
      transition={100}
    />
  );
}

function VideoThumbnailWeb({ videoUrl, fallbackImageUrl, style, lowData }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleLoadedData = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = SEEK_TIME;
    }
  }, []);

  if (lowData) {
    if (!fallbackImageUrl) return <View style={[style, { backgroundColor: "#0a0a0a" }]} />;
    return (
      <Image
        source={{ uri: fallbackImageUrl }}
        style={style}
        contentFit="cover"
        cachePolicy="disk"
      />
    );
  }

  return (
    // @ts-ignore
    <video
      ref={videoRef}
      src={videoUrl}
      preload="metadata"
      muted
      playsInline
      onLoadedData={handleLoadedData}
      style={{
        ...(typeof style === "object" ? StyleSheet.flatten(style) : {}),
        objectFit: "cover",
      }}
    />
  );
}

export function VideoThumbnail(props: Props) {
  if (Platform.OS === "web") return <VideoThumbnailWeb {...props} />;
  return <VideoThumbnailNative {...props} />;
}
