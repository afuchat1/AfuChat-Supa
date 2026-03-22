# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   ├── mobile/             # AfuChat Expo React Native app
│   └── mockup-sandbox/     # Component preview server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## AfuChat Mobile App (artifacts/mobile)

Expo React Native app — WeChat-style chat application connecting to an external Supabase backend.

### Backend: Supabase (rhnsjqqtdzlkvqazfcbg.supabase.co)

The app uses an **existing** Supabase project with pre-created tables. No schema migration needed.

### Key Supabase Tables Used

- **profiles** — `id`, `handle`, `display_name`, `avatar_url`, `bio`, `xp`, `acoin`, `current_grade`, `is_verified`, `country`, `website_url`, `phone_number`, `banner_url`, `language`, `tipping_enabled`, etc.
- **chats** — `id`, `name`, `is_group`, `is_channel`, `created_by`, `is_pinned`, `is_archived`, `avatar_url`, `description`, `user_id`, `is_verified`, `who_can_send`, `member_limit`
- **chat_members** — `id`, `chat_id`, `user_id`, `joined_at`, `is_admin`
- **messages** — `id`, `chat_id`, `sender_id`, `encrypted_content`, `sent_at`, `reply_to_message_id`, `attachment_url`, `attachment_type`, `audio_url`, `edited_at`
- **follows** — `id`, `follower_id`, `following_id` (acts as contacts system)
- **follow_requests** — `id`, `requester_id`, `target_id`, `status`
- **posts** — `id`, `author_id`, `content` (max 280 chars), `image_url`, `view_count`, `is_blocked`, `wall_user_id`, `language_code`
- **post_images** — `id`, `post_id`, `image_url`, `display_order`
- **post_replies** — `id`, `post_id`, `author_id`, `content`, `parent_reply_id`
- **stories** — `id`, `user_id`, `media_url`, `media_type`, `caption`, `expires_at`, `view_count`
- **gifts/gift_transactions** — virtual gift system
- **message_reactions** — emoji reactions on messages
- **blocked_users** — block/unblock users
- **notifications** — system notifications
- **acoin_transactions** / **xp_transfers** — currency system

### App Architecture

- **Auth**: Supabase Auth (email/password), AuthContext provider
- **Navigation**: Expo Router with tabs (Chats, Contacts, Discover, Me)
- **Design**: AfuChat teal `#00C2CB` brand color, Inter font family, dark/light theme, custom logo
- **Real-time**: Supabase Realtime subscriptions for incoming messages
- **State**: React Context (AuthContext) + local component state

### Key Files

- `lib/supabase.ts` — Supabase client config
- `context/AuthContext.tsx` — Auth provider with profile loading
- `constants/colors.ts` — Brand colors + light/dark theme
- `hooks/useTheme.ts` — Theme hook
- `components/ui/Avatar.tsx` — Avatar with initials fallback
- `components/ui/Separator.tsx` — List separator
- `app/(tabs)/index.tsx` — Chats list with stories bar
- `app/(tabs)/contacts.tsx` — Contacts (follows) list
- `app/(tabs)/discover.tsx` — Posts feed (tap to post detail)
- `app/(tabs)/me.tsx` — Profile & settings hub (nav to all feature screens)
- `app/chat/[id].tsx` — Chat with reactions, typing indicators, read receipts, reply-to, red envelopes
- `app/moments/create.tsx` — Create new post
- `app/profile/edit.tsx` — Edit profile
- `app/group/create.tsx` — Create group chat
- `app/contact/[id].tsx` — Contact profile with follow/block/report
- `app/stories/create.tsx` — Create story (image + caption, 24h expiry)
- `app/stories/view.tsx` — View stories with progress dots and view tracking
- `app/post/[id].tsx` — Post detail with likes, replies, view count
- `app/notifications.tsx` — Notifications list with mark read
- `app/wallet/index.tsx` — XP/ACoin balance, transfer XP, transaction history
- `app/gifts/index.tsx` — Gift shop, owned gifts, send gifts, pin favorites
- `app/red-envelope/[id].tsx` — Red envelope claim and status
- `app/games/index.tsx` — Game challenges and scores
- `app/mini-programs/index.tsx` — Mini programs discovery
- `app/ai/index.tsx` — AfuAi chat (powered by OpenAI via Replit AI Integrations)
- `app/my-posts/index.tsx` — Dedicated My Posts screen (user's own posts with delete)
- `app/settings/privacy.tsx` — Privacy settings (private account, online status, hide lists)
- `app/settings/notifications.tsx` — Notification preferences
- `app/settings/chat.tsx` — Chat preferences (theme, bubble, font, read receipts)
- `app/settings/blocked.tsx` — Blocked users management

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health`; `src/routes/ai-chat.ts` exposes `POST /api/ai/chat` (AfuAi chat) and `POST /api/ai/reply` (AfuAi auto-reply when @AfuAi is tagged in post comments)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
