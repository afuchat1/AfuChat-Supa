// Returns on-device storage usage stats for all AfuChat local data layers.
// Used by the storage management settings screen.

import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { getMediaCacheStats } from "@/lib/storage/mediaCache";
import { getOfflineCacheStats } from "@/lib/videoCache";
import { getQueueSize } from "@/lib/storage/syncQueue";

export type StorageStats = {
  sqliteBytes: number;
  videoBytes: number;
  videoCount: number;
  mediaBytes: number;
  mediaCount: number;
  pendingActions: number;
  totalBytes: number;
};

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

export function useStorageStats() {
  const [stats, setStats] = useState<StorageStats>({
    sqliteBytes: 0,
    videoBytes: 0,
    videoCount: 0,
    mediaBytes: 0,
    mediaCount: 0,
    pendingActions: 0,
    totalBytes: 0,
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [sqliteBytes, videoStats, mediaStats, pendingActions] =
        await Promise.all([
          getSQLiteSize(),
          getOfflineCacheStats(),
          getMediaCacheStats(),
          getQueueSize(),
        ]);

      const totalBytes =
        sqliteBytes + videoStats.bytes + mediaStats.bytes;

      setStats({
        sqliteBytes,
        videoBytes: videoStats.bytes,
        videoCount: videoStats.count,
        mediaBytes: mediaStats.bytes,
        mediaCount: mediaStats.count,
        pendingActions,
        totalBytes,
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
