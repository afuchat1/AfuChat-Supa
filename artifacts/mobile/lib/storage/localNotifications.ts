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
  cached_at: number;
};

const NOTIF_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_NOTIFS = 200;

// ─── Reads ─────────────────────────────────────────────────────────────────────

export async function getLocalNotifications(limit = 50): Promise<LocalNotification[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<LocalNotification>(
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

// ─── Writes ────────────────────────────────────────────────────────────────────

export async function saveNotifications(items: any[]): Promise<void> {
  if (!items.length) return;
  try {
    const db = await getDB();
    const now = Date.now();
    for (const n of items) {
      await db.runAsync(
        `INSERT OR REPLACE INTO notifications
         (id, type, actor_id, actor_name, actor_avatar, target_id, body, read_at, created_at, cached_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          n.id, n.type ?? "generic",
          n.actor_id ?? null, n.actor_name ?? null, n.actor_avatar ?? null,
          n.target_id ?? null, n.body ?? null,
          n.read_at ?? null, n.created_at, now,
        ],
      );
    }
    // Trim to MAX_NOTIFS
    await db.runAsync(
      `DELETE FROM notifications WHERE id NOT IN (
         SELECT id FROM notifications ORDER BY created_at DESC LIMIT ?
       )`,
      [MAX_NOTIFS],
    );
    // Expire old
    const expiry = Date.now() - NOTIF_TTL_MS;
    await db.runAsync("DELETE FROM notifications WHERE cached_at < ?", [expiry]);
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
