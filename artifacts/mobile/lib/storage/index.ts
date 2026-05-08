// ─── Device Storage — barrel export ───────────────────────────────────────────
// Import from this file to access all local storage primitives.

export { storage, KEYS } from "./mmkv";
export { getDB } from "./db";
export * from "./localMessages";
export * from "./localConversations";
export * from "./localFeed";
export * from "./localNotifications";
export * from "./syncQueue";
export * from "./mediaCache";
export * from "./searchHistory";

// ─── Startup initialiser ───────────────────────────────────────────────────────
// Call once from the root _layout.tsx. Runs DB migrations, starts the sync
// queue, and prunes expired data in the background.

import { getDB } from "./db";
import { startSyncQueue } from "./syncQueue";

let _initialized = false;

export async function initDeviceStorage(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  try {
    // Opens and migrates the SQLite DB
    await getDB();
    // Start listening for network changes to drain the offline action queue
    startSyncQueue();
  } catch {}
}
