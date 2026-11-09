---
name: MMKV web localStorage shim
description: On web MMKV falls back to in-memory (lost on page refresh); fix uses localStorage with prefix.
---

# MMKV web localStorage shim

**Rule:** On web, `react-native-mmkv` throws at require time, causing `getStore()` to silently fall back to `createMemoryStore()` — all MMKV data (userId, profile, preferences) is lost on every page refresh.

**Fix:** `lib/storage/mmkv.ts` — added `createLocalStorageStore()` which wraps `localStorage` with a `"mmkv_"` prefix. In `getStore()`, `Platform.OS === "web"` is now detected first and routes to the localStorage store.

**Also fixed:** `storage.getAllKeys()` was not exposed on the `storage` export object. Added it — required by `wipeAllLocalData` to snapshot `perm_status_*` keys.

**expo-camera v55 note:** `requestCameraPermissionsAsync` / `getMicrophonePermissionsAsync` etc. are static methods on `Camera` class in expo-camera 55, not top-level exports. Access via `Camera.requestCameraPermissionsAsync()` or use `as any` fallback chain.

**Why:** Any screen or hook that reads MMKV on web after a page refresh got `undefined` — user appeared logged-out and preferences/drafts were gone.

**How to apply:** Never assume MMKV data persists on web in the same process — use the localStorage-backed store. The fix is in place; no extra work needed for new MMKV reads/writes.
