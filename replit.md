# AfuChat — Replit Project

## Overview
AfuChat is a full-featured social/chat mobile platform. The project is a pnpm monorepo with three main services:

1. **API Server** (`artifacts/api-server`) — Express 5 + TypeScript, built with esbuild. Handles auth, uploads, AI chat proxy, video processing, push notifications, and realtime event watching via Supabase.
2. **Mobile App** (`artifacts/mobile`) — Expo 54 (React Native) with Expo Router. Runs as a web app in Replit preview (port 5000). Also supports iOS/Android via EAS Build.
3. **Mockup Preview Server** (`artifacts/mockup-sandbox`) — Vite dev server for canvas/mockup previews (port 8000).

## Architecture

### Backend (API Server — port 3000)
- **Framework**: Express 5
- **Language**: TypeScript → esbuild bundle → `dist/index.mjs`
- **Auth**: Supabase Auth (service-role key for admin operations)
- **Database**: Supabase (primary), Replit PostgreSQL provisioned via `DATABASE_URL` (for future Drizzle schema use)
- **Storage**: Cloudflare R2 (S3-compatible) for all user media
- **Email**: Resend API (`RESEND_API_KEY`)
- **Realtime**: Supabase Realtime channels (push notifications, email triggers)
- **Video**: ffmpeg for transcoding, R2 for storage

### Frontend (Mobile — port 5000)
- **Framework**: Expo 54 with Expo Router
- **Target**: iOS, Android, Web
- **Auth**: Supabase JS client (anon key)
- **Build**: Metro bundler (web dev mode in Replit), EAS Build for native

### Shared Libraries
- `lib/db` — Drizzle ORM + pg, connects to `DATABASE_URL` (Replit PostgreSQL)
- `lib/api-spec` — Shared API type definitions
- `lib/api-zod` — Zod schemas for API validation
- `lib/api-client-react` — React hooks for API calls

## Environment Variables
All set in `.replit` `[userenv.shared]`:
- `SUPABASE_URL` / `SUPABASE_PROJECT_REF`
- `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL` / `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` (Replit PostgreSQL)
- `GITHUB_PAT`
- Cloudflare R2 credentials loaded at runtime from Supabase `app_settings` table

## Workflows
| Name | Command | Port | Purpose |
|------|---------|------|---------|
| API Server | `cd artifacts/api-server && node ./build.mjs && PORT=3000 node --enable-source-maps ./dist/index.mjs` | 3000 | REST API |
| Start application | `cd artifacts/mobile && CI=1 ... ./node_modules/.bin/expo start --port 5000` | 5000 | Mobile web preview |
| Mockup Preview Server | `cd artifacts/mockup-sandbox && PORT=8000 BASE_PATH=/__mockup/ npx vite` | 8000 | Canvas mockups |

## Key Files
- `artifacts/api-server/build.mjs` — esbuild bundler script
- `artifacts/api-server/src/index.ts` — Server entry point
- `artifacts/api-server/src/lib/bootstrap.ts` — Loads R2 config from Supabase `app_settings` at startup
- `artifacts/api-server/src/lib/constants.ts` — Hard-coded Supabase URL (public, not a secret)
- `artifacts/api-server/src/lib/r2.ts` — Cloudflare R2 client
- `artifacts/api-server/src/services/realtimeWatcher.ts` — Supabase Realtime event handler
- `artifacts/mobile/app.json` — Expo config (bundle ID: `com.afuchat.app`)
- `lib/db/src/schema/index.ts` — Drizzle schema (currently empty; add tables here)
- `pnpm-workspace.yaml` — Workspace packages and catalog versions

## Development Notes
- Run `pnpm install` from workspace root to install all dependencies
- API server must be rebuilt after source changes: `cd artifacts/api-server && node ./build.mjs`
- The mobile app uses `CI=1` (not `--non-interactive`) for non-watch mode in Replit
- Supabase is the primary backend — do NOT replace with Replit Auth/DB unless explicitly requested
- Cloudflare R2 credentials are fetched from Supabase `app_settings` table at server boot (graceful fallback if unavailable)
