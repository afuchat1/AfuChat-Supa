---
name: SDK 55 New Arch migration
description: What changed when migrating from SDK 54 (old arch) to SDK 55 (new arch mandatory, RN 0.83).
---

## The rule
SDK 55 runs exclusively on New Architecture (RN 0.83). `newArchEnabled: false` is ignored — remove it to avoid confusion. Do NOT add old-arch compatibility code.

**Why:** The legacy architecture was frozen in June 2025. SDK 55 / RN 0.82+ removed the option to disable New Arch entirely.

**How to apply:** When working on this project, assume New Architecture is always on. Never add `if (Platform.OS === "android" && __DEV__) return null` guards around Reanimated — Reanimated 4.x + worklets work correctly in both Expo Go and production on New Arch.

## Package versions (SDK 55)
- `expo`: ~55.0.26
- `react-native`: 0.83.6
- `expo-router`: ~55.0.16  (versioning aligned with SDK, no more 6.x numbering)
- `react-native-reanimated`: 4.2.1 (New Arch native, requires worklets peer dep)
- `react-native-worklets`: >=0.7.0 required (Reanimated 4.2.1 peerDep); 0.7.4 installed ✅
- `react-native-mmkv`: ^4.3.1 (Nitro, replaces v3 JSI approach)
- All `expo-*` packages: ~55.0.x range

## What was removed
- `"newArchEnabled": false` from `app.json`
- MMKV Old Arch patch from `postinstall.sh` (MmkvPlatformContextModule.java no longer exists in v4)
- `if (Platform.OS === "android" && __DEV__) return null` lines from 3 files: `chat/[id].tsx`, `ImageViewer.tsx`, `VideoFeed.tsx`
- `new MMKV({id})` constructor → replaced with `createMMKV({id})`

## What was kept
- RNTP null-safety postinstall patch (Arguments.fromBundle nullable issue persists in RN 0.83)
- Lazy IIFE Reanimated wrapper (still useful as error isolation in Expo Go)
- Web shim for Reanimated + worklets in metro.config.js (web platform still needs the mock)
