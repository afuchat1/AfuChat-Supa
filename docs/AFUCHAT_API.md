# AfuChat API contract

## Ownership and base URL

- Base URL: `https://api.afuchat.com`
- Canonical AfuChat Worker namespace: `/v1/chat/*`
- Worker: `afuchat-api`
- Worker source and deployment composition: `backend/afu-chat-api/`
- All AfuChat-owned product API operations, including storage, use `/v1/chat`.
- AfuAuth owns `/v1/auth/*`; AfuAI owns `/v1/ai/*`. Those routes are not AfuChat endpoints and are not moved by this contract.

Supabase Auth and Realtime remain on the shared Supabase project. All AfuChat
PostgREST table and RPC requests use the existing `afuchat` schema and enter
through the AfuChat Worker. The mobile client pins schema headers to `afuchat`;
the Worker rejects other schemas and accepts only the exact relation and
function names in `backend/afu-chat-api/src/data-gateway.ts`. It forwards the
same user's bearer token so the existing grants and row-level security remain
authoritative, and never uses a service-role key.

`afuchat.*` is the sole data source for AfuChat application records. Shared
authentication verifies the account identity; it does not redirect AfuChat
data reads to compatibility views or another product schema. The Worker and
mobile app do not use `chat.*`, `social.*`, or `public` compatibility resources
for AfuChat data.

## Mobile data gateway

| Method and path | Purpose and inputs | Authentication | Response |
|---|---|---|---|
| `GET`, `HEAD`, `POST`, `PATCH`, `DELETE /v1/chat/data/{registeredRelation}` | Compatibility path for the mobile app's statically inventoried PostgREST relations. Query string, filters, ranges, and supported PostgREST headers are preserved. Unknown relation names and schemas are rejected before Supabase is called. | The configured public API key is required. User bearers are verified through AfuAuth and forwarded unchanged for database row-level security. Anonymous requests use only the public anon role and remain subject to existing grants and policies. | Preserves the PostgREST status, body, and response metadata while adding AfuChat request headers. |
| `GET`, `POST /v1/chat/data/rpc/{registeredFunction}` | Compatibility path for the mobile app's statically inventoried RPC functions in `afuchat`. | Same bearer and row-level security behavior as table requests. | Preserves the PostgREST response; unknown functions are rejected before Supabase is called. |

## AfuChat endpoints

### Health and status

| Method and path | Purpose and inputs | Authentication | Response |
|---|---|---|---|
| `GET /v1/chat/healthz` | Public API health check. | Public. | `200 { product: "afuchat", status: "ok", version: "v1" }`; no Worker or infrastructure identifiers are returned. |
| `GET`, `POST /v1/chat/status` | Checks service health without returning provider or database details. The mobile status screen uses `GET`. | Public. | `200 { ok, timestamp }`; `ok` is false if the health check fails. |

### Conversations and account data

| Method and path | Purpose and inputs | Authentication | Response |
|---|---|---|---|
| `GET /v1/chat/conversations?unread_excluded_ids={uuid,...}` | Returns the signed-in user's chat list. The optional query can be repeated or comma-separated and accepts at most 100 UUIDs. | `Authorization: Bearer <Supabase access token>`; verified through shared authentication, then the same token is forwarded for row-level authorization. | Successful chat-list JSON is returned. Invalid IDs return `400`; missing/invalid session returns `401`; upstream failures return a generic `502` without upstream error details. |
| `GET /v1/chat/profiles/{profileId}` | Returns only the read-only fields used on another user's contact/profile page. Reads `afuchat.profiles`; hidden profile details are omitted for a private profile unless the verified viewer follows it. Either-direction block relationships hide the profile, and `last_seen` is null when online status is disabled. | Shared-session bearer verified through AfuAuth; the same bearer is forwarded to Supabase for profile, follow, and block checks. | `200 { profile }` with an allowlisted contact profile; invalid IDs return `400`, missing/blocked profiles return `404`, missing/invalid sessions return `401`, and lookup failures return a generic `502`. |
| `POST /v1/chat/account/export` | Requests an email export. JSON body: `{ "types": ["profile", "posts", "messages", "activity", "transactions"] }`. Omitted or unrecognized selections fall back to `profile`. | Bearer token verified through shared authentication; account email required. | `200 { ok: true, email }` after the JSON attachment is emailed. Missing email is `400`; unavailable delivery returns a generic `503` or `502`. |

### Saved posts and bookmarks

