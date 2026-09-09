---
name: Expo to Next.js web port
description: The web artifact is a faithful Next.js port of Expo web flows, not a separate marketing recreation.
---

The Next.js public web surface lives inside the mobile artifact at `artifacts/mobile/web`; there is no separate web workspace. It should port the existing Expo web experience screen by screen, beginning with the real onboarding language selection, onboarding slides, and authentication routes.

**Why:** The requested change is a runtime conversion from Expo web to Next.js without creating a second artifact, so user-visible behavior and product copy should come from the existing mobile source rather than invented web content.

**How to apply:** Keep the Next app under the mobile workspace, reuse its bundled assets, translations, colors, and route intent, and keep the preview/deployment commands rooted at `artifacts/mobile`. Add live Supabase behavior as each screen is ported; do not substitute static marketing sections for app screens.