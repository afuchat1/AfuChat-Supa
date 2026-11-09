---
name: AfuMusic web downloads
description: Browser file-download strategy for private R2-backed music.
---

Use an authenticated, signed R2 GET URL with attachment disposition for private AfuMusic downloads. Avoid reading whole tracks into browser blobs or relying on cross-origin download attributes.

**Why:** R2 CORS can block browser blob reads, buffering large audio wastes memory, and purchase checks must remain authoritative on the server.

**How to apply:** pass the intended filename through the signed-read flow while preserving its current user and track entitlement checks. Deploy the uploads Edge Function change before expecting production web downloads to receive the attachment header.
