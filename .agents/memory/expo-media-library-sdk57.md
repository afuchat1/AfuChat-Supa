---
name: Expo Media Library SDK 57
description: Which package entry point to use for the app's legacy media-library queries.
---

Use `expo-media-library/legacy` anywhere existing gallery code depends on `getAssetsAsync`, `MediaType`, or `SortBy`. The root `expo-media-library` entry point targets the newer Query API and does not expose the legacy types.

**Why:** SDK 57's root entry caused type errors in the existing gallery screens and a server-render failure when loaded by the dynamic video route.

**How to apply:** Keep legacy asset-query screens and video-save paths on the `/legacy` subpath. Use the package root only when implementing the newer Query API intentionally.
