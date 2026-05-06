import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./constants";
import { logger } from "./logger";

const supabaseUrl = SUPABASE_URL;
const serviceRoleKey = SUPABASE_SERVICE_ROLE_KEY;

let cached: SupabaseClient | null = null;
let warnedMissing = false;

/**
 * Returns a singleton Supabase client authenticated with the service-role key.
 * Returns `null` (and logs once) if the key is missing — callers must handle
 * this gracefully so the server still boots in environments without the key
 * (e.g. local dev without secrets).
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseUrl || !serviceRoleKey) {
    if (!warnedMissing) {
      warnedMissing = true;
      logger.warn(
        { hasUrl: !!supabaseUrl, hasKey: !!serviceRoleKey },
        "supabaseAdmin: SUPABASE_SERVICE_ROLE_KEY is not configured. " +
          "Server-side video pipeline and admin features will be unavailable.",
      );
    }
    return null;
  }
  if (cached) return cached;
  cached = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(supabaseUrl && serviceRoleKey);
}

export const VIDEO_BUCKET = "videos" as const;
export const SUPABASE_URL_PUBLIC = supabaseUrl;
