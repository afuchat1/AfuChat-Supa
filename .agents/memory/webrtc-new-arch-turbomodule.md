---
name: WebRTC New Architecture TurboModule injection
description: react-native-webrtc v124 throws at module-eval when NativeModules.WebRTCModule is null (New Arch production). Fix is to inject from TurboModuleRegistry before requiring the package. Also: don't permanently cache null from early probes.
---

## The Problem

`react-native-webrtc@124` does this at module-eval time in `src/index.ts` (Metro's resolved entry via the `react-native` package.json field):

```js
const { WebRTCModule } = NativeModules;
if (WebRTCModule === null) {
  throw new Error(`WebRTC native module not found...`);
}
```

In New Architecture production builds (RN 0.73+), `NativeModules.WebRTCModule` is `null` — TurboModules don't auto-register in the legacy NativeModules bridge. The throw is caught by our outer `try/catch`, setting `WEBRTC_AVAILABLE = false`. Every call tap then throws `"WEBRTC_UNAVAILABLE"` which is swallowed by CallContext as `"Could not start call"`.

**Why:** react-native-webrtc v124 does not inject itself into NativeModules in New Architecture. All internal `WebRTCModule.xxx` method calls also rely on the same captured reference.

## The Fix (Part 1 — module injection)

In `lib/callEngine.ts`, before `require("react-native-webrtc")`:

1. Import `TurboModuleRegistry` from `react-native`
2. If `NativeModules.WebRTCModule == null`, call `TurboModuleRegistry.get("WebRTCModule")`
3. If TurboModuleRegistry has it, inject it into `NativeModules.WebRTCModule`
4. Then `require("react-native-webrtc")` (the library now sees the injected module)

## The Fix (Part 2 — null caching bug)

`CallContext` calls `getWebRTCAvailable()` in a `useEffect` at mount. On production New Arch builds, TurboModules may not be fully registered yet at mount time — `_detectRTC()` returns null. The old `_getRTC()` cached this null permanently (`undefined` → `null`, never re-detected), so every subsequent `startCall` threw `WEBRTC_UNAVAILABLE`.

**Fix in `_getRTC()`:** Only permanently cache SUCCESS. Track `_rtcNullCount` — after 3 consecutive null detections, permanently cache null (this handles Expo Go). On production, the mount-time probe may fail but the real call-time probe (500ms+ later) succeeds.

**Fix in `CallContext`:** Delay the mount-time probe by 500ms:
```javascript
useEffect(() => {
  const t = setTimeout(() => setWebrtcAvailable(getWebRTCAvailable()), 500);
  return () => clearTimeout(t);
}, []);
```

**How to apply:** Both fixes must stay in sync. If `_getRTC()` logic changes, ensure null is never permanently cached on the first attempt.

## ProGuard — also required

Even with the TurboModuleRegistry injection, ProGuard/R8 in full-mode strips
`com.oney.WebRTCModule.*` (the Java bridge) because nothing references it from
Java outside the RN module registry (which uses reflection). Without an explicit
keep rule, `TurboModuleRegistry.get("WebRTCModule")` returns null even in
production release builds.

**Fix in proguard-rules.pro:**
```
-keep class com.oney.WebRTCModule.** { *; }
-dontwarn com.oney.WebRTCModule.**
```

Both the TurboModuleRegistry injection (in callEngine.ts) AND this ProGuard rule
are required for voice calls to work in production AAB builds.

## Expo Go Behavior

In Expo Go, `TurboModuleRegistry.get("WebRTCModule")` also returns null (the module isn't bundled in Expo Go). With the null-count guard, after 3 attempts `_rtcBridge` is permanently null — calls are gracefully disabled.
