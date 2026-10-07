---
name: Expo web lazy-import chunks
description: Diagnose unknown Metro module errors caused by code-split helpers in the static web export.
---

Expo's static web export can emit a shared helper as a separate hashed JavaScript chunk for dynamic `import()`. In the Replit preview, a login-triggered lazy import of `rewardXp` produced `Requiring unknown module` because its module ID was only present in that chunk. `EXPO_NO_LAZY=1` did not prevent the dynamic-import chunk.

**Why:** A logged-in web session reached the lazy module before the chunk was registered, causing the app error screen instead of loading authenticated screens.

**How to apply:** When an unknown Metro module ID appears after a route transition, search the emitted web bundles for that ID and statically include modules needed during startup/login; verify the separate chunk is gone or the module is registered in the main bundle.
