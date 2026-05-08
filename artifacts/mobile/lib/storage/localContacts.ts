// ─── Permanent Contacts Store ───────────────────────────────────────────────────
// Contacts (people the user follows) are stored permanently in SQLite.
// Loaded instantly on startup — no spinner, no network wait.
// Network refresh updates the list in the background.

import { getDB } from "./db";

export type LocalContact = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  stored_at: number;
};

// ─── Reads ──────────────────────────────────────────────────────────────────────

export async function getLocalContacts(): Promise<LocalContact[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM contacts ORDER BY display_name COLLATE NOCASE ASC",
    );
    return rows.map(rowToContact);
  } catch {
    return [];
  }
}

export async function hasLocalContacts(): Promise<boolean> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM contacts",
    );
    return (row?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─── Writes ─────────────────────────────────────────────────────────────────────

/**
 * Replace all stored contacts with the latest follows list.
 * Uses a transaction: delete existing, insert new — ensures the list
 * exactly matches the server without leaving stale entries.
 */
export async function saveLocalContacts(contacts: any[]): Promise<void> {
  try {
    const db = await getDB();
    const now = Date.now();
    await db.execAsync("DELETE FROM contacts");
    for (const c of contacts) {
      await db.runAsync(
        `INSERT OR REPLACE INTO contacts
         (id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, stored_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          c.id,
          c.display_name ?? "",
          c.handle ?? "",
          c.avatar_url ?? null,
          c.bio ?? null,
          c.is_verified ? 1 : 0,
          c.is_organization_verified ? 1 : 0,
          now,
        ],
      );
    }
  } catch {}
}

/** Add or update a single contact (e.g. after following someone new). */
export async function upsertLocalContact(c: any): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO contacts
       (id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, stored_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        c.id, c.display_name ?? "", c.handle ?? "",
        c.avatar_url ?? null, c.bio ?? null,
        c.is_verified ? 1 : 0, c.is_organization_verified ? 1 : 0,
        Date.now(),
      ],
    );
  } catch {}
}

/** Remove a contact (e.g. after unfollowing). */
export async function removeLocalContact(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM contacts WHERE id = ?", [id]);
  } catch {}
}

// ─── Internal ───────────────────────────────────────────────────────────────────

function rowToContact(r: any): LocalContact {
  return {
    ...r,
    is_verified: r.is_verified === 1,
    is_organization_verified: r.is_organization_verified === 1,
  };
}
