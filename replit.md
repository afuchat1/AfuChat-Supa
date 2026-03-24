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

Expo React Native app — WeChat-style chat super app connecting to an external Supabase backend.

### Backend: Supabase (rhnsjqqtdzlkvqazfcbg.supabase.co)

The app uses an **existing** Supabase project with pre-created tables. No schema migration needed.

### Key Supabase Tables Used

- **profiles** — `id`, `handle`, `display_name`, `avatar_url`, `bio`, `xp` (Nexa), `acoin`, `current_grade`, `is_verified`, `is_organization_verified`, `is_admin`, `country`, `website_url`, `phone_number`, `banner_url`, `language`, `tipping_enabled`, etc. NOTE: No `is_premium` field — premium status comes from `user_subscriptions`.
- **subscription_plans** — `id`, `name`, `description`, `acoin_price`, `duration_days`, `features` (jsonb), `grants_verification`, `is_active`, `tier` (silver/gold/platinum)
- **user_subscriptions** — `id`, `user_id` (UNIQUE), `plan_id`, `started_at`, `expires_at`, `is_active`, `acoin_paid`. Premium = active + not expired.
- **currency_settings** — `nexa_to_acoin_rate`, `conversion_fee_percent`, `p2p_fee_percent`. Used for Nexa→ACoin conversion.
- **acoin_transactions** — `id`, `user_id`, `amount`, `transaction_type`, `nexa_spent`, `fee_charged`, `metadata`
- **xp_transfers** — `id`, `sender_id`, `receiver_id`, `amount`, `message`, `status`. XP is displayed as "Nexa" throughout the app.
- **linked_accounts** — `id`, `primary_user_id`, `linked_user_id`, `linked_at`. Premium-only feature.
- **chats** — `id`, `name`, `is_group`, `is_channel`, `created_by`, `is_pinned`, `is_archived`, `avatar_url`, `description`, `user_id`, `is_verified`, `who_can_send`, `member_limit`
- **chat_members** — `id`, `chat_id`, `user_id`, `joined_at`, `is_admin`
- **messages** — `id`, `chat_id`, `sender_id`, `encrypted_content`, `sent_at`, `reply_to_message_id`, `attachment_url`, `attachment_type`, `audio_url`, `edited_at`
- **follows** — `id`, `follower_id`, `following_id` (acts as contacts system)
- **follow_requests** — `id`, `requester_id`, `target_id`, `status`
- **posts** — `id`, `author_id`, `content` (max 280 chars), `image_url`, `view_count`, `is_blocked`, `wall_user_id`, `language_code`
- **post_images** — `id`, `post_id`, `image_url`, `display_order`
- **post_replies** — `id`, `post_id`, `author_id`, `content`, `parent_reply_id`
- **stories** — `id`, `user_id`, `media_url`, `media_type`, `caption`, `expires_at`, `view_count`
- **gifts/gift_transactions** — virtual gift system (costs shown in Nexa)
- **message_reactions** — emoji reactions on messages
- **blocked_users** — block/unblock users
- **notifications** — system notifications

### App Architecture

