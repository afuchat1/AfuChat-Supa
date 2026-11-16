---
name: Expo Router SDK 58 web route loading
description: Verified SDK 58 route-based bundle splitting for the static web preview.
---

Keep Expo Router async routes enabled on web with granular production chunking for the static export.

**Why:** The synchronous static export shipped a 9.2 MiB web entry bundle. SDK 58's static renderer correctly links route chunks into each HTML page; a clean export verified the root and `/welcome` routes with 282 generated chunks and a smaller first-route payload.

**How to apply:** Preserve `{ web: true }` for async routes and `experiments.chunking.mode: "granular"`. After changing Expo Router or the static web server, verify `/`, `/welcome`, dynamic routes, and that their referenced chunk files load.
