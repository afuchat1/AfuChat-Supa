// Returns on-device storage usage stats for all AfuChat local data layers.
// Used by the storage management settings screen.
//
// TWO-BUCKET MODEL (matches what Android Settings shows):
//   "User data"  → documentDirectory  (permanent, never OS-cleared)
//   "Cache"      → cacheDirectory     (temp, OS can clear under pressure)

import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { getMediaCacheStats } from "@/lib/storage/mediaCache";
import { getOfflineCacheStats } from "@/lib/videoCache";
import { getQueueSize } from "@/lib/storage/syncQueue";
import { getTempCacheStats } from "@/lib/storage/tempCache";
import { getDB } from "@/lib/storage/db";

// ─── Per-type chat attachment breakdown ───────────────────────────────────────

export type ChatAttachmentStats = {
  imagesBytes: number;
  imagesCount: number;
  audioBytes: number;
  audioCount: number;
  filesBytes: number;
  filesCount: number;
  gifsBytes: number;
  gifsCount: number;
  totalBytes: number;
  totalCount: number;
};

async function getChatAttachmentStats(): Promise<ChatAttachmentStats> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<{ media_type: string; bytes: number; count: number }>(`
      SELECT media_type,
             COALESCE(SUM(file_size), 0) AS bytes,
             COUNT(*) AS count
      FROM media_cache
      WHERE media_type LIKE 'chat_%'
      GROUP BY media_type
    `);

    let imagesBytes = 0, imagesCount = 0;
    let audioBytes = 0, audioCount = 0;
    let filesBytes = 0, filesCount = 0;
    let gifsBytes = 0, gifsCount = 0;

    for (const row of rows) {
      switch (row.media_type) {
        case "chat_image":
        case "chat_story_reply":
          imagesBytes += row.bytes; imagesCount += row.count; break;
        case "chat_audio":
          audioBytes += row.bytes; audioCount += row.count; break;
        case "chat_gif":
          gifsBytes += row.bytes; gifsCount += row.count; break;
        default:
          filesBytes += row.bytes; filesCount += row.count;
      }
    }

    return {
      imagesBytes, imagesCount, audioBytes, audioCount,
      filesBytes, filesCount, gifsBytes, gifsCount,
      totalBytes: imagesBytes + audioBytes + filesBytes + gifsBytes,
      totalCount: imagesCount + audioCount + filesCount + gifsCount,
    };
  } catch {
    return {
      imagesBytes: 0, imagesCount: 0, audioBytes: 0, audioCount: 0,
      filesBytes: 0, filesCount: 0, gifsBytes: 0, gifsCount: 0,
      totalBytes: 0, totalCount: 0,
    };
  }
}

async function getProfileCacheStats(): Promise<{ bytes: number; count: number }> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ bytes: number; count: number }>(`
      SELECT COALESCE(SUM(file_size), 0) AS bytes, COUNT(*) AS count
      FROM media_cache
      WHERE media_type IN ('avatar', 'thumb')
    `);
    return { bytes: row?.bytes ?? 0, count: row?.count ?? 0 };
  } catch {
    return { bytes: 0, count: 0 };
  }
}

async function getSQLiteSize(): Promise<number> {
  if (Platform.OS === "web") return 0;
  try {
    const dbPath = ((FileSystem as any).documentDirectory ?? "") + "SQLite/afuchat_local.db";
    const info = await FileSystem.getInfoAsync(dbPath);
    return (info as any).size ?? 0;
  } catch {
    return 0;
  }
}

// ─── Exported types ────────────────────────────────────────────────────────────

export type StorageStats = {
  // Permanent user data (documentDirectory — Android "User data")
  sqliteBytes: number;
  videoBytes: number;
  videoCount: number;
  chatAttachments: ChatAttachmentStats;
  profileCacheBytes: number;
  profileCacheCount: number;

  // App cache (cacheDirectory — Android "Cache")
  tempCacheBytes: number;
  tempCacheCount: number;
  tempCacheOldFiles: number;

  // Legacy fields kept for backward compat with existing screen
  mediaBytes: number;
  mediaCount: number;

  // Sync queue
  pendingActions: number;

  // Totals
  totalUserDataBytes: number;
  totalCacheBytes: number;
  totalBytes: number;
};

const EMPTY_CHAT: ChatAttachmentStats = {
  imagesBytes: 0, imagesCount: 0, audioBytes: 0, audioCount: 0,
  filesBytes: 0, filesCount: 0, gifsBytes: 0, gifsCount: 0,
  totalBytes: 0, totalCount: 0,
};

export function useStorageStats() {
  const [stats, setStats] = useState<StorageStats>({
    sqliteBytes: 0,
    videoBytes: 0,
    videoCount: 0,
    chatAttachments: EMPTY_CHAT,
    profileCacheBytes: 0,
    profileCacheCount: 0,
    tempCacheBytes: 0,
    tempCacheCount: 0,
    tempCacheOldFiles: 0,
    mediaBytes: 0,
    mediaCount: 0,
    pendingActions: 0,
    totalUserDataBytes: 0,
    totalCacheBytes: 0,
    totalBytes: 0,
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [
        sqliteBytes,
        videoStats,
        mediaStats,
        chatStats,
        profileStats,
        tempStats,
        pendingActions,
      ] = await Promise.all([
        getSQLiteSize(),
        getOfflineCacheStats(),
        getMediaCacheStats(),
        getChatAttachmentStats(),
        getProfileCacheStats(),
        getTempCacheStats(),
        getQueueSize(),
      ]);

      const totalUserDataBytes =
        sqliteBytes + videoStats.bytes + chatStats.totalBytes + profileStats.bytes;
      const totalCacheBytes = tempStats.bytes;

      setStats({
        sqliteBytes,
        videoBytes: videoStats.bytes,
        videoCount: videoStats.count,
        chatAttachments: chatStats,
        profileCacheBytes: profileStats.bytes,
        profileCacheCount: profileStats.count,
        tempCacheBytes: tempStats.bytes,
        tempCacheCount: tempStats.count,
        tempCacheOldFiles: tempStats.oldFileCount,
        // legacy compat
        mediaBytes: mediaStats.bytes,
        mediaCount: mediaStats.count,
        pendingActions,
        totalUserDataBytes,
        totalCacheBytes,
        totalBytes: totalUserDataBytes + totalCacheBytes,
      });
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, []);

  return { stats, loading, refresh };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatCount(n: number, singular: string, plural?: string): string {
  if (n === 0) return `No ${plural ?? singular + "s"}`;
  if (n === 1) return `1 ${singular}`;
  return `${n.toLocaleString()} ${plural ?? singular + "s"}`;
}
