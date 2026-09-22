---
name: AfuCloud media boundary
description: Client media transport must enter through the AfuCloud API before reaching object storage.
---

The mobile client must not upload bytes to presigned R2 URLs or download app-owned media from direct R2/CDN URLs. Uploads stream through the AfuCloud worker, and canonical object URLs use its storage route; legacy AfuCloud-owned URLs are normalized at download boundaries.

**Why:** AfuCloud is the app's authenticated storage boundary and keeps object-storage credentials and routing server-side.

**How to apply:** When adding upload, playback, image, attachment, story, or offline-cache code, use the shared AfuCloud URL normalizer and keep direct object-storage URLs out of client transport.