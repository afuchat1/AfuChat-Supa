// ─── Image Compression ────────────────────────────────────────────────────────
// Compresses images to WebP before upload using expo-image-manipulator.
// Uses adaptive quality based on network type (WiFi → 0.85, cellular → 0.60).
// Compressed output goes to cacheDirectory (temp) — never documentDirectory.
//
// USAGE:
//   const result = await compressImageForUpload(pickerUri);
//   await uploadToStorage("post-images", key, result.uri, "image/webp");
//
// WHY WebP:
//   - 25–35% smaller than JPEG at same perceived quality
//   - Supported by all modern Android (4.0+) and iOS (14+)
//   - Lossless option available for transparency
//   - Retains metadata (EXIF) stripping for privacy

import { Platform } from "react-native";
import { getNetworkType } from "./networkQuality";
import { getTempFilePath } from "./storage/tempCache";
import * as FileSystem from "expo-file-system";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompressionResult = {
  uri: string;       // local file path (in cacheDirectory)
  width: number;
  height: number;
  fileSizeBytes: number;
  mimeType: string;  // always "image/webp"
  originalUri: string;
};

export type CompressionOptions = {
  /** Maximum dimension (width or height). Larger images are scaled down. Default: 1920 */
  maxDimension?: number;
  /** Quality override (0–1). If not set, derived from network type. */
  quality?: number;
  /** Force a specific output format. Default: "webp" */
  format?: "webp" | "jpeg" | "png";
};

// ─── Quality presets ──────────────────────────────────────────────────────────

function getAdaptiveQuality(): number {
  const net = getNetworkType();
  if (net === "wifi") return 0.85;
  if (net === "cellular") return 0.60;
  return 0.75; // unknown
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Compress an image URI to WebP and write it to cacheDirectory.
 * - Scales down if wider/taller than maxDimension
 * - Adaptive quality based on WiFi vs cellular
 * - Idempotent: if the output already exists, returns immediately
 * - Returns null on web or if compression fails (caller should use original)
 */
export async function compressImageForUpload(
  sourceUri: string,
  opts: CompressionOptions = {},
): Promise<CompressionResult | null> {
  if (Platform.OS === "web" || !sourceUri) return null;

  const format = opts.format ?? "webp";
  const quality = opts.quality ?? getAdaptiveQuality();
  const maxDim = opts.maxDimension ?? 1920;
  const mime = format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : "image/webp";

  // Deterministic output path based on source + options
  const key = `${sourceUri}|${format}|${quality}|${maxDim}`;
  const destPath = getTempFilePath(key, format === "jpeg" ? "jpg" : format);

  try {
    // Already compressed — return cached output
    const existing = await FileSystem.getInfoAsync(destPath);
    if (existing.exists && (existing as any).size > 0) {
      return {
        uri: destPath,
        width: 0,
        height: 0,
        fileSizeBytes: (existing as any).size ?? 0,
        mimeType: mime,
        originalUri: sourceUri,
      };
    }

    const ImageManipulator = await import("expo-image-manipulator");

    // Get original dimensions to decide if we need to scale
    const context = ImageManipulator.ImageManipulator.manipulate(sourceUri);

    // Build actions: resize if needed
    const actions: any[] = [];
    // We'll get image info first to compute resize
    // Use a lightweight render to check size
    const infoResult = await context.renderAsync();
    const { width: origW, height: origH } = infoResult;

    if (origW > maxDim || origH > maxDim) {
      if (origW >= origH) {
        actions.push({ resize: { width: maxDim } });
      } else {
        actions.push({ resize: { height: maxDim } });
      }
    }

    // Build final pipeline
    const pipeline = ImageManipulator.ImageManipulator.manipulate(sourceUri);
    for (const action of actions) {
      if (action.resize) pipeline.resize(action.resize);
    }

    const saveFormat =
      format === "jpeg"
        ? ImageManipulator.SaveFormat.JPEG
        : format === "png"
          ? ImageManipulator.SaveFormat.PNG
          : ImageManipulator.SaveFormat.WEBP;

    const rendered = await pipeline.renderAsync();
    const saved = await rendered.saveAsync({
      format: saveFormat,
      compress: quality,
      base64: false,
    });

    // Copy output to our deterministic temp path
    if (saved.uri !== destPath) {
      try {
        await FileSystem.copyAsync({ from: saved.uri, to: destPath });
        // Clean up the manipulator's temp output
        await FileSystem.deleteAsync(saved.uri, { idempotent: true });
      } catch {
        // If copy failed, use the manipulator output path directly
        const check = await FileSystem.getInfoAsync(saved.uri);
        if (check.exists && (check as any).size > 0) {
          return {
            uri: saved.uri,
            width: saved.width ?? origW,
            height: saved.height ?? origH,
            fileSizeBytes: (check as any).size ?? 0,
            mimeType: mime,
            originalUri: sourceUri,
          };
        }
        return null;
      }
    }

    const finalInfo = await FileSystem.getInfoAsync(destPath);
    if (!finalInfo.exists || (finalInfo as any).size === 0) return null;

    return {
      uri: destPath,
      width: saved.width ?? origW,
      height: saved.height ?? origH,
      fileSizeBytes: (finalInfo as any).size ?? 0,
      mimeType: mime,
      originalUri: sourceUri,
    };
  } catch {
    return null;
  }
}

/**
 * Compress an avatar/profile photo.
 * Smaller max dimension (512px) and always WebP.
 */
export async function compressAvatarForUpload(
  sourceUri: string,
): Promise<CompressionResult | null> {
  return compressImageForUpload(sourceUri, {
    maxDimension: 512,
    quality: 0.80,
    format: "webp",
  });
}

/**
 * Compress a chat image before sending.
 * Slightly smaller than post images to reduce data usage in chats.
 */
export async function compressChatImageForUpload(
  sourceUri: string,
): Promise<CompressionResult | null> {
  const net = getNetworkType();
  return compressImageForUpload(sourceUri, {
    maxDimension: net === "cellular" ? 1080 : 1440,
    quality: net === "cellular" ? 0.55 : 0.75,
    format: "webp",
  });
}

/**
 * Compress a post image for feed upload.
 * High quality on WiFi, aggressive on cellular.
 */
export async function compressPostImageForUpload(
  sourceUri: string,
): Promise<CompressionResult | null> {
  const net = getNetworkType();
  return compressImageForUpload(sourceUri, {
    maxDimension: net === "cellular" ? 1280 : 1920,
    quality: net === "cellular" ? 0.60 : 0.85,
    format: "webp",
  });
}

/**
 * Returns approximate compression savings as a percentage string.
 * e.g. "38% smaller"
 */
export async function getCompressionSavings(
  originalUri: string,
  compressedUri: string,
): Promise<string> {
  try {
    const [orig, comp] = await Promise.all([
      FileSystem.getInfoAsync(originalUri),
      FileSystem.getInfoAsync(compressedUri),
    ]);
    const origSize = (orig as any).size ?? 0;
    const compSize = (comp as any).size ?? 0;
    if (origSize === 0 || compSize >= origSize) return "0% smaller";
    const saved = Math.round(((origSize - compSize) / origSize) * 100);
    return `${saved}% smaller`;
  } catch {
    return "";
  }
}
