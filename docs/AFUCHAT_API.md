# AfuChat API contract

## Ownership and base URL

- Base URL: `https://api.afuchat.com`
- Canonical AfuChat Worker namespace: `/v1/chat/*`
- Worker: `afuchat-api`
- Worker source and deployment composition: `backend/afu-chat-api/`
- All AfuChat-owned product API operations, including storage, use `/v1/chat`.
- AfuAuth owns `/v1/auth/*`; AfuAI owns `/v1/ai/*`. Those routes are not AfuChat endpoints and are not moved by this contract.

The mobile Supabase SDK continues to use the shared Supabase project for Auth,
PostgREST, and Realtime. Those shared database-provider requests are not
AfuChat Worker endpoints; their schema, URLs, and compatibility relations are
unchanged.

## AfuChat endpoints

### Health and status

| Method and path | Purpose and inputs | Authentication | Response |
|---|---|---|---|
| `GET /v1/chat/healthz` | Worker health check. | Public. | `200 { product: "afuchat", worker: "afuchat-api", status: "ok", version: "v1" }`. |
| `GET`, `POST /v1/chat/status` | Checks the public Supabase profile endpoint and reports Worker/provider configuration. The mobile status screen uses `GET`. | Public. | `200 { ok, timestamp, services, configuration, worker }`; `ok` is false if the Supabase check fails. |

### Conversations and account data

| Method and path | Purpose and inputs | Authentication | Response |
|---|---|---|---|
| `GET /v1/chat/conversations?unread_excluded_ids={uuid,...}` | Returns the signed-in user's chat list. The optional query can be repeated or comma-separated and accepts at most 100 UUIDs. | `Authorization: Bearer <Supabase access token>`; verified through `afuauth-api`, then the same token is forwarded to Supabase RLS. | Supabase `get_chat_list` JSON response passes through. Invalid IDs return `400`; missing/invalid session returns `401`; missing service configuration returns `503`; upstream failure returns `502`. |
| `POST /v1/chat/account/export` | Requests an email export. JSON body: `{ "types": ["profile", "posts", "messages", "activity", "transactions"] }`. Omitted or unrecognized selections fall back to `profile`. | Bearer token verified through `afuauth-api`; account email required. | `200 { ok: true, email }` after the JSON attachment is emailed. Missing email is `400`; missing email-provider configuration is `503`; delivery failure is `502`. |

### Payments

| Method and path | Purpose and inputs | Authentication | Response |
|---|---|---|---|
| `POST /v1/chat/payments/pesapal-initiate` | Starts a Pesapal donation or ACoin top-up. JSON body accepts `{ "purpose": "donation" | "acoin_topup", "acoin_amount": number, "usd_amount": number }`. `purpose` defaults to `acoin_topup`; a donation requires `usd_amount`. | Bearer token verified through `afuauth-api`; the account must have a verified email. | `200 { redirect_url, order_tracking_id, merchant_reference }`; invalid amount/email is `400`, missing Pesapal setup is `503`, provider failure is `502`. |
| `GET`, `POST /v1/chat/payments/pesapal-callback` | Pesapal checkout callback. Reads `OrderTrackingId` and `OrderMerchantReference` from the query, form body, or JSON body. | Public provider callback; transaction state is rechecked with Pesapal. | `200 { ok, status, order_tracking_id, merchant_reference }`; missing references are `400`. Provider lookup failures return a pending result. |
| `GET`, `POST /v1/chat/payments/pesapal-ipn` | Pesapal IPN. Reads the same tracking/reference fields as the callback and rechecks transaction state before crediting ACoin. | Public provider callback; transaction state and merchant reference are verified with Pesapal before a credit. | `200 { orderNotificationId, orderTrackingId, orderMerchantReference }`; missing references are `400`; processing failure is `502`. |

### Storage and uploads

The API routes below are handled by the existing AfuChat media handler through
the `afuchat-api` deployment wrapper. New app clients use only the canonical
`/v1/chat/storage/*` paths.

| Method and path | Purpose and inputs | Authentication | Response |
|---|---|---|---|
| `GET /v1/chat/storage/usage` | Returns usage for the authenticated user's `containers/` objects. | Bearer session verified by the existing AfuChat media handler against the shared Supabase Auth project. | `200 { user_id, used_bytes, used_count, quota_bytes, remaining_bytes, percent_used, per_bucket }`; missing/invalid auth is `401`. |
| `GET /v1/chat/storage/containers` | Lists the user's logical containers. | Bearer session. | `200 [{ id, name, slug }]`; missing/invalid auth is `401`. |
| `POST /v1/chat/storage/containers` | Creates a logical container. JSON body: `{ "name": "..." }`; names are slugged and limited to 48 characters. | Bearer session. | `200 { id, name, slug }`; invalid name is `400`. |
| `POST /v1/chat/storage/containers/{containerId}/upload?name={objectName}` | Streams raw file bytes into the user's container. `Content-Type` is stored as object metadata; default maximum object size is 100 MiB. | Bearer session; the object key is scoped to the authenticated user and container. | `200 { key, size, etag }`; invalid name is `400`, too large is `413`, storage failure is `502`. |
| `GET /v1/chat/storage/containers/{containerId}/objects?cursor={cursor}` | Lists objects in one of the user's containers. | Bearer session. | `200 { objects: [{ key, size, updatedAt, url }], nextToken }`; invalid cursor is `400`. |
| `POST /v1/chat/storage/containers/{containerId}/objects/confirm` | Confirms an uploaded object. JSON body: `{ "name": "...", "key": "...", "size": number }`; `size` is optional. | Bearer session; the supplied key must match the authenticated user's container prefix. | `200 { key, size, etag, url }`; invalid input is `400`, outside-container key is `403`, missing object is `404`, size mismatch is `409`. |
| `DELETE /v1/chat/storage/containers/{containerId}/objects/by-key` | Deletes one object. JSON body: `{ "key": "..." }`. | Bearer session; the key must be inside the authenticated user's container. | `200 { ok: true }`; invalid key is `400`, outside-container key is `403`. |
| `GET`, `HEAD /v1/chat/storage/objects/{key}` | Reads a public container object by key. Supports conditional and byte-range requests. | Public read; only validated `containers/{userId}/{containerId}/...` keys are accepted. | Object bytes and HTTP metadata; invalid key is `400`, missing object is `404`, invalid byte range is `416`. |
| `GET`, `HEAD https://cdn.afuchat.com/chat/{key}` | CDN delivery for validated container objects. This is a media-delivery route, not an API operation. | Public read. | Object bytes, cache headers, ETag, and range responses. |

The current upload implementation does not enforce the reported cumulative
5 GiB quota; it enforces the per-object upload limit.

### Video processing

| Method and path | Purpose and inputs | Authentication | Response |
|---|---|---|---|
| `POST /v1/chat/videos` | App attempts to register an uploaded source video with JSON fields `source_path` and optional `post_id`, `duration`, `width`, `height`, `source_size_bytes`, and `source_mime`. | The client sends its bearer token when available. | Currently `501 { error, request_id }`; the client intentionally keeps the original video as its playback fallback. |
| `GET /v1/chat/videos/{assetId}/manifest` | App requests a playback manifest for an asset. | No server-side session check is currently performed by this stub. | Currently `501 { error, request_id }`. |
| `GET /v1/chat/videos/by-post/{postId}/manifest` | App requests a playback manifest for a post. | No server-side session check is currently performed by this stub. | Currently `501 { error, request_id }`. |

The Worker also returns `501` for other `/v1/chat/videos` paths until video
processing is configured. `OPTIONS` is handled as a CORS preflight.

## AfuAuth dependency and shared session flow

AfuChat does not create its own identity system or token. The mobile app obtains
Supabase-issued sessions from the shared account flow and sends the same
Supabase access token to AfuChat.

- `POST /v1/auth/session` belongs to `afuauth-api`. It accepts the bearer token
  and returns the verified user plus that same `accessToken`; it does not mint
  an AfuChat token. The mobile media-upload flow uses this endpoint.
- `POST /v1/auth/resolve-identifier` belongs to `afuauth-api`. AfuChat login
  sends `{ "identifier": "..." }` and receives `{ "email": "..." }` before
  using the shared login flow.
- The AfuChat Worker calls `afuauth-api` through its `AFUAUTH_API` service
  binding when validating sessions for conversations, account export, and
  payments. It forwards the original Supabase token to Supabase where RLS
  applies.
- AI calls stay on AfuAI-owned `/v1/ai/*` routes and are not part of this
  AfuChat endpoint inventory.

## Renamed routes and compatibility

The mobile source now uses these canonical storage paths:

| Legacy path | Canonical path |
|---|---|
| `/v1/storage/usage` | `/v1/chat/storage/usage` |
| `/v1/storage-containers` | `/v1/chat/storage/containers` |
| `/v1/storage-containers/{containerId}/*` | `/v1/chat/storage/containers/{containerId}/*` |
| `/v1/storage/{key}` | `/v1/chat/storage/objects/{key}` |

The deployment wrapper still accepts the old `/v1/storage*` paths as
compatibility aliases for previously released app versions. They are not the
canonical contract and new clients must not call them. They can be removed
only after old clients have been migrated and the production routes have been
verified.

No `/v1/posts`, `/v1/messages`, `/v1/profile`, `/v1/upload`, or `/v1/feed`
endpoints are registered by this AfuChat Worker. Unimplemented AfuChat paths
return `501`; no speculative handlers are documented here.

## Deployment verification

`backend/afu-chat-api/deploy.mjs` composes the chat API with the existing media
handler and includes preflight/postflight checks for chat health, status,
conversation authentication, the canonical and compatibility storage routes,
the AfuAuth service, and the existing media binding. This source update does
not itself deploy a Worker. Production route behavior must be rechecked after
deploying with that script; do not report a local source change as a live
deployment.

The latest live smoke probe confirmed `GET /v1/chat/healthz` returns `200` from
`afuchat-api`, but unauthenticated `GET /v1/chat/storage/usage` still returns
`501`. The legacy `/v1/storage/usage` returns `401`, showing that the existing
handler is reachable and enforcing authentication. The canonical storage
mapping is therefore implemented in source but is not live yet. Deploy the
Worker before releasing a mobile build that uses `/v1/chat/storage/*`; the
postflight check must return `401` for both storage usage paths.
