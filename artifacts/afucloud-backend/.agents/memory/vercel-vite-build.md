---
name: Vercel frontend builds
description: Vite build behavior when the AfuCloud frontend is hosted outside Replit
---

# Vercel frontend builds

The AfuCloud frontend must provide safe defaults for `PORT` and `BASE_PATH` during `vite build`. Replit injects both for its preview server, but Vercel static builds do not.

**Why:** Requiring preview-only variables makes a valid static deployment fail before the frontend bundle is generated.

**How to apply:** Keep Replit values available when present, but default the build to port `4173` and root base path `/` for static hosts.