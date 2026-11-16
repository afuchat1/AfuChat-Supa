---
name: AfuChat durable user data
description: Project rule for keeping user data out of OS-clearable caches.
---

Do not place durable user data in OS-clearable cache storage. Use persistent app storage or the server for user data. Re-fetchable remote images should use the shared Expo Image memory-and-disk cache so the same image can be reused across screens.

**Why:** The user asked to reuse previously downloaded images across the mobile app to avoid repeated network fetches and make navigation smoother. Image bytes are re-creatable; saved offline media and other user data are not.

**How to apply:** Route remote images through the shared cached image components with memory-and-disk caching and preserve their exact source URLs. Do not add a second file-cache owner for the same images. Keep saved offline videos, music, and other canonical user content in persistent storage with explicit save semantics; do not prefetch adjacent media on cellular or unknown connections, and keep feed requests bounded and paginated.
