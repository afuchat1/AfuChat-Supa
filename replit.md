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
- **Responsive Design**: Utilizes `useWindowDimensions()` and custom `useResponsive()` hooks for dynamic layouts across web, mobile, and desktop, avoiding static `Dimensions.get('window')`.
- **UI Components**: Reusable components for avatars, verified badges, skeletons, offline banners, and swipeable bottom sheets.
- **Input Styling**: Consistent rounded `borderRadius: 12` for all input fields.

**Technical Implementations:**
- **Authentication**: Supabase Auth with email/password, Google/GitHub OAuth, OTP-based password reset, email confirmation. Supports multi-account switching via `expo-secure-store`/`AsyncStorage`.
- **Navigation**: Expo Router with tab-based navigation and deep linking support. Tabs: AfuChat (chats, auth-gated), Discover (feed), Apps (with built-in search for people/posts/apps), Me (profile, auth-gated). Post creation via FAB on discover page.
- **Post Visibility**: Posts have a `visibility` column (`public`, `followers`, `private`, default `public`). Create screen saves the audience selection to DB. Discover feed "For You" shows only public posts; "Following" shows public + followers posts. Search only returns public posts. Profile pages show public + followers posts. My Posts page shows all with visibility badges. Post detail page includes visibility field.
- **Offline Support**: Offline-first architecture with `AsyncStorage` caching for critical data, message queuing, and auto-sync on reconnect. Includes network status banners.
- **Real-time**: Supabase Realtime for chat, notifications, and presence.
- **Notifications**: Expo Push Notifications with custom sound, token management, and authenticated edge function triggers.
- **Media Handling**: Centralized media upload utility to Supabase Storage buckets for various content types.
- **AI Features**: Multi-provider AI assistant and image generation with cascading fallbacks via Supabase Edge Functions. Includes rich markdown rendering, actionable responses, and executable actions.
- **Monetization**: `ACoin` and `Nexa` (XP) in-app currencies. Dynamic gift pricing, subscription plans, and in-app purchases for services.
- **Gamification**: XP rewards for user activities, tracked via DB functions with cooldowns.
- **Account Management**: Soft-delete with a 30-day grace period, followed by permanent purge via an authenticated API endpoint.
- **SEO & Deep Linking**: API server routes for public profiles and posts with SEO-friendly short IDs, `sitemap.xml`, `robots.txt`, and app link configurations.
- **Chat UX (Telegram/WhatsApp/Signal patterns)**:
  - Swipe-to-record voice messages with direction-locked gestures (Telegram pattern: 10pt deadzone, horizontal=cancel at -120px, vertical=lock at -100px).
  - 60fps native-thread animations via `react-native-reanimated` + `react-native-gesture-handler` (Gesture.Pan, useSharedValue, withSpring).
  - Scroll-to-bottom FAB with unread message count badge (uses ref to avoid stale closures in realtime subscriptions).
  - Telegram-style message spacing: 2px same-sender, 8px different-sender for visual grouping.
  - Date separator pills with subtle background and shadow.
  - Empty chat state with icon + prompt text.
  - Read receipt checkmarks: single (sent), double (delivered), blue double (read).
- **Story Camera**: Full-screen camera screen (`app/stories/camera.tsx`) for story posting with Photo/Video modes, flash toggle, front/back camera flip, and gallery picker. Camera FAB on chats tab navigates to camera, which pushes to story create screen after capture. Uses `expo-camera` CameraView with mic permission gating for video recording.
- **Story Privacy**: Privacy levels (Everyone/Close Friends/Only Me) stored in a `privacy` column on the `stories` table (values: `everyone`, `close_friends`, `only_me`, default `everyone`). RLS policy enforces server-side filtering (only `everyone` stories or own stories visible). Client-side filtering also applied in story listing and viewer for defense in depth.
- **Cross-Platform Adaptations**: Platform-specific guards for features like push notifications, haptics, blur effects, keyboard handling, and camera access.
- **Premium Tiering**: Features gated by subscription tiers (Silver, Gold) using `LockedToggle`/`LockedLink` components, accessible via the `app/advanced-features.tsx` screen.
- **Onboarding**: A forced 5-step onboarding flow for new users covering display name, handle, country, phone number, date of birth, gender, interests, and profile photo.
- **Referral System**: Deep link-based referral system for user acquisition, applying referrer handles during onboarding.

# External Dependencies

- **Supabase**: Primary backend for database (PostgreSQL), authentication, real-time, and storage. Uses an existing Supabase project.
- **Drizzle ORM**: PostgreSQL ORM integrated via `@workspace/db`.
- **Express 5**: API framework for the `api-server`.
- **Expo**: Framework for building universal React applications (mobile, web, desktop).
  - `expo-router`: File-system based router.
  - `expo-secure-store`: Secure key-value storage for native platforms.
  - `expo-image-picker`: Access to device's image library.
  - `expo-av`: Audio and video playback.
  - `expo-notifications`: Push notifications.
  - `expo-device`: Device information.
  - `expo-location`: Geolocation services.
- **Zod**: Schema declaration and validation library.
- **Orval**: OpenAPI code generator.
- **React Query**: Data fetching and caching library for React.
- **pnpm**: Monorepo package manager.
- **esbuild**: Fast JavaScript bundler.
- **Resend**: Email API for transactional and marketing emails (used by Supabase Edge Functions for auth emails).
- **GROQ API**: AI chat features (optional, via API key).
- **Pesapal**: Payment gateway for Nexa/ACoin top-ups (M-Pesa, Visa, Mastercard).
- **NetInfo**: React Native community library for network connectivity status.
- **React Native Share API**: For sharing content from the app.
- **`react-native-view-shot`**: Capturing post content as images.
- **AI Providers (via Supabase Edge Functions)**:
  - Gemini 2.5 Flash
  - Lovable AI
  - DeepSeek
  - GPT-4o Mini
  - AIML API
  - DALL-E 3
  - Runware
  - AIML Flux
  - Freepik AI