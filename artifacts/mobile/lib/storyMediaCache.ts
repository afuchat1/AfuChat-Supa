import * as FileSystem from "expo-file-system/legacy";
import { toAfuCloudMediaUrl } from "./afuCloudMedia";

const STORY_CACHE_DIR = `${FileSystem.documentDirectory ?? ""}afuchat_stories/`;

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function extension(url: string, mediaType: string): string {
  const clean = url.split("?")[0].toLowerCase();
  const match = clean.match(/\.(jpg|jpeg|png|webp|gif|mp4|mov|m4v|webm)$/);
  if (match) return match[1] === "jpeg" ? "jpg" : match[1];
  return mediaType === "video" ? "mp4" : "jpg";
}

async function ensureDirectory() {
  if (!FileSystem.documentDirectory) throw new Error("Persistent file storage unavailable");
  const info = await FileSystem.getInfoAsync(STORY_CACHE_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(STORY_CACHE_DIR, { intermediates: true });
}

export async function getCachedStoryMedia(
  storyId: string,
  remoteUrl: string,
  mediaType: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  await ensureDirectory();
  const resolvedUrl = toAfuCloudMediaUrl(remoteUrl) || remoteUrl;
  const localUri = `${STORY_CACHE_DIR}${stableHash(storyId)}.${extension(resolvedUrl, mediaType)}`;
  const existing = await FileSystem.getInfoAsync(localUri);
  if (existing.exists && (existing as any).size !== 0) {
    onProgress?.(1);
    return localUri;
  }

  const download = FileSystem.createDownloadResumable(
    resolvedUrl,
    localUri,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (totalBytesExpectedToWrite > 0) {
        onProgress?.(totalBytesWritten / totalBytesExpectedToWrite);
      }
    },
  );
  const result = await download.downloadAsync();
  if (!result?.uri) throw new Error("Story media download failed");
  onProgress?.(1);
  return result.uri;
}