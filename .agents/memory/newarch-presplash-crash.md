---
name: New Arch pre-splash crash
description: newArchEnabled:true causes JSI modules (worklets/mmkv/nitro) to crash before JS runs in standalone APK
---

# New Architecture causes pre-splash crash on standalone APK

## The rule
**Set `newArchEnabled: false` in app.json** for any AfuChat standalone APK build until all JSI/TurboModule native deps are proven stable on New Arch.

**Why:**
With `newArchEnabled: true`, React Native initializes all JSI modules (react-native-worklets, react-native-nitro-modules, react-native-mmkv) via TurboModule JNI **before** the Hermes JS bundle executes. If any of these JNI `nativeInstall()` calls fail (version mismatch, missing .so, bad initialization order), the app crashes **before the splash screen ever shows**. The crash is invisible to JS error handlers.

In Expo Go these modules are ABSENT (Expo Go has its own worklet/mmkv runtime), so the crash never appears there — making it a standalone-only crash that is very hard to attribute.

With `newArchEnabled: false`, JSI modules initialize lazily on first JS call. The app boots and shows the splash screen. If a module crashes, it happens in JS context where error boundaries and try/catch can handle it.

**How to apply:**
- Any time the APK crashes before the splash screen appears on a real device but works in Expo Go → first try `newArchEnabled: false`
- Do NOT re-enable New Arch without testing ALL of: react-native-worklets, react-native-mmkv, react-native-nitro-modules, react-native-track-player on the target RN + Expo SDK version combination

## EAS account / token mapping (Jun 2026)
- Token `DMMpaEjJw_...` → `afuchat` account, project `784a87ad-e3d1-438c-9c84-1b336f4fd2d2`
- Token `9p8fBftcc...` → `afume` account, project `363a3c64-5a90-4aae-86b5-aa54014921ef`
- Current app.json/eas.json uses `afume` / `363a3c64` — use token `9p8fBftcc...` for builds.
- Always verify owner + projectId match the token account before submitting a build.

## EAS build from main agent
Main agent cannot run `eas build` normally because EAS CLI uses `git archive` which is a blocked git operation.
Workaround: set `EAS_NO_VCS=1` env var — this makes EAS pack files directly without git, bypassing the restriction.
