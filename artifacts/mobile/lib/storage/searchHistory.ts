import { getDB } from "./db";

const MAX_HISTORY = 25;

export async function addSearchHistory(query: string): Promise<void> {
  if (!query.trim()) return;
  try {
    const db = await getDB();
    await db.runAsync(
      "INSERT OR REPLACE INTO search_history (query, used_at) VALUES (?, ?)",
      [query.trim(), Date.now()],
    );
    // Trim to MAX_HISTORY
    await db.runAsync(
      `DELETE FROM search_history WHERE query NOT IN (
         SELECT query FROM search_history ORDER BY used_at DESC LIMIT ?
       )`,
      [MAX_HISTORY],
    );
  } catch {}
}

export async function getSearchHistory(): Promise<string[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<{ query: string }>(
      "SELECT query FROM search_history ORDER BY used_at DESC LIMIT ?",
      [MAX_HISTORY],
    );
    return rows.map((r) => r.query);
  } catch {
    return [];
  }
}

export async function removeSearchHistoryItem(query: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM search_history WHERE query = ?", [query]);
  } catch {}
}

export async function clearSearchHistory(): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM search_history");
  } catch {}
}
