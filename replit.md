# AfuChat mobile app with an Expo web surface

AfuChat is an Expo application built with Expo SDK 57, Expo Router, Hermes, and the React Native New Architecture. Its web build is the same Expo Router app and UI as mobile, exported as static route HTML so public pages are discoverable without requiring JavaScript to parse the site. The app connects directly to a live Supabase project for auth, database, realtime, storage, and Edge Functions.

## Quick start on Replit

### 1. Install dependencies

Run once from the workspace root:

```bash
pnpm install
```

This installs all packages and runs the `postinstall` script that patches native modules for the build environment.

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
| `EXPO_PUBLIC_SUPABASE_URL` | Override the Supabase project URL | No — fallback in `env.ts` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public anon key used by the client | Required |
| `EXPO_PUBLIC_ENGAGERA_API_KEY` | Engagera AI key (client use should be replaced by a server proxy) | Optional |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin operations (Edge Functions) | Only for EAS builds |
| `SUPABASE_ACCESS_TOKEN` | Deploy Edge Functions via CLI | Only for Edge Function deploys |
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
  supabase/     Existing Supabase migrations and Edge Function source
  scripts/      postinstall.sh — patches native modules for New Arch
```

The `supabase/` directory is part of the existing backend. Do not modify its migrations or Edge Functions during app-only work.

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
- All DB writes go through Supabase RLS-protected routes or Edge Functions.
- ACoin deductions must use the `deduct_acoin` RPC (not direct `.update()`).
- Direct PostgreSQL connections from Replit fail (IPv4 blocked); use the Supabase JS admin client (HTTPS) for all DB ops.

## User preferences

- Voice call UI uses the liquid-glass design system (`constants/glass.ts`): BlurView panels, specular edges, ambient colour orbs.
