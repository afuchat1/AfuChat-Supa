# AfuChat

A full-featured social chat mobile platform with posts, shops, video, push notifications, and AI chat.

## Run & Operate

```bash
pnpm install                              # install all workspace deps
cd artifacts/api-server && node ./build.mjs   # rebuild API server after source changes
```

**Workflows (auto-started by Replit):**
| Name | Port | Purpose |
|------|------|---------|
| API Server | 3000 | Express REST API |
| Start application | 5000 | Expo web preview |
| Mockup Preview Server | 8000 | Canvas mockup previews |

**Required env vars** (set in `.replit` `[userenv.shared]`):
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase admin access (server-only, never expose to client)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_URL` — client-side Supabase
- `DATABASE_URL` / `PG*` — Replit PostgreSQL (provisioned)
- `RESEND_API_KEY` — email (optional; emails skipped if absent)
- Cloudflare R2 credentials are loaded **at runtime** from Supabase `app_settings` table — no static env vars needed

## Stack

- **API**: Express 5, TypeScript, esbuild, Node.js 20
- **Mobile**: Expo 54 (React Native + Expo Router), Metro bundler
- **Auth**: Supabase Auth (service-role key on server, anon key on client)
- **DB**: Supabase (primary), Replit PostgreSQL provisioned for Drizzle ORM (`lib/db`)
- **Storage**: Cloudflare R2 (S3-compatible)
- **Email**: Resend API
- **Realtime/Push**: Supabase Realtime channels + Expo Push

## Where things live

```
artifacts/api-server/      Express API server
  src/index.ts             Entry point
  src/lib/bootstrap.ts     Loads R2 config from Supabase app_settings at boot
  src/lib/constants.ts     Hard-coded public Supabase URL
  src/lib/r2.ts            Cloudflare R2 client
  src/services/realtimeWatcher.ts  Supabase Realtime → email/push
  build.mjs                esbuild bundler script
  dist/                    Compiled output (git-ignored)
artifacts/mobile/          Expo app
  app.json                 Expo config (bundle ID: com.afuchat.app)
  metro.config.js          Metro config with /api/* proxy → port 3000
artifacts/mockup-sandbox/  Vite mockup preview server
lib/db/                    Drizzle ORM + pg (Replit PostgreSQL)
lib/api-spec/              Shared API type definitions
supabase/                  Edge functions + SQL migrations
```

## Architecture decisions

- **Supabase is the primary backend** — do NOT replace with Replit Auth/DB. The project intentionally keeps Supabase Auth, Supabase Realtime, and Supabase edge functions.
- **R2 credentials are runtime-injected** — `bootstrap.ts` fetches them from `app_settings` at server start so the env surface stays small. Callers gracefully return 503 if R2 is unconfigured.
- **Metro proxies `/api/*`** — `metro.config.js` forwards all `/api/` requests to port 3000, avoiding CORS issues in web dev mode.
- **`--offline` flag on Expo** — bypasses EAS auth in Replit (no EAS account/token needed to run the dev server).
- **esbuild single-file bundle** — API server ships as `dist/index.mjs`; rebuild required after any source change.

## Product

Social chat app: user profiles, posts/feed, group chats, voice messages, video, stories, a shop/marketplace with ACoin escrow payments, push notifications, AI chat assistant, and admin/support ticketing.

## User preferences

- Keep Supabase as the auth and primary database provider — do not migrate to Replit Auth.

## Gotchas

- Always rebuild API server after editing source: `cd artifacts/api-server && node ./build.mjs`
- `EXPO_NO_LAZY=1` is set in the workflow env to prevent Metro multipart streaming crashes through the Replit proxy.
- The Supabase URL is intentionally hard-coded in `constants.ts` (it's public info, not a secret).
- `pnpm install` must be run from the workspace root, not from individual packages.
