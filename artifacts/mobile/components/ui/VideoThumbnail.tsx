import React, { useEffect, useState, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import CachedImage from "./CachedImage";

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
  watchedFraction?: number | null;
};

function DurationBadge({ label }: { label: string }) {
  if (!label) return null;
  return (
    <View style={badgeStyles.wrap}>
      <Text style={badgeStyles.text}>{label}</Text>
    </View>
  );
}

function WatchProgressBar({ fraction }: { fraction: number }) {
  if (fraction < 0.02 || fraction > 0.97) return null;
  return (
    <View style={[progressStyles.track, { pointerEvents: "none" } as any]}>
      <View style={[progressStyles.fill, { width: `${Math.round(fraction * 100)}%` as any }]} />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  fill: {
    height: 3,
    backgroundColor: "#ff2d55",
  },
});

const badgeStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 10,
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

function VideoThumbnailNative({
  videoUrl, fallbackImageUrl, style, lowData,
  durationSeconds, showDuration = true, watchedFraction,
}: Props) {
  const [thumbUri, setThumbUri] = useState<string | null>(null);

  useEffect(() => {
    // Android's video thumbnail decoder can allocate a full codec surface for
    // every recycled Discover row. During a fast scroll those decoders overlap
    // and can take down the process on memory-constrained devices. Prefer the
    // already-supplied poster on Android; full playback remains available when
    // the user opens the video.
    if (lowData || Platform.OS === "android") return;
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
  const hasFraction = watchedFraction != null && watchedFraction >= 0.02 && watchedFraction <= 0.97;
  const durationLabel = showDuration && durationSeconds != null
    ? formatDuration(durationSeconds) : "";
  const badgeBottom = hasFraction ? 10 : 6;

  return (
    <View style={style}>
      {source ? (
        <CachedImage
          uri={source}
          cacheType="thumb"
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0a0a0a" }]} />
      )}
      {hasFraction && <WatchProgressBar fraction={watchedFraction!} />}
      {!!durationLabel && (
        <View style={[badgeStyles.wrap, { bottom: badgeBottom }]}>
          <Text style={badgeStyles.text}>{durationLabel}</Text>
        </View>
      )}
    </View>
  );
}

export function VideoThumbnail(props: Props) {
  return <VideoThumbnailNative {...props} />;
}

export { formatDuration };
