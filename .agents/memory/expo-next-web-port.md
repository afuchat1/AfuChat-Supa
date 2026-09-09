---
name: Expo static web surface
description: Expo Router is the canonical web UI; static export keeps native parity while making route HTML crawlable.
---

The mobile artifact's Expo Router app is the canonical web surface. Use `web.output: "static"` and serve the generated `dist` export with clean-URL routing so the browser and crawlers receive the same screens and route structure as native.

**Why:** A separate Next.js recreation drifted from the mobile UI and feature set. Expo already contains the complete shared screens, navigation, translations, and behavior; static rendering solves discoverability without duplicating the product.

**How to apply:** Build with `expo export -p web`, deploy `dist` as static output, and map extensionless paths to generated HTML. During Node static rendering, Supabase Realtime needs a no-op transport because Node 20 has no native WebSocket; preserve the real transport in browser/native runtimes.