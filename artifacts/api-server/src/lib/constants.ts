/**
 * Static constants shared across the API server.
 *
 * SUPABASE_URL is hard-coded here because it's the project's permanent
 * public URL — not a secret. Hard-coding it lets us remove SUPABASE_URL
 * from environment variables and keep the bootstrap surface as small as
 * possible (only SUPABASE_SERVICE_ROLE_KEY needs to live in the deploy
 * environment).
 */
export const SUPABASE_URL = "https://rhnsjqqtdzlkvqazfcbg.supabase.co";
