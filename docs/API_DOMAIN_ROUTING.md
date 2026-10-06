# AfuChat API domain and routing

**Verified:** 2026-10-06  
**Scope:** The API namespace gateway route and product-specific API/CDN routes.
No Cloudflare Worker, route, DNS record, domain, bucket, or data object is
deleted by this routing configuration.

## DNS and hostname ownership

Cloudflare is authoritative for `afuchat.com`. The zone has proxied wildcard A
records targeting the Vercel origin addresses `64.29.17.1` and `216.198.79.65`.
Those records remain unchanged so other hostnames are unaffected.

An exact DNS record now overrides the wildcard for the API hostname:

| Type | Name | Origin | Proxy |
|---|---|---|---|
| A | `api.afuchat.com` | `192.0.2.1` | Proxied |

The origin is a reserved, non-routable placeholder. Cloudflare Worker routes
serve API requests before origin fallback. Keep this exact record; do not
replace it with a Vercel target or remove it without first providing an
equivalent Cloudflare Worker-safe origin.

The hostname is owned through Cloudflare Worker routes, not a Worker custom
domain. No Vercel project-domain association could be queried from this
workspace; the wildcard DNS target and the pre-fix Vercel response established
the fallback behavior.

## AfuChat paths

| Host and path | Worker | Use |
|---|---|---|
| `api.afuchat.com/` | `afu-api` | API root entry point; forwards to AfuAuth |
| `api.afuchat.com/v1/auth/*` | `afuauth-api` | Authentication paths |
| `api.afuchat.com/v1/auth-resolve-identifier` | `afuauth-api` | Identifier resolution |
| `api.afuchat.com/chat/*` | `afuchat-api` | Supabase compatibility and media API |
| `api.afuchat.com/v1/chat/*` | `afuchat-api` | Versioned AfuChat business API |
| `api.afuchat.com/v1/storage*` | `afuchat-api` | Existing storage compatibility alias |
| `api.afuchat.com/v1/ai/*` | `afuai-api` | AfuAI operations |
| Other existing product paths | Existing product Worker | Preserved in Cloudflare |
| `cdn.afuchat.com/chat/*` | `afuchat-api` | Public AfuChat media |

Product paths are assigned directly to their existing Workers. The API root
route is assigned to `afu-api`, which forwards `/` through its AfuAuth service
binding. No catch-all route is added; unmatched paths retain the existing
fail-closed DNS behavior rather than being sent to a product Worker.

The API and CDN use the same `/chat/*` path on different hostnames. The media
handler now checks the hostname before dispatching that path, so API requests
go through the compatibility handler while CDN requests serve public objects.
The versioned business API remains under `/v1/chat/*`.

The `afuchat-api` Worker retains its existing `AFUCHAT_ASSETS` binding to the
`afu-chat-assets` bucket and `AFUAUTH_API` service binding to `afuauth-api`.
The gateway forwards only its root/auth fallback through the existing
`AFUAUTH_API` service binding.

## Verification

- `GET https://api.afuchat.com/` → `200`, existing AfuAuth root handler.
- `GET /v1/chat/healthz` → `200`, `afuchat-api`.
- `GET /chat/v1/storage/usage` → `401 Authentication required`, confirming the
  protected AfuChat compatibility handler is reached.
- `GET /v1/chat/storage/usage` and the existing `/v1/storage/usage` alias →
  `401 Authentication required`.
- Read-only `GET /chat/rest/v1/profiles?select=id&limit=0` → `200 []`.
- `GET https://cdn.afuchat.com/chat/__deployment_probe__` → `400 Invalid storage
  key`, confirming the CDN route reaches the AfuChat media handler.
- An unassigned API path returns Cloudflare `522` from the reserved placeholder
  origin; it does not reach Vercel or a product Worker.
- The root route belongs to `afu-api`; all listed product routes remain on their
  current Workers.
- AfuChat Worker tests pass, including a test that distinguishes API and CDN
  requests sharing `/chat/*`.
