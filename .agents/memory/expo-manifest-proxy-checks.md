---
name: Expo manifest proxy checks
description: Verify Expo Go manifest and bundle delivery over a proxied Metro server
---

## Rule
When checking Expo Go's manifest on the forwarded Metro root, send `Accept: application/expo+json` and `expo-platform: android`. A generic request can receive the web HTML document with HTTP 200. Then fetch the `launchAsset.url` from the returned manifest and verify the full bundle response.

**Why:** Metro serves both browser HTML and native manifests from the same root; an HTTP 200 alone can hide that the phone would not receive the Android manifest.

**How to apply:** Use Expo Go's platform/protocol headers for public proxy checks, inspect the response content type, and confirm the launch bundle downloads successfully.
