# AfuChat mobile app with an Expo web surface

AfuChat is a product separate from AfuCloud. AfuChat is an Expo application built with Expo SDK 57, Expo Router, Hermes, and the React Native New Architecture. Its web build is the same Expo Router app and UI as mobile, exported as static route HTML so public pages are discoverable without requiring JavaScript to parse the site.

The Afu ecosystem shares the Afu Account, `api.afuchat.com` API gateway, `cdn.afuchat.com` CDN gateway, and one database, while each product owns its Worker, schema, R2 bucket, routes, configuration, secrets, and deployment. The API gateway routes to independently deployable product Workers; it must not host product-specific business logic. Apply the Afu ecosystem master infrastructure rules before backend or infrastructure changes. Preserve compatibility during migrations and verify ownership, consumers, data, routes, bindings, and rollback before cutover or decommissioning.

## Quick start on Replit

### 1. Install dependencies

Run once from the workspace root:

```bash
pnpm install
```

This installs all packages and runs the `postinstall` script that patches native modules for the build environment.

The Worker is an independent Cloudflare project outside the root pnpm workspace:

```bash
cd backend/cf-worker
pnpm install --ignore-workspace --frozen-lockfile
pnpm run typecheck
```

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
| `EXPO_PUBLIC_AFUCLOUD_API_URL` | Legacy mobile API base currently used by AfuChat call sites; split calls by product during migration | No — defaults to `https://api.afuchat.com` |
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
  supabase/     Existing Supabase migrations kept as database reference
  scripts/      postinstall.sh — patches native modules for New Arch

backend/cf-worker/
  src/          Legacy mixed Worker API, including AfuCloud routes and AfuChat gateway/app handlers
  wrangler.toml Current local Worker route, R2 binding, and public vars; not the target architecture
```

The `supabase/` directory is retained for schema history and migration reference. It is not a deployed application backend: clients must not call Supabase Edge Functions or Supabase Storage directly.

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
- The current local Worker configuration is a legacy mixed setup: `afucloud-api`
  owns the `api.afuchat.com` route, AfuCloud API handlers, AfuChat Supabase
  gateway/app handlers, and an `afuchat-media` binding. Treat this as a
  nonconforming state to migrate, not as the target architecture.
- AfuChat data and media belong to AfuChat's own schema and bucket; AfuCloud
  data and media belong to AfuCloud's own schema and bucket. The master rules
  give `afu-chat-assets` and `afu-cloud-storage` as product-owned bucket names.
  CDN paths must identify the product and map to its bucket.
- Existing endpoints and media paths are compatibility contracts. Do not
  repoint, delete, or decommission the current Worker, route, bucket, or data
  until live ownership, consumers, object inventory, migration, validation, and
  rollback are established. No live Cloudflare inventory has been verified.
- The Worker source currently lives at `backend/cf-worker/`; do not treat its
  current Wrangler deployment target as proof of exclusive resource ownership.
- ACoin deductions must use the `deduct_acoin` RPC (not direct `.update()`).
- Direct PostgreSQL connections from Replit fail (IPv4 blocked); use the Supabase JS admin client (HTTPS) for all DB ops.

## User preferences

- Voice call UI uses the liquid-glass design system (`constants/glass.ts`): BlurView panels, specular edges, ambient colour orbs.
