/**
 * In-memory profile cache with 5-minute TTL.
 *
 * Stores lightweight profile snapshots keyed by user ID so that the
 * contact/[id] screen can render immediately on first open (from params)
 * and instantly on repeat visits (from cache), with no waiting for a
 * Supabase round-trip before showing content.
 *
 * Cache entries are intentionally kept small — only the fields needed
 * to render the profile header. Full data (bio, posts, counts) is still
 * fetched from the network and updates the cache entry when it arrives.
 */

const TTL_MS = 5 * 60 * 1000;

export type CachedProfile = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified?: boolean;
  is_organization_verified?: boolean;
  is_business_mode?: boolean;
  bio?: string | null;
  country?: string | null;
  website_url?: string | null;
  xp?: number;
  current_grade?: string;
  acoin?: number;
  show_online_status?: boolean;
  last_seen?: string | null;
  created_at?: string | null;
};

type Entry = { data: CachedProfile; fetchedAt: number };

const _cache = new Map<string, Entry>();

/**
 * handle → profile-id map. Never expires — a handle's owner UUID never changes.
 * Populated whenever a profile is stored via setProfileCache or
 * setHandleId; available to profile-aware consumers that need a fast local hint.
 */
const _handleToId = new Map<string, string>();

/** Store or update a profile entry. Partial updates are merged.
 *  Also keeps the handle→id index in sync. */
export function setProfileCache(id: string, data: Partial<CachedProfile>): void {
  const existing = _cache.get(id)?.data ?? ({ id } as CachedProfile);
  const merged = { ...existing, ...data, id };
  _cache.set(id, { data: merged, fetchedAt: Date.now() });
  if (merged.handle) {
    _handleToId.set(merged.handle.toLowerCase(), id);
  }
}

/** Retrieve a cached profile by ID, or null if not cached / expired. */
export function getProfileCache(id: string): CachedProfile | null {
  const entry = _cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL_MS) {
    _cache.delete(id);
    return null;
  }
  return entry.data;
}

/**
 * Look up a profile ID by handle from the local index.
 * Returns null if we've never seen this handle before.
 * The handle→id mapping never expires (UUIDs are permanent).
 */
export function getProfileIdByHandle(handle: string): string | null {
  return _handleToId.get(handle.toLowerCase()) ?? null;
}

/**
 * Explicitly seed the handle→id index (e.g. from post author data
 * that already contains both handle and id, without a full profile fetch).
 */
export function setHandleId(handle: string, id: string): void {
  _handleToId.set(handle.toLowerCase(), id);
}

/** Clear the entire cache (e.g. on logout). */
export function clearProfileCache(): void {
  _cache.clear();
  _handleToId.clear();
}
