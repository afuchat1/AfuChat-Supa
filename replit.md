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
│   ├── mobile/             # AfuChat Expo React Native + Web app
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

- **profiles** — `id`, `handle`, `display_name`, `avatar_url`, `bio`, `xp` (Nexa), `acoin`, `current_grade`, `is_verified`, `is_organization_verified`, `is_admin`, `country`, `website_url`, `phone_number`, `banner_url`, `language`, `tipping_enabled`, `last_seen` (timestamptz), `show_online_status`, etc. NOTE: No `is_premium` field — premium status comes from `user_subscriptions`.
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
- **gifts** — `id`, `name`, `emoji`, `base_xp_cost`, `rarity`, `description`, `image_url`, `season`, `available_from`, `available_until`. Virtual gift catalog. No `acoin_price` column — dynamic price computed at runtime.
- **gift_statistics** — `id`, `gift_id` (unique), `total_sent`, `price_multiplier` (default 1.00, +0.01 per send, cap 3.0), `last_sale_price`, `last_updated`. Realtime-enabled. Dynamic price = `MAX(base_xp_cost × price_multiplier, last_sale_price)`. `last_sale_price` reflects actual last transaction price (can go up or down). `useGiftPrices` hook (`hooks/useGiftPrices.ts`) subscribes to Supabase Realtime changes on this table for instant price updates everywhere.
- **gift_transactions** — `gift_id`, `sender_id`, `receiver_id`, `xp_cost`, `message`. Records gift sends. Uses Nexa (XP) for payment via `send_gift` RPC.
- **user_gifts** — `id`, `user_id`, `gift_id`, `is_pinned`, `acquired_at`, `transaction_id`. User's gift gallery/collection.
- **gift_marketplace** — `id`, `seller_id`, `user_gift_id`, `gift_id`, `asking_price`, `status` (listed/sold/cancelled), `buyer_id`, `listed_at`, `sold_at`. Rare/Epic/Legendary gifts only. 5% marketplace fee on sales.
- **message_reactions** — emoji reactions on messages
- **blocked_users** — block/unblock users
- **notifications** — system notifications

### App Architecture

