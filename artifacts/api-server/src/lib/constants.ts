/**
 * Static constants shared across the API server.
 *
 * Both the Supabase URL and the service-role key are project-specific
 * constants embedded here so the server needs no environment variables
 * to reach Supabase. The anon key is public; the service-role key is
 * scoped to this project's backend only.
 */
export const SUPABASE_URL = "https://rhnsjqqtdzlkvqazfcbg.supabase.co";

export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTY3MDg2OSwiZXhwIjoyMDc3MjQ2ODY5fQ.2EkaV3a2lgTxVVJUtNpIygnaRg6z45qR4OjM4M16qMs";
