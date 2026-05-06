# AfuChat

A full-featured social chat mobile platform with posts, shops, video, push notifications, AI chat, and in-app payments.

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

**Required env vars / secrets:**
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase admin access (server-only, stored as Replit secret)
- `SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — client-side Supabase (Replit secret)
- `SUPABASE_ACCESS_TOKEN` — Supabase management API (Replit secret)
- `GITHUB_PAT` — GitHub personal access token (Replit secret)
- `DATABASE_URL` / `PG*` — Replit PostgreSQL (provisioned, runtime-managed)
- Cloudflare R2 credentials are loaded **at runtime** from Supabase `app_settings` table
- Pesapal credentials (`PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, `PESAPAL_IPN_ID`) loaded from Supabase `app_settings` table at boot

## Stack

- **API**: Express 5, TypeScript, esbuild, Node.js 20
- **Mobile**: Expo 54 (React Native + Expo Router), Metro bundler
- **Auth**: Supabase Auth (service-role key on server, anon key on client)
- **DB**: Supabase (primary), Replit PostgreSQL provisioned for Drizzle ORM (`lib/db`)
- **Storage**: Cloudflare R2 (S3-compatible)
- **Payments**: Pesapal (Google Pay, Card, MTN MoMo, Airtel Money) — fully custom in-app checkout
- **Email**: Resend API
- **Realtime/Push**: Supabase Realtime channels + Expo Push

## Where things live

```
artifacts/api-server/      Express API server
  src/routes/payments.ts   Custom checkout: Google Pay, Card, MTN, Airtel via Pesapal
  src/routes/index.ts      Route registry
  src/lib/bootstrap.ts     Loads R2 + Pesapal config from Supabase app_settings at boot
  src/lib/constants.ts     Hard-coded public Supabase URL
  src/lib/r2.ts            Cloudflare R2 client
  src/services/realtimeWatcher.ts  Supabase Realtime → email/push
  build.mjs                esbuild bundler script
  dist/                    Compiled output (git-ignored)
artifacts/mobile/          Expo app
  app/wallet/topup.tsx     Custom in-app checkout UI (Google Pay primary)
  app.json                 Expo config (bundle ID: com.afuchat.app)
  metro.config.js          Metro config with /api/* proxy → port 3000
artifacts/mockup-sandbox/  Vite mockup preview server
lib/db/                    Drizzle ORM + pg (Replit PostgreSQL)
lib/api-spec/              Shared API type definitions
supabase/                  Edge functions + SQL migrations
```

## Architecture decisions

- **Supabase is the primary backend** — do NOT replace with Replit Auth/DB. Intentionally keeps Supabase Auth, Realtime, and edge functions.
- **Custom in-app checkout** — `POST /api/payments/initiate` handles all methods (Google Pay, Card, MTN, Airtel) through Pesapal. No hosted Pesapal redirects. IPN webhook at `POST /api/payments/webhook`.
- **R2 + Pesapal credentials are runtime-injected** — `bootstrap.ts` fetches from `app_settings` at server start so the secrets surface stays small.
- **Metro proxies `/api/*`** — `metro.config.js` forwards all `/api/` requests to port 3000, avoiding CORS issues in web dev mode.
- **Secrets in Replit secrets** — sensitive credentials (Supabase keys, GitHub PAT, etc.) are stored as Replit secrets, NOT in plaintext `.replit` env vars.

## Product

Social chat app: profiles, posts/feed, group chats, voice messages, video, stories, shop/marketplace with ACoin escrow, push notifications, AI chat assistant, admin/support ticketing, and in-app ACoin top-up via Google Pay / Card / MTN / Airtel.

## User preferences

- Keep Supabase as the auth and primary database provider — do not migrate to Replit Auth.
- Payment UI: Google Pay is the PRIMARY (first/most prominent) payment method. All payments stay in-app — no Pesapal hosted checkout redirects.

## Gotchas

- Always rebuild API server after editing source: `cd artifacts/api-server && node ./build.mjs`
- `EXPO_NO_LAZY=1` prevents Metro multipart streaming crashes through the Replit proxy.
- The Supabase URL is intentionally hard-coded in `constants.ts` (it's public info, not a secret).
- `pnpm install` must be run from the workspace root, not from individual packages.
- Pesapal `PESAPAL_CONSUMER_KEY` / `PESAPAL_CONSUMER_SECRET` must be in Supabase `app_settings` table for the payment routes to work.
