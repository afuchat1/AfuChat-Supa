# AfuChat

A full-featured social chat mobile platform with posts, shops, video, push notifications, AI chat, and in-app payments.

## Run & Operate

```bash
pnpm install                                  # install all workspace deps
cd artifacts/api-server && node ./build.mjs   # rebuild API server after source changes
```

**Workflows (auto-started by Replit):**
| Name | Port | Purpose |
|------|------|---------|
| API Server | 3000 | Express REST API |
| Start application | 5000 | Expo web preview + Metro bundler |
| Mockup Preview Server | 8000 | Canvas mockup previews |

**Required secrets (add via Replit Secrets):**
- `SUPABASE_SERVICE_ROLE_KEY` — enables video pipeline, realtime watcher, email notifications, auth admin routes
- All other credentials (Cloudflare R2, Pesapal, Resend, Groq) load **automatically at boot** from Supabase `app_settings` table once the service role key is set

**Public env vars (already in `.replit`):**
- `SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL`
- `SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `PORT=3000`

## Stack

- **API**: Express 5, TypeScript, esbuild bundle → `dist/index.mjs`, Node.js 20
- **Mobile**: Expo 54 (React Native + Expo Router), Metro bundler, port 5000
- **Auth**: Supabase Auth (service-role key server-side, anon key client-side)
- **DB**: Supabase Postgres (primary); `lib/db` has Drizzle ORM wired to Replit PostgreSQL for secondary use
- **Storage**: Cloudflare R2 (S3-compatible), credentials from `app_settings`
- **Payments**: Pesapal — Google Pay, Card, MTN MoMo, Airtel Money via custom in-app checkout
- **Email**: Resend API (credentials from `app_settings`)
- **Realtime/Push**: Supabase Realtime channels + Expo Push Notifications

## Where things live

```
artifacts/api-server/      Express API server
  src/app.ts               Express app setup, CORS, middleware
  src/index.ts             Entry point: bootstrap → listen → start background services
  src/routes/              Route handlers (auth, ai-chat, payments, uploads, videos, …)
  src/lib/bootstrap.ts     Loads R2 + Pesapal config from Supabase app_settings at boot
  src/lib/constants.ts     Supabase URL (public) — service role key from env
  src/lib/r2.ts            Cloudflare R2 S3 client
  src/lib/supabaseAdmin.ts Singleton Supabase admin client (needs service role key)
  src/services/            Background services: realtime watcher, video encoder, story cleanup
  build.mjs                esbuild bundler → dist/
  dist/                    Compiled output (gitignored, rebuilt by workflow)
artifacts/mobile/          Expo React Native app
  app/                     Expo Router screens
  lib/                     Client-side helpers, Supabase client, API client
  metro.config.js          Metro: /api/* proxied to port 3000, maxWorkers=2
artifacts/mockup-sandbox/  Vite canvas mockup preview server (port 8000)
lib/db/                    Drizzle ORM schema + Replit PostgreSQL client
lib/api-spec/              Shared Zod API types
supabase/                  Edge functions (ai-chat, pesapal-*) + SQL migrations
```

## Architecture decisions

- **Supabase is the primary backend** — do NOT replace with Replit Auth/DB. Keeps Supabase Auth, Realtime, and edge functions (user preference).
- **Custom in-app checkout** — `POST /api/payments/initiate` handles all methods through Pesapal. No hosted redirects. IPN webhook at `POST /api/payments/webhook`.
- **R2 + Pesapal credentials are runtime-injected** — `bootstrap.ts` fetches from Supabase `app_settings` at server start, so Replit secrets surface stays minimal.
- **Metro proxies `/api/*`** — `metro.config.js` forwards all `/api/` requests to port 3000 to avoid CORS issues.
- **`@aws-sdk/*` is externalized** in esbuild — the SDK must be present in `node_modules` at runtime (it is, via pnpm workspace install).
- **`EXPO_NO_LAZY=1`** prevents Metro multipart streaming crashes through the Replit proxy tunnel.

## Product

Social chat app: profiles, posts/feed, group chats, voice messages, video, stories, shop/marketplace with ACoin escrow, push notifications, AI chat assistant, admin/support ticketing, in-app ACoin top-up via Google Pay / Card / MTN / Airtel.

## User preferences

- Keep Supabase as the auth and primary database provider — do not migrate to Replit Auth or Neon.
- Google Pay is the PRIMARY (first/most prominent) payment method in the checkout UI.
- All payments stay in-app — no Pesapal hosted checkout redirects.

## Gotchas

- Always rebuild API server after editing source: `cd artifacts/api-server && node ./build.mjs`
- Run `pnpm install` from the **workspace root**, not from individual packages.
- The Supabase URL is intentionally hard-coded in `constants.ts` (it's a public project identifier, not a secret).
- Without `SUPABASE_SERVICE_ROLE_KEY`, the server boots but these features are disabled: video encoder, realtime email watcher, auth admin routes, upload signing. Add it as a Replit secret to enable them.
- Pesapal + Cloudflare R2 + Resend credentials come from the Supabase `app_settings` table, not from env vars directly.
