# AfuChat Development Rules

> **Read this before touching anything.** These rules apply to every contributor — human or AI agent.

The full reasoning lives in [`replit.md`](./replit.md) under **"Critical Architecture Constraints — DO NOT CHANGE"**. This file is the short, hard "no" list.

---

## 🔒 Locked infrastructure — DO NOT CHANGE

### 1. Supabase is the only backend

Auth, Postgres, RLS, Realtime, Storage policies, and Edge Functions all live in Supabase. The mobile app and the API server both depend on it.

**Never:**
- Migrate to Neon, Replit Postgres, PlanetScale, Firebase, or any other database.
- Replace Supabase Auth with Replit Auth, Clerk, NextAuth, Auth0, or anything else.
- Rewrite Supabase Edge Functions (`supabase/functions/*`) as Express routes.
- Delete or rewrite migration files in `supabase/migrations/`.
- Change RLS policies, RPC signatures, or column names without an additive migration AND a coordinated client update.
- Remove `@supabase/supabase-js` from any package.

**Always:**
- Add new tables, columns, RPCs, and policies in a **new dated migration** (`supabase/migrations/YYYYMMDD_description.sql`) using idempotent SQL (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`).
- Add new edge functions under `supabase/functions/<name>/index.ts` and register them in `supabase/config.toml`.

### 2. Cloudflare R2 is the only media CDN

All user media lives in the single R2 bucket `afuchat-media` and is served via `https://cdn.afuchat.com`. The flow is:

```
mobile/web client
  → POST /api/uploads/sign  (api-server returns presigned PUT URL)
  → PUT bytes directly to R2
  → write https://cdn.afuchat.com/<bucket>/<userId>/<file> into Supabase row
```

**Never:**
- Migrate media to Supabase Storage, Replit Object Storage, AWS S3, Vercel Blob, Cloudinary, ImageKit, UploadThing, or anywhere else.
- Change the `cdn.afuchat.com` domain — every existing post/avatar/video URL in the database depends on it.
- Split `afuchat-media` into multiple buckets. Logical groupings (avatars, posts, videos, stories, group-avatars, chat-media, voice-messages, shop-media, match-photos, banners) are **key prefixes**, not separate buckets.
- Hard-code R2 credentials in source, `.env`, `app.json`, or deploy config.
- Refactor `artifacts/api-server/src/lib/r2.ts` to read env vars at module-load time. They MUST be read lazily inside functions so they pick up `bootstrap.ts`'s injection.

**Always:**
- Add new logical key prefixes by passing a new `bucket` value to `POST /api/uploads/sign`.
- Push new R2 keys to Supabase with `pnpm --filter @workspace/scripts push-secrets-to-supabase`.

### 3. Secrets live in Supabase, not in env files

R2 credentials and other server-side runtime config live in `public.app_settings` (a Supabase table with RLS allowing only `service_role`). On boot, `artifacts/api-server/src/lib/bootstrap.ts` queries this table and merges rows into `process.env`.

**The only env var the API server actually needs in production is `SUPABASE_SERVICE_ROLE_KEY`.**

**Never:**
- Commit secrets to source.
- Expose secrets via `EXPO_PUBLIC_*` env vars (those ship to the browser bundle).
- Send the service-role key to the mobile client.

### 4. The `lib/` directory is owner-controlled

Files under `lib/` (`lib/api-spec`, `lib/api-client-react`, `lib/api-zod`, `lib/db`) are shared across all artifacts. Do not modify them without explicit owner approval.

### 5. The Replit `DATABASE_URL` is not used

A Replit Postgres database is provisioned for tooling reasons, but the app does not read from or write to it. Leave it alone.

---

## ✅ Where you can build freely

- New screens / components in `artifacts/mobile/app/` and `artifacts/mobile/components/`.
- New API routes in `artifacts/api-server/src/routes/` (for orchestration, long-running jobs, R2 presigning — NOT for things that should be edge functions).
- New edge functions in `supabase/functions/` for auth-tied user actions.
- New additive Supabase migrations.
- New logical R2 key prefixes for new media types.

---

## When in doubt

1. Re-read the relevant section of [`replit.md`](./replit.md).
2. If the change touches Supabase schema, R2, `lib/`, or auth — **stop and ask the owner first**.
3. If it doesn't, ship it.
