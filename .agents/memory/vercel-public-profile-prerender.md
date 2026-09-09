---
name: Vercel public profile prerendering
description: Static Vercel hosting needs per-handle HTML files for AfuChat profiles because the Replit runtime crawler is not present on Vercel.
---

Public profile pages are prerendered during the Expo web build from public Supabase profile data. This keeps profile bios and metadata readable before JavaScript runs while preserving the Expo bundle for normal browsers.

**Why:** Vercel serves the dist directory directly and does not run the Replit static server's request-time crawler decoration.

**How to apply:** Keep the profile prerender in the web build, use only public profile fields, and rerun the build when public profile data needs to refresh.