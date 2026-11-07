import { getDB } from "./db";

export type StoredDiscoverPerson = Record<string, any>;

const MAX_SAVED_PEOPLE = 120;

export async function getDiscoverPeople(userId: string): Promise<StoredDiscoverPerson[]> {
  if (!userId) return [];
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<{ profile_json: string }>(
      `SELECT profile_json FROM discover_people
       WHERE user_id = ? ORDER BY position ASC`,
      [userId],
    );
    return rows.flatMap((row) => {
      try {
        const person = JSON.parse(row.profile_json);
        return person && typeof person.id === "string" ? [person] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/** Persist the user's latest public Discover people, independent of OS caches. */
export async function saveDiscoverPeople(
  userId: string,
  people: StoredDiscoverPerson[],
): Promise<void> {
  if (!userId) return;
  const db = await getDB();
  await db.execAsync("BEGIN IMMEDIATE");
  try {
    await db.runAsync("DELETE FROM discover_people WHERE user_id = ?", [userId]);
    const savedAt = Date.now();
    for (const [position, person] of people.slice(0, MAX_SAVED_PEOPLE).entries()) {
      if (typeof person?.id !== "string" || !person.id) continue;
      await db.runAsync(
        `INSERT OR REPLACE INTO discover_people
         (user_id, person_id, profile_json, position, stored_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, person.id, JSON.stringify(person), position, savedAt],
      );
    }
    await db.execAsync("COMMIT");
  } catch (error) {
    await db.execAsync("ROLLBACK").catch(() => {});
    throw error;
  }
}

export async function clearAllDiscoverPeople(): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM discover_people");
  } catch {}
}
