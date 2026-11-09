---
name: Kotlin version requirement for EAS SDK 55 build image
description: EAS SDK 55 image (Gradle 9.0.0) uses KSP which requires Kotlin 2.0+; 1.9.x fails at build.gradle evaluation.
---

## Rule
Set `kotlinVersion: "2.1.21"` (or any 2.x from the supported list) in `expo-build-properties` in `app.json` when targeting EAS SDK 55 image.

**Why:** The EAS build image `ubuntu-24.04-jdk-17-ndk-r27b-sdk-55` uses Gradle 9.0.0. The `expo-root-project` plugin applies KSP (Kotlin Symbol Processing), and KSP on Gradle 9.0.0 only supports Kotlin 2.0+. Using `kotlinVersion: "1.9.25"` causes the build to fail at `build.gradle` evaluation (before any app code compiles) with:

```
Can't find KSP version for Kotlin version '1.9.25'. 
Supported versions are: 2.2.21, 2.3.1, 2.3.0, 2.2.20, 2.2.10, 2.2.0, 2.1.21, 2.1.20, 2.1.10, 2.1.0, 2.0.21, 2.0.20, 2.0.10, 2.0.0
```

This surfaces as `EAS_BUILD_UNKNOWN_GRADLE_ERROR` and the build fails in ~90 seconds.

**How to apply:** In `app.json` inside the `expo-build-properties` plugin block:
```json
"android": {
  "compileSdkVersion": 36,
  "targetSdkVersion": 36,
  "kotlinVersion": "2.1.21",
  ...
}
```

Use `2.1.21` — it is stable and in the supported list. Do NOT use `1.9.x` with SDK 55+.

**How to diagnose:** Fetch raw build logs via GraphQL `logFiles` field → brotli-compressed text → look for `Can't find KSP version` in `RUN_GRADLEW` phase.
