# Afu ecosystem API infrastructure audit

**Checked:** 2026-10-04  
**Scope:** Cloudflare Workers, routes, bindings, Supabase schema metadata, R2 object metadata, mobile API callers, and production HTTP smoke checks.

This audit preserves the production resources and data. It changed no Worker deployment, Cloudflare route, DNS record, database row/schema, or R2 object. One client-side compatibility correction is in source: legacy media keys now resolve through the existing CDN root while new `containers/...` objects continue through `/chat/`. That change is not live for already-published app builds until those builds are released.

## Required Workers and namespaces

The requested target names and namespaces are:

| Product | Required Worker | Required namespace | Live status |
|---|---|---|---|
| AfuChat | `afuchat-api` | `/v1/chat/*` | Missing. `afuchat-media-worker` is live but only provides a Supabase proxy and storage API; it is not the complete chat API. |
| AfuAuth | `afuauth-api` | `/v1/auth/*` | Missing as a dedicated Worker. Supabase Auth is available through the legacy `/afuchat/auth/v1/*` proxy. |
| AfuMail | `afumail-api` | `/v1/mail/*` | Missing; no matching backend source was found in this workspace. |
| AfuCloud | `afucloud-api` | `/v1/cloud/*` | Exact Worker name exists, but the current implementation is a mixed root `/v1/*` API rather than the requested cloud namespace. |
| AfuAI | `afuai-api` | `/v1/ai/*` | Missing. The mobile app's `/v1/ai/chat` smoke request currently returns 404. |
| AfuAds | `afuads-api` | `/v1/ads/*` | Missing; no matching backend source was found in this workspace. |

Do not deploy empty Workers or attach routes that return 404. `backend/afu-chat-api/wrangler.toml` is an incomplete staged implementation named `afu-chat-api` (with a hyphen after `afu`), not the exact required `afuchat-api`. Deploying it now would also overlap the live media Worker route.

## Live Cloudflare routing

| Host/path | Current owner or destination | Notes |
|---|---|---|
| `api.afuchat.com/*` | `afu-api-gateway` | The gateway forwards `/v1/*` to the service binding `AFUCLOUD_API`, targeting `afucloud-api`. |
| `api.afuchat.com/afuchat/*` | `afuchat-media-worker` | More-specific route; serves the legacy Supabase-compatible and media API namespace used by the mobile app. |
| `cdn.afuchat.com/chat/*` | `afuchat-media-worker` | Reads only `afu-chat-assets`; current target bucket is empty. |
| `cdn.afuchat.com` root | R2 custom domain for `afuchat-media` | Keep this mapping for legacy object keys. A separate `/chat/*` Worker route takes precedence only on that path. |
| `cdn.afuchat.com/cloud/*` | `afucloud-cdn` | Existing cloud CDN route. |
| `img.afuchat.com` | R2 custom domain for `afucloud-images` | Existing AfuCloud image bucket. |

The live Worker inventory contains `afu-api-gateway`, `afuchat-media-worker`, `afucloud`, `afucloud-api`, and `afucloud-cdn`. Only `afucloud-api` exactly matches a requested final name. Keep the gateway and legacy routes until their consumers have been moved and verified.

## Current mobile API contract

The current mobile app uses two existing API bases; neither is the requested final `/v1/chat/*` namespace:

- Supabase Auth, PostgREST, and Realtime use `https://api.afuchat.com/afuchat` as the Supabase client base. The live media Worker proxies `/auth/v1/*`, `/rest/v1/*`, and `/realtime/v1/*` to the existing Supabase project, preserving the caller's authorization and RLS behavior.
- AfuChat media upload/session calls use the same `/afuchat` base.
- Other app functions still use `https://api.afuchat.com/v1`, which is routed through the gateway to the mixed `afucloud-api`. Current call sites include video, AI chat, payments, status, identifier resolution, and account export.

### Live AfuChat media/Supabase Worker endpoints

Base URL: `https://api.afuchat.com/afuchat`

