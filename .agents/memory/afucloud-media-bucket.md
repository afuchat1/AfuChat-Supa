---
name: AfuCloud media bucket migration
description: Shared AfuChat/AfuCloud R2 bucket, retained media hostnames, and source-bucket handling.
---

`afuchat-media` is the shared R2 bucket for AfuChat and AfuCloud. Both `img.afuchat.com` and `cdn.afuchat.com` serve that bucket. Keep `api.afuchat.com` as the shared Worker boundary for Auth, REST/Realtime, and AfuCloud routes. The original `afucloud-images` bucket was left intact after cutover.

**Why:** The user selected the existing AfuChat bucket as the shared store and asked that both buckets remain available through migration verification.

**How to apply:** Keep Worker bindings, S3 bucket configuration, and new media URLs on `afuchat-media` while preserving both hostnames. Do not delete `afucloud-images` unless the user explicitly requests its removal.