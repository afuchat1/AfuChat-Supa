---
name: Production connectivity unknown state
description: Release Android can render before NetInfo's first result
---

## Rule

Treat the short pre-NetInfo window as network-usable, not offline or low-data. Screens hydrate local caches first, and the first native NetInfo result must immediately take over.

**Why:** Standalone release builds can mount faster/differently than Expo Go. Starting `_isOnline=false` and data mode `"low"` sends connected users down cache-only and throttled media paths, making the app appear offline.

**How to apply:** Keep `offlineStore.isOnline()` optimistic only while `_netInfoReported` is false; initialize data mode as high/Wi-Fi until NetInfo reports. Defer noncritical realtime, push, WebRTC, and AI housekeeping until after first data render.