/**
 * lib/db — intentionally empty stub.
 *
 * AfuChat stores ALL data in Supabase (PostgreSQL managed by Supabase).
 * This package exists as a workspace placeholder so tooling (tsc, pnpm)
 * resolves the @workspace/db import without errors.
 *
 * There are NO Replit-managed database connections, no Drizzle ORM tables,
 * and no DATABASE_URL usage anywhere in the application.
 *
 * - Mobile data   → Supabase JS client (supabase.from(...))
 * - Server data   → Supabase Admin client (supabaseAdmin.from(...))
 * - Media storage → Cloudflare R2 via Supabase Edge Functions
 * - Auth          → Supabase Auth
 */

export {};
