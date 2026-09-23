import { defineConfig } from "drizzle-kit";
import path from "path";

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

const dbUrl =
  supabasePassword && supabaseHost && supabaseUser
    ? `postgresql://${encodeURIComponent(supabaseUser)}:${encodeURIComponent(supabasePassword)}@${supabaseHost}:${supabasePort}/${supabaseDatabase}`
    : process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("A database connection must be configured");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  schemaFilter: ["afucloud", "accounts", "auth"],
  tablesFilter: [
    "users",
    "profiles",
    "refresh_tokens",
    "projects",
    "images",
    "api_keys",
    "personal_tokens",
    "webhooks",
    "activity_logs",
    "domains",
    "hostnames",
    "storage_containers",
    "storage_objects",
  ],
  dbCredentials: {
    url: dbUrl,
    ssl: true,
    options: "-c search_path=afucloud,accounts,public",
  },
});
