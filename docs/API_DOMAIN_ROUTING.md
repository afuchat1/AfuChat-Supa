# Production API and CDN routing

**Live routing baseline checked:** 2026-10-06, before the `afu-cdn` cutover
**Target CDN owner:** `afu-cdn` (source and route plan are staged locally; not deployed)
**Scope:** Cloudflare Worker routes, product R2 bindings, and retained object
domains. Product health is not implied by correct route ownership.

## Canonical product routes

| Product | API namespace → Worker | CDN path → `afu-cdn` binding | R2 bucket |
|---|---|---|---|
| AfuAuth | `/v1/auth/*` → `afuauth-api` | None | None |
| AfuChat | `/v1/chat/*` → `afuchat-api` | `/chat/{key}` → `CHAT_ASSETS` | `afu-chat-assets` |
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
(`afuchat-media`). Unknown prefixes fall back to that legacy key space so
existing root URLs remain available. Future product prefixes must be added to
the dispatch map and assigned their own R2 binding.

The deployed AfuCloud Worker was inspected read-only. Its `R2_PUBLIC_URL` is
`cdn.afuchat.com/cloud`, and the active `/cloud/*` handler reads from
`afucloud-images`; those paths retain the same URL and bucket after dispatch
moves to `afu-cdn`.

## Root gateway and retained domains

The API root remains a separate gateway route:

| Host and path | Owner | Behavior |
|---|---|---|
| `api.afuchat.com/` | `afu-api` | Forwards only `/` through the `AFUAUTH_API` service binding. |
| `cloud.afuchat.com/*` | `afucloud-web` | Existing AfuCloud website route; not an API route. |

The root route is not a product API namespace. No generic API catch-all is
configured. The proxied exact DNS record for `api.afuchat.com` remains pointed
at the reserved placeholder origin so unassigned paths do not fall through to
the wildcard Vercel origin.

These existing R2 custom domains remain attached to their current buckets to
preserve old object URLs:

| Custom domain | Bucket | Purpose |
|---|---|---|
| `cdn.afuchat.com` | `afuchat-media` | The original R2 custom domain remains attached. After cutover, `afu-cdn` handles requests and reads unprefixed legacy object keys through `LEGACY_MEDIA`. |
| `img.afuchat.com` | `afucloud-images` | Existing AfuCloud compatibility URLs remain on the same bucket. |

No bucket, object, DNS record, or custom domain was deleted, moved, or copied.

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

The production behavior below was verified read-only on 2026-10-06 before this
CDN consolidation was staged:

The following behavior was verified against production on 2026-10-06 before the
current hardening changes. The hardening itself has not been deployed or
production-verified:

- `GET https://api.afuchat.com/` → `200`, served through `afu-api` and its
  AfuAuth service binding.
- `GET /v1/chat/healthz` → `200` with product health only; Worker identifiers are not returned.
- `GET /v1/chat/status` → `200 { ok, timestamp }`; provider and database details remain private.
- CORS preflight for `/v1/chat/conversations` → `204` with the AfuChat origin.
- Unauthenticated `/v1/chat/storage/usage` and invalid-session
  `/v1/chat/conversations` → `401`.
- `GET https://cdn.afuchat.com/chat/` → generic `404` with an AfuChat request
  ID under the former per-product route.
- Read-only `HEAD` checks for three existing public legacy objects on the root
  `cdn.afuchat.com` custom domain returned `200` (two images and one video).
- Before this change, all six API routes, five per-product CDN routes, five
  product R2 bindings, the root gateway, and the AfuCloud website route had the
  expected owners.

The new `afu-cdn` Worker and route consolidation have not been deployed or
production-verified. No Cloudflare routes, DNS records, buckets, or objects
were changed while preparing this implementation. The previous `/chat/` probe
did not verify object delivery from `afu-chat-assets`, which had no objects at
audit time. Video registration and manifest endpoints remain explicit `501`
stubs until a video-processing backend is configured; they are not reported
as healthy processing endpoints.

## Change safety

`backend/route-management/reconcile.mjs` defaults to a read-only dry run. It
now requires the deployed `afu-cdn` Worker and all six exact R2 bindings before
reporting a safe plan. Use `--apply` only for an approved route reconciliation.
It verifies exact route ownership, product storage bindings, retained custom
domains, API DNS fail-closed behavior, and website/root routes before changing
routes. It creates canonical routes before deleting obsolete API/CDN routes
and rolls back route changes if post-deployment verification fails.

Do not delete or migrate product data as part of route cleanup. Route ownership
does not certify product health. Per the product-scope decision, once a
non-AfuChat product’s URL and binding are confirmed, leave its health and
implementation unchanged unless separately requested.
