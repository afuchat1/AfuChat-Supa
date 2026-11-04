---
name: Android module compatibility
description: The user's Android support requirement for app modules and device-specific crash investigation.
---

App modules should work on Android 14 and earlier across phone brands. Request camera and microphone access when a user enters the feature that needs them; use the system picker for one-off photo/video selection instead of requiring full-library access.

In this Expo SDK 58 project, Expo autolinking includes `react-native-webrtc`. Manually adding `WebRTCModulePackage()` to `MainApplication` duplicates the package list and risks a native startup failure.

**Why:** the user asked for cross-brand compatibility; the WebRTC duplicate was found in the generated Android startup path.

**How to apply:** keep Expo and native dependencies aligned with the lockfile, preserve the user's selected-media choice, verify `expo-modules-autolinking react-native-config --platform android --json` before manually registering ReactPackages, and use crash reports plus physical-device testing before claiming device-specific compatibility.