- **Auth**: Supabase Auth (email/password, Google OAuth, GitHub OAuth via WebBrowser + PKCE), AuthContext provider. App scheme `afuchat://` for OAuth deep links. OTP-based password reset (6-digit code, not link). Email confirmation required on registration (OTP verify). All auth emails sent from `noreply@afuchat.com` via Resend (edge function `send-password-reset` handles all email types with branded templates + AfuChat Technologies Ltd footer).
- **Navigation**: Expo Router with tabs (Chats, Contacts, Discover, Me)
- **Design**: AfuChat teal `#00C2CB` brand color, gold business badge `#D4A853`, Inter font family, dark/light theme, custom logo
- **Badge System**: `is_organization_verified=true` → gold badge (#D4A853) + "Verified Business" tag. `is_verified=true` (subscription) → teal badge (#00C2CB), no business tag. Applied across me.tsx, discover.tsx, contacts.tsx, contact/[id].tsx, post/[id].tsx, admin/index.tsx.
- **Cross-platform Alerts**: `lib/alert.ts` exports `showAlert()` — wraps `Alert.alert` on native, uses `window.confirm`/`window.prompt` on web. All screens use this instead of `Alert.alert` directly.
- **Account Switching**: `lib/accountStore.ts` stores multiple Supabase sessions using `expo-secure-store` (native) / AsyncStorage (web). AuthContext exposes `addAccount(email, password)`, `switchAccount(userId)`, `removeAccount(userId)`. Users add accounts with email+password and switch instantly without logging out.
- **Chat Attachments**: Messages support image, video, audio, file, and gif attachment types. Video uses `expo-av` Video component with native controls. Audio messages use expo-av playback.
- **Stories**: View screen has animated progress bars, auto-advance timer (5s for images, video duration for video stories), and hold-to-pause. Create screen supports both image and video preview.
- **Themes**: Dark theme uses pure `#000000` black. Light theme uses cream tones (`#FDF8F3` background). User can toggle via Appearance setting on Me tab (System/Dark/Light). ThemeContext with AsyncStorage persistence.
- **Push Notifications**: Expo Push Notifications via `expo-notifications` + `expo-device`. Token stored in `profiles.expo_push_token`. Edge function `send-push-notification` uses Expo Push API with JWT auth verification (caller must be authenticated). Notifications triggered client-side for: new messages, follows, post likes, post replies, red envelope claims. Badge cleared on app active + opening Notifications screen. Token cleared on sign-out.
- **Real-time**: Supabase Realtime subscriptions for incoming messages
- **State**: React Context (AuthContext, ThemeContext) + local component state
- **Premium**: Uses `user_subscriptions` table (NOT `profiles.is_premium`). Plans loaded from `subscription_plans` table. Payment via ACoin. AuthContext exposes `isPremium`, `subscription` fields.
- **Currency**: XP displayed as "Nexa" throughout. ACoin is premium currency. Nexa→ACoin conversion via `currency_settings` table rates/fees.

### Key Files

- `lib/supabase.ts` — Supabase client config
- `context/AuthContext.tsx` — Auth provider with profile + subscription loading. Premium status from `user_subscriptions` table.
- `context/ThemeContext.tsx` — Theme provider with explicit light/dark/system toggle, persisted to AsyncStorage
- `constants/colors.ts` — Brand colors + light/dark theme + gold badge color
- `hooks/useTheme.ts` — Theme hook (reads from ThemeContext, exposes `setThemeMode`)
- `components/ui/Avatar.tsx` — Avatar with initials fallback
- `components/ui/Separator.tsx` — List separator
- `app/(tabs)/index.tsx` — Chats list with stories bar
- `app/(tabs)/contacts.tsx` — Contacts (follows) list
- `app/(tabs)/discover.tsx` — Posts feed (tap to post detail)
- `app/(tabs)/me.tsx` — Profile & settings hub (nav to all feature screens, premium banner, golden badge)
- `app/chat/[id].tsx` — Chat with swipe-to-reply, reactions, typing indicators, read receipts, gift box UI, red envelopes, swipe-to-close bottom sheets
- `app/moments/create.tsx` — Create new post
- `app/profile/edit.tsx` — Edit profile
- `app/group/create.tsx` — Create group chat
- `app/contact/[id].tsx` — Contact profile with golden badge, country, join date, verification details, bio, follow/block/report, user posts feed
- `app/stories/create.tsx` — Create story (image + caption, 24h expiry)
- `app/stories/view.tsx` — View stories with progress dots and view tracking
- `app/post/[id].tsx` — Post detail with likes, replies, view count
- `app/notifications.tsx` — Notifications list with mark read
- `app/wallet/index.tsx` — Nexa/ACoin balance, send Nexa, Nexa→ACoin conversion (using currency_settings), filtered transaction history
- `app/gifts/index.tsx` — Gift shop, owned gifts, send gifts, pin favorites
- `app/red-envelope/[id].tsx` — Red envelope claim and status
- `app/games/index.tsx` — Game challenges and scores
- `app/mini-programs/index.tsx` — Mini programs discovery
- `app/ai/index.tsx` — AfuAi chat (powered by Lovable gateway via Supabase Edge Function `ai-chat`)
- `app/admin/index.tsx` — Admin Dashboard (admin-only, accessible from Me tab). Features: platform overview stats, user management (verify toggle, balance adjust), content moderation (block/delete posts), subscription plans view, currency settings, moderation reports. Only visible to users with `is_admin=true` in profiles.
- `app/my-posts/index.tsx` — Dedicated My Posts screen (user's own posts with delete)
- `app/premium.tsx` — Premium subscription with plans from `subscription_plans` table, ACoin payment, free features list, active subscription display
- `app/linked-accounts.tsx` — Account switching (add accounts with email+password, switch instantly, sessions stored via accountStore)
- `app/(auth)/login.tsx` — Login screen with email/password, Google/GitHub OAuth (WebBrowser auth session with PKCE), OTP-based forgot password (email → 6-digit code → new password in-app)
- `app/(auth)/register.tsx` — Register screen with terms/privacy checkbox (must agree before account creation)
- `app/settings/privacy.tsx` — Privacy settings (private account, online status, hide lists)
- `app/settings/notifications.tsx` — Notification preferences
- `app/settings/chat.tsx` — Chat preferences (theme, bubble, font, read receipts)
- `app/settings/blocked.tsx` — Blocked users management
- `lib/pushNotifications.ts` — Push notification registration, permission, badge, tap navigation, token management
- `lib/notifyUser.ts` — Notification trigger helpers (messages, follows, likes, replies, gifts) via authenticated Supabase Edge Function calls
- `components/PushNotificationManager.tsx` — Null component wired into root layout for notification setup

## Auth & Onboarding Flow

- **Registration**: Sign up page collects only email + password. After signup, user verifies email via 6-digit OTP code.
- **Onboarding**: After OTP verification, new users are routed to a 4-step onboarding flow (`/onboarding`):
  - Step 1: Display name + username (handle) — required
  - Step 2: Region, date of birth (DD/MM/YYYY), gender (male/female) — all required, must be 13+
  - Step 3: Interests selection — pick at least 3 from 18 options
  - Step 4: Profile summary review
- **Onboarding completion**: Profile is created with `onboarding_completed = true` on the `profiles` table. Existing users already have this set to `true`.
- **Routing logic** (`index.tsx`): If session exists but `profile.onboarding_completed` is false, redirects to onboarding. Otherwise goes to `(tabs)`.
- **New profile columns**: `gender` (text), `date_of_birth` (date), `region` (text), `interests` (text[]), `onboarding_completed` (boolean, default false).
- **Referral system**: No manual codes — referrals work via deep links only. `afuchat.com/username` (no @) = referral link. `afuchat.com/@username` (with @) = public profile. When someone opens a referral link and signs up, the referrer handle is stored via `AsyncStorage` and auto-applied during onboarding. Referrer gets +500 XP, referred user gets 1 week free Platinum premium.

## UI Conventions

- **Input styling**: All TextInput fields use `borderRadius: 0` (flat, no rounded box borders). Input containers have no `borderWidth` or `borderBottomWidth`. Search boxes, chat inputs, reply bars, form fields, modal inputs all follow this pattern.
- **Keyboard handling**: All screens with TextInputs are wrapped in `KeyboardAvoidingView` with `behavior="padding"` on iOS and `"height"` on Android.
- **Brand colors**: `#00C2CB` teal, `#D4A853` gold. Use `#0D0D0D` instead of `#000000` for visible UI.

## Supabase Edge Functions

- `send-push-notification` — Expo Push API for mobile push notifications (JWT auth, batch support, channel routing)
- `send-password-reset` — Custom email hook for ALL Supabase auth emails (recovery, signup, magic link, email change, reauthentication, invite). Sends via Resend from `noreply@afuchat.com` with branded templates + AfuChat Technologies Ltd footer. Deployed with `--no-verify-jwt` (uses webhook signature instead).
- `send-marketing-email` — Admin-only marketing/notification email system. Templates: welcome, inactive_reminder, new_feature, weekly_digest, special_offer, custom. Supports `toAll` or targeted `userIds`. Batched 50/batch with 1s delays. Paginated user fetching.
- `ai-chat` — AI assistant powered by Lovable gateway (Gemini 2.5 Flash)
- `generate-ai-image` — AI image generation

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
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health`; `src/routes/ai-chat.ts` exposes `POST /api/ai/chat` (proxies to Supabase Edge Function `ai-chat`)
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
