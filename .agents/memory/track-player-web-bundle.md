---
name: Track Player web bundle shim
description: react-native-track-player 4.1.x pulls an optional Shaka browser module into Metro web bundles
---

`react-native-track-player` can make Metro's web resolver traverse its browser entry and fail on the optional `shaka-player` dependency, even when runtime code guards the player behind `Platform.OS !== "web"`. Keep Track Player lazy on native and resolve it to a no-op web shim in `metro.config.js`.

**Why:** A root layout import causes Metro to statically inspect reachable `require()` targets; the runtime platform guard alone does not prevent web bundle resolution.

**How to apply:** Preserve the native `NativeModules.TrackPlayerModule` guard and the web resolver shim whenever Track Player is imported by a module reachable from the root layout.

Metro can also invoke the resolver with a null platform while it walks a
CommonJS `require` from the web entrypoint. Match the null-platform case and
Track Player subpaths in the resolver; matching only the literal `"web"` case
can still allow the Shaka import to be traversed.