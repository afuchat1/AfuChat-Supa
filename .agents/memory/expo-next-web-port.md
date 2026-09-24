---
name: Expo static web surface
description: Expo Router is the canonical web UI; static export keeps native parity while making route HTML crawlable.
---

The mobile artifact's Expo Router app is the canonical web surface. Use `web.output: "static"` and serve the generated `dist` export with clean-URL routing so the browser and crawlers receive the same screens and route structure as native.

**Why:** A separate Next.js recreation drifted from the mobile UI and feature set. Expo already contains the complete shared screens, navigation, translations, and behavior; static rendering solves discoverability without duplicating the product.

**How to apply:** Build with `expo export -p web`, deploy `dist` as static output, and map extensionless paths to generated HTML. During Node static rendering, Supabase Realtime needs a no-op transport because Node 20 has no native WebSocket; preserve the real transport in browser/native runtimes.

Native-only gesture/media modules can still be evaluated by Expo Router's Node renderer when a route imports them at module scope. Put route-specific interaction layers behind `.native` and `.web` files, and use the platform wrapper for native media APIs.

**Why:** A native gesture/media import caused static export to fail with `Class extends value undefined`, even though browser bundling and native Metro were otherwise healthy.

**How to apply:** Keep the native implementation unchanged in the `.native` file; make the `.web` implementation safe for both browser rendering and the Node static pass.