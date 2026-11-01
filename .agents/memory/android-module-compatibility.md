---
name: Android module compatibility
description: The user's Android support requirement for app modules and device-specific crash investigation.
---

App modules should work on Android 14 and earlier across phone brands. Request camera and microphone access when a user enters the feature that needs them; use the system picker for one-off photo/video selection instead of requiring full-library access.

**Why:** the user asked for cross-brand compatibility.

**How to apply:** keep Expo and native dependencies aligned with the lockfile, preserve the user's selected-media choice, and use crash reports plus physical-device testing before claiming device-specific compatibility.
