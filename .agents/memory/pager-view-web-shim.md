---
name: react-native-pager-view web shim
description: pager-view@8.0.2 imports RN internals on web, crashing Metro bundler; requires a web shim.
---

## Rule
Add `lib/pager-view-web-shim.js` and map `react-native-pager-view` to it on web in `metro.config.js` `resolveRequest`.

**Why:** `react-native-pager-view@8.0.2` imports `react-native/Libraries/Utilities/codegenNativeCommands` which chains through React Native renderer internals. Metro fails with "Importing react-native internals is not supported on web". The error manifests as a cascade ending in `ReactDevToolsSettingsManager` not found.

**How to apply:** In metro.config.js `resolveRequest`, when `platform === "web"` and `moduleName === "react-native-pager-view"`, return `lib/pager-view-web-shim.js`. The shim exports a simple View-based PagerView component. This pattern is the same as the existing reanimated, worklets, and track-player web shims in that file.
