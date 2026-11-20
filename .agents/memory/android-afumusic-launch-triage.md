---
name: Android startup crash triage
description: Diagnose physical Android launch failures from native crash traces rather than assumptions about the triggering feature.
---

Treat AfuMusic player controls as a lead, not a diagnosis. For native Android launch crashes, inspect tombstones first. A WebRTC stack through `libjingle_peerconnection_so` can indicate R8/JNI keep rules are missing or that the native module is being loaded too early from app-wide startup state. Keep optional call-engine initialization out of the root startup path and retain the JNI-bound WebRTC classes in release builds.

**Why:** uploaded device traces showed repeated SIGABRTs in WebRTC `JNI_OnLoad`, and the app's root call provider probed that native module during authenticated startup.

**How to apply:** when investigating Android launch failures, verify the exact native stack before changing media or player code; if WebRTC is involved, verify R8 rules and defer loading until call actions. Check Expo package compatibility before upgrading dependencies.

For WebRTC M155 release builds, R8 may report the absent optional `org.webrtc.Dav1dDecoder$Natives` class. Suppress only that class with a targeted `-dontwarn`; keep the broader WebRTC and JNI classes.

**Why:** Jitsi's M155 consumer app uses this exact narrow suppression for the same R8 failure; broad `org.webrtc` warning suppression could hide unrelated missing classes.

**How to apply:** add the exact rule to the persistent ProGuard source used by the Expo config plugin, then verify with a release build.
