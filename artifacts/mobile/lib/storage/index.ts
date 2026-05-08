// ─── Device Storage — permanent on-device store ────────────────────────────────
// Data is stored once, lives forever, never auto-expired.
// Only removed when the user explicitly clears it via Settings → Storage,
// or when the app is uninstalled.

export { storage, KEYS } from "./mmkv";
export { getDB } from "./db";
export * from "./localMessages";
export * from "./localConversations";
export * from "./localFeed";
export * from "./localNotifications";
export * from "./localContacts";
export * from "./syncQueue";
export * from "./mediaCache";
export * from "./chatAttachmentCache";
export * from "./searchHistory";

import { getDB } from "./db";
import { startSyncQueue } from "./syncQueue";
import { migrateOfflineCacheV2toV3 } from "../videoCache";

let _initialized = false;

/**
 * Call once from the root _layout.tsx on app start.
 * - Runs SQLite schema migrations
 * - Migrates any legacy AsyncStorage video registry into SQLite
 * - Starts the offline action queue listener
 * No data is purged — everything on device is kept.
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
  } catch {}
}