- **Auth**: Supabase Auth (email/password, Google OAuth, GitHub OAuth via WebBrowser + PKCE), AuthContext provider. App scheme `afuchat://` for OAuth deep links. OTP-based password reset (6-digit code, not link). Email confirmation required on registration (OTP verify). All auth emails sent from `noreply@afuchat.com` via Resend (edge function `send-password-reset` handles all email types with branded templates + AfuChat Technologies Ltd footer).
- **Navigation**: Expo Router with tabs (Chats, Contacts, Discover, Me)
- **Design**: AfuChat teal `#00C2CB` brand color, gold business badge `#D4A853`, Inter font family, dark/light theme, branded afu-symbol logo used for app icon, splash screen (teal background), favicon, and notification icon
- **Badge System**: `is_organization_verified=true` → gold badge (#D4A853) + "Verified Business" tag. `is_verified=true` (subscription) → teal badge (#00C2CB), no business tag. Applied across me.tsx, discover.tsx, contacts.tsx, contact/[id].tsx, post/[id].tsx, admin/index.tsx.
- **Cross-platform Alerts**: `lib/alert.ts` exports `showAlert()` — Android uses native `Alert.alert()` for Material Design dialogs; iOS/web use `IOSAlert` custom modal registered in `_layout.tsx` via event listener pattern (`registerAlertListener`/`unregisterAlertListener`). Web fallback uses `window.confirm`/`window.prompt` if listener not registered. All screens use `showAlert()` instead of `Alert.alert` directly.
- **Account Switching**: `lib/accountStore.ts` stores multiple Supabase sessions using `expo-secure-store` (native) / AsyncStorage (web). AuthContext exposes `addAccount(email, password)`, `switchAccount(userId)`, `removeAccount(userId)`. Users add accounts with email+password and switch instantly without logging out.
- **Chat Attachments**: Messages support image, video, audio, file, and gif attachment types. Video uses `expo-av` Video component with native controls. Audio messages use expo-av playback.
- **Stories**: View screen has animated progress bars, auto-advance timer (5s for images, video duration for video stories), and hold-to-pause. Create screen supports both image and video preview.
- **Themes**: Dark theme uses pure `#000000` black. Light theme uses cream tones (`#FDF8F3` background). User can toggle via Appearance setting on Me tab (System/Dark/Light). ThemeContext with AsyncStorage persistence.
- **Account Deletion**: Soft-delete with 30-day grace period. `profiles.scheduled_deletion_at` set to now+30d on delete request. User is signed out. On next login, if scheduled_deletion_at is set, user is prompted to restore or proceed with deletion. After 30 days, `POST /api/account-purge` (requires `ACCOUNT_PURGE_SECRET`) permanently removes all user data (moments, messages, follows, contacts, stories, transactions, subscriptions, notifications) and deletes the Supabase auth user. `profiles.account_deleted` boolean marks fully purged accounts.
- **Push Notifications**: Expo Push Notifications via `expo-notifications` + `expo-device`. Token stored in `profiles.expo_push_token`. Edge function `send-push-notification` uses Expo Push API with JWT auth verification (caller must be authenticated). Notifications triggered client-side for: new messages, follows, post likes, post replies, red envelope claims. Badge cleared on app active + opening Notifications screen. Token cleared on sign-out. Custom notification sound (`assets/sounds/notification.wav`) used across all channels (default, messages, social).
- **Offline Support**: Full offline-first architecture. `lib/offlineStore.ts` caches profile, conversations, contacts, moments, notifications, and per-chat messages to AsyncStorage. `lib/offlineSync.ts` queues messages when offline (shown with clock icon) and auto-syncs on reconnect via `onConnectivityChange`. On reconnect, also calls `reconnectRealtime()` (disconnects + reconnects Supabase Realtime) and fires `addOnlineListener()` callbacks so screens refresh immediately. `OfflineBanner` component (red "No internet" / green "Back online") shown on all tabs, chat screen, and notifications. AuthContext re-fetches profile on reconnect. Home tab calls `loadChats()` on reconnect. Supabase client has `persistSession: true` so users stay logged in offline.
- **Real-time**: Supabase Realtime for: chat messages (per-chat channel), typing indicators, notification inserts (notifications screen + home tab badge), new chat member inserts (home tab), per-chat message inserts (home tab conversation list). All channels reconnect automatically via `offlineSync.reconnectRealtime()` when coming back online.
- **State**: React Context (AuthContext, ThemeContext) + local component state
- **Premium**: Uses `user_subscriptions` table (NOT `profiles.is_premium`). Plans loaded from `subscription_plans` table. Payment via ACoin. AuthContext exposes `isPremium`, `subscription` fields.
- **Currency**: XP displayed as "Nexa" throughout. ACoin is premium currency. Nexa→ACoin conversion via `currency_settings` table rates/fees. Red envelopes and gifts use ACoins (DB functions `create_red_envelope`, `claim_red_envelope`, `deduct_acoin`, `credit_acoin` are SECURITY DEFINER and operate on `profiles.acoin`).
- **Activity Rewards (Nexa/XP)**: Users earn Nexa for nearly every activity via `reward_activity_xp` DB function (SECURITY DEFINER) with cooldown-based spam prevention. Tracked in `activity_rewards` table. Helper: `lib/rewardXp.ts`. Reward amounts: profile completion 1000, referral 2000, daily login 20, post 50, reply 20, like 5, follow 10, message 2, story create 30, story view 3, gift sent 25, group/channel create 50, red envelope sent 30, red envelope claimed 10.

### Key Files

- `lib/supabase.ts` — Supabase client config
- `context/AuthContext.tsx` — Auth provider with profile + subscription loading. Premium status from `user_subscriptions` table.
- `context/ThemeContext.tsx` — Theme provider with explicit light/dark/system toggle, persisted to AsyncStorage
- `constants/colors.ts` — Brand colors + light/dark theme + gold badge color
- `hooks/useTheme.ts` — Theme hook (reads from ThemeContext, exposes `setThemeMode`)
- `components/ui/Avatar.tsx` — Avatar with initials fallback
- `components/ui/Separator.tsx` — List separator
- `components/ui/VerifiedBadge.tsx` — Shared verified badge (gold for business, teal for personal)
- `components/ui/Skeleton.tsx` — Animated skeleton loading placeholders (ChatRowSkeleton, ContactRowSkeleton, PostSkeleton, ProfileSkeleton, NotificationSkeleton, GiftCardSkeleton, WalletSkeleton, PostDetailSkeleton, ListRowSkeleton, GameCardSkeleton, PremiumSkeleton, AdminSkeleton, ReferralSkeleton, MarketplaceCardSkeleton, ChatLoadingSkeleton, ChatBubbleSkeleton)
- `components/ui/OfflineBanner.tsx` — Network status banner (red offline / green reconnected) with animated fade
- `lib/offlineStore.ts` — AsyncStorage-based caching for profile, conversations, contacts, moments, notifications, messages; pending message queue; NetInfo connectivity tracking
- `lib/offlineSync.ts` — Auto-sync pending messages on reconnect
- `app/(tabs)/index.tsx` — Chats list with stories bar
- `app/(tabs)/contacts.tsx` — Contacts (follows) list
- `app/(tabs)/discover.tsx` — Posts feed (tap to post detail)
- `app/(tabs)/me.tsx` — Profile & settings hub (nav to all feature screens, premium banner, golden badge)
- `app/chat/[id].tsx` — Chat with WhatsApp-style SVG bubble tails, long-press reaction picker, typing indicators, read receipts (blue double-check), gift box UI, red envelopes, offline message queue, cached messages, file uploads via FileSystem.uploadAsync (native) / fetch→blob (web), date headers, network status indicator
- `app/moments/create.tsx` — Create new post
- `app/profile/edit.tsx` — Edit profile
- `app/group/create.tsx` — Create group chat
- `app/contact/[id].tsx` — Contact profile with golden badge, country, join date, verification details, bio, follow/block/report, user posts feed, SEO Head (OG tags)
- `app/stories/create.tsx` — Create story (image + caption, 24h expiry)
- `app/stories/view.tsx` — View stories with progress dots and view tracking
- `app/post/[id].tsx` — Post detail with likes, replies, view count, SEO Head (OG tags for sharing)
- `app/notifications.tsx` — Notifications list with mark read
- `app/wallet/index.tsx` — Nexa/ACoin balance, send Nexa, Nexa→ACoin conversion (using currency_settings), filtered transaction history, Buy Nexa / Buy ACoin buttons
- `app/wallet/topup.tsx` — Top up Nexa or ACoin via Pesapal (M-Pesa, Visa, Mastercard). Supports both currency types with dedicated packages and custom amounts.
- `app/gifts/index.tsx` — User's owned gifts gallery (no shop tab). Convert gifts to ACoin (5.99% hidden fee), send gifts to friends, pin/unpin via long press. Listed marketplace gifts hidden from gallery. Double-listing prevented. Marketplace listing check before send/convert.
- `app/gifts/marketplace.tsx` — Gift marketplace for rare/epic/legendary gifts. Atomic buy flow with full rollback on failure. 5% marketplace fee. Seller ownership verified on transfer. Skeleton loading.
- `app/red-envelope/[id].tsx` — Red envelope claim and status
- `app/games/index.tsx` — Game challenges and scores
- `app/mini-programs/index.tsx` — Mini programs discovery
- `app/ai/index.tsx` — AfuAi chat with full user context (balance, stats, gifts, premium status), animated thinking dots indicator, actionable navigation buttons from AI responses (allowlisted routes only), platform-aware system prompt. Powered by Supabase Edge Function `ai-chat`.
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
- `lib/pushNotifications.ts` — Push notification registration, permission, badge, tap navigation, token management. Web-safe: conditionally loads `expo-notifications` and `expo-device` only on native platforms via `require()` behind `Platform.OS !== 'web'` guard to prevent crashes in Expo web/Go.
- `lib/notifyUser.ts` — Notification trigger helpers (messages, follows, likes, replies, gifts) via authenticated Supabase Edge Function calls
- `lib/share.ts` — Share utility (sharePost, shareProfile, shareStory, shareRedEnvelope) using React Native Share API. Generates afuchat.com deep links. Used across discover feed, post detail, my-posts, contact profile, stories, and red envelopes.
- `components/PushNotificationManager.tsx` — Null component wired into root layout for notification setup

## Web & Desktop Deployment (Vercel)

The AfuChat app is cross-platform — same codebase runs on mobile (iOS/Android via Expo), web (afuchat.com), and desktop (desktop.afuchat.com).

### Web Build
- `npx expo export --platform web --output-dir dist` — builds static web assets to `dist/`
- `vercel.json` — Vercel deployment config with SPA rewrites and cache headers
- `app/+html.tsx` — Custom HTML document with meta tags, SEO, PWA support, and responsive desktop styles
- `public/manifest.json` — PWA manifest for installable web app
- `public/logo.png` — App icon for PWA
- Web output uses `output: "single"` mode (SPA with client-side routing)

### Platform Guards
- Push notifications: Only register on native (`Platform.OS !== 'web'`)
- Haptics: Safe-fail on web
- SF Symbols: Falls back to Ionicons on web
- Blur effects: Falls back to solid colors on web
- Keyboard handling: `KeyboardAwareScrollViewCompat` switches to standard `ScrollView` on web
- Offline detection: Uses `navigator.onLine` + `window.addEventListener` on web, NetInfo on native
- Alerts: Web fallback uses `window.alert`/`window.confirm`/`window.prompt`

## Auth & Onboarding Flow

- **Registration**: Sign up page collects only email + password. After signup, user verifies email via 6-digit OTP code.
- **Onboarding**: After OTP verification, new users are routed to a 5-step onboarding flow (`/onboarding`):
  - Step 1: Display name + username (handle) — required
  - Step 2: Country (auto-detected via GPS/reverse geocoding using expo-location, with full searchable picker fallback for 130+ countries with flags and dial codes) + phone number (validated against country-specific digit length) — required
  - Step 3: Date of birth (scrollable day/month/year dropdown selectors) + gender (male/female) — all required, must be 13+
  - Step 4: Interests selection — pick at least 3 from 18 options
  - Step 5: Profile photo upload (via expo-image-picker, uploaded to Supabase Storage `avatars` bucket) + profile summary review
- **Onboarding completion**: Profile is created with `onboarding_completed = true` on the `profiles` table. Existing users already have this set to `true`.
- **Onboarding enforcement**: Both `index.tsx` and `(tabs)/_layout.tsx` check `profile.onboarding_completed` — redirects to `/onboarding` if false. Users cannot access the app without completing onboarding.
- **Routing logic** (`index.tsx`): If session exists but `profile.onboarding_completed` is false, redirects to onboarding. Otherwise goes to `(tabs)`.
- **Profile columns**: `gender` (text), `date_of_birth` (date), `country` (text), `phone_number` (text), `interests` (text[]), `onboarding_completed` (boolean, default false).
- **Country data**: `constants/countries.ts` exports `COUNTRIES` array with name, code, dial code, flag emoji, and valid phone digit lengths for each country.
- **Edit Profile**: `profile/edit.tsx` supports real avatar upload via expo-image-picker + Supabase Storage. Change Photo button opens gallery, selected image uploaded on save.
- **Referral system**: No manual codes — referrals work via deep links and web routes. `afuchat.com/username` (no @) = referral link → stores referrer handle and redirects to signup. `afuchat.com/@username` (with @) = public profile → looks up user by handle and shows their contact profile. Both patterns handled by `app/[handle].tsx` dynamic route (works on web and via native deep links). Referrer handle stored via `AsyncStorage` and auto-applied during onboarding. Referrer gets +500 XP, referred user gets 1 week free Platinum premium.

## UI Conventions

- **Input styling**: All TextInput fields/containers use `borderRadius: 12` (rounded corners). No `borderWidth` or `borderBottomWidth` on input containers. Search boxes, chat inputs, reply bars, form fields, modal inputs all follow this pattern.
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
