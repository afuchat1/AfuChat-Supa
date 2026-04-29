<div align="center">
  <img src="artifacts/mobile/assets/images/logo.png" alt="AfuChat Logo" width="120" />
  <h1>AfuChat</h1>
  
  <!-- Language & Runtime Banners -->
  ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
  ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

  <!-- Framework & Platform Banners -->
  ![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
  ![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)
  ![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
  ![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)

  <!-- Backend & Database Banners -->
  ![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
  ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
  ![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)

  <!-- Tooling Banners -->
  ![pnpm](https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white)
  ![esbuild](https://img.shields.io/badge/esbuild-FFCF00?style=for-the-badge&logo=esbuild&logoColor=black)
  ![Zod](https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod&logoColor=white)
  ![TanStack Query](https://img.shields.io/badge/TanStack_Query-FF4154?style=for-the-badge&logo=reactquery&logoColor=white)

  <!-- License & Platform -->
  ![License: MIT](https://img.shields.io/badge/License-MIT-00C2CB?style=for-the-badge)
  ![Platform: iOS Android Web](https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20Web-00C2CB?style=for-the-badge)
</div>

---

> ⚠️ **Before contributing, read [DEVELOPMENT_RULES.md](./DEVELOPMENT_RULES.md).** Supabase and Cloudflare R2 are locked infrastructure — do not migrate, replace, or "modernize" them.

## Overview

AfuChat is a full-featured super app built with React Native and Expo. It combines real-time messaging, a social feed, AI assistant, virtual currency, gifting, games, digital services, and more — all in one platform. The backend is powered by Supabase for auth, real-time subscriptions, edge functions, and storage. Media is served from Cloudflare R2 via `https://cdn.afuchat.com`.

---

## Features

- **Messaging** — 1-on-1 and group chats with voice messages, attachments, reactions, typing indicators, read receipts, red envelopes, and offline message queuing
- **Social Feed** — Post, like, reply, follow, and share moments with image support
- **Stories** — 24-hour stories with video and image support, auto-advance, and view tracking
- **AfuAi** — Conversational AI assistant powered by Groq (Llama 3.3), with executable actions, invoice cards, and full user context awareness
- **Wallet** — Dual currency system: Nexa (XP) and ACoin. Send, earn, convert, and top up via Pesapal (M-Pesa, Visa, Mastercard)
- **Gifts** — Virtual gift catalog with dynamic pricing, rarity system, marketplace, and gift-to-ACoin conversion
- **Games** — 8 in-browser games (Snake, Tetris, 2048, Flappy Bird, Space Shooter, Brick Breaker, Minesweeper, Memory Match) with ACoin power-ups
- **Mini Programs** — Airtime, data bundles, bills, hotel bookings, event tickets, and money transfers
- **Premium Subscriptions** — Silver / Gold / Platinum tiers paid with ACoin, unlocking verified badge and exclusive features
- **Push Notifications** — Expo Push Notifications with channel-specific sounds and preference management
- **Offline-First** — Full AsyncStorage caching, pending message queue, and auto-sync on reconnect
- **Digital ID & Prestige** — User profile cards, achievement system, and prestige levels

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile / Web | React Native + Expo Router |
| API Server | Express 5 + Node.js 20 |
| Auth | Supabase Auth (email, Google, GitHub OAuth, OTP) |
| Database | Supabase PostgreSQL + Drizzle ORM |
| Real-time | Supabase Realtime |
| Storage | Supabase Storage (avatars, media, documents) |
| Edge Functions | Supabase Deno Edge Functions (AI chat, push, email) |
| AI | Groq API — Llama 3.3 70B + Whisper Large v3 |
| Email | Resend (branded transactional + marketing emails) |
| Payments | Pesapal (M-Pesa, Visa, Mastercard) |
| Package Manager | pnpm workspaces |
| Build | esbuild |
| Validation | Zod v4 + drizzle-zod |
| API Layer | OpenAPI spec + Orval codegen + TanStack Query |

---

## Project Structure

```
afuchat/
├── artifacts/
│   ├── api-server/        # Express API server (port 3000)
│   │   └── src/
│   │       ├── routes/    # REST endpoints
│   │       └── lib/       # Logger, utilities
│   └── mobile/            # Expo React Native + Web app (port 5000)
│       ├── app/           # Expo Router screens
│       ├── components/    # Reusable UI components
│       ├── context/       # Auth, Theme context providers
│       ├── hooks/         # Custom React hooks
│       └── lib/           # Supabase client, helpers, utilities
├── lib/
│   ├── db/                # Drizzle ORM schema + DB connection
│   ├── api-spec/          # OpenAPI spec + Orval codegen config
│   ├── api-client-react/  # Generated TanStack Query hooks
│   └── api-zod/           # Generated Zod schemas from OpenAPI
├── supabase/
│   ├── functions/         # Deno Edge Functions
│   │   ├── ai-chat/           # Groq chat + audio transcription
│   │   ├── generate-ai-image/ # AI image generation
│   │   ├── send-push-notification/
│   │   ├── send-marketing-email/
│   │   ├── send-password-reset/
│   │   └── transcribe-audio/
│   └── migrations/        # SQL migrations
├── scripts/               # Utility scripts
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Expo Go app (for mobile preview) or a web browser

### Install

```bash
pnpm install
```

### Run

```bash
# Start both the API server and Expo app together
pnpm run dev

# Or start individually:
# API Server (port 3000)
cd artifacts/api-server && pnpm run dev

# Expo App (port 5000)
cd artifacts/mobile && pnpm run dev
```

### Environment Variables

The app connects to Supabase using the following variables (already configured in the workflow):

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `ACCOUNT_PURGE_SECRET` | Secret for the account purge endpoint |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/healthz` | Health check |
| `POST` | `/api/ai/chat` | Proxy to Supabase AI edge function |
| `POST` | `/api/chats/create` | Create a new 1-on-1 chat |
| `POST` | `/api/account-purge` | Purge expired deleted accounts |
| `GET` | `/@:handle` | Public SEO profile page |
| `GET` | `/robots.txt` | Robots file |
| `GET` | `/sitemap.xml` | XML sitemap |

---

## Contributing

We welcome contributions! Please read our [Contributing Guidelines](./CONTRIBUTING.md) for details on the process, coding standards, branch naming, and pull request expectations.

---

## License

[MIT](./LICENSE) © 2026 AfuChat Technologies Ltd
