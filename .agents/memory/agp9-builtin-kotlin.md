---
name: AGP 9 built-in Kotlin compatibility
description: The AGP 9 Android toolchain conflicts with the legacy external Kotlin Gradle plugin in generated Expo app projects.
---

## Rule

For Expo SDK 55 projects that still apply the external Kotlin Gradle plugin, use AGP 8.10.x with Gradle 8.13 when compile SDK 36 is required. Keep the external Kotlin plugin and the configured Kotlin 2.x version; do not enable the AGP 9 built-in-Kotlin migration path.

**Why:** AGP 9 first causes duplicate Kotlin-extension errors when built-in Kotlin and Expo's external plugin overlap, then fails with an `ApplicationExtension`/`BaseExtension` cast when the overlap is disabled. The external plugin is not compatible with AGP 9's changed Android extension model.

**How to apply:** Enforce the compatible AGP and Gradle versions through the CNG/EAS config plugin. Keep the optimized ProGuard template and verify generated Gradle files before spending an EAS build.