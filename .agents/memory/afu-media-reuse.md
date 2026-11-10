---
name: AfuChat media reuse
description: Project-wide media and profile-avatar reuse requirements.
---

Use the exact `profiles.avatar_url` for the signed-in user's story-reply and comment composer avatar. Forwarding, reposting, and resending already stored media must preserve its existing public URL/storage path rather than create another stored copy. A repeat upload of the same local source path should resolve to its existing stored reference.

**Why:** The user asked that profile avatars remain the exact profile file and that files be uploaded only once to reduce storage use and improve performance.

**How to apply:** Reuse attachment URLs and types when creating forwarded message rows; route all new media uploads through the shared uploader, which should recognize stored URLs and reuse a per-user source-path mapping. Upload bytes only for new files.
