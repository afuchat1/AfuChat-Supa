/**
 * Static constants shared across the API server.
 *
 * The Supabase URL is a public, project-specific constant (not a secret).
 * The service-role key MUST be supplied via the SUPABASE_SERVICE_ROLE_KEY
 * environment variable (stored as a Replit secret). It is never hardcoded.
 */
export const SUPABASE_URL = "https://rhnsjqqtdzlkvqazfcbg.supabase.co";

export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";
