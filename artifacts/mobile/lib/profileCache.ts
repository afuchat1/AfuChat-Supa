/**
 * In-memory profile cache.
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

const _cache = new Map<string, CachedProfile>();

/** Store or update a profile entry. Partial updates are merged. */
export function setProfileCache(id: string, data: Partial<CachedProfile>): void {
  const existing = _cache.get(id) ?? ({ id } as CachedProfile);
  _cache.set(id, { ...existing, ...data, id });
}

/** Retrieve a cached profile by ID, or null if not cached. */
export function getProfileCache(id: string): CachedProfile | null {
  return _cache.get(id) ?? null;
}

/** Clear the entire cache (e.g. on logout). */
export function clearProfileCache(): void {
  _cache.clear();
}
