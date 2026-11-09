---
name: WebRTC lazy initialization
description: Why WEBRTC_AVAILABLE was always false in production and how it was fixed
---

# WebRTC Lazy Init Fix

## The rule
`getWebRTCAvailable()` must be called AFTER the component mounts — never at module-eval time. `callEngine.ts` is imported very early (3rd import in `_layout.tsx`) before the React Native TurboModuleRegistry is fully initialized.

**Why:** `TurboModuleRegistry.get("WebRTCModule")` returns `null` at module-eval time even when the native module IS present in the build, because the bridge isn't ready yet. This set `WEBRTC_AVAILABLE = false` permanently → "Could not start call" on every tap.

**How to apply:**
- `_getRTC()` in callEngine.ts is lazy: computed on first call (first startCall/acceptCall), not at import time
- `WEBRTC_AVAILABLE` constant is gone; replaced by `getWebRTCAvailable()` function
- `CallContext` calls `getWebRTCAvailable()` inside a `useEffect` on mount and stores result in `webrtcAvailable` state
- This guarantees the TurboModuleRegistry lookup runs after app startup is complete

## Also fixed
- `requestMicPermission()` used to return `"denied"` when expo-av failed to load → MicPermissionModal always blocked calls. Now falls back to `PermissionsAndroid` (Android) or `"prompt"` (iOS) so the call engine's getUserMedia handles permission natively.
