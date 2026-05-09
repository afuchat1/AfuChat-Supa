# AfuChat — Project Overview

## What this is
AfuChat is a social mobile app (React Native/Expo) with an Express API backend. The app includes messaging, posts, stories, video, payments (Pesapal), AI chat, and more.

## Architecture
- **`artifacts/mobile`** — Expo/React Native mobile app (runs on port 5000 in dev, scannable with Expo Go)
- **`artifacts/api-server`** — Express API server (runs on port 3000)
- **`lib/db`** — Drizzle ORM + Replit PostgreSQL (for app-level data)
- **`lib/api-spec`, `lib/api-zod`, `lib/api-client-react`** — shared types and API client
- **`supabase/`** — Supabase Edge Functions + migrations (auth, realtime, AI)

## How to run
- **Start Backend** workflow: starts the Express API server on port 3000
- **Start application** workflow: starts Expo Metro bundler on port 5000 (scan QR in Expo Go or open web)
- Both workflows run together via the **Project** workflow

## Key services used
- **Supabase** — auth, realtime subscriptions, storage (videos), edge functions (AI chat)
- **Cloudflare R2** — media storage (avatars, posts, stories, chat media)
- **Pesapal** — payments gateway (Africa-focused)
- **Resend** — transactional email
- **Replit PostgreSQL** — Drizzle ORM schema (DATABASE_URL auto-provisioned)

## Required secrets
- `SUPABASE_SERVICE_ROLE_KEY` — enables admin features, video processing, email watcher
- `RESEND_API_KEY` — transactional email notifications
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY` — media uploads
- `R2_BUCKET`, `R2_PUBLIC_BASE_URL` — R2 bucket name and public URL
- `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, `PESAPAL_IPN_ID` — payments

## User preferences
- Use pnpm for package management (enforced by preinstall hook)
- API server must be built before starting (`pnpm run build` in `artifacts/api-server`)
- The mobile app uses Expo Router (file-based routing under `artifacts/mobile/app/`)
- Never expose Supabase service role key to the client/mobile app
