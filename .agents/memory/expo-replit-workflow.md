---
name: Expo Go tunnel workflow
description: Reliable Expo Go startup and public bundle delivery from this Replit workspace
---

## Rule
Use Expo's public tunnel for Expo Go device testing:

```
EXPO_OFFLINE=1 NODE_OPTIONS=--max-old-space-size=4096 pnpm exec expo start --go --tunnel --port 8000
```

**Why:** The Replit `.expo.worf.replit.dev` host can return 502 even while Metro is healthy locally. The Expo tunnel's `exp.direct` URL served the Android loading endpoint successfully.

**How to apply:** Keep `EXPO_OFFLINE=1`, `--go`, and `--tunnel` in the Expo Go workflow. Do not combine the separate `--offline` CLI flag with `--tunnel`; Expo rejects those flags together. Keep the 4 GB Node heap because this Expo Router graph exceeds the default heap during startup.

The first Android bundle can take roughly a minute on a cold Metro cache; after it completes, the same 21 MB bundle is served in about two seconds. Prewarm it before testing Expo Go.

**Do NOT use `CI=1`:** CI=1 breaks native bundle serving — every Expo Go connection produces a CommandError and the native bundle is never served.

