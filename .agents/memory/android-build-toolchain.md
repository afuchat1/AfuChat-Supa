---
name: Android build toolchain
description: Keep Expo-generated Android Gradle, wrapper, and Kotlin versions compatible across version catalogs and conventional build files.
---

Expo Continuous Native Generation can resolve Android build plugin versions from a version catalog while a config plugin separately edits the Gradle wrapper or Groovy build files. Updating only one source can leave the cloud build with incompatible versions.

**Why:** An Android cloud build failed during configuration because its resolved Android Gradle Plugin required a newer Gradle wrapper than the app's custom config plugin generated.

**How to apply:** When Expo or React Native changes, align the Android Gradle Plugin, Gradle wrapper, and Kotlin plugin in the app build-properties, generated version catalog, and conventional Gradle declarations.
