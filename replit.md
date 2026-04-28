# Overview

This project is a pnpm workspace monorepo utilizing TypeScript to develop AfuChat, a WeChat-style chat super app. AfuChat aims to provide a comprehensive communication and lifestyle platform, connecting users through chat, social features, and integrated services. The platform targets mobile (iOS/Android) with mobile-web parity; on web, a flat Replit-style desktop shell (sidebar + main area, with centered modal panels for compose/edit routes) wraps the same screens at viewport widths ≥ 1024 px and the bottom tab bar is hidden — see `components/desktop/DesktopShell.tsx` and `components/desktop/DesktopSidebar.tsx`. On desktop, the brand color is teal `#00BCD4` (gold accent `#D4A853`) and fonts fall back to the OS system stack (`app/+html.tsx` overrides custom fonts at ≥ 1024 px via the `[data-font="system"]` selector that `DesktopShell.tsx` applies). Camera-only screens (`app/wallet/scan.tsx`, `app/stories/camera.tsx`, `app/admin/id-scanner.tsx`) render `components/desktop/DesktopCameraFallback.tsx` (a QR code + step list) instead of webcam access on desktop. Voice and video calls are now real on web AND mobile: `lib/callSignaling.ts` binds the browser-native `RTCPeerConnection`/`mediaDevices` when running on web (`isCallSupported()` helper) and `app/call/[id].tsx` renders local/remote `MediaStream`s through `components/call/WebVideoStream.tsx` (a `<video srcObject>` wrapper) on web while keeping `RTCView` on native. The call screen also exposes an in-call chat panel (`components/call/CallChatPanel.tsx`): a Chat button in the controls toggles a side panel (right-slide on desktop, bottom-slide on mobile) that uses its own Supabase realtime broadcast channel `call_chat:<callId>` so participants can text each other without leaving the call. Bottom sheets show as proper centered modals on desktop: `components/SwipeableBottomSheet.tsx` detects `useIsDesktop()` and renders a centered, scaled-in modal card (with overlay + drop shadow) instead of a bottom sheet at viewport widths ≥ 1024 px — every existing usage (wallet send/convert, gifts, marketplace, match) automatically inherits the desktop modal style.

Key capabilities include (latest: Telegram Mini App support):
- Real-time chat and social networking features (posts, stories, follows) with end-to-end encrypted direct messaging.
- Advanced AI integrations for chat, image generation, and intelligent features (AfuAi cannot access private messages).
- Clickable followers/following lists with privacy enforcement (`hide_followers_list`/`hide_following_list` settings respected).
- In-app wallet with custom currencies (Nexa/ACoin) for virtual goods, gifts, and services.
- Gamified user experience with XP rewards and in-app games.
- A marketplace for unique digital gifts.
- Extensive mini-programs for daily-life services like bill payments, airtime, and data bundles.
- A robust administrative dashboard for user and content management.

The project leverages an existing Supabase backend for data persistence and authentication, focusing on delivering a rich, interactive, and secure user experience.

# User Preferences

I prefer clear and concise information.
I appreciate detailed explanations for complex features.
I want an iterative development approach with regular updates.
Please ask for my confirmation before making significant architectural changes or implementing major new features.
Do not make changes to files in the `lib/` directory without explicit approval.
Do not make changes to the existing Supabase schema unless absolutely necessary and after thorough discussion.
Prioritize performance and user experience in all development tasks.
Ensure all new features are thoroughly tested across all supported platforms (web, iOS, Android).

# System Architecture

The project is structured as a pnpm monorepo using TypeScript, with distinct packages for deployable applications and shared libraries.

**Core Technologies:**
- **Monorepo Tool**: pnpm workspaces
- **Backend**: Express 5 API server (`artifacts/api-server`), Supabase for all data persistence, authentication, real-time, and Edge Functions. The Replit PostgreSQL database is provisioned but not used — all data lives in Supabase.
- **Frontend**: Expo React Native for mobile and web, targeting a unified codebase.
- **Validation**: Zod for API request and response validation.
- **API Codegen**: Orval from OpenAPI specification for generating API clients and Zod schemas.
- **Build**: esbuild for API server, Expo Metro bundler for mobile/web.