| Method and path | Purpose and inputs | Authentication | Response |
|---|---|---|---|
| `GET /v1/chat/bookmarks` | Lists up to 50 saved posts, including the post and public author fields needed by the Saved Posts screen. | Shared-session bearer verified through AfuAuth; all reads are scoped to that user. | `200 { items: [{ id, post_id, saved_at, post }] }`; missing/invalid session is `401`; upstream failures return a generic `502`. |
| `GET /v1/chat/bookmarks?post_id={uuid}` | Checks whether the current user saved one post. | Shared-session bearer. | `200 { bookmarked: boolean }`; malformed IDs return `400`. |
| `GET /v1/chat/bookmarks?post_ids={uuid,...}` | Checks saved status for a batch of up to 100 posts. | Shared-session bearer. | `200 { post_ids: [uuid, ...] }`; malformed or oversized batches return `400`. |
| `POST /v1/chat/bookmarks` | Saves a post. JSON body: `{ "post_id": "..." }`. An optional `expected_user_id` is accepted only as an offline-queue account check; the target user is always derived from the verified session. | Shared-session bearer. | Idempotent `200 { bookmarked: true }`; invalid input returns `400`, an account mismatch returns `409`, and database failures return a generic `502`. |
| `DELETE /v1/chat/bookmarks?post_id={uuid}&expected_user_id={uuid}` | Removes a saved post. `expected_user_id` is optional and only prevents an offline action from crossing accounts. | Shared-session bearer; the delete filter always uses the verified user ID. | Idempotent `200 { bookmarked: false }`; invalid input returns `400`, an account mismatch returns `409`, and database failures return a generic `502`. |

### Follows

The signed-in user's identity is always taken from the verified shared session.
Profile follow-list privacy settings are enforced for list and ID queries.

| Method and path | Purpose and inputs | Authentication | Response |
|---|---|---|---|
| `GET /v1/chat/follows/summary?profile_id={uuid}` | Returns follower/following counts and whether the current account follows the profile or is followed by it. | Shared-session bearer. | `200 { followers_count, following_count, follows_you, is_following }`; invalid IDs return `400`; missing/invalid session returns `401`. |
| `GET /v1/chat/follows/status?user_ids={uuid,...}` | Checks the current account's follow relationship with up to 100 profiles. IDs may be comma-separated or repeated. | Shared-session bearer. | `200 { items: [{ user_id, is_following, follows_you }] }`; invalid or oversized lists return `400`. |
| `GET /v1/chat/follows/list?profile_id={uuid}&direction={followers\|following}&limit={1..100}&offset={n}` | Lists paginated follow records with public account-profile fields. | Shared-session bearer; the target profile's list privacy setting is enforced. | `200 { items, hidden, next_offset }`; private lists return an empty `items` array with `hidden: true`; invalid input returns `400`. |
| `GET /v1/chat/follows/ids?profile_id={uuid}&direction={followers\|following}&limit={1..100}&offset={n}` | Returns paginated profile IDs for follow-set and feed operations, with the same list-privacy enforcement. | Shared-session bearer. | `200 { items: [uuid, ...], hidden, next_offset }`; invalid input returns `400`. |
| `POST /v1/chat/follows` | Follows a profile. JSON body: `{ "target_user_id": "uuid", "expected_user_id": "optional uuid" }`. The optional account check prevents queued work from crossing accounts. | Shared-session bearer; `follower_id` is derived from the verified session. | Idempotent `200 { is_following: true, target_user_id }`; invalid or mismatched input returns `409`. |
| `DELETE /v1/chat/follows?target_user_id={uuid}&expected_user_id={uuid}` | Unfollows a profile. The optional account check is used for queued work. | Shared-session bearer; deletion is scoped to the verified follower. | Idempotent `200 { is_following: false, target_user_id }`; invalid or mismatched input returns `409`. |

### Discover feeds and post views

| Method and path | Purpose and inputs | Authentication | Response |
|---|---|---|---|
| `GET /v1/chat/feed/for-you` | Returns the recent, mid-range, and throwback streams. Supports bounded paging/cursor parameters (`recent_since`, `mid_before`, `mid_since`, `throwback_before`, offsets, `recent_limit`, and stream-exhaustion flags), plus `older_than`, `newer_than`, and `exclude_self`. | Shared-session bearer; author identity and interaction state are based on the verified account. | `200 { recent, mid, throwback }`; invalid cursors or limits return `400`, missing/invalid session returns `401`, and database failures return a generic `502`. |
| `GET /v1/chat/feed/following?limit={n}&older_than={timestamp}&newer_than={timestamp}` | Returns posts from profiles followed by the signed-in account, plus the current following ID set. | Shared-session bearer; followed IDs are derived from the verified account. | `200 { items, following_ids }`; invalid cursors or limits return `400`, missing/invalid session returns `401`, and database failures return a generic `502`. |
| `POST /v1/chat/feed/views` | Records one batch of up to 100 post IDs. JSON body: `{ "post_ids": ["uuid", ...], "expected_user_id": "optional uuid" }`. The optional account check prevents queued work from crossing accounts. | Shared-session bearer; the view owner is derived from the verified session. | `200 { recorded: true, count }`; malformed input returns `400`, an account mismatch returns `409`, and database failures return a generic `502`. |

### Posts (initial migration slice)

These named routes cover post creation, the signed-in user's post list,
single-post details, owner deletion, acknowledgments, and replies. Feed ranking
and post-view recording use the separate named routes above. Mention search and
other post surfaces remain outside this slice.

