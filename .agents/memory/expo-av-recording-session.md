---
name: expo-av recording session setup
description: What causes "Could not start recording" and the correct pattern for all recording screens.
---

## Rule
Every screen that records audio MUST call `Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })` BEFORE calling `Audio.Recording.createAsync()`. Skipping it causes "Could not start recording" on both iOS and Android because the OS still has the session in playback mode.

After recording ends (stop OR cancel), restore the session with `Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false })` so video audio and sound effects work normally again.

## API to use
Always use the single-step API:
```js
const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
```
The old three-step sequence (`new Audio.Recording()` → `prepareToRecordAsync` → `startAsync`) is more fragile and deprecated in newer expo-av.

## Lazy import pattern (required for web)
All files that use `Audio` must use the lazy require pattern (static import crashes on web):
```js
let Audio: typeof import("expo-av").Audio | null = null;
if (Platform.OS !== "web") {
  try { Audio = require("expo-av").Audio; } catch {} 
}
```
Then null-guard every call site: `if (!Audio) return;` at the top of recording functions.

**Why:** expo-av throws "Cannot find native module 'ExponentAV'" on web with a static import. The lazy require pattern is safe on native and a no-op on web.

**How to apply:** chat/[id].tsx, post/[id].tsx, VideoCommentsSheet.tsx, AudioPlayer.tsx all use this pattern. Any new file that imports Audio must follow it.
