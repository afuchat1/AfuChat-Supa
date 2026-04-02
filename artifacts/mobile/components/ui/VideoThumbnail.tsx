import React, { useEffect, useState, useRef, useCallback } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";

const SEEK_TIME = 1.0;

type Props = {
  videoUrl: string;
  fallbackImageUrl?: string | null;
  style?: any;
  resizeMode?: "cover" | "contain" | "stretch";
};

function VideoThumbnailNative({ videoUrl, fallbackImageUrl, style, resizeMode = "cover" }: Props) {
  const [thumbUri, setThumbUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { getThumbnailAsync } = await import("expo-video-thumbnails");
        const { uri } = await getThumbnailAsync(videoUrl, { time: SEEK_TIME * 1000 });
        if (!cancelled) setThumbUri(uri);
      } catch {
        if (!cancelled) setThumbUri(null);
      }
    })();

    return () => { cancelled = true; };
  }, [videoUrl]);

  const source = thumbUri || fallbackImageUrl;
  if (!source) return <View style={[style, { backgroundColor: "#0a0a0a" }]} />;

  return (
    <Image
      source={{ uri: source }}
      style={style}
      resizeMode={resizeMode}
    />
  );
}

function VideoThumbnailWeb({ videoUrl, style }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleLoadedData = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = SEEK_TIME;
    }
  }, []);

  return (
    // @ts-ignore
    <video
      ref={videoRef}
      src={videoUrl}
      preload="auto"
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
