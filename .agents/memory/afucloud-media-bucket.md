---
name: AfuCloud media bucket migration
description: Shared AfuChat/AfuCloud R2 bucket, retained media hostnames, and source-bucket handling.
---

`afuchat-media` is the shared R2 bucket for AfuChat and AfuCloud. Both `img.afuchat.com` and `cdn.afuchat.com` serve that bucket. Keep `api.afuchat.com` as the shared Worker boundary for Auth, REST/Realtime, and AfuCloud routes. The original `afucloud-images` bucket was left intact after cutover. The user requires `img.afuchat.com` to keep serving AfuCloud storage too; changing it without a compatibility path can make AfuCloud users lose bucket access.

**Why:** The user selected the existing AfuChat bucket as the shared store and said changing `img.afuchat.com` away from AfuCloud storage can make AfuCloud users lose access to the bucket.

**How to apply:** Keep Worker bindings, S3 bucket configuration, and new media URLs on `afuchat-media` while preserving both hostnames. Before changing the `img.afuchat.com` attachment, ensure AfuCloud users' media remains reachable through it or a compatibility route. Do not delete `afucloud-images` unless the user explicitly requests its removal.