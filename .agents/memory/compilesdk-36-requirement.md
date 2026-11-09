---
name: compileSdkVersion 36 required for androidx.activity 1.11+ / androidx.core 1.17+
description: EAS_BUILD_UNKNOWN_GRADLE_ERROR caused by AndroidX deps requiring compileSdk >= 36
---

## Rule
Set `compileSdkVersion: 36` (and `targetSdkVersion: 36`) in `expo-build-properties` in `app.json` when any dependency requires it.

**Why:** `androidx.activity:activity:1.11.0` and `androidx.core:core:1.17.0` (pulled transitively by several Expo/RN packages) declare `minCompileSdk = 36`. When these are resolved by Gradle, `:app:checkReleaseAarMetadata` fails with "requires libraries and applications that depend on it to compile against version 36 or later". The generic EAS error code `EAS_BUILD_UNKNOWN_GRADLE_ERROR` hides this real cause.

**How to apply:** In `app.json` inside the `expo-build-properties` plugin block:
```json
"android": {
  "compileSdkVersion": 36,
  "targetSdkVersion": 36,
  ...
}
```
The fix must be in `expo-build-properties` — NOT in a bare `android/` folder (managed workflow has no android/ dir).

**How to diagnose in the future:** EAS log files are brotli-compressed (Content-Encoding: br, stored as binary). Use `curl -sL --compressed` to auto-decompress, then `strings -n 8` to extract readable JSON log lines. Look for `phase":"RUN_GRADLEW"` entries with `checkReleaseAarMetadata`.
