---
name: AfuCloud browser auth CORS
description: Browser sign-in behavior when Supabase Auth is proxied through the AfuCloud gateway.
---

The AfuCloud gateway's CORS policy must allow `apikey` and `X-Client-Info` in addition to `Content-Type` and `Authorization`. Supabase JS sends those headers during Auth and PostgREST requests; if preflight rejects them, browsers surface only `Failed to fetch`.

**Why:** The upstream Supabase Auth endpoint was healthy, while the gateway preflight omitted Supabase client headers. Native requests were unaffected because native fetch does not enforce browser CORS.

**How to apply:** Keep the worker allow-list and the mobile web client aligned. If the production worker has not received the CORS change yet, use the direct Supabase URL for the web client as a temporary compatibility path; deploy the worker before removing that fallback.