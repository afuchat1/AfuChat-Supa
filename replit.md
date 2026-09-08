# AfuChat Android app

AfuChat is an Android-first React Native application built with Expo SDK 55, Expo Router, Hermes, and the React Native New Architecture. The app connects directly to a live Supabase project for auth, database, realtime, storage, and Edge Functions.

## Quick start on Replit

### 1. Install dependencies

Run once from the workspace root:

```bash
pnpm install
```

This installs all packages and runs the `postinstall` script that patches native modules for the build environment.

### 2. Start Metro

Click **Run** or start the **Start application** workflow. Metro bundler launches automatically:

```
EXPO_OFFLINE=1 EXPO_NO_LAZY=1 \
  EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN \
  EXPO_PUBLIC_REPL_ID=$REPL_ID \
  EXPO_PACKAGER_PROXY_URL=https://$REPLIT_EXPO_DEV_DOMAIN \
  REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_EXPO_DEV_DOMAIN \
  pnpm exec expo start --go --web --port 5000
```

### 3. Open on device

Scan the QR code shown in the workflow output with **Expo Go** on an Android (or iOS) device. The web preview at port 5000 also works for visual inspection.

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

# TypeScript check
pnpm run typecheck

# Export bundle (requires network for Expo CLI)
pnpm exec expo export --platform android
```

## Important conventions

- Use `EXPO_OFFLINE=1` in Replit workflows — `CI=1` breaks native bundle serving.
- EAS cloud builds require `EAS_NO_VCS=1` (Replit blocks `git stash`).
- Do not add web routes, web layouts, or a server layer — the app is native Android.
- All DB writes go through Supabase RLS-protected routes or Edge Functions.
- ACoin deductions must use the `deduct_acoin` RPC (not direct `.update()`).
- Direct PostgreSQL connections from Replit fail (IPv4 blocked); use the Supabase JS admin client (HTTPS) for all DB ops.

## User preferences

- Voice call UI uses the liquid-glass design system (`constants/glass.ts`): BlurView panels, specular edges, ambient colour orbs.
