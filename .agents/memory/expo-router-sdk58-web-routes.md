---
name: Expo Router SDK 58 web route loading
description: Why the static preview keeps synchronous route loading on web.
---

Keep Expo Router async routes disabled on web while preserving the SDK default on native.

**Why:** With SDK 58's default async web routes, the static preview's first-run redirect to `/welcome` failed with `Requiring unknown module 897`. Disabling web async routes fixed the initial screen without changing native routing.

**How to apply:** When upgrading Expo Router or changing the static web server, retest the root-to-welcome redirect and static routes. Do not re-enable async web routes until lazy chunk loading is verified in the preview.
