---
name: Nitro TurboRegistry false-positive crash
description: Using TurboModuleRegistry.get("NitroModules") to gate MMKV initialization causes instant Android crash on release builds.
---

## The Rule
Only use `global.NitroModulesProxy !== undefined` to detect Nitro readiness.
Never use `TurboModuleRegistry.get("NitroModules")` as a Nitro availability signal.
Never access MMKV at module-evaluation time — defer to `useEffect`.

**Why:**
`TurboModuleRegistry.get("NitroModules")` returns the Java-side TurboModule proxy as soon as the native package is registered — which happens during `MainApplication.onCreate()`, before any JS has run. This gives a false-positive: the Java wrapper exists, but Nitro's C++ shared library (`libNitroModules.so`) has NOT been loaded yet.

If MMKV sees this false-positive and calls `require("react-native-mmkv")`, MMKV's internal code triggers Nitro's first-time `.so` load (`System.loadLibrary("NitroModules")` via `JNIOnLoad.initializeNativeNitro()`). This happens inside the module-evaluation phase, before the TurboModule error-handling infrastructure is ready. If the load fails for any reason (or if the timing causes a race), the exception propagates as an unrecoverable native crash — the Android "App has stopped" dialog appears before any UI renders.

The only reliable signal that Nitro is FULLY initialised (Java + C++ + proxy installed) is `global.NitroModulesProxy` being set. Nitro's JS module sets this AFTER `install()` completes successfully.

**How to apply:**
- `isNitroAvailable()` in `lib/storage/mmkv.ts` must check only `global.NitroModulesProxy`.
- `getStore()` must NOT cache the web/memory store when `isNitroAvailable()` is false — return a throwaway instance so the next caller (inside a React component) can retry after Nitro initialises.
- Any code that calls `getCachedUserId()` or any other MMKV accessor at module-eval time (e.g., top-level `if` blocks in `_layout.tsx`) must be moved into `useEffect` hooks. Module-eval runs before the React engine has warmed up Nitro.
- `enableProguardInReleaseBuilds` is already `false` in `app.json` — ProGuard stripping is NOT the issue.
