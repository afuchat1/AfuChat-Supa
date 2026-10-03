---
name: AfuCloud media bucket migration
description: Shared AfuChat/AfuCloud R2 bucket, retained media hostnames, and source-bucket handling.
---

`afuchat-media` is the shared R2 bucket for new AfuChat and AfuCloud media. `cdn.afuchat.com` serves that shared bucket; `img.afuchat.com` remains attached to the original `afucloud-images` bucket for AfuCloud users. Keep `api.afuchat.com` as the shared Worker boundary for Auth, REST/Realtime, and AfuCloud routes. The original `afucloud-images` bucket remains intact.

**Why:** The user selected `afuchat-media` for shared storage and explicitly chose to keep `img.afuchat.com` serving the original AfuCloud bucket, since changing it can make AfuCloud users lose access.

**How to apply:** Keep the Worker binding and S3 bucket configuration on `afuchat-media`, and set new shared-media URLs and CDN targets to `cdn.afuchat.com`. Keep `img.afuchat.com` attached to `afucloud-images`; do not move it without an explicit compatibility plan. Do not delete `afucloud-images` unless the user explicitly requests its removal.