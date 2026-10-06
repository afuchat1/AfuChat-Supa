# Production API and CDN routing

**Verified:** 2026-10-06  
**Scope:** Cloudflare Worker routes, product R2 bindings, and retained object
domains. Product health is not implied by correct route ownership.

## Canonical product routes

| Product | API namespace → Worker | CDN namespace → Worker | R2 bucket |
|---|---|---|---|
| AfuAuth | `/v1/auth/*` → `afuauth-api` | None | None |
| AfuChat | `/v1/chat/*` → `afuchat-api` | `/chat/*` → `afuchat-api` | `afu-chat-assets` |
| AfuMail | `/v1/mail/*` → `afumail-api` | `/mail/*` → `afumail-api` | `afu-mail-assets` |
| AfuCloud | `/v1/cloud/*` → `afucloud-api` | `/cloud/*` → `afucloud-api` | `afucloud-images` |
| AfuAI | `/v1/ai/*` → `afuai-api` | `/ai/*` → `afuai-api` | `afu-ai-assets` |
| AfuAds | `/v1/ads/*` → `afuads-api` | `/ads/*` → `afuads-api` | `afu-ads-assets` |

Each CDN Worker serves only its own product prefix from its explicitly bound
bucket. The CDN hostname dispatches to that product’s object handler; it does
not call another product’s API or storage binding.

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
| `cdn.afuchat.com` (root object paths) | `afuchat-media` | Existing mixed-media object URLs. The `/chat/*` Worker route handles the canonical AfuChat CDN prefix. |
| `img.afuchat.com` | `afucloud-images` | Existing AfuCloud object URLs. New product URLs use `cdn.afuchat.com/cloud/*`. |

No bucket, object, DNS record, or custom domain was deleted, moved, or copied.

## Removed routes

The following obsolete API aliases were removed from the Cloudflare zone:

| Removed route | Previous Worker |
|---|---|
| `api.afuchat.com/chat/*` | `afuchat-api` |
| `api.afuchat.com/v1/storage*` | `afuchat-api` |
| `api.afuchat.com/afucloud/*` | `afucloud-api` |
| `api.afuchat.com/v1/auth-resolve-identifier` | `afuauth-api` |

The remaining scoped route inventory contains eleven product API/CDN routes
plus the required `api.afuchat.com/` root gateway. Together with the preserved
`cloud.afuchat.com/*` website route, these are the zone’s relevant routes for
the audited hosts. No legacy alias or catch-all route remains on the API/CDN
hosts.

Older deployed clients were still using some removed aliases at audit time.
Those callers must be updated to the canonical paths; the aliases are not
redirected or proxied.

## AfuChat production verification

The `afuchat-api` Worker was deployed with hostname/path gating so it accepts
only `api.afuchat.com/v1/chat/*` for API requests and
`cdn.afuchat.com/chat/*` for media delivery. Legacy unnamespaced storage paths
and other product CDN prefixes return `404` at the Worker.

Verified live on 2026-10-06:

- `GET https://api.afuchat.com/` → `200`, served through `afu-api` and its
  AfuAuth service binding.
- `GET /v1/chat/healthz` → `200`, `afuchat-api`.
- `GET /v1/chat/status` → `200`; Supabase and Worker checks both report healthy.
- CORS preflight for `/v1/chat/conversations` → `204` with the AfuChat origin.
- Unauthenticated `/v1/chat/storage/usage` and invalid-session
  `/v1/chat/conversations` → `401`.
- `GET https://cdn.afuchat.com/chat/__deployment_probe__` → `400 Invalid storage
  key` with an AfuChat request ID, confirming dispatch to the AfuChat media
  handler.
- Read-only `HEAD` checks for three existing public legacy objects on the root
  `cdn.afuchat.com` custom domain returned `200` (two images and one video).
- The post-deployment route inventory contains no removed aliases, and all six
  product API routes, five CDN routes, five product R2 bindings, the root
  gateway, and the AfuCloud website route have the expected owners.

The `/chat/` CDN probe deliberately uses an invalid key; it verifies route
dispatch, not delivery from the dedicated `afu-chat-assets` bucket, which had
no objects at audit time. The separate legacy root-domain object probes verify
that existing files still serve. Video registration and manifest endpoints
remain explicit `501` stubs until a video-processing backend is configured;
they are not reported as healthy processing endpoints.

## Change safety

`backend/route-management/reconcile.mjs` defaults to a read-only dry run. Use
`--apply` only for an approved route reconciliation. It verifies Worker
existence, exact route ownership, product bucket bindings, retained custom
domains, API DNS fail-closed behavior, and the website/root routes before
changing routes. It creates canonical routes before deleting obsolete API/CDN
routes and rolls back route changes if post-deployment verification fails.

Do not delete or migrate product data as part of route cleanup. Route ownership
does not certify product health. Per the product-scope decision, once a
non-AfuChat product’s URL and binding are confirmed, leave its health and
implementation unchanged unless separately requested.
