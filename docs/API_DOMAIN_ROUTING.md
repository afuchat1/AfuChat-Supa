# AfuChat API domain and routing

**Verified:** 2026-10-06  
**Scope:** AfuChat routes and the exact DNS record for `api.afuchat.com`. Other
Afu products' Workers, routes, data, and settings were not changed.

## DNS and hostname ownership

Cloudflare is authoritative for `afuchat.com`. The zone has proxied wildcard A
records targeting the Vercel origin addresses `64.29.17.1` and `216.198.79.65`.
Those records remain unchanged so other hostnames are unaffected.

An exact DNS record now overrides the wildcard for the API hostname:

| Type | Name | Origin | Proxy |
|---|---|---|---|
| A | `api.afuchat.com` | `192.0.2.1` | Proxied |

The origin is a reserved, non-routable placeholder. Cloudflare Worker routes
serve the supported API paths before origin fallback; an unassigned path cannot
fall through to the website's Vercel origin. The unmatched-path probe returned
Cloudflare `522`, not a Vercel response. Do not replace this exact record with a
Vercel target or remove it without first providing an equivalent Cloudflare
Worker-safe origin.

The hostname is owned through Cloudflare Worker routes, not a Worker custom
domain. No Vercel project-domain association could be queried from this
workspace; the wildcard DNS target and the pre-fix Vercel response established
the fallback behavior.

## AfuChat paths

| Host and path | Worker | Use |
|---|---|---|
| `api.afuchat.com/chat/*` | `afuchat-api` | Supabase compatibility and media API |
| `api.afuchat.com/v1/chat/*` | `afuchat-api` | Versioned AfuChat business API |
| `api.afuchat.com/v1/storage*` | `afuchat-api` | Existing storage compatibility alias |
| `cdn.afuchat.com/chat/*` | `afuchat-api` | Public AfuChat media |

Cloudflare selects the most-specific matching Worker route. Existing routes
owned by other products were left unchanged. There is no broad API-host catchall
to another product's Worker.

The API and CDN use the same `/chat/*` path on different hostnames. The media
handler now checks the hostname before dispatching that path, so API requests
go through the compatibility handler while CDN requests serve public objects.
The versioned business API remains under `/v1/chat/*`.

The `afuchat-api` Worker retains its existing `AFUCHAT_ASSETS` binding to the
`afuchat-media` bucket and `AFUAUTH_API` service binding to `afuauth-api`.
Neither binding nor the shared authentication Worker was changed.

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
- An unassigned API path returned Cloudflare `522`; it no longer reached
  Vercel.
- Cloudflare confirms the exact proxied DNS record and AfuChat route ownership.
- AfuChat Worker tests pass, including a test that distinguishes API and CDN
  requests sharing `/chat/*`.
