# AfuChat mobile app with an Expo web surface

AfuChat is a product separate from AfuCloud. AfuChat is an Expo application built with Expo SDK 57, Expo Router, Hermes, and the React Native New Architecture. Its web build is the same Expo Router app and UI as mobile, exported as static route HTML so public pages are discoverable without requiring JavaScript to parse the site.

The Afu ecosystem shares the Afu Account, `api.afuchat.com` hostname, `cdn.afuchat.com` hostname, and Supabase project, but each Afu product is separate. Product API and CDN paths go to their product Workers. AfuChat currently shares `afuchat-media` between `/chat/*` objects and unprefixed legacy URLs; other product media uses product-specific R2 buckets. `afu-api` owns the existing API-host fallback; product API routes remain unchanged by the AfuChat bucket switch. The mobile-facing product Workers maintained in this workspace are `afuchat-api`, `afuauth-api`, and `afuai-api`.

This Repl owns the AfuChat mobile app and its gateway/AfuChat/AfuAuth/AfuAI Worker sources. AfuCloud, AfuAds, and AfuMail Worker source is intentionally not maintained here; those Workers and their data remain in Cloudflare. AfuChat business and storage APIs use `/v1/chat/*`; its product CDN path is `cdn.afuchat.com/chat/*`. Preserve existing root `cdn.afuchat.com` object URLs and `img.afuchat.com`.

## Quick start on Replit

### 1. Install dependencies

Run once from the workspace root:

```bash
pnpm install
```

This installs all packages and runs the `postinstall` script that patches native modules for the build environment.

To typecheck the Expo app:

```bash
cd artifacts/mobile
pnpm run typecheck
```

The AfuChat media handler in `artifacts/afuchat-worker/src/` is bundled into
`afuchat-api`; it is not a separately deployed Worker.

### 2. Start the Expo web preview

Click **Run** or start the **Start application** workflow. The Expo web app launches on port 5000:

```
cd artifacts/mobile
pnpm run build:web
node scripts/serve-static-web.mjs
```

### 3. Open on device

Start the **Expo Go** workflow and scan its QR code with Expo Go SDK 57. This workflow uses an Expo tunnel so the device can reach Metro without relying on the Replit proxy. The Expo static web export is the Replit preview surface. The EAS workflows remain available separately for Android cloud builds.

## Environment variables and secrets

The app ships with hardcoded production-safe fallbacks in `artifacts/mobile/lib/env.ts`. **No environment variables are required to run the app.** All of the following are optional overrides:

| Variable | Purpose | Required? |
|---|---|---|
| `EXPO_PUBLIC_AFUCLOUD_API_URL`, `EXPO_PUBLIC_AFUCHAT_API_URL` | Deprecated and ignored for AfuChat; its API origin is pinned to `https://api.afuchat.com` and data routes use `/v1/chat/*` | No |
| `EXPO_PUBLIC_AFUAI_API_URL` | AfuAI API origin; AI requests use `/v1/ai/*` | No — defaults to `https://api.afuchat.com` |
| `EXPO_PUBLIC_AFUCHAT_MEDIA_CDN_URL` | AfuChat public media CDN base | No — defaults to `https://cdn.afuchat.com/chat` |
| `EXPO_PUBLIC_SUPABASE_URL` | Legacy project URL used only for public client metadata | No |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public anon key forwarded through the Worker gateway | No — fallback in `env.ts` |
| `EXPO_TOKEN` | EAS cloud builds | Only for EAS builds |

To set Replit secrets (for EAS builds): use the **Secrets** panel (environment-secrets skill).

## Project layout

```
artifacts/mobile/
  app/          Expo Router screens (chat, call, discover, profile, …)
  components/   Shared React Native UI components
  context/      Auth, theme, call, language and app-state providers
  hooks/        Reusable React hooks
  lib/          Supabase client, native services, storage, call engine
  modules/      Native mini-app modules
  web/          Legacy public web surface retained during the Expo web migration
  supabase/     Supabase client configuration
  scripts/      postinstall.sh — patches native modules for New Arch

backend/
  afu-api/      Shared api.afuchat.com namespace gateway and route deployment tooling
  afuauth-api/  Shared authentication Worker source
  afu-chat-api/ AfuChat API Worker source and deployment tooling
  afuai-api/    AfuAI API Worker source
  shared/       Utilities used by maintained Workers
artifacts/afuchat-worker/src/
                AfuChat media module bundled into afuchat-api
```

The mobile app uses the existing shared Supabase Auth, PostgREST, and Realtime APIs without repository-managed database schema changes; AfuChat-owned media uses AfuChat Worker/CDN routes.

## Key features implemented

- **Messaging** — real-time chat with SQLite offline cache, reactions, replies, voice notes, media
- **Voice calls** — P2P WebRTC (Opus ~20 kbps) over Supabase Realtime signaling; glass call screen (`app/call/[id].tsx`), glass incoming call modal (`components/IncomingCallModal.tsx`), call button in 1-on-1 chat headers
- **Discover / Shorts** — algorithmic video feed with offline cache
- **Stories, AI chat, gifts, marketplace, AfuPay** — full feature set

## Verification

