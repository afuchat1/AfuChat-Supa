---
name: Expo Go tunnel workflow
description: Reliable Expo Go startup and public bundle delivery from this Replit workspace
---

## Rule
Use Expo's `--tunnel` mode for Expo Go on Replit, without `EXPO_OFFLINE` or `EXPO_PACKAGER_PROXY_URL`. The tunnel's `exp://*.exp.direct` URL works over HTTP and avoids the Replit forwarded-port protocol mismatch.

**Why:** Expo Go rewrites `exp://` to HTTP. Replit's forwarded port requires HTTPS, so that route returns HTTP 400. Expo's tunnel serves the manifest and bundle through its own compatible endpoint; a verified tunnel manifest and bundle both returned HTTP 200.

**How to apply:** Start Expo Go with `--go --tunnel --port 8000`, retain a 4 GB Node heap, and prewarm the Android bundle before reporting readiness. Do not inject a Replit host URL or custom `exps://` QR.

**Do NOT use `CI=1`:** CI=1 breaks native bundle serving — every Expo Go connection produces a CommandError and the native bundle is never served.

## Anonymous CLI startup
When Expo CLI's stdout is a TTY, SDK 57 may pause on an optional "Log in / Proceed anonymously" prompt before Expo Go loads. Pipe the CLI's stdout and relay it to the workflow log so the CLI is non-interactive; it then follows its anonymous path without `EXPO_TOKEN` or an EAS login.

**Why:** The default interactive selection starts on "Log in" and can leave Replit's phone preview waiting indefinitely.

**How to apply:** Keep stdout visible through a pipe, with stdin non-interactive; do not set `CI=1`, which breaks native bundle serving.

