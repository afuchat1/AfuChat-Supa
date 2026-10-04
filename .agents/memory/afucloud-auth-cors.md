---
name: AfuCloud browser auth CORS
description: Browser sign-in behavior when Supabase Auth is proxied through the AfuCloud gateway.
---

The AfuCloud gateway's CORS policy must allow `apikey` and `X-Client-Info` in addition to `Content-Type` and `Authorization`. Supabase JS sends those headers during Auth and PostgREST requests; if preflight rejects them, browsers surface only `Failed to fetch`.

**Why:** The upstream Supabase Auth endpoint was healthy, while the gateway preflight omitted Supabase client headers. Native requests were unaffected because native fetch does not enforce browser CORS.

**How to apply:** Keep the worker allow-list and the mobile web client aligned. If the production worker has not received the CORS change yet, use the direct Supabase URL for the web client as a temporary compatibility path; deploy the worker before removing that fallback.

Before treating this as a headers-only problem, probe the deployed route itself. A 404 from `api.afuchat.com/auth/v1/*` or `/rest/v1/*` means the active Worker is missing the proxy route even if repository source contains it. A browser-only fetch rewrite of `/auth/v1/*` to `SUPABASE_URL` can restore sign-in without changing native or REST routing, but it does not restore post-login data requests.

**Why:** On 2026-10-04 the live API hostname returned 404 for both Auth and PostgREST paths, while the direct Supabase endpoint passed browser preflight and the checked-in gateway source contained proxy routes.

**How to apply:** Verify active deployment routes separately from source code, use an Auth-only browser workaround when needed, and confirm PostgREST works before considering the signed-in app fully operational.