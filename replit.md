# AfuChat

A full-featured social chat mobile platform with posts, shops, video, push notifications, AI chat, and in-app payments.

## Run & Operate

```bash
pnpm install          # install all workspace deps (run from workspace root)
```

**Workflows (auto-started by Replit):**
| Name | Port | Purpose |
|------|------|---------|
| Start application | 5000 | Expo web preview + Metro bundler |
| Mockup Preview Server | 8000 | Canvas mockup previews |

**Required secrets (add via Replit Secrets):**
- `SUPABASE_ACCESS_TOKEN` — deploy Edge Functions via CLI (`npx supabase functions deploy --project-ref rhnsjqqtdzlkvqazfcbg`)
- `SUPABASE_SERVICE_ROLE_KEY` — needed by Edge Functions for admin operations (set in Supabase Dashboard → Project Settings → Edge Functions secrets, NOT Replit secrets)

**Public env vars (already in `.replit`):**
- `SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL`
- `SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Stack

- **Mobile**: Expo 54 (React Native + Expo Router), Metro bundler, port 5000
- **Backend**: Supabase Edge Functions (Deno) — all API logic lives here
- **Auth**: Supabase Auth (anon key client-side, service-role key in Edge Functions)
- **DB**: Supabase Postgres
- **Storage**: Cloudflare R2 (S3-compatible), credentials from `app_settings` table
- **Payments**: Pesapal — Google Pay, Card, MTN MoMo, Airtel Money via custom in-app checkout
- **Email**: Resend API (credentials from `app_settings`)
- **Realtime/Push**: Supabase Realtime channels + Expo Push Notifications

## Where things live

```
artifacts/mobile/          Expo React Native app
  app/                     Expo Router screens
  lib/                     Client-side helpers, Supabase client
  metro.config.js          Metro bundler config
artifacts/mockup-sandbox/  Vite canvas mockup preview server (port 8000)
supabase/functions/        All 19 Edge Functions (ai-chat, pesapal-*, uploads, videos, …)
supabase/migrations/       SQL migrations
```

**Edge Functions (Supabase project: rhnsjqqtdzlkvqazfcbg):**
account-purge, admin-broadcast-push, ai-chat, auth-resolve-identifier, chats-create, generate-ai-image, pesapal-initiate, pesapal-ipn, register-push-token, send-marketing-email, send-password-reset, send-push-notification, status, support, telegram-auth, transcribe-audio, uploads, videos

## Architecture decisions

- **Supabase is the ONLY backend** — no Express server, no Replit Auth/DB. All API logic in Supabase Edge Functions.
- **R2 is the ONLY storage backend** — Cloudflare R2 (S3-compatible), credentials from Supabase `app_settings` table.
- **Custom in-app checkout** — Pesapal handles all payment methods. No hosted redirects.
- **R2 + Pesapal + Resend credentials are runtime-injected** — fetched from Supabase `app_settings` table inside Edge Functions, so Replit secrets stay minimal.
- **`EXPO_NO_LAZY=1`** prevents Metro multipart streaming crashes through the Replit proxy tunnel.

## Product

Social chat app: profiles, posts/feed, group chats, voice messages, video, stories, shop/marketplace with ACoin escrow, push notifications, AI chat assistant, admin/support ticketing, in-app ACoin top-up via Google Pay / Card / MTN / Airtel.

**Offline video cache (TikTok-style):** Videos are auto-cached to `afuchat_offline/` when watched. 24h TTL, auto-expired on app launch. Registry stored in AsyncStorage (`afu_offline_video_registry_v2`). Managed via Settings → Offline Videos.

## User preferences

- Keep Supabase as the auth and primary database provider — do not migrate to Replit Auth or Neon.
- R2 (Cloudflare) is the ONLY storage backend — do not add other storage providers.
- Google Pay is the PRIMARY (first/most prominent) payment method in the checkout UI.
- All payments stay in-app — no Pesapal hosted checkout redirects.

## Gotchas

- Run `pnpm install` from the **workspace root**, not from individual packages.
- The Supabase URL is intentionally hard-coded in client constants (it's a public project identifier, not a secret).
- `SUPABASE_SERVICE_ROLE_KEY` must be set in the **Supabase Dashboard** (Edge Function secrets), not Replit secrets — Edge Functions read it from their own secret store.
- To redeploy Edge Functions after changes: `SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy --project-ref rhnsjqqtdzlkvqazfcbg`
- EAS APK builds: run from `artifacts/mobile/` with `EXPO_TOKEN` set. Latest build: v2.0.57, build ID b5d9d436.
