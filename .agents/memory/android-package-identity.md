---
name: Android package identity migration
description: Native Android package changes require coordinated Firebase and App Links updates.
---

Changing the Android application ID requires a new Firebase Android app configuration and refreshed signing fingerprints for Digital Asset Links; changing only the Expo package string is not sufficient for native services.

**Why:** Firebase configuration is package-bound, and Android App Links verification matches both the package name and signing certificate.

**How to apply:** When changing `android.package`, replace `google-services.json` with the config for the new package and update `well-known/assetlinks.json` with the new release certificate fingerprints before building or releasing.