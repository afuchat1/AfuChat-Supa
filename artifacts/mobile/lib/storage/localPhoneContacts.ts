import { getDB } from "./db";

export type LocalPhoneContact = {
  key: string;
  name: string;
  phone: string;
  normalized_phone: string;
  position: number;
  phone_index: number;
  matched_user_id: string | null;
  matched_display_name: string | null;
  matched_handle: string | null;
  matched_avatar_url: string | null;
  matched_bio: string | null;
  matched_acoin: number;
  matched_is_verified: boolean;
  matched_is_organization_verified: boolean;
  stored_at: number;
};

export type DevicePhoneContact = Pick<
  LocalPhoneContact,
  "key" | "name" | "phone" | "normalized_phone" | "position" | "phone_index"
>;

export type PhoneContactMatch = {
  normalized_phone: string;
  user_id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  acoin: number;
  is_verified: boolean;
  is_organization_verified: boolean;
};

export async function getLocalPhoneContacts(): Promise<LocalPhoneContact[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM phonebook_contacts ORDER BY position ASC, phone_index ASC",
    );
    return rows.map(rowToLocalPhoneContact);
  } catch {
    return [];
  }
}

/**
 * Save the exact device order. Existing account matches are preserved until a
 * successful online matching pass replaces them.
 */
export async function saveDevicePhoneContacts(
  contacts: DevicePhoneContact[],
): Promise<void> {
  try {
    const db = await getDB();
    const previous = await getLocalPhoneContacts();
    const previousMatches = new Map(
      previous
        .filter((contact) => contact.matched_user_id)
        .map((contact) => [contact.normalized_phone, contact]),
    );

    await db.runAsync("DELETE FROM phonebook_contacts");
    for (const contact of contacts) {
      const old = previousMatches.get(contact.normalized_phone);
      await db.runAsync(
        `INSERT OR REPLACE INTO phonebook_contacts
         (contact_key, name, phone, normalized_phone, position, phone_index,
          matched_user_id, matched_display_name, matched_handle, matched_avatar_url,
          matched_bio, matched_acoin, matched_is_verified,
          matched_is_organization_verified, stored_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          contact.key,
          contact.name,
          contact.phone,
          contact.normalized_phone,
          contact.position,
          contact.phone_index,
          old?.matched_user_id ?? null,
          old?.matched_display_name ?? null,
          old?.matched_handle ?? null,
          old?.matched_avatar_url ?? null,
          old?.matched_bio ?? null,
          old?.matched_acoin ?? 0,
          old?.matched_is_verified ? 1 : 0,
          old?.matched_is_organization_verified ? 1 : 0,
          Date.now(),
        ],
      );
    }
  } catch {}
}

export async function replacePhoneContactMatches(
  matches: PhoneContactMatch[],
): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `UPDATE phonebook_contacts SET
        matched_user_id = NULL,
        matched_display_name = NULL,
        matched_handle = NULL,
        matched_avatar_url = NULL,
        matched_bio = NULL,
        matched_acoin = 0,
        matched_is_verified = 0,
        matched_is_organization_verified = 0`,
    );

    for (const match of matches) {
      await db.runAsync(
        `UPDATE phonebook_contacts SET
          matched_user_id = ?, matched_display_name = ?, matched_handle = ?,
          matched_avatar_url = ?, matched_bio = ?, matched_acoin = ?,
          matched_is_verified = ?, matched_is_organization_verified = ?
         WHERE normalized_phone = ?`,
        [
          match.user_id,
          match.display_name,
          match.handle,
          match.avatar_url,
          match.bio,
          match.acoin,
          match.is_verified ? 1 : 0,
          match.is_organization_verified ? 1 : 0,
          match.normalized_phone,
        ],
      );
    }
  } catch {}
}

function rowToLocalPhoneContact(row: any): LocalPhoneContact {
  return {
    key: row.contact_key,
    name: row.name ?? "Unknown",
    phone: row.phone ?? "",
    normalized_phone: row.normalized_phone ?? row.phone ?? "",
    position: Number(row.position ?? 0),
    phone_index: Number(row.phone_index ?? 0),
    matched_user_id: row.matched_user_id ?? null,
    matched_display_name: row.matched_display_name ?? null,
    matched_handle: row.matched_handle ?? null,
    matched_avatar_url: row.matched_avatar_url ?? null,
    matched_bio: row.matched_bio ?? null,
    matched_acoin: Number(row.matched_acoin ?? 0),
    matched_is_verified: row.matched_is_verified === 1,
    matched_is_organization_verified: row.matched_is_organization_verified === 1,
    stored_at: Number(row.stored_at ?? 0),
  };
}