// Device storage barrel. Keep this entry point in sync with the storage
// modules because some startup code imports the directory path directly.
export { storage, KEYS } from "./mmkv";
export { getDB } from "./db";
export * from "./localMessages";
export * from "./localConversations";
export * from "./localFeed";
export * from "./localContacts";
export * from "./localProfile";
export * from "./localSettings";
export * from "./syncQueue";
export * from "./mediaCache";
export * from "./chatAttachmentCache";
export * from "./tempCache";
export * from "./chatFolders";

import { getDB } from "./db";
import { startSyncQueue } from "./syncQueue";
import { migrateOfflineCacheV2toV3 } from "../videoCache";
import { cleanupTempCache, _sweepOrphanedRecordings } from "./tempCache";

let _initialized = false;
let _initializationPromise: Promise<void> | null = null;

/**
 * Call once from the root layout on app start.
 * Database initialization is kept behind this function so SQLite is never
 * touched during module evaluation.
 */
export async function initDeviceStorage(): Promise<void> {
  if (_initialized) return;
  if (_initializationPromise) return _initializationPromise;

  _initializationPromise = (async () => {
    await getDB();
    _initialized = true;
    migrateOfflineCacheV2toV3().catch(() => {});
    startSyncQueue();
    cleanupTempCache().catch(() => {});
    _sweepOrphanedRecordings().catch(() => {});
  })().finally(() => {
    _initializationPromise = null;
  });

  return _initializationPromise;
}