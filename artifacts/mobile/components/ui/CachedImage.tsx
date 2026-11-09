import React from "react";
import { Image as ExpoImage, type ImageProps } from "expo-image";

type Props = Omit<ImageProps, "source"> & {
  uri: string | null | undefined;
  cacheType?: "avatar" | "thumb";
};

/**
 * Persistent remote image — instant, offline-first.
 *
 * expo-image owns the complete loading pipeline: native memory/disk caching,
 * bitmap downsampling, and recycled-cell cleanup. Keeping one cache owner
 * avoids a second FileSystem/SQLite download path and duplicate bitmaps.
 */
export function CachedImage({ uri, cacheType = "thumb", ...props }: Props) {
  // cacheType remains part of the public API for existing callers. Native
  // caching is now owned entirely by expo-image rather than a second
  // FileSystem/SQLite downloader, which avoids duplicate downloads and
  // full-size bitmap allocations.
  void cacheType;
  if (!uri) return null;

  return (
    <ExpoImage
      {...props}
      source={{ uri }}
      cachePolicy="memory-disk"
      transition={0}
      allowDownscaling
      recyclingKey={uri}
    />
  );
}

export default CachedImage;
