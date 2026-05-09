import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const dbUrl = process.env.DATABASE_URL;

let pool: InstanceType<typeof Pool> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

if (dbUrl) {
  pool = new Pool({ connectionString: dbUrl });
  _db = drizzle(pool, { schema });
} else {
  console.warn(
    "[db] DATABASE_URL is not set — Drizzle ORM is disabled. " +
    "All app data is served from Supabase. Set DATABASE_URL if you need the local schema.",
  );
}

export { pool };
export const db = _db as ReturnType<typeof drizzle<typeof schema>>;

export * from "./schema";