```bash
cd artifacts/mobile

# Expo static web export with crawlable no-JavaScript fallbacks
pnpm run build:web

# Native typecheck
pnpm run typecheck
```

## Important conventions

- The Expo Go workflow uses `EXPO_OFFLINE=1 --tunnel`; this skips EAS development code-signing/account prompts while the local ngrok tunnel provides device access. Do not add the separate `--offline` CLI flag because Expo rejects it together with `--tunnel`.
- Keep `NODE_OPTIONS=--max-old-space-size=4096` on the Expo Go workflow because this route graph exceeds Node's default heap during Metro startup.
- Do not use `CI=1` — it breaks native bundle serving.
- EAS cloud builds require `EAS_NO_VCS=1` (Replit blocks `git stash`).
- Keep the Expo web export identical to the native Expo flows. Do not create a separate web-only product surface or mock product content.
- `afu-api` owns only the exact `api.afuchat.com/` root route and forwards `/`
  through its AfuAuth service binding. Product APIs and CDNs each have one
  canonical product namespace and direct route to their product Worker. Do not
  add a broad catch-all or attach a Worker custom domain.
- `backend/route-management/reconcile.mjs` verifies the six API namespaces,
  five CDN namespaces, product R2 bindings, root gateway, and existing website
  route. It removes obsolete API/CDN aliases only; it does not modify DNS,
  Workers, buckets, objects, or retained custom domains.
- The dedicated AfuChat API source is `backend/afu-chat-api/` and its Worker is
  `afuchat-api`. Canonical AfuChat business and storage calls use `/v1/chat/*`
  (`/v1/chat/storage/*` for storage). Legacy API aliases `/chat/*` and
  `/v1/storage*` have been removed; do not reintroduce them. The updated Worker
  is deployed and health/status, CORS, unauthenticated rejection, and canonical
  storage routing pass live checks. Video processing endpoints remain explicit
  `501` stubs; see `docs/AFUCHAT_API.md`.
- AfuCloud, AfuAds, and AfuMail source folders were removed from this workspace
  because they are not mobile-app Worker dependencies. This does not delete or
  change their Cloudflare Workers, routes, buckets, or data.
- A production probe on 2026-10-06 found `/v1/ai/healthz` returns `503` because
  `ENGAGERA_API_KEY` is not configured in the AfuAI Worker. Configure it through
  the approved secret flow before claiming AI production readiness.
- AfuChat's `AFUCHAT_ASSETS` API binding and `CHAT_ASSETS` CDN binding use
  `afuchat-media`, which also serves unprefixed legacy URLs through
  `LEGACY_MEDIA`. AfuMail uses `afu-mail-assets`, AfuCloud uses
  `afucloud-images`, AfuAI uses `afu-ai-assets`, and AfuAds uses
  `afu-ads-assets`. The root `cdn.afuchat.com` R2 custom domain remains attached
  to `afuchat-media`; `img.afuchat.com` remains attached to `afucloud-images`.
  Do not copy or delete objects as part of route cleanup.
- On 2026-10-06, CDN routing was consolidated to `cdn.afuchat.com/*` →
  `afu-cdn`; its product prefixes use the verified R2 bindings. The existing
  API route inventory (the `afu-api` fallback plus product API routes) and
  `cloud.afuchat.com/*` → `afucloud-web` were left unchanged by the CDN and
  storage changes. AfuCloud, AfuMail, AfuAI, and AfuAds health/implementation
  were not changed after their route and bucket ownership was confirmed.
- AfuChat uses the shared Supabase identity; the Worker verifies the same
  bearer through AfuAuth and preserves it for RLS. The mobile app's product
  data calls are being migrated to named `/v1/chat/*` routes. Do not add a
  generic PostgREST proxy, expose the `afuchat` schema, create duplicate
  identity/data stores, or bulk-copy divergent schemas. The current source and
  live catalog audit is in `docs/AFUCHAT_BACKEND_MIGRATION_AUDIT.md`.
- Read-only catalog queries through the Supabase Management API are available
  in this workspace; direct PostgreSQL connections remain blocked from Replit.
  Treat older table/RPC counts as historical and refresh them before making
  implementation decisions.
- Old API aliases were explicitly retired; do not restore redirects or proxy
  fallbacks for them. Keep parsing of old stored media URLs separate from new
  API calls, and preserve the existing R2 custom domains and objects.
- Direct requests to the live Worker hostnames from this workspace receive
  Cloudflare error 1010, so do not interpret that response as a Worker failure.
  Use a permitted external runtime probe for data-plane verification.
- The AfuCloud Worker remains a Cloudflare resource, but its source is
  intentionally absent from this workspace. Its verified routes and bucket
  binding are documented in `docs/API_DOMAIN_ROUTING.md`; do not change its
  health or implementation unless separately requested.
- ACoin deductions must use the `deduct_acoin` RPC (not direct `.update()`).
- Direct PostgreSQL connections from Replit fail (IPv4 blocked); use the Supabase JS admin client (HTTPS) for all DB ops.

## User preferences

- Voice call UI uses the liquid-glass design system (`constants/glass.ts`): BlurView panels, specular edges, ambient colour orbs.