| Method and path | Purpose and inputs | Auth and authorization | Response/errors |
|---|---|---|---|
| `GET /healthz` | Worker health. | Public. | `200 {"status":"ok","service":"afuchat-media-worker"}`. |
| `POST /v1/auth/session` | Verify the current Supabase bearer token and return the user ID and same access token. No body. | `Authorization: Bearer <Supabase access token>`; validated against Supabase Auth. | `200 {userId, accessToken}`; missing/invalid session is `401`; upstream verification failure is `502`. |
| `GET /v1/storage/usage` | Counts objects and bytes under the authenticated user's `containers/` prefix. | Bearer token; ownership is derived from the verified user ID. | `200 {user_id,used_bytes,used_count,quota_bytes,remaining_bytes,percent_used,per_bucket}`; missing auth is `401`. The upload route enforces the per-object limit, not a cumulative quota. |
| `GET /v1/storage-containers` | List the user's container names discovered under their R2 prefix. | Bearer token. | `200 [{id,name,slug},...]`; missing auth is `401`. |
| `POST /v1/storage-containers` | Create a logical container. JSON body: `{ "name": "..." }`; name is slugged and limited to 48 characters. | Bearer token. | `200 {id,name,slug}`; invalid/missing name is `400`. |
| `POST /v1/storage-containers/{containerId}/upload?name={objectName}` | Stream raw file bytes to R2; `Content-Type` is stored as object metadata. Default per-object limit is 100 MiB. | Bearer token; object is stored under `containers/{userId}/{containerId}/`. | `200 {key,size,etag}`; invalid name `400`, too large `413`, write failure `502`. |
| `GET /v1/storage-containers/{containerId}/objects?cursor={cursor}` | List objects in the authenticated user's container. | Bearer token. | `200 {objects:[{key,size,updatedAt,url}],nextToken}`; invalid cursor `400`. |
| `POST /v1/storage-containers/{containerId}/objects/confirm` | Confirm an uploaded object. JSON body requires `name` and `key`; `size` is optional. | Bearer token; key must equal the expected user/container prefix. | `200 {key,size,etag,url}`; invalid input `400`, outside container `403`, missing object `404`, size mismatch `409`. |
| `DELETE /v1/storage-containers/{containerId}/objects/by-key` | Delete one object. JSON body: `{ "key": "..." }`. | Bearer token; key must be under the authenticated user's container prefix. | `200 {ok:true}`; outside container `403`, invalid key `400`. |
| `GET` / `HEAD /v1/storage/{key}` | Retrieve a public object through the API route. Key must be a valid `containers/{uuid}/{slug}/...` key. | Public object read; only the validated new key format is accepted. | Object bytes and HTTP metadata; invalid key `400`, missing key `404`, invalid byte range `416`. |
| `GET` / `HEAD https://cdn.afuchat.com/chat/{key}` | Public CDN read for a new container object. Same key validation as the API read. | Public object read. | Object bytes, cache headers, ETag, ranges; invalid key `400`, missing key `404`, invalid byte range `416`. |
| Supabase `/auth/v1/*`, `/rest/v1/*`, `/realtime/v1/*` | Supabase-compatible Auth, REST, and WebSocket/realtime proxy paths; method, query, body, and profile headers follow Supabase contracts. | Worker injects its configured public API key and preserves the caller's bearer token; Postgres grants/RLS are authoritative. | Upstream Supabase responses pass through. Worker-generated upstream failures return `502`; trusted-origin CORS preflight returns `204`, untrusted origins receive `403`. |

These are the live media/Supabase routes, not a substitute for `/v1/chat/*` business endpoints such as conversations, posts, comments, reactions, or gifts.

### Root `/v1` production checks

| Request | Observed result | Interpretation |
|---|---|---|
| `GET /healthz` | `200` | Gateway/API health responds. |
| `GET /v1/storage-containers` without bearer | `401` | Route exists and requires authentication. |
| `GET /v1/projects` without bearer | `401` | Route exists and requires authentication. |
| `GET /v1/auth/register` | `404` | Not present at this production path. |
| `GET /v1/ai/chat` | `404` | Not present at this production path. |
| `GET /v1/chat/conversations` | `404` | Required AfuChat namespace is not currently served. |
| `GET /v1/status` | `404` | Mobile caller and production route are out of sync. |

An unauthenticated zero-row `profiles` read through `/afuchat/rest/v1` returned `200`; a deliberately invalid login returned the expected Supabase `invalid_credentials` response. The PostgREST OpenAPI-root request was not accepted, so this audit does not claim a complete generated OpenAPI contract for the dynamic table/RPC surface. Direct CDN HEAD probes returned `403` from this audit environment and do not establish whether the CDN works for app clients.

## Existing local Worker source (not a production contract)

