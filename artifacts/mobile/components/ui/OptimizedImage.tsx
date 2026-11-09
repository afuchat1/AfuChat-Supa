import React from "react";
import { Image as ExpoImage, type ImageProps } from "expo-image";

type ResizeMode = "cover" | "contain" | "stretch" | "center";

export type OptimizedImageProps = Omit<
  ImageProps,
  "source" | "contentFit" | "cachePolicy"
> & {
  source: ImageProps["source"];
  /**
   * Kept compatible with React Native's Image API so callers can migrate
   * without changing layout code.
   */
  resizeMode?: ResizeMode;
  contentFit?: ImageProps["contentFit"];
  cachePolicy?: ImageProps["cachePolicy"];
};

const CONTENT_FIT: Record<ResizeMode, NonNullable<ImageProps["contentFit"]>> = {
  cover: "cover",
  contain: "contain",
  stretch: "fill",
  center: "none",
};

function getRecyclingKey(source: ImageProps["source"]): string | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return undefined;
  }
  const uri = (source as { uri?: unknown }).uri;
  return typeof uri === "string" && uri.length > 0 ? uri : undefined;
}

/**
 * Memory-safe image primitive for all remote and local media previews.
 *
 * expo-image uses native image pipelines with memory/disk caching and
 * downsampling. `recyclingKey` also prevents a recycled list cell from
 * briefly showing the previous image while a new URI is loading.
 */
export function OptimizedImage({
  source,
  resizeMode = "cover",
  contentFit,
  cachePolicy = "memory-disk",
  transition = 0,
  allowDownscaling = true,
  recyclingKey,
  ...props
}: OptimizedImageProps) {
  return (
    <ExpoImage
      {...props}
      source={source}
      contentFit={contentFit ?? CONTENT_FIT[resizeMode]}
      cachePolicy={cachePolicy}
      transition={transition}
      allowDownscaling={allowDownscaling}
      recyclingKey={recyclingKey ?? getRecyclingKey(source)}
    />
  );
}

export default OptimizedImage;