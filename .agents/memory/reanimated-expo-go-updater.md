---
name: Expo Go Reanimated updater mismatch
description: Expo Go can pair a different native Reanimated runtime with the bundled JS runtime, causing styleUpdater to receive an updater object.
---

Use the Worklets Babel plugin with Reanimated 4, and keep shared loading UI independent of Reanimated. Lazy Reanimated entry points should detect Expo Go/store-client execution and use their plain fallbacks instead of calling native animated styles.

**Why:** Expo Go's native module version can differ from the app's bundled Reanimated 4 + Worklets pair. The mismatch surfaces as `updater is not a function (it is Object)` inside `styleUpdater`, often from a component that mounts during startup.

**How to apply:** For app-owned standalone builds, retain Reanimated animations. For Expo Go, guard lazy `require("react-native-reanimated")` calls with `expo-constants` ownership/environment checks and fall back to React Native `Animated` or static styles.