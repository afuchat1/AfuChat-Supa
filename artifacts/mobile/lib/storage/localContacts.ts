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

// ─── Phone-book name overrides ──────────────────────────────────────────────────
// When the current user has someone saved in their phone contacts, we store the
// name they used there (e.g. "Dad", "Dr. Musa") against the app user ID.
// These names override the registered display_name in chats, and appear as a
// "Saved as …" label on profiles and contact rows.

/**
 * Persist (or update) a single phone-book → user-ID mapping.
 */
export async function savePhonebookName(userId: string, name: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO phone_contact_names (user_id, phonebook_name, stored_at) VALUES (?,?,?)`,
      [userId, name, Date.now()],
    );
  } catch {}
}

/**
 * Bulk-save all phone-book name mappings found after a contacts scan.
 * Existing entries for the same user_id are replaced.
 */
export async function saveAllPhonebookNames(
  mappings: Array<{ userId: string; name: string }>,
): Promise<void> {
  try {
    const db = await getDB();
    for (const { userId, name } of mappings) {
      await db.runAsync(
        `INSERT OR REPLACE INTO phone_contact_names (user_id, phonebook_name, stored_at) VALUES (?,?,?)`,
        [userId, name, Date.now()],
      );
    }
  } catch {}
}

/**
 * Get the phone-book name for a single user, or null if not saved.
 */
export async function getPhonebookName(userId: string): Promise<string | null> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ phonebook_name: string }>(
      `SELECT phonebook_name FROM phone_contact_names WHERE user_id = ?`,
      [userId],
    );
    return row?.phonebook_name ?? null;
  } catch {
    return null;
  }
}

/**
 * Load all phone-book name overrides as a Map<userId, phonebookName>.
 * Used for efficient bulk lookups when rendering lists.
 */
export async function getAllPhonebookNames(): Promise<Map<string, string>> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<{ user_id: string; phonebook_name: string }>(
      `SELECT user_id, phonebook_name FROM phone_contact_names`,
    );
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.user_id, r.phonebook_name);
    return map;
  } catch {
    return new Map();
  }
}

// ─── Internal ───────────────────────────────────────────────────────────────────

function rowToContact(r: any): LocalContact {
  return {
    ...r,
    is_verified: r.is_verified === 1,
    is_organization_verified: r.is_organization_verified === 1,
  };
}
