// ─── Permanent Notification Store ──────────────────────────────────────────────
// Notifications are stored permanently on device using INSERT OR IGNORE.
// Already-stored notifications are never re-downloaded.
// Delta sync: only notifications newer than the newest stored one are fetched.
// No TTL, no auto-trim — accumulates until user clears storage.

import { getDB } from "./db";

export type LocalNotification = {
  id: string;
  type: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
  target_id: string | null;
  body: string | null;
  read_at: string | null;
  created_at: string;
  stored_at: number;
};

// ─── Reads ──────────────────────────────────────────────────────────────────────

export async function getLocalNotifications(limit = 100): Promise<LocalNotification[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?`,
      [limit],
    );
    return rows;
  } catch {
    return [];
  }
}

export async function getLocalUnreadCount(): Promise<number> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM notifications WHERE read_at IS NULL",
    );
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

export async function hasLocalNotifications(): Promise<boolean> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM notifications",
    );
    return (row?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Returns the created_at of the newest stored notification.
 * Used as delta-sync cursor — only fetch notifications newer than this.
 */
export async function getNewestNotificationDate(): Promise<string | null> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ created_at: string }>(
      "SELECT created_at FROM notifications ORDER BY created_at DESC LIMIT 1",
    );
    return row?.created_at ?? null;
  } catch {
    return null;
  }
}

// ─── Writes ─────────────────────────────────────────────────────────────────────

/**
 * Persist notifications permanently using INSERT OR IGNORE.
 * Already-stored notifications are never overwritten or re-downloaded.
 */
export async function saveNotifications(items: any[]): Promise<void> {
  if (!items.length) return;
  try {
    const db = await getDB();
    const now = Date.now();
    for (const n of items) {
      await db.runAsync(
        `INSERT OR IGNORE INTO notifications
         (id, type, actor_id, actor_name, actor_avatar, target_id, body, read_at, created_at, stored_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          n.id, n.type ?? "generic",
          n.actor_id ?? null, n.actor_name ?? null, n.actor_avatar ?? null,
          n.target_id ?? null, n.body ?? null,
          n.read_at ?? null, n.created_at, now,
        ],
      );
    }
  } catch {}
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      "UPDATE notifications SET read_at = ? WHERE id = ?",
      [new Date().toISOString(), id],
    );
  } catch {}
}

export async function markAllNotificationsRead(): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      "UPDATE notifications SET read_at = ? WHERE read_at IS NULL",
      [new Date().toISOString()],
    );
  } catch {}
}

/** User-initiated only: delete all notifications from device. */
export async function clearAllNotifications(): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM notifications");
  } catch {}
}
