---
name: Stable Old-Arch APK stack for Expo SDK 54
description: The confirmed working native package set for building a stable Android APK without pre-splash crashes on real devices.
---

## The problem
React Native New Architecture (newArchEnabled: true) caused instant pre-splash crashes on real Android devices for this app, even though Expo Go worked fine. The crash was native-level (before any JS runs), caused by JSI/TurboModule initialization of specific packages.

## Why Reanimated 4 forces New Arch
`react-native-reanimated >=4.0.0` requires `react-native-worklets` as a peer dep. worklets uses New Architecture's JSI initialization path — if `newArchEnabled: false`, the Gradle build **fails** with `EAS_BUILD_UNKNOWN_GRADLE_ERROR`.

## Why MMKV 4 forces New Arch
`react-native-mmkv >=4.0.0` uses `react-native-nitro-modules` as its engine. Nitro Modules only supports New Architecture. With `newArchEnabled: false`, the Gradle build fails.

## Stable stack (confirmed buildable with newArchEnabled: false)
- `newArchEnabled: false` in app.json
- `react-native-reanimated: ~3.19.5` (Old Arch compatible, all standard APIs intact)
- `react-native-mmkv: ~3.3.3` (direct JSI, lazy init, no Nitro)
- No `react-native-worklets` (only for Reanimated 4)
- No `react-native-nitro-modules` (only for MMKV 4)

**Why:** MMKV 3.x uses JSI lazily (only when first called from JS), so it cannot crash at app boot time. Reanimated 3.x bundles its own worklet runtime and supports old arch.

**How to apply:** When upgrading either package in the future, verify the major version. MMKV 4+ and Reanimated 4+ both lock you to New Arch. If any real-device crash occurs before splash, revert to these versions.

## API compatibility
- All `react-native-reanimated` APIs used in the app (`makeMutable`, `useSharedValue`, `useAnimatedStyle`, `withTiming`, `withSpring`, `FadeIn`, etc.) are present in 3.x.
- `react-native-mmkv` 3.x API is identical to 4.x for basic usage (`new MMKV({ id })`, `.set()`, `.getString()`, etc.).
- Babel plugin `react-native-reanimated/plugin` works for both 3.x and 4.x.

## EAS build command
```
cd artifacts/mobile && EXPO_TOKEN=<token> EAS_NO_VCS=1 ./node_modules/.bin/eas build --profile preview --platform android --non-interactive
```
`EAS_NO_VCS=1` is required because the main agent cannot run git commands. It bypasses git archive but still respects `.easignore` (which excludes node_modules).
