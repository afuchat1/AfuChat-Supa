# Production API and CDN routing

**Live routing and binding baseline checked:** 2026-10-06, after the CDN cutover
**CDN owner:** `afu-cdn` (deployed and active)
**Scope:** Cloudflare Worker routes, product R2 bindings, and retained object
domains. Product health is not implied by correct route ownership.

## Canonical product routes

| Product | API namespace → Worker | CDN path → `afu-cdn` binding | R2 bucket |
|---|---|---|---|
| AfuAuth | `/v1/auth/*` → `afuauth-api` | None | None |
| AfuChat | `/v1/chat/*` → `afuchat-api` | `/chat/{key}` → `CHAT_ASSETS` | `afuchat-media` (shared with legacy URLs) |
| AfuMail | `/v1/mail/*` → `afumail-api` | `/mail/{key}` → `MAIL_ASSETS` | `afu-mail-assets` |
| AfuCloud | `/v1/cloud/*` → `afucloud-api` | `/cloud/{key}` → `CLOUD_ASSETS` | `afucloud-images` |
| AfuAI | `/v1/ai/*` → `afuai-api` | `/ai/{key}` → `AI_ASSETS` | `afu-ai-assets` |
| AfuAds | `/v1/ads/*` → `afuads-api` | `/ads/{key}` → `ADS_ASSETS` | `afu-ads-assets` |

One route, `cdn.afuchat.com/*`, is owned by `afu-cdn`. The first path segment
selects one product bucket; the segment is removed before the object lookup.
Bare namespace roots such as `/chat` and `/chat/` are not object keys. The
Worker serves only public GET, HEAD, and OPTIONS requests and does not handle
API operations.

Unprefixed legacy paths continue to read from `LEGACY_MEDIA`
(`afuchat-media`). AfuChat's `CHAT_ASSETS` binding points to that same physical
bucket. Unknown prefixes fall back to the legacy key space so existing root
URLs remain available. Future product prefixes must be added to the dispatch
map and assigned an R2 binding.

The deployed AfuCloud Worker was inspected read-only. Its `R2_PUBLIC_URL` is
`cdn.afuchat.com/cloud`, and the active `/cloud/*` handler reads from
`afucloud-images`; those paths retain the same URL and bucket after dispatch
moves to `afu-cdn`.

## Root gateway and retained domains

The existing API route inventory was left unchanged by the CDN and storage
changes:

| Host and path | Owner | Behavior |
|---|---|---|
| `api.afuchat.com/*` | `afu-api` | Existing API-host fallback; product-specific routes remain owned by their Workers. |
| `cloud.afuchat.com/*` | `afucloud-web` | Existing AfuCloud website route; not an API route. |

No API route, including AfuAuth, was changed for this storage update. The
proxied exact DNS record for `api.afuchat.com` remains pointed at the reserved
placeholder origin so requests do not fall through to the wildcard Vercel
origin.

These existing R2 custom domains remain attached to their current buckets to
preserve old object URLs:

| Custom domain | Bucket | Purpose |
|---|---|---|
| `cdn.afuchat.com` | `afuchat-media` | The original R2 custom domain remains attached. After cutover, `afu-cdn` handles requests and reads unprefixed legacy object keys through `LEGACY_MEDIA`. |
| `img.afuchat.com` | `afucloud-images` | Existing AfuCloud compatibility URLs remain on the same bucket. |

The empty `afu-chat-assets` bucket was deleted after its zero-object inventory
was verified and both AfuChat bindings were switched. No existing objects were
copied or moved; the retained custom domains and other buckets were unchanged.

## Removed routes

The following obsolete API aliases were removed from the Cloudflare zone:

| Removed route | Previous Worker |
|---|---|
| `api.afuchat.com/chat/*` | `afuchat-api` |
| `api.afuchat.com/v1/storage*` | `afuchat-api` |
| `api.afuchat.com/afucloud/*` | `afucloud-api` |
| `api.afuchat.com/v1/auth-resolve-identifier` | `afuauth-api` |

The live baseline before this change contained six product API routes and five
product CDN routes, plus the required `api.afuchat.com/` root gateway. The
target inventory contains six API routes and one CDN route. The route manager
will remove the five superseded product CDN routes only after `afu-cdn` is
deployed and its exact bucket bindings have been verified.

Older deployed clients were still using some removed aliases at audit time.
Those callers must be updated to the canonical paths; the aliases are not
redirected or proxied.

## Production verification and cutover status

Verified on 2026-10-06 after the CDN and AfuChat storage changes:

- `cdn.afuchat.com/*` is owned by `afu-cdn`; no product-specific CDN routes
  remain. The exact API route inventory was unchanged.
- `afuchat-api` binds `AFUCHAT_ASSETS` to `afuchat-media`.
- `afu-cdn` binds both `CHAT_ASSETS` and `LEGACY_MEDIA` to `afuchat-media`;
  other product bindings remain on their own buckets.
- Cloudflare's object listing returned zero objects for `afu-chat-assets`
  before it was deleted.
- A live request for a nonexistent CDN key returned the Worker’s generic 404
  with `X-AfuCdn-Request-Id`, confirming the CDN host reaches `afu-cdn`. This
  probe does not verify bytes for a real media object.
- `img.afuchat.com` remains attached to `afucloud-images`; the Cloud site route
  and API routes were not changed.

Video registration and manifest endpoints remain explicit `501` stubs until a
video-processing backend is configured; they are not reported as healthy
processing endpoints.

## Change safety

`backend/route-management/reconcile.mjs` defaults to a read-only dry run. Its
`--cdn-only` mode changes only CDN routes and validates all six `afu-cdn`
bindings, retained custom domains, the API DNS fail-closed behavior, and the
website route before and after a CDN change. The unscoped mode manages the
broader API and CDN route set separately.

Do not delete or migrate product data as part of route cleanup. Route ownership
does not certify product health. Per the product-scope decision, once a
non-AfuChat product’s URL and binding are confirmed, leave its health and
implementation unchanged unless separately requested.
