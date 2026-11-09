---
name: AfuMusic playlist scope
description: Persistence and synchronization expectations for AfuMusic playlists.
---

AfuMusic playlists are currently scoped to the signed-in account on the current device or browser; do not present them as cross-device synced.

**Why:** the initial playlist feature has no server playlist schema, and local persistence avoids a database migration while playback and download access remain server-authorized.

**How to apply:** keep playlist persistence local unless cross-device sync is requested. If adding sync, introduce a server-backed schema and access rules rather than storing signed media URLs in playlist records.
