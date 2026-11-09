---
name: Local Android Gradle verification
description: Environment-specific limitation encountered when compiling generated Expo Android projects in the Replit container.
---

The local Android Gradle wrapper may fail before evaluating the app with a `JvmVendorSpec IBM_SEMERU` `NoSuchFieldError` from the Foojay toolchain resolver. This is an environment/toolchain mismatch, not an application source diagnostic.

**Why:** The generated Expo Android project can be valid while the container's Gradle resolver crashes before Kotlin or Android compilation starts.

**How to apply:** Validate Expo config and generated manifest locally, but use the configured EAS Android build for authoritative native compilation when this resolver error occurs.

The Gradle distribution URL must use the full published version. `gradle-9.1-bin.zip` returns 404; Gradle 9.1 is published as `gradle-9.1.0-bin.zip`. With the current AGP 9.0.0 override, Gradle 9.1.0 is the minimum compatible wrapper.

**Why:** A custom wrapper pin first caused EAS to fail before Gradle startup, and the next downgrade reached AGP's version check, which explicitly rejected Gradle 9.0.0 and required 9.1.0.

**How to apply:** Keep the exact published wrapper version aligned with the AGP override; validate both the URL and AGP's minimum requirement before changing app or dependency code.