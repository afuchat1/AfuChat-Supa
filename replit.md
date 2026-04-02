# Overview

This project is a pnpm workspace monorepo utilizing TypeScript to develop AfuChat, a WeChat-style chat super app. AfuChat aims to provide a comprehensive communication and lifestyle platform, connecting users through chat, social features, and integrated services. The platform is designed for cross-platform compatibility, running on mobile (iOS/Android), web, and desktop.

Key capabilities include:
- Real-time chat and social networking features (posts, stories, follows).
- Advanced AI integrations for chat, image generation, and intelligent features.
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
- **Backend**: Express 5 API server, PostgreSQL with Drizzle ORM, Supabase for authentication and real-time.
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
- **Responsive Design**: Utilizes `useWindowDimensions()` and custom `useResponsive()` hooks for dynamic layouts across web, mobile, and desktop.
- **UI Components**: Reusable components for avatars, verified badges, skeletons, offline banners, and swipeable bottom sheets.
- **Input Styling**: Consistent rounded `borderRadius: 12` for all input fields.

**Technical Implementations:**
- **Authentication**: Supabase Auth with email/password, Google/GitHub OAuth, OTP-based password reset, email confirmation. Supports multi-account switching.
- **Navigation**: Expo Router with tab-based navigation and deep linking support. Tabs: AfuChat, Discover, Apps, Me. Post creation via FAB on discover page.
- **Post Visibility**: Posts have `public`, `followers`, `private` visibility. Discover feed shows posts based on visibility. Search only returns public posts.
- **Offline Support**: Offline-first architecture with `AsyncStorage` caching, message queuing, and auto-sync on reconnect. Includes network status banners.
- **Real-time**: Supabase Realtime for chat, notifications, presence, and discover feed updates (likes, comments, views, follows, new posts). Twitter/X-style "New posts" pill for feed updates.
- **Notifications**: Expo Push Notifications with custom sound, token management, and authenticated edge function triggers.
- **Media Handling**: Centralized media upload utility to Supabase Storage.
- **AI Features**: Multi-provider AI assistant and image generation with cascading fallbacks via Supabase Edge Functions. Includes rich markdown rendering and actionable responses.
- **Monetization**: `ACoin` and `Nexa` (XP) in-app currencies, dynamic gift pricing, subscription plans, and in-app purchases.
- **Gamification**: XP rewards for user activities with cooldowns.
- **Account Management**: Soft-delete with a 30-day grace period, followed by permanent purge.
- **SEO & Deep Linking**: API server routes for public profiles and posts with SEO-friendly short IDs, `sitemap.xml`, `robots.txt`, and app link configurations.
- **Chat UX**: Telegram/WhatsApp/Signal patterns for voice messages, 60fps animations, scroll-to-bottom FAB with unread count, message spacing, date separators, empty chat state, and read receipts.
- **Story Camera**: Full-screen camera for story posting with Photo/Video modes, flash, camera flip, and gallery picker.
- **Story Privacy**: Privacy levels (`everyone`, `close_friends`, `only_me`) enforced by RLS and client-side filtering.
- **Story Comments**: `story_replies` table with text input at bottom of story viewer. Comments pause story timer while composing. RLS: anyone can read, authenticated users can insert/delete own.
- **Real-time Stories**: StoriesBar subscribes to Supabase Realtime INSERT events on `stories` table. New story rings appear immediately without refresh.
- **Articles & Videos (post_type system)**: Posts table supports `post`, `article`, `video` types. Article creation with title, body, audience, word count. Video creation with `expo-image-picker`, `expo-av` preview, upload to Supabase storage. Detail screens for articles and TikTok-style full-screen video player with inline autoplay.
- **Distinctive Article Cards**: Articles render with a unique card design across discover feed, profile pages, and search results. Features: cover image, badge with read time estimate, bold title, excerpt, branded "Read article" CTA button. Visually distinct from regular posts.
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