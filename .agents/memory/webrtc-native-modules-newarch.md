---
name: WebRTC NativeModules guard in New Arch
description: NativeModules.WebRTCModule is null in New Arch production builds — same trap as ExponentAV; use try-require + constructor check instead.
---

# WebRTC NativeModules guard — New Architecture

## Rule
Never gate `require("react-native-webrtc")` on `NativeModules.WebRTCModule`. In Expo SDK 55 + New Architecture production builds, react-native-webrtc registers via TurboModules/JSI and does **not** appear in `NativeModules`. The check always returns `null`, making `WEBRTC_AVAILABLE = false` and silently disabling all calling.

**Why:** Same failure mode as `NativeModules.ExponentAV` (already documented). NativeModules is an old-arch bridge concept; New Arch modules bypass it entirely.

**How to apply:** Instead of checking `NativeModules.WebRTCModule`, try-require the package and verify `rn?.RTCPeerConnection` is non-null. This correctly handles both cases:
- **Expo Go**: module is absent → require returns null or throws → `catch` returns null
- **New Arch production**: module uses TurboModules → NativeModules check would fail, but require succeeds and RTCPeerConnection is present

```ts
try {
  const rn = require("react-native-webrtc");
  if (!rn?.RTCPeerConnection) return null;   // Expo Go
  return { RTCPeerConnection: rn.RTCPeerConnection, ... };
} catch {
  return null;
}
```
