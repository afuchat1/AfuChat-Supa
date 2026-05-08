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
  actor_handle: string | null;
  actor_is_verified: boolean;
  actor_is_org_verified: boolean;
  target_id: string | null;
  body: string | null;
  post_id: string | null;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
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
    return rows.map(rowToNotif);
  } catch {
    return [];
  }
}

export async function getLocalUnreadCount(): Promise<number> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM notifications WHERE is_read = 0",
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
 * Persist notifications permanently using INSERT OR IGNORE then selectively
 * update is_read — already-stored notifications are never re-downloaded.
 * Accepts the raw Supabase notification rows (with nested `profiles` actor).
 */
export async function saveNotifications(items: any[]): Promise<void> {
  if (!items.length) return;
  try {
    const db = await getDB();
    const now = Date.now();
    for (const n of items) {
      const actor = n.actor ?? n.profiles ?? null;
      const isRead = n.is_read === true || n.is_read === 1 ? 1 : 0;
      await db.runAsync(
        `INSERT OR IGNORE INTO notifications
         (id, type, actor_id, actor_name, actor_avatar, actor_handle,
          actor_is_verified, actor_is_org_verified,
          target_id, body, post_id, reference_id, reference_type,
          is_read, read_at, created_at, stored_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          n.id,
          n.type ?? "generic",
          actor?.id ?? n.actor_id ?? null,
          actor?.display_name ?? n.actor_name ?? null,
          actor?.avatar_url ?? n.actor_avatar ?? null,
          actor?.handle ?? n.actor_handle ?? null,
          actor?.is_verified ? 1 : 0,
          actor?.is_organization_verified ? 1 : 0,
          n.target_id ?? null,
          n.body ?? null,
          n.post_id ?? null,
          n.reference_id ?? null,
          n.reference_type ?? null,
          isRead,
          n.read_at ?? null,
          n.created_at,
          now,
        ],
      );
      // Allow is_read to be updated on already-stored rows (marking read later)
      if (isRead) {
        await db.runAsync(
          "UPDATE notifications SET is_read = 1, read_at = COALESCE(read_at, ?) WHERE id = ?",
          [new Date().toISOString(), n.id],
        );
      }
    }
  } catch {}
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      "UPDATE notifications SET is_read = 1, read_at = ? WHERE id = ?",
      [new Date().toISOString(), id],
    );
  } catch {}
}

export async function markAllNotificationsRead(): Promise<void> {
  try {
    const db = await getDB();
    const now = new Date().toISOString();
    await db.runAsync(
      "UPDATE notifications SET is_read = 1, read_at = ? WHERE is_read = 0",
      [now],
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

// ─── Internal ───────────────────────────────────────────────────────────────────

function rowToNotif(r: any): LocalNotification {
  return {
    ...r,
    actor_is_verified: r.actor_is_verified === 1,
    actor_is_org_verified: r.actor_is_org_verified === 1,
    is_read: r.is_read === 1,
  };
}
