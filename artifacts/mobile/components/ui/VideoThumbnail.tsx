import React, { useEffect, useState, useRef, useCallback } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

const SEEK_TIME = 1.0;

function formatDuration(secs: number): string {
  if (!isFinite(secs) || secs <= 0) return "";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  videoUrl: string;
  fallbackImageUrl?: string | null;
  style?: any;
  resizeMode?: "cover" | "contain" | "stretch";
  lowData?: boolean;
  durationSeconds?: number | null;
  showDuration?: boolean;
};

function DurationBadge({ label }: { label: string }) {
  if (!label) return null;
  return (
    <View style={badgeStyles.wrap}>
      <Text style={badgeStyles.text}>{label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  text: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
});

function VideoThumbnailNative({ videoUrl, fallbackImageUrl, style, lowData, durationSeconds, showDuration = true }: Props) {
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
  const durationLabel = showDuration && durationSeconds != null ? formatDuration(durationSeconds) : "";

  return (
    <View style={style}>
      {source ? (
        <Image
          source={{ uri: source }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy={lowData ? "disk" : "memory-disk"}
          transition={100}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0a0a0a" }]} />
      )}
      {!!durationLabel && <DurationBadge label={durationLabel} />}
    </View>
  );
}

function VideoThumbnailWeb({ videoUrl, fallbackImageUrl, style, lowData, durationSeconds, showDuration = true }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [autoDuration, setAutoDuration] = useState<number | null>(null);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = SEEK_TIME;
      const d = videoRef.current.duration;
      if (isFinite(d) && d > 0) setAutoDuration(d);
    }
  }, []);

  const resolvedDuration = durationSeconds ?? autoDuration;
  const durationLabel = showDuration && resolvedDuration != null ? formatDuration(resolvedDuration) : "";

  if (lowData) {
    const source = fallbackImageUrl;
    return (
      <View style={style}>
        {source ? (
          <Image source={{ uri: source }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0a0a0a" }]} />
        )}
        {!!durationLabel && <DurationBadge label={durationLabel} />}
      </View>
    );
  }

  return (
    <View style={style}>
      {/* @ts-ignore */}
      <video
        ref={videoRef}
        src={videoUrl}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        style={{
          ...(typeof style === "object" ? StyleSheet.flatten(style) : {}),
          position: "absolute",
          top: 0, left: 0, width: "100%", height: "100%",
          objectFit: "cover",
        }}
      />
      {!!durationLabel && <DurationBadge label={durationLabel} />}
    </View>
  );
}

export function VideoThumbnail(props: Props) {
  if (Platform.OS === "web") return <VideoThumbnailWeb {...props} />;
  return <VideoThumbnailNative {...props} />;
}

export { formatDuration };