**Application Structure:**
- `artifacts/`: Contains deployable applications (`api-server`, `mobile`, `mockup-sandbox`).
- `lib/`: Houses shared libraries like `api-spec`, `api-client-react`, `api-zod`, and `db`.
- `scripts/`: Utility scripts.

**UI/UX and Design:**
- **Branding**: AfuChat blue-green (`#00BCD4`) and gold (`#D4A853`).
- **Typography**: Inter font family.
- **Theming**: Dark/light theme support (dark uses Google-style warm greys, light uses cream tones), persisted via `AsyncStorage`.
- **App Accent Color**: User-selectable accent color via `AppAccentContext` (AsyncStorage key `app_color_theme`). Six options: Teal (#00BCD4, default), Blue (#2196F3), Purple (#9C27B0), Rose (#E91E63), Amber (#FF9800), Emerald (#4CAF50). The `useTheme()` hook returns `accent` and overrides `colors.accent/tint/tabIconSelected/online/unread`. Color picker is in the Me tab under Appearance. Static StyleSheet references use `Colors.brand` (the constant default teal); dynamic theming is applied via inline styles.
- **Liquid Glass UI**: `GlassView` component (`components/ui/GlassView.tsx`) uses `BlurView` on iOS (intensity 72+), semi-transparent fallback on Android/web. Applied to `SwipeableBottomSheet`, video `CommentsSheet` modal, and the `ProductTour` tooltip.
- **Responsive Design**: Utilizes `useWindowDimensions()` and custom `useResponsive()` hooks for dynamic layouts on phone/tablet form factors.
- **UI Components**: Reusable components for avatars, verified badges, skeletons, offline banners, and swipeable bottom sheets.
- **Input Styling**: Consistent rounded `borderRadius: 12` for all input fields.

**Technical Implementations:**
- **Authentication**: Supabase Auth with email/password, Google/GitHub OAuth, OTP-based password reset, email confirmation. Supports multi-account switching.
- **Navigation**: Expo Router with tab-based navigation and deep linking support. Tabs: AfuChat, Discover, Apps, Me. Post creation via FAB on discover page.
- **Post Visibility**: Posts have `public`, `followers`, `private` visibility. Discover feed shows posts based on visibility. Search only returns public posts.
- **Offline Support**: Offline-first architecture with `AsyncStorage` caching, message queuing, and auto-sync on reconnect. Includes network status banners.
- **Real-time**: Supabase Realtime for chat, notifications, presence, and discover feed updates (likes, comments, views, follows, new posts). Twitter/X-style "New posts" pill for feed updates.
- **Notifications**: Expo Push Notifications with custom sound, token management, and authenticated edge function triggers.
- **Media Handling**: Centralized media upload utility to **Cloudflare R2** (single bucket `afuchat-media`, served via the `cdn.afuchat.com` custom domain). The mobile client requests a presigned PUT URL from the API server (`POST /api/uploads/sign`), then uploads directly to R2. Logical bucket names (avatars, post-images, videos, stories, group-avatars, chat-media, voice-messages, shop-media, match-photos, banners) are preserved as key prefixes inside the R2 bucket, so URLs are stable across the migration. See `artifacts/api-server/src/lib/r2.ts`, `artifacts/api-server/src/routes/uploads.ts`, and `artifacts/mobile/lib/mediaUpload.ts`. The migration script for moving historical Supabase Storage objects + rewriting DB URLs lives at `scripts/migrate-storage.mjs` (`pnpm --filter @workspace/scripts migrate-storage`). Per-user usage and quota are exposed at `GET /api/uploads/usage` (5 GB default quota, broken down by logical bucket) — `getStorageUsage()` and `formatBytes()` helpers in `lib/mediaUpload.ts` consume it. R2 lifecycle rules (abort-multipart-7d, expire-stories-30d, expire-ephemeral-chat-media-30d) are applied via `pnpm --filter @workspace/scripts setup-r2-lifecycle`.
- **Server Configuration / Secrets**: Runtime settings live in Supabase, not in the deploy environment. The table `public.app_settings (key, value)` is created by `supabase/migrations/20260428_app_settings.sql` with RLS enabled and only `service_role` granted access. On boot, `artifacts/api-server/src/lib/bootstrap.ts` queries this table with the service-role key and merges the rows into `process.env` (env wins on conflict). The only env var the API server needs in production is `SUPABASE_SERVICE_ROLE_KEY`; the public Supabase URL is hard-coded in `artifacts/api-server/src/lib/constants.ts`. `pnpm --filter @workspace/scripts push-secrets-to-supabase` UPSERTs the R2 keys (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL, R2_DEV_PUBLIC_URL, R2_S3_ENDPOINT) from the local environment into Supabase. If Supabase is unreachable at boot, bootstrap logs a warning and the server falls back to whatever is already in `process.env`.
- **AI Features**: Advanced AI assistant (AfuAi) powered by Groq Llama-3.3-70b via Supabase Edge Functions. Features: chat history persistence (ai_conversations/ai_messages tables), history browser with search/pin/delete, full platform intelligence (pulls user posts, channels, events, marketplace, followers, bookmarks, transactions), 15 executable actions (send_nexa, send_acoin, follow, unfollow, subscribe, cancel_subscription, convert_nexa, create_post, bookmark_post, delete_post, update_bio, update_status, search_users, buy_gift, send_message), auto-conversation-titling, rich markdown rendering, action buttons, suggestion chips, invoices/receipts, and confirmation cards. System prompt includes comprehensive AfuChat encyclopedia with all platform features.
- **Monetization**: `ACoin` and `Nexa` (XP) in-app currencies, dynamic gift pricing, subscription plans, and in-app purchases.
- **Freelance Marketplace**: Professional freelance service marketplace (`app/freelance.tsx`) with: browse/search/filter by category & sort, service detail modals with reviews, ACoin payment integration via `transferAcoin`, full order workflow (pending→in_progress→delivered→revision→completed/cancelled), seller dashboard with earnings stats, create/edit listings with tags & requirements, buyer review system with star ratings, and listing management (pause/activate/delete). DB tables: `freelance_listings`, `freelance_orders`, `freelance_reviews` on Supabase.
- **Gamification**: XP rewards for user activities with cooldowns.
- **Account Management**: Soft-delete with a 30-day grace period, followed by permanent purge.
- **SEO & Deep Linking**: API server routes for public profiles and posts with SEO-friendly short IDs, `sitemap.xml`, `robots.txt`, and app link configurations.
- **Chat UX**: Telegram/WhatsApp/Signal patterns for voice messages, 60fps animations, scroll-to-bottom FAB with unread count, message spacing, date separators, empty chat state, and read receipts.
- **Chat Preferences**: `ChatPreferencesContext` (`context/ChatPreferencesContext.tsx`) provides live chat customisation — theme color (bubble color via `CHAT_THEME_COLORS`), bubble border radius (via `BUBBLE_RADIUS`), font size, typing indicators, and read receipts. Persisted to Supabase `chat_preferences` table. Provider added to root `_layout.tsx` inside `LanguageProvider`. Chat screen (`app/chat/[id].tsx`) consumes the context: message bubble color, border radius, and font size applied dynamically; typing indicator broadcasting and read receipt marking each gated by their respective preference toggles.
- **Story Viewer (Web-enabled)**: Full story viewing experience now works on web — image/video stories with progress bar, tap left/right navigation, comment input, viewer list (owner), and share. Previously blocked by a web guard; the guard has been removed since all components (`Video`, `Image`, `Animated`, `TouchableOpacity`) are web-compatible.
- **Story Camera**: Full-screen camera for story posting with Photo/Video modes, flash, camera flip, and gallery picker.
- **Story Privacy**: Privacy levels (`everyone`, `close_friends`, `only_me`) enforced by RLS and client-side filtering.
- **Story Comments**: `story_replies` table with text input at bottom of story viewer. Comments pause story timer while composing. RLS: anyone can read, authenticated users can insert/delete own.
- **Real-time Stories**: StoriesBar subscribes to Supabase Realtime INSERT events on `stories` table. New story rings appear immediately without refresh.
- **Articles & Videos (post_type system)**: Posts table supports `post`, `article`, `video` types. Article creation with title, body, audience, word count. Video creation with `expo-image-picker`, `expo-av` preview, upload to Supabase storage. Detail screens for articles and TikTok-style full-screen video player with inline autoplay.
- **Distinctive Article Cards**: Articles render with a unique card design across discover feed, profile pages, and search results. Features: cover image, badge with read time estimate, bold title, excerpt, branded "Read article" CTA button. Visually distinct from regular posts.
- **Article Detail Page**: Magazine-style layout with optional cover image + gradient overlay, article badge + read time, large title, italic subtitle (short summary), author section with date, full `article_body` content (not truncated `content`), stats row, rounded action bar (Like/Comment/Share), threaded comments. Share button in header.
- **Feed Performance & Offline**: Per-tab in-memory cache, `AsyncStorage` persistence with TTL, background fetching for silent refreshes, and auto-refresh on reconnect.
- **Adaptive Feed Algorithm**: Records user interaction weights per category to learn interests and rank posts accordingly.
- **Threaded Replies (Video Comments)**: Recursive threaded replies with indentation, "Reply" button, and `@handle` banner.
- **Music Marquee (Video Player)**: Displays audio name at the bottom of the video player.
- **Video Web Not Supported**: Video features are app-only; web shows "Videos are only available in the app" message.
- **Unique Per-User Video Views**: Views recorded in `post_views` table with unique constraint per user.
- **Cross-Platform Adaptations**: Platform-specific guards for various features.
- **Premium Tiering**: Features gated by subscription tiers (Silver, Gold) using `LockedToggle`/`LockedLink` components.
- **Onboarding**: A forced 5-step onboarding flow for new users.
- **Referral System**: Deep link-based referral system for user acquisition.

# External Dependencies

- **Supabase**: Primary backend for database (PostgreSQL), authentication, real-time, and storage.
- **Drizzle ORM**: PostgreSQL ORM.
- **Express 5**: API framework.
- **Expo**: Universal React framework.
  - `expo-router`
  - `expo-secure-store`
  - `expo-image-picker`
  - `expo-av`
  - `expo-notifications`
  - `expo-device`
  - `expo-location`
- **Zod**: Schema declaration and validation.
- **Orval**: OpenAPI code generator.
- **React Query**: Data fetching and caching.
- **pnpm**: Monorepo package manager.
- **esbuild**: JavaScript bundler.
- **Resend**: Email API for transactional emails.
- **GROQ API**: AI chat features.
- **Pesapal**: Payment gateway for Nexa/ACoin top-ups.
- **NetInfo**: Network connectivity status.
- **React Native Share API**: Content sharing.
- **`react-native-view-shot`**: Capturing post content.
- **AI Providers (via Supabase Edge Functions)**: Gemini 2.5 Flash, Lovable AI, DeepSeek, GPT-4o Mini, AIML API, DALL-E 3, Runware, AIML Flux, Freepik AI.

## Tier System

Tiers: `free → silver → gold → platinum`. Managed by `hooks/useTier.ts` (`hasTier(tier)` utility reads `useAuth().subscription.plan_tier`).

Gate component: `components/ui/PremiumGate.tsx` — wraps screen content, shows full-screen lock with upgrade CTA when tier is insufficient.

Applied gates:
- **Group create** (`app/group/create.tsx`) — Gold required
- **Channel create** (`app/channel/create.tsx`) — Platinum required
- **Story create** (`app/stories/create.tsx`) — Gold required
- **Monetize** (`app/monetize.tsx`) — Silver required
- **AfuAI chat tap** (`app/(tabs)/index.tsx`) — Platinum intercept, routes to `/premium`

## Desktop UI Removal

All desktop-specific UI was removed to shrink the APK and lighten the codebase. The app now ships a single mobile layout that also serves on web.

Removed:
- `components/DesktopWrapper.tsx`, `components/DesktopSidebar.tsx`, `components/DesktopRightPanel.tsx`, `components/DesktopChatView.tsx`, `components/DesktopPostView.tsx`
- Entire `components/desktop/` folder (Apps/AI/Match/Settings/Contacts/Discover sections + `ui.tsx`)
- `components/ui/DesktopAuthCard.tsx`
- `context/DesktopDetailContext.tsx`, `hooks/useIsDesktop.ts`

Simplified:
- `app/_layout.tsx` no longer wraps the tree in a desktop shell
- `app/+html.tsx` uses a single body background (no desktop media query)
- All `isDesktop` branches collapsed to mobile in `app/(tabs)/{_layout,index,discover,search}.tsx`, `app/collections.tsx`, `app/wallet/index.tsx`, `app/(auth)/{login,register}.tsx`, `app/chat/[id].tsx`
- `components/SwipeableBottomSheet.tsx` and `components/gifts/GiftPickerSheet.tsx` are mobile-only (no side-docked desktop variants)

## Post Thumbnail Detection

All surfaces now pick the best available thumbnail using priority: `post_images[0]` → `image_url` → null.

- `contact/[id].tsx`: Video posts now render `image_url` behind the play-button overlay (previously showed a blank dark background).
- `post/[id].tsx`: Query now fetches `article_title`; article posts render a bold title above the body text in the detail view.

## Offline Improvements

- `lib/offlineStore.ts` — added `cacheWallet` / `getCachedWallet` (key `offline_wallet`)
- `app/wallet/index.tsx` — loads cached transactions when offline; caches on successful load; shows `OfflineBanner`
- `app/group/create.tsx`, `app/channel/create.tsx`, `app/stories/create.tsx`, `app/monetize.tsx` — `isOnline()` guard before any mutation
## Post Detail Page Redesign

`app/post/[id].tsx` — Full visual overhaul (all logic preserved):
- **Article hero**: 280px full-bleed image with `LinearGradient` overlay; article title + badge displayed on top of the gradient for a magazine-style look
- **Reading time**: Calculated from word count (`Math.ceil(words/200)`) shown in the badge row
- **Author byline**: Full-width bordered row (avatar + name + date + view count) separating hero from body
- **Image grid**: Smart `ImageGrid` component — 1 image full-width, 2 images side-by-side, 3-4 in a 2×2 tile grid with "+N" overflow badge
- **Engagement bar**: 4-column bar (Like · Replies · Views · Share) with `hairlineWidth` dividers; like count turns red when liked
- **Reply section header**: Centered divider with a badge showing reply count
- **Reply composer**: Shows user's own avatar; character counter appears at 200+ chars; turns red below 20 remaining
- **Reply card**: Nested replies get a colored left-border depth indicator; replies render in a rounded bubble
- **Context menu**: Menu items use icon badge circles (color-coded per action)

## First-Login Welcome Guide

`components/ui/WelcomeGuide.tsx` — New full-screen overlay shown once per account after first login:
- 6 swipeable slides: Welcome · Chat · Discover · AfuAI · Wallet · Community
- Each slide: `LinearGradient` background, large icon circle, title, subtitle, 3 feature bullet points
- Smooth spring entrance animation (scale + translateY)
- Top-right **Skip** button dismisses immediately
- Dot page indicators (active dot wider)
- **Next** → **Get Started** CTA button at bottom
- Stored in `AsyncStorage` key `afu_welcome_guide_v1_seen` — shown exactly once
- Wired in `(tabs)/_layout.tsx` after `onboarding_completed === true`, shows user's first name on slide 1

## Hybrid Video Pipeline (H.264 + AV1)

Async, DB-backed encoding queue producing adaptive renditions (360p/720p/1080p) in
both H.264 (universal compatibility) and AV1 (smaller files for capable devices).
HLS/DASH not implemented yet — architecture leaves the hooks open.

**Schema** (`supabase/migrations/20260427_video_pipeline.sql`, must be applied on Supabase):
- `video_assets` — one row per source upload (status: pending/encoding/ready/failed, poster_path)
- `video_renditions` — one row per (asset, codec, height) output
- `video_jobs` — work queue, claimed atomically via `claim_video_job(worker_id, codecs[])` (FOR UPDATE SKIP LOCKED)
- `posts.video_asset_id` FK for fast manifest lookup at playback
- DB trigger flips `video_assets.status='ready'` once the H.264 baseline (≥720p) lands
- RLS: public select, service-role-only writes

**API server** (`artifacts/api-server/`):
- `lib/supabaseAdmin.ts` — singleton service-role client (graceful no-op when key missing)
- `lib/ffmpeg.ts` — typed spawn helpers, encoder ladder builder (libx264 + libsvtav1)
- `lib/videoStorage.ts` — Cloudflare R2 I/O for the `videos` logical bucket (keys are `videos/<path>` inside the `afuchat-media` R2 bucket)
- `routes/videos.ts` — `POST /api/videos`, `GET /api/videos/:id`, `GET /api/videos/:id/manifest`,
  `GET /api/videos/by-post/:postId/manifest`. Manifest sources are codec-priority sorted
  (H.264=10, AV1=50; 720<1080<360 height boost).
- `services/videoEncoder.ts` — background worker started from `index.ts`. Boots only
  when `SUPABASE_SERVICE_ROLE_KEY` is set AND ffmpeg/libx264 are present. Claims jobs,
  encodes, uploads to `{owner}/encoded/{asset}/{codec}_{h}p.mp4`, extracts a 1-second
  poster frame, retries with backoff, skips upscale jobs.

**Mobile** (`artifacts/mobile/`):
- `lib/videoApi.ts` — `registerVideoAsset`, `getPostVideoManifest`, `getAssetVideoManifest`,
  `pickBestSource`, `isAv1Supported` (uses `MediaSource.isTypeSupported` on web; AV1
  disabled on native because expo-av support is inconsistent).
- `hooks/useResolvedVideoSource.ts` — picks the best ready rendition for a post and
  polls every 8s (up to ~64s) so freshly uploaded posts swap to the optimized rendition
  without a refresh. Falls back to the original `video_url` until renditions are ready.
- `app/moments/create-video.tsx` — calls `registerVideoAsset` after the post insert
  (non-blocking — encoder failures never break posting).
- `components/VideoFeed.tsx` and `app/video/[id].tsx` — both wired through the resolver
  hook; the existing `videoCache` layer still applies for the source URL fallback.

**Operational requirements** (must be done by the user):
1. Apply `supabase/migrations/20260427_video_pipeline.sql` on the Supabase project
   (cannot be applied locally — depends on the `auth` schema).
2. The `videos` Storage bucket must allow service-role writes under
   `{userId}/encoded/{asset}/...` (existing upload code already uses `{userId}/...`).

## Secrets Policy (IMPORTANT)

**`SUPABASE_SERVICE_ROLE_KEY` MUST live only in Supabase Edge Function secrets** —
never in Replit env vars, never in `.env`, never anywhere outside Supabase.

Consequences on the Replit-hosted Express API server (`artifacts/api-server`):
- `getSupabaseAdmin()` returns `null` → all admin-scoped routes degrade gracefully
  (videos pipeline, account purge, admin endpoints, support endpoints,
  realtime email watcher, etc.).
- The video encoder worker stays disabled and `POST /api/videos` returns 503.
  Videos still play via the original uploaded source URL — only the
  re-encoding-to-multi-rendition optimization is skipped.

If admin-scoped functionality is ever needed beyond what Supabase Edge Functions
already provide, port the route into a new Edge Function under
`supabase/functions/<name>/` rather than adding the service-role key here.
