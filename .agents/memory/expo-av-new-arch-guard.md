---
name: expo-av NativeModules.ExponentAV absent in New Architecture production builds
description: The old NativeModules.ExponentAV guard silently disables all audio in Expo SDK 55 production builds; use Platform.OS check instead.
---

# expo-av: NativeModules.ExponentAV guard breaks audio in New Architecture production

## The rule
Never gate expo-av loading on `NativeModules.ExponentAV`. Use `Platform.OS !== "web"` instead.

**Why:** In Expo SDK 55 with New Architecture enabled (which all production AAB builds use), expo-av registers its native module through TurboModules/JSI — NOT through the legacy NativeModules bridge. So `NativeModules.ExponentAV` is `undefined` even when expo-av is fully installed and working. Any guard like `if (_NM.ExponentAV) Audio = require("expo-av").Audio` returns null and silently disables all audio features app-wide.

**How to apply:** Replace every instance of this pattern:
```javascript
// BROKEN — NativeModules.ExponentAV is null in New Arch production
const { NativeModules: _NM } = require("react-native");
if (_NM.ExponentAV) Audio = require("expo-av").Audio;
```
With:
```javascript
// CORRECT — Platform check works on all build types
import { Platform } from "react-native";
if (Platform.OS !== "web") {
  try { Audio = require("expo-av").Audio; } catch {}
}
```

For module-level `_AV` constants (e.g. in callEngine.ts):
```javascript
// CORRECT
const _AV = (() => {
  if (Platform.OS === "web") return null;
  try { return require("expo-av"); } catch { return null; }
})();
```

## Files fixed
- `lib/callEngine.ts` — `_AV` module constant
- `lib/micPermission.ts` — getMicPermissionState
- `components/AudioPlayer.tsx` — Audio singleton
- `components/chat/VideoTrimmerModal.tsx` — `_AV` module constant
- `components/ui/VideoCommentsSheet.tsx` — Audio singleton
- `app/chat/[id].tsx` — Audio singleton (voice recording)
- `app/post/[id].tsx` — Audio singleton (voice replies)
