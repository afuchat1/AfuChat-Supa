// ─── Permanent Profile Store ────────────────────────────────────────────────────
// The logged-in user's own profile is stored once in SQLite and updated in-place.
// On next app launch, the profile is available instantly (no network round-trip).
// Delta: refreshed from server whenever AuthContext.fetchProfile() resolves,
// then written back here — same single-row upsert pattern.

import { getDB } from "./db";

export type LocalProfile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  phone_number: string | null;
  xp: number;
  acoin: number;
  current_grade: string;
  is_verified: boolean;
  is_private: boolean;
  show_online_status: boolean;
  country: string | null;
  website_url: string | null;
  language: string;
  tipping_enabled: boolean;
  is_admin: boolean;
  is_support_staff: boolean;
  is_organization_verified: boolean;
  is_business_mode: boolean;
  gender: string | null;
  date_of_birth: string | null;
  region: string | null;
  interests: string[] | null;
  onboarding_completed: boolean;
  scheduled_deletion_at: string | null;
  created_at: string | null;
  stored_at: number;
};

// ─── Read ───────────────────────────────────────────────────────────────────────

/** Load the stored profile for a given user ID. Returns null if not yet stored. */
export async function getLocalProfile(userId: string): Promise<LocalProfile | null> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<any>(
      "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
      [userId],
    );
    if (!row) return null;
    return rowToProfile(row);
  } catch {
    return null;
  }
}

/** Load the most recently stored profile (used on cold start before auth resolves). */
export async function getAnyLocalProfile(): Promise<LocalProfile | null> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<any>(
      "SELECT * FROM user_profiles ORDER BY stored_at DESC LIMIT 1",
    );
    if (!row) return null;
    return rowToProfile(row);
  } catch {
    return null;
  }
}

// ─── Write ──────────────────────────────────────────────────────────────────────

/** Upsert the user's own profile. Called every time fetchProfile() gets fresh data. */
export async function saveLocalProfile(profile: Omit<LocalProfile, "stored_at">): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO user_profiles (
        id, handle, display_name, avatar_url, banner_url, bio, phone_number,
        xp, acoin, current_grade,
        is_verified, is_private, show_online_status,
        country, website_url, language, tipping_enabled,
        is_admin, is_support_staff, is_organization_verified, is_business_mode,
        gender, date_of_birth, region, interests,
        onboarding_completed, scheduled_deletion_at, created_at, stored_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )`,
      [
        profile.id,
        profile.handle,
        profile.display_name,
        profile.avatar_url ?? null,
        profile.banner_url ?? null,
        profile.bio ?? null,
        profile.phone_number ?? null,
        profile.xp ?? 0,
        profile.acoin ?? 0,
        profile.current_grade ?? "",
        profile.is_verified ? 1 : 0,
        profile.is_private ? 1 : 0,
        profile.show_online_status ? 1 : 0,
        profile.country ?? null,
        profile.website_url ?? null,
        profile.language ?? "en",
        profile.tipping_enabled ? 1 : 0,
        profile.is_admin ? 1 : 0,
        profile.is_support_staff ? 1 : 0,
        profile.is_organization_verified ? 1 : 0,
        profile.is_business_mode ? 1 : 0,
        profile.gender ?? null,
        profile.date_of_birth ?? null,
        profile.region ?? null,
        profile.interests ? JSON.stringify(profile.interests) : null,
        profile.onboarding_completed ? 1 : 0,
        profile.scheduled_deletion_at ?? null,
        profile.created_at ?? null,
        Date.now(),
      ],
    );
  } catch {}
}

/** Patch specific fields without a full re-fetch (e.g. after inline edit). */
export async function patchLocalProfile(userId: string, patch: Partial<LocalProfile>): Promise<void> {
  try {
    const db = await getDB();
    const fields: string[] = [];
    const values: any[] = [];

    const allowed: (keyof LocalProfile)[] = [
      "handle", "display_name", "avatar_url", "banner_url", "bio", "phone_number",
      "xp", "acoin", "current_grade", "is_verified", "is_private", "show_online_status",
      "country", "website_url", "language", "tipping_enabled",
      "is_admin", "is_support_staff", "is_organization_verified", "is_business_mode",
      "gender", "date_of_birth", "region", "interests",
      "onboarding_completed", "scheduled_deletion_at",
    ];

    for (const key of allowed) {
      if (key in patch) {
        fields.push(`${key} = ?`);
        const v = (patch as any)[key];
        if (key === "interests") {
          values.push(Array.isArray(v) ? JSON.stringify(v) : null);
        } else if (typeof v === "boolean") {
          values.push(v ? 1 : 0);
        } else {
          values.push(v ?? null);
        }
      }
    }

    if (!fields.length) return;
    fields.push("stored_at = ?");
    values.push(Date.now(), userId);

    await db.runAsync(
      `UPDATE user_profiles SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
  } catch {}
}

/** Remove a user's profile from device (called on sign-out/account-switch). */
export async function deleteLocalProfile(userId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM user_profiles WHERE id = ?", [userId]);
  } catch {}
}

// ─── Internal ───────────────────────────────────────────────────────────────────

function rowToProfile(r: any): LocalProfile {
  return {
    id: r.id,
    handle: r.handle,
    display_name: r.display_name,
    avatar_url: r.avatar_url ?? null,
    banner_url: r.banner_url ?? null,
    bio: r.bio ?? null,
    phone_number: r.phone_number ?? null,
    xp: r.xp ?? 0,
    acoin: r.acoin ?? 0,
    current_grade: r.current_grade ?? "",
    is_verified: r.is_verified === 1,
    is_private: r.is_private === 1,
    show_online_status: r.show_online_status === 1,
    country: r.country ?? null,
    website_url: r.website_url ?? null,
    language: r.language ?? "en",
    tipping_enabled: r.tipping_enabled === 1,
    is_admin: r.is_admin === 1,
    is_support_staff: r.is_support_staff === 1,
    is_organization_verified: r.is_organization_verified === 1,
    is_business_mode: r.is_business_mode === 1,
    gender: r.gender ?? null,
    date_of_birth: r.date_of_birth ?? null,
    region: r.region ?? null,
    interests: r.interests ? (() => { try { return JSON.parse(r.interests); } catch { return null; } })() : null,
    onboarding_completed: r.onboarding_completed === 1,
    scheduled_deletion_at: r.scheduled_deletion_at ?? null,
    created_at: r.created_at ?? null,
    stored_at: r.stored_at ?? 0,
  };
}
