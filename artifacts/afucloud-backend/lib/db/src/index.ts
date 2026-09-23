import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const supabasePassword = process.env.SUPABASE_DB_PASSWORD;
const supabaseHost = process.env.SUPABASE_DB_HOST;
const supabaseUser = process.env.SUPABASE_DB_USER;
const supabasePort = process.env.SUPABASE_DB_PORT ?? "5432";
const supabaseDatabase = process.env.SUPABASE_DB_NAME ?? "postgres";
const hasSupabaseTarget = Boolean(supabaseHost || process.env.SUPABASE_PROJECT_ID);

if (hasSupabaseTarget && (!supabasePassword || !supabaseHost || !supabaseUser)) {
  throw new Error(
    "Supabase is configured but SUPABASE_DB_PASSWORD is missing. Refusing to fall back to the local DATABASE_URL.",
  );
}

const connectionString =
  supabasePassword && supabaseHost && supabaseUser
    ? `postgresql://${encodeURIComponent(supabaseUser)}:${encodeURIComponent(supabasePassword)}@${supabaseHost}:${supabasePort}/${supabaseDatabase}`
    : process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "A database connection must be configured.",
  );
}

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  // Keep shared profiles available for raw SQL, but all Drizzle tables are
  // explicitly schema-qualified so auth never depends on search_path ordering.
  options: "-c search_path=afucloud,accounts,public",
});
export const db = drizzle(pool, { schema });

export * from "./schema";
