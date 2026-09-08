---
name: AfuChat web artifact architecture
description: The SEO web experience is a separate Next.js artifact alongside the Expo Android app.
---

The AfuChat web experience should stay in its own Next.js artifact rather than being forced through React Native Web.

**Why:** React Native Web pulled native-only modules and React runtime mismatches into the browser bundle, while Next.js provides the server-rendered routes and SEO controls needed for the public web experience.

**How to apply:** Keep Android code under artifacts/mobile and web pages/assets under artifacts/web. Share brand assets deliberately, but do not make the two runtimes depend on each other's platform-specific modules.