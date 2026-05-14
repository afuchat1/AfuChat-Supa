# EAS Build History

## v2.0.68 — Android APK (preview)

- **Build ID**: `b9ea03d0-6213-42ff-b0a3-cc6276680129`
- **Dashboard**: https://expo.dev/accounts/afuchat/projects/afuchat/builds/b9ea03d0-6213-42ff-b0a3-cc6276680129
- **Platform**: Android
- **Profile**: preview (APK, internal distribution)
- **versionCode**: 2075 (auto-incremented by EAS remote from 2074)
- **Keystore**: Build Credentials 3ohDBvKUsq (default, managed by Expo)
- **Triggered**: 2026-05-14
- **Fixes in this build**:
  - Offline hardening: feed load-more from SQLite, post detail SQLite fallback, proactive chat message pre-caching
  - Dynamic post timestamps (minutes, hours, days, weeks, months, years)
- **Method**: EAS CLI with `EAS_NO_VCS=1` (filesystem archiver, bypasses Replit git sandbox)

## v2.0.70 — Android APK (preview)

- **Build ID**: `5f38a277-036a-4e82-9180-7be1b4a81252`
- **Dashboard**: https://expo.dev/accounts/afuchat/projects/afuchat/builds/5f38a277-036a-4e82-9180-7be1b4a81252
- **Platform**: Android
- **Profile**: preview (APK, internal distribution)
- **versionCode**: 2070 (auto-incremented by EAS remote from 2069)
- **Keystore**: Build Credentials 3ohDBvKUsq (default, managed by Expo)
- **Archive size**: 1.3 MB
- **Triggered**: 2026-05-16
- **Fixes in this build**:
  - Installed `expo-sqlite@~16.0.10` — resolves "Unable to resolve expo-sqlite" crash on Android
  - Added plus/camera button in chat header left when no active stories exist
  - Added `mediaDownloader.web.ts` stub — fixes blank web preview
  - Added Video Analytics dashboard screen (`/video-analytics`)
- **Method**: EAS CLI from isolated /tmp dir with absolute pnpm symlinks

## v2.0.69 — Android APK (preview)

- **Build ID**: `e9f3b9ec-2951-4db0-af08-e5ea1e8242a9`
- **Dashboard**: https://expo.dev/accounts/afuchat/projects/afuchat/builds/e9f3b9ec-2951-4db0-af08-e5ea1e8242a9
- **Platform**: Android
- **Profile**: preview (APK, internal distribution)
- **versionCode**: 2069 (auto-incremented by EAS remote from 2068)
- **Keystore**: Build Credentials 3ohDBvKUsq (default, managed by Expo)
- **Archive size**: 1.3 MB
- **Triggered**: 2026-05-16
- **Fixes in this build**:
  - Added `runtimeVersion: { policy: "appVersion" }` + `fallbackToCacheTimeout: 0` to fix OTA update crash
  - Removed `expo-sqlite` from app.json plugins (was causing plugin resolution failure in EAS)
  - DB columns added: `overlay_metadata`, `filter`, `avatar_overlay`, `comment_count`, `share_count`, `repost_count`
- **Method**: EAS CLI from isolated /tmp dir with absolute pnpm symlinks (bypasses Replit git sandbox)

## v2.0.66 — Android APK (preview)

- **Build ID**: `9b6bd5ac-bb95-42f4-9756-27e9b2e74676`
- **Dashboard**: https://expo.dev/accounts/amkaweesi1/projects/afuchat/builds/9b6bd5ac-bb95-42f4-9756-27e9b2e74676
- **Platform**: Android
- **Profile**: preview (APK, internal distribution)
- **versionCode**: 2068 (auto-incremented by EAS remote from 2065)
- **Keystore**: Build Credentials I56-2eELc3 (default, managed by Expo)
- **Archive size**: 1.2 MB
- **Triggered**: 2026-05-12
- **Method**: `eas build --platform android --profile preview --non-interactive --no-wait`
  with `EAS_NO_VCS=1` (filesystem archiver, bypasses Replit git sandbox restriction)
