---
name: Android AfuMusic launch triage
description: The user's reported association between AfuMusic player controls and physical Android startup crashes.
---

The user reports that AfuChat can close on launch on a physical Android phone and that AfuMusic player controls shown in Android UI are often associated with the crash. They also want dependencies kept current without breaking app functionality.

**Why:** the user stated this recurring Android issue and asked for it to be prioritized during startup-crash investigations.

**How to apply:** when investigating Android launch failures, check AfuMusic playback and Android media-control setup first, verify Expo native packages against the active SDK instead of upgrading blindly, and use device crash logs to confirm the cause.
