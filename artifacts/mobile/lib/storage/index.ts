// ─── Device Storage — permanent on-device store ────────────────────────────────
// Data is stored once, lives forever, never auto-expired.
// Only removed when the user explicitly clears it via Settings → Storage,
// or when the app is uninstalled.
//
// See also: lib/storage/tempCache.ts — cacheDirectory manager (OS-clearable temp files)

export { storage, KEYS } from "./mmkv";
export { getDB } from "./db";
export * from "./localMessages";
export * from "./localConversations";
export * from "./localFeed";
export * from "./localNotifications";
export * from "./localContacts";
export * from "./localProfile";
export * from "./localSettings";
export * from "./mediaDownloader";
export * from "./syncQueue";
export * from "./mediaCache";
export * from "./chatAttachmentCache";
export * from "./searchHistory";
export * from "./tempCache";

import { getDB } from "./db";
import { startSyncQueue } from "./syncQueue";
import { migrateOfflineCacheV2toV3 } from "../videoCache";
import { cleanupTempCache } from "./tempCache";

let _initialized = false;

/**
 * Call once from the root _layout.tsx on app start.
 * - Runs SQLite schema migrations
 * - Migrates any legacy AsyncStorage video registry into SQLite
 * - Starts the offline action queue listener
 * - Cleans up temp cache files older than 7 days (cacheDirectory)
 * No permanent data is purged — only expired temp files are removed.
 */
export async function initDeviceStorage(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  try {
    // Open DB and run migrations (creates all tables if first launch)
    await getDB();
    // Migrate old AsyncStorage video registry into SQLite
    migrateOfflineCacheV2toV3().catch(() => {});
    // Start listening for network changes to drain the offline action queue
    startSyncQueue();
    // Clean up temp cache files older than 7 days (runs in background)
    cleanupTempCache().catch(() => {});
  } catch {}
}
