import { useEffect, useState } from "react";
import { Image as NativeImage, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

export type ProfileCoverTone = "light" | "dark";
export type ProfileCoverRegion = "identity" | "status";

const SAMPLE_SIZE = 24;
const STATUS_SAMPLE_HEIGHT = 0.14;
const LIGHT_BACKGROUND_THRESHOLD = 0.179;
const toneCache = new Map<string, ProfileCoverTone>();
const pendingSamples = new Map<string, Promise<ProfileCoverTone>>();

type JpegDecoder = {
  decode: (
    input: Uint8Array,
    options?: { useTArray?: boolean },
  ) => { data: Uint8Array; width: number; height: number };
};

const jpeg = require("jpeg-js") as JpegDecoder;

function linearizeSrgb(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function classifyProfileCoverPixels(rgba: ArrayLike<number>): ProfileCoverTone | null {
  let totalLuminance = 0;
  let totalAlpha = 0;

  for (let index = 0; index + 3 < rgba.length; index += 4) {
    const alpha = rgba[index + 3] / 255;
    if (alpha <= 0) continue;

    // Composite transparent pixels over a light surface, which is the safer
    // assumption for profile-cover images with transparency.
    const red = rgba[index] * alpha + 255 * (1 - alpha);
    const green = rgba[index + 1] * alpha + 255 * (1 - alpha);
    const blue = rgba[index + 2] * alpha + 255 * (1 - alpha);
    totalLuminance +=
      (0.2126 * linearizeSrgb(red) +
        0.7152 * linearizeSrgb(green) +
        0.0722 * linearizeSrgb(blue)) *
      alpha;
    totalAlpha += alpha;
  }

  if (!totalAlpha) return null;
  return totalLuminance / totalAlpha >= LIGHT_BACKGROUND_THRESHOLD ? "light" : "dark";
}

function classifyProfileCoverSample(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  region: ProfileCoverRegion,
): ProfileCoverTone | null {
  if (region === "identity") return classifyProfileCoverPixels(rgba);

  // Status icons are placed at the left and right edges, not over the center
  // of the image where a bright logo can distort the contrast decision.
  const statusPixels: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= width * 0.25 && x < width * 0.68) continue;
      const index = (y * width + x) * 4;
      statusPixels.push(
        rgba[index],
        rgba[index + 1],
        rgba[index + 2],
        rgba[index + 3],
      );
    }
  }
  return classifyProfileCoverPixels(statusPixels);
}

function decodeBase64(base64: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = new Uint8Array(Math.floor((base64.length * 3) / 4));
  let outputIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (const character of base64) {
    if (character === "=") break;
    const value = alphabet.indexOf(character);
    if (value < 0) continue;

    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[outputIndex++] = (buffer >> bits) & 0xff;
      buffer &= (1 << bits) - 1;
    }
  }

  return bytes.subarray(0, outputIndex);
}