- `backend/cf-worker/wrangler.toml` names `afucloud-api`, but declares broad `api.afuchat.com` routes. The live broad route currently belongs to `afu-api-gateway`. Its `IMAGES_BUCKET` binding points to the mixed `afuchat-media` bucket, while the live `img.afuchat.com` custom domain points to `afucloud-images`. Do not deploy this config as a namespace migration.
- The Hono entry point mounts local handlers at `/v1/auth`, `/v1/projects`, `/v1/analytics`, `/v1/tokens`, `/v1/activity`, `/v1/storage`, `/v1/domains`, `/v1/storage-containers`, `/v1/payments`, and `/v1`. It also declares root `/auth/v1/*`, `/rest/v1/*`, and `/realtime/v1/*` Supabase proxy paths. These local declarations do not match the current live `/afuchat/*` proxy route.
- The local `/v1/auth/*` handler reads and creates profiles through the configured `afucloud` schema. It is not a verified, product-independent AfuAuth service.
- The `/v1` app-functions router includes `/v1/ai/chat`, `/v1/ai/reply`, `/v1/ai/transcribe`, `/v1/ai/lens`, `/v1/status`, and `/v1/auth-resolve-identifier`. It combines Engagera calls with shared profile lookups and is not a verified isolated AfuAI Worker.
- Production probes returned `404` for `/v1/auth/register` and `/v1/ai/chat` even though those paths appear in local source. Do not copy or route these local handlers to the requested product namespaces until their data ownership, auth contract, bindings, and live behavior are verified.

## Supabase and R2 data

- One existing Supabase project is used; no new database was created. The schemas include `public`, `accounts`, `afuchat`, `afucloud`, `afuai`, `mail`, and `ads`.
- `afuchat` has 201 base tables, all with RLS enabled. The database also has 201 `public` security-invoker views used for compatibility. `afuai`, `mail`, `ads`, and `accounts` tables have RLS. In `afucloud`, 2 of 13 tables have RLS; the other 11 have no `anon`/`authenticated` CRUD grants in the inspected metadata.
- Earlier read-only crosswalk: 94 literal mobile table names and 37 literal RPC names; the client still depends on `public` compatibility views and RPCs. Do not switch the client wholesale to `Accept-Profile: afuchat` or expose all schemas without per-call ownership/grant review.
- Existing R2 source `afuchat-media` currently has 1,429 objects totaling 1,531,320,634 bytes. Major key groups include avatars (426), post images (207), chat attachments (143), voice messages (140), videos (136), and UUID-root keys (136 across 11 opaque prefixes). It also contains product/shop, verification, organization, and mini-app media. Do not bulk-copy the entire bucket without ownership review.
- Target `afu-chat-assets` currently has zero objects. The source `afuchat-media` root custom domain remains mapped to `cdn.afuchat.com`; the `/chat/*` Worker reads only the empty target and accepts only `containers/...` keys.
- The app's resolver previously converted legacy `/v1/storage/{key}` and `/chat/{key}` URLs to the new `/chat/{key}` route. That fails for existing non-container keys because the new Worker rejects those keys and the target is empty. The source change now sends only `containers/...` to `/chat/`; legacy keys use the existing CDN root. No objects were moved or copied.

## Security and operational controls

- Cloudflare managed protections and L7 DDoS protection are enabled. A leaked-credential rate-limit rule exists. No general endpoint-specific rate limits were found in the inspected Worker code or zone rules.
- The AfuChat media Worker validates bearer sessions, scopes writes to the authenticated user's container prefix, rejects untrusted API origins, streams uploads with a default 100 MiB object-size limit, and sets CORS/security headers.
- The Worker reports a 5 GiB per-user quota but the inspected upload handler does not enforce a cumulative quota. Add an enforced quota only after defining the product limit and testing concurrent uploads.
- The CORS allowlist includes `afuchat.com` subdomains and broad `.replit.dev`, `.replit.app`, and `.vercel.app` suffixes; review those suffixes before narrowing, since current preview clients may rely on them.
- Worker secret names were inspected, but values are intentionally excluded from this report.

## Blockers before routing the target namespaces

1. No complete, tested `afuchat-api` handler exists for `/v1/chat/*`; the staged Worker is incomplete and its configured name is wrong.
2. The live `/afuchat/*` and `/chat/*` routes serve current app clients. Keep them until a compatibility release and route-by-route smoke test are ready.
3. The root `/v1` gateway currently targets `afucloud-api`; changing it to `/v1/cloud/*` without preserving legacy `/v1/*` calls would break current clients.
4. AfuMail and AfuAds backend source and API contracts are not present in this workspace. Their site homepages do not prove that API Workers or routes exist.
5. A complete endpoint-by-endpoint contract for the dynamic PostgREST API and deployed root Worker cannot be produced from a successful OpenAPI response or a deployment-matched implementation. Do not document local route declarations as live behavior.

## Rollback boundary

The client URL correction can be reverted independently; it does not mutate stored URLs or objects. No Cloudflare routes, Worker deployments, database state, or R2 data were changed. The existing source bucket remains intact. Any future object copy must be separately approved; retain source objects and verify counts/bytes/metadata before considering source cleanup.