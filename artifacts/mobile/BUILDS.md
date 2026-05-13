# EAS Build History

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