function sampleBrowserImage(
  uri: string,
  region: ProfileCoverRegion,
): Promise<ProfileCoverTone | null> {
  const browser = globalThis as any;
  if (!browser.Image || !browser.document?.createElement) return Promise.resolve(null);

  return new Promise((resolve) => {
    const image = new browser.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = browser.document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          resolve(null);
          return;
        }

        // Identity text sits near the cover's lower-right area. Status icons
        // sit over the top strip across the full width of the cover.
        const sourceX = region === "status" ? 0 : image.naturalWidth * 0.28;
        const sourceY = region === "status" ? 0 : image.naturalHeight * 0.52;
        const sourceWidth =
          region === "status"
            ? image.naturalWidth
            : Math.max(1, image.naturalWidth - sourceX);
        const sourceHeight =
          region === "status"
            ? Math.max(1, image.naturalHeight * STATUS_SAMPLE_HEIGHT)
            : Math.max(1, image.naturalHeight - sourceY);
        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          SAMPLE_SIZE,
          SAMPLE_SIZE,
        );
        resolve(
          classifyProfileCoverSample(
            context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data,
            SAMPLE_SIZE,
            SAMPLE_SIZE,
            region,
          ),
        );
      } catch {
        // Cross-origin images without CORS headers cannot be sampled in canvas.
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = uri;
  });
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    NativeImage.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function hashUri(uri: string) {
  let hash = 2166136261;
  for (let index = 0; index < uri.length; index += 1) {
    hash = Math.imul(hash ^ uri.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function sampleNativeImage(
  uri: string,
  region: ProfileCoverRegion,
): Promise<ProfileCoverTone | null> {
  let sourceUri = uri;
  let downloadedUri: string | null = null;
  let sampledUri: string | null = null;

  try {
    if (!uri.startsWith("file://") && !uri.startsWith("content://")) {
      const cacheDirectory = FileSystem.cacheDirectory;
      if (!cacheDirectory) return null;

      const path = uri.split("?")[0].split("#")[0];
      const extension = path.match(/\.(jpe?g|png|webp|heic|heif)$/i)?.[1] ?? "img";
      const destination = `${cacheDirectory}profile-cover-tone-${hashUri(uri)}.${extension}`;
      const existingFile = await FileSystem.getInfoAsync(destination);
      if (existingFile.exists) {
        await FileSystem.deleteAsync(destination, { idempotent: true });
      }
      const download = await FileSystem.downloadAsync(uri, destination);
      sourceUri = download.uri;
      downloadedUri = download.uri;
    }

    let crop: ImageManipulator.ActionCrop["crop"] | null = null;
    try {
      const { width, height } = await getImageSize(sourceUri);
      if (width > 1 && height > 1) {
        const originX = region === "status" ? 0 : Math.floor(width * 0.28);
        const originY =
          region === "status" ? 0 : Math.floor(height * 0.52);
        crop = {
          originX,
          originY,
          width: Math.max(1, width - originX),
          height:
            region === "status"
              ? Math.max(1, Math.floor(height * STATUS_SAMPLE_HEIGHT))
              : Math.max(1, height - originY),
        };
      }
    } catch {
      // A full-image sample is still useful if dimensions are unavailable.
    }

    const actions: ImageManipulator.Action[] = [
      ...(crop ? [{ crop }] : []),
      { resize: { width: SAMPLE_SIZE, height: SAMPLE_SIZE } },
    ];
    const result = await ImageManipulator.manipulateAsync(sourceUri, actions, {
      compress: 0.65,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    sampledUri = result.uri;
    if (!result.base64) return null;

    const decoded = jpeg.decode(decodeBase64(result.base64), { useTArray: true });
    return classifyProfileCoverSample(
      decoded.data,
      decoded.width,
      decoded.height,
      region,
    );
  } catch {
    return null;
  } finally {
    if (sampledUri && sampledUri !== sourceUri) {
      await FileSystem.deleteAsync(sampledUri, { idempotent: true }).catch(() => {});
    }
    if (downloadedUri) {
      await FileSystem.deleteAsync(downloadedUri, { idempotent: true }).catch(() => {});
    }
  }
}

export function getProfileCoverTone(
  uri: string,
  region: ProfileCoverRegion = "identity",
): Promise<ProfileCoverTone> {
  const cacheKey = `${region}:${uri}`;
  const cached = toneCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  const pending = pendingSamples.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const tone =
      Platform.OS === "web"
        ? await sampleBrowserImage(uri, region)
        : await sampleNativeImage(uri, region);
    const resolvedTone = tone ?? "dark";

    if (tone) {
      if (toneCache.size >= 64) {
        const oldestUri = toneCache.keys().next().value;
        if (oldestUri) toneCache.delete(oldestUri);
      }
      toneCache.set(cacheKey, tone);
    }

    return resolvedTone;
  })().finally(() => {
    pendingSamples.delete(cacheKey);
  });

  pendingSamples.set(cacheKey, request);
  return request;
}

export function useProfileCoverTone(
  uri?: string | null,
  region: ProfileCoverRegion = "identity",
): ProfileCoverTone {
  const [result, setResult] = useState<{
    uri: string | null;
    region: ProfileCoverRegion;
    tone: ProfileCoverTone;
  }>({ uri: null, region, tone: "dark" });

  useEffect(() => {
    if (!uri) {
      setResult({ uri: null, region, tone: "dark" });
      return;
    }

    let active = true;
    void getProfileCoverTone(uri, region).then((tone) => {
      if (active) setResult({ uri, region, tone });
    });

    return () => {
      active = false;
    };
  }, [uri, region]);

  return result.uri === (uri ?? null) && result.region === region
    ? result.tone
    : "dark";
}
