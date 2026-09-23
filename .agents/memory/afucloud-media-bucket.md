---
name: AfuCloud media bucket migration
description: Canonical current-app R2 bucket/CDN and legacy bucket preservation rule.
---

The current app must write and read media through the AfuCloud R2 bucket `afucloud-images`, with public media URLs served by its active custom domain `img.afuchat.com`. The legacy `afuchat-media` bucket and `cdn.afuchat.com` custom domain remain untouched for older app versions.

**Why:** `cdn.afuchat.com` is still attached to the legacy bucket, while `img.afuchat.com` is attached to `afucloud-images`; moving the hostname would break older installed clients.

**How to apply:** Keep new Worker bindings, public URL settings, and app-generated media URLs on `afucloud-images`/`img.afuchat.com`. Never generate the retired `.dev` hostname or switch the current app back to `afuchat-media`.