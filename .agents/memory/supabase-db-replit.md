---
name: Supabase DB connection on Replit
description: Why direct pg and Supavisor pooler both fail from Replit, and the correct HTTPS-based workaround.
---

## The rule
Never use a direct PostgreSQL connection (`pg` pool / `node-postgres`) from Replit's runtime. Use the Supabase JS admin client (`createClient(url, SERVICE_ROLE_KEY)`) for ALL database operations from the API server.

**Why:** Replit containers are IPv4-only. Supabase's direct DB hostname (`db.<ref>.supabase.co`) is IPv6-only (ENODATA on IPv4 lookup). Supabase's connection pooler (`aws-0-<region>.pooler.supabase.com`) IS IPv4-reachable, but Supavisor returns "tenant/user not found" for both the `postgres` superuser and custom roles — they are not registered in Supavisor's user catalog when reached this way.

**How to apply:**
- Import from `lib/supabase-admin.ts` → `getAdminClient()`.
- For CRUD: use `.from('table').select/insert/update/delete()`.
- For stored procedures (e.g. `claim_video_job`, `credit_acoin`): use `.rpc('fn_name', { p_param: value })`.
- For auth.users lookups: use `supabase.auth.admin.getUserById(userId)`.
- Do NOT import from `lib/db.ts` in any route or service — that file uses `pg.Pool` which cannot connect.
- Do NOT gate background services on `SUPABASE_DB_URL` — use `SUPABASE_SERVICE_ROLE_KEY` as the availability signal instead.
