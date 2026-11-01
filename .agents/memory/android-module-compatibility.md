---
name: Android module compatibility
description: The user's Android support requirement for app modules and device-specific crash investigation.
---

App modules should not crash on Android 14 and earlier across phone brands.

**Why:** the user asked for cross-brand compatibility.

**How to apply:** keep Expo and native dependencies aligned with the lockfile, and use crash reports plus physical-device testing before claiming device-specific compatibility.