| Method and path | Purpose and inputs | Authentication | Response |
|---|---|---|---|
| `POST /v1/chat/posts` | Creates a post with a fixed field allowlist. JSON body supports post content/media/article/duet fields and an optional ordered `images` array. Media URLs must be HTTPS. `author_id` is ignored; the Worker derives it from the verified session. Image metadata rows are written as part of the operation; if that write fails, the new post row is rolled back. | Shared-session bearer; the same token is forwarded for database row-level security. | `201 { post }`; malformed or oversized input returns `400`, missing/invalid session returns `401`, and database failure returns a generic `502`. |
| `GET /v1/chat/posts/mine` | Lists up to 50 posts for the verified account, including ordered image URLs and like/reply counts used by My Posts. | Shared-session bearer; author ID is always taken from the verified session. | `200 { items }`; missing/invalid session returns `401`, and database failures return a generic `502`. |
| `GET /v1/chat/posts/{postId}` | Loads one post, ordered images, shared `accounts.profiles` author fields, and whether the current account liked it. Database row-level policies still determine whether the caller may see it. | Shared-session bearer; same bearer token is forwarded to each read. | `200 { post }`; invalid IDs return `400`, inaccessible/missing posts return `404`, and database failures return a generic `502`. |
| `DELETE /v1/chat/posts/{postId}` | Deletes only a post whose `author_id` matches the verified account. | Shared-session bearer; ownership is enforced in the database filter as well as row-level policies. | `200 { ok: true, id }`; invalid IDs return `400`, missing/non-owned posts return `404`, and database failures return a generic `502`. |
| `POST`, `DELETE /v1/chat/posts/{postId}/like` | Idempotently adds or removes the current account's post acknowledgment. | Shared-session bearer; user ID is always derived from the verified session. | `200 { liked: boolean }`; invalid IDs return `400`; database failures return a generic `502`. |
| `GET /v1/chat/posts/{postId}/replies` | Lists up to 100 replies in chronological order with shared account profiles, like counts, and current-account like state. | Shared-session bearer; the same token is forwarded to all reads. | `200 { items }`; invalid IDs return `400`; database failures return a generic `502`. |
| `POST /v1/chat/posts/{postId}/replies` | Creates a text, image, or voice reply. JSON body accepts `content`, optional `parent_reply_id`, HTTPS `image_url`/`voice_url`, and `voice_duration`. A parent reply must belong to the same post; `author_id` is derived by the Worker. | Shared-session bearer; row-level security applies. | `201 { reply }`; invalid data returns `400`, unknown parent returns `404`, and database failures return a generic `502`. |
| `POST`, `DELETE /v1/chat/posts/{postId}/replies/{replyId}/like` | Adds or removes the current account's like on a reply; the reply is checked against the URL's post first. | Shared-session bearer; user ID is always derived from the verified session. | `200 { liked: boolean }`; invalid IDs return `400`, missing reply returns `404`, and database failures return a generic `502`. |

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
| `GET`, `HEAD https://cdn.afuchat.com/chat/{key}` | CDN delivery for validated container objects through the separate `afu-cdn` Worker. This is not an AfuChat API operation. | Public read. | Object bytes, cache headers, ETag, and range responses. |

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

The mobile source uses the canonical storage paths:

| Former path | Current path |
|---|---|
| `/v1/storage/usage` | `/v1/chat/storage/usage` |
| `/v1/storage-containers` | `/v1/chat/storage/containers` |
| `/v1/storage-containers/{containerId}/*` | `/v1/chat/storage/containers/{containerId}/*` |
| `/v1/storage/{key}` | `/v1/chat/storage/objects/{key}` |

The former `/v1/storage*` and `/chat/*` API aliases, along with the old
`/afucloud/*` and auth resolver aliases, have been removed from Cloudflare
routing. Older clients that still call those aliases must be upgraded; there is
no redirect or compatibility proxy. The root `api.afuchat.com/` remains owned by
the separate `afu-api` gateway and forwards only the root request to AfuAuth.

The `afu-cdn` Worker owns `cdn.afuchat.com/*` and dispatches
`/chat/{key}` through `CHAT_ASSETS` to `afuchat-media`. Unprefixed legacy
object URLs use `LEGACY_MEDIA`, which points to that same bucket. The separate
URL paths remain intact; no objects were moved or copied.

The data gateway is deliberately limited to the current mobile call inventory:
no arbitrary schema, relation, or function can be selected. AfuChat-owned
application records, including profiles, bookmarks, follows, feeds, posts,
messages, payments, and storage metadata, use only `afuchat`. AfuAuth verifies
identity separately; it is not a data fallback.

## Deployment verification

`backend/afu-chat-api/deploy.mjs` composes the chat API with the existing
storage API handler and checks chat health, status, data-gateway CORS and
resource rejection, authentication rejection, the canonical storage route,
AfuAuth service binding, and the shared AfuChat/legacy media binding. CDN routing and delivery are managed separately by
`backend/afu-cdn/` and `backend/route-management/reconcile.mjs`.

The Worker was deployed on 2026-10-09 to the existing `afuchat-api` script. Its
postflight checks passed for health, status, CORS, session rejection, an
AfuChat schema probe, media routing, and the existing bindings. These checks do
not verify signed-in chat reads/writes. Production still needs the prepared
AfuChat RPC/RLS schema migration and an existing-account chat smoke test before
the release can be called complete. Already-published mobile builds still need
their own release to use updated client paths.
