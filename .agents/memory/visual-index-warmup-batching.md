---
name: Visual image index warmup batching
description: Production failure pattern for AfuSearch visual-index warmup requests.
---

PostgREST `.in()` filters serialize values into the request URL. Sending a full page of long image URLs in one lookup can exceed URL limits and fail in the Edge Function, preventing the public visual index from warming.

**Why:** production logs showed the visual index lookup failing while requesting hundreds of public image URLs in one query.

**How to apply:** keep image URL lookup batches small and bounded. Do not send large URL arrays in one PostgREST GET request; verify background warmup errors separately from the user-facing match RPC.
