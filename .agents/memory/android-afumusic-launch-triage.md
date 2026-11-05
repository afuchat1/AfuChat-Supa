---
name: Android startup crash triage
description: Diagnose physical Android launch failures from native crash traces rather than assumptions about the triggering feature.
---

Treat AfuMusic player controls as a lead, not a diagnosis. For native Android launch crashes, inspect tombstones first. A WebRTC stack through `libjingle_peerconnection_so` can indicate R8/JNI keep rules are missing or that the native module is being loaded too early from app-wide startup state. Keep optional call-engine initialization out of the root startup path and retain the JNI-bound WebRTC classes in release builds.

**Why:** uploaded device traces showed repeated SIGABRTs in WebRTC `JNI_OnLoad`, and the app's root call provider probed that native module during authenticated startup.

**How to apply:** when investigating Android launch failures, verify the exact native stack before changing media or player code; if WebRTC is involved, verify R8 rules and defer loading until call actions. Check Expo package compatibility before upgrading dependencies.
