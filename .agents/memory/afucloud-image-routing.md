---
name: AfuCloud image routing
description: Required behavior for the shared image hostname and AfuCloud bucket access.
---

Keep `img.afuchat.com` serving the original AfuCloud storage bucket. Changing the hostname's routing can cut AfuCloud users off from their bucket.

**Why:** The user explicitly warned that existing AfuCloud users depend on this hostname for bucket access.

**How to apply:** Preserve the original AfuCloud bucket route whenever changing image or storage routing for AfuChat.
