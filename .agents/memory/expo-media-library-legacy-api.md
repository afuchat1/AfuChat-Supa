---
name: Expo Media Library legacy API
description: Which package entry point to use for existing media-library queries in current Expo SDKs.
---

Use `expo-media-library/legacy` anywhere gallery code depends on `getAssetsAsync`, `MediaType`, or `SortBy`. The root `expo-media-library` entry point targets the newer Query API and does not expose the legacy types.

**Why:** SDK 58 still exposes the legacy asset-query API through `/legacy`; the root entry targets the newer Query API, so old gallery calls there fail typechecking and can break static route rendering.

**How to apply:** Keep legacy asset-query screens and video-save paths on the `/legacy` subpath. Use the package root only when implementing the newer Query API intentionally.
