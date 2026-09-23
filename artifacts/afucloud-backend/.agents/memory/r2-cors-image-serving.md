---
name: R2 CORS and image serving
description: How upload CORS and image display are wired for AfuCloud's R2 integration
---

# R2 CORS and Image Serving

## CORS for browser uploads
R2 does not allow browser PUT by default. `configureBucketCors()` in `artifacts/api-server/src/lib/storage.ts` is called on server startup (non-blocking) using S3 PutBucketCors with SigV4 signing. It sets AllowedOrigin=*, AllowedMethod=GET/PUT/DELETE/HEAD, AllowedHeader=*.

**Why:** Without this, direct browser-to-R2 pre-signed PUT requests fail with a network error (XHR onerror fires = CORS block).

**How to apply:** Call `configureBucketCors()` in `artifacts/api-server/src/index.ts` after the server starts listening (already done). Errors are logged as warnings, not fatal.

## Image serving (no R2_PUBLIC_URL)
`getPublicUrl(key)` falls back to `/api/v1/storage/${encodeURIComponent(key)}` when `R2_PUBLIC_URL` env var is not set. The key uses `encodeURIComponent` so slashes become `%2F` (single URL segment). The route `GET /v1/storage/:key` in `artifacts/api-server/src/routes/storage.ts` generates a pre-signed GET URL via `generateSignedGetUrl()` and responds with HTTP 302.

**Why:** `<img src="...">` tags cannot send Authorization headers; the redirect approach lets browsers load images without auth headers while still serving from private R2.

**How to apply:** If `R2_PUBLIC_URL` is eventually set (public bucket), the fallback route is bypassed entirely and images load directly.
