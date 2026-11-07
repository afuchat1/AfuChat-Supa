---
name: AfuChat durable user data
description: Project rule for keeping user data out of OS-clearable caches.
---

Do not place durable user data in OS-clearable cache storage. Use persistent app storage or the server for user data; use only memory or disposable staging for re-fetchable media and in-progress operations.

**Why:** The user explicitly said caches are cleared unpredictably and asked to avoid data loss, including for offline media.

**How to apply:** When changing AfuChat storage or network behavior, distinguish canonical user data from re-creatable media. Disk image caches should be disabled; persistent user content belongs in SQLite, AsyncStorage/MMKV, or durable files and server sync. Offline video and music saves must be explicit and cannot expire or be evicted automatically; if storage is full, reject a new save rather than deleting saved media. Avoid adjacent media prefetch on cellular or unknown connections, and keep feed requests bounded and paginated.
