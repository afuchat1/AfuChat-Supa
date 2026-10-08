# AfuChat backend separation

This file records the separation constraints and known database compatibility
risks. AfuChat and AfuAuth use the same current Supabase project and user
identity. Their product API routes are `/v1/chat/*` and `/v1/auth/*`; the
Supabase SDK uses the shared project URL directly rather than an `/afuchat`
gateway path.

See [`docs/AFUCHAT_API.md`](../../docs/AFUCHAT_API.md) for the current
endpoint-by-endpoint API contract.

## Current live ownership

- `afuchat-api` owns `api.afuchat.com/v1/chat/*`, including the canonical
  `/v1/chat/storage/*` routes. Its `AFUCHAT_ASSETS` binding points to
  `afuchat-media`, shared with AfuChat's CDN and legacy media paths.
- The former `/v1/storage*` and `/chat/*` API aliases are removed. New clients
  must use `/v1/chat/storage/*`; no compatibility redirect or proxy remains.
- `afuauth-api` owns `api.afuchat.com/v1/auth/*`. Its canonical identifier
  resolver is `/v1/auth/resolve-identifier`; the old resolver alias is removed.
  AfuChat verifies sessions through its Worker service binding and forwards the
  same Supabase bearer token to RLS.
- AfuCloud, AfuMail, AfuAI, and AfuAds each retain their own versioned API and
  CDN namespaces and product-specific R2 buckets. Their route ownership was
  checked; their service health was not changed or brought into AfuChat scope.
- `afu-cdn` owns `cdn.afuchat.com/*`. Its `CHAT_ASSETS` and `LEGACY_MEDIA`
  bindings both point to `afuchat-media`; `/chat/*` and unprefixed legacy URLs
  retain separate URL paths while using the same physical bucket.

The existing `api.afuchat.com/*` fallback remains owned by the separate
`afu-api` gateway; product-specific API routes remain with their Workers. Keep
legacy URL parsing for stored data separate from outgoing API requests, which
must use canonical routes.

## Database and compatibility inventory

The detailed schema crosswalk below is historical and read-only; do not assume
its counts describe the new shared Supabase project. On 2026-10-06, read-only
PostgREST probes against the new project confirmed `accounts.profiles` and
`public.get_chat_list` are present. No database migration is needed for this
Worker integration.

### Mobile inventory refresh (2026-10-08)

The current audit and exact source inventories are recorded in
[`docs/AFUCHAT_BACKEND_MIGRATION_AUDIT.md`](../../docs/AFUCHAT_BACKEND_MIGRATION_AUDIT.md).
The read-only Management API catalog query now succeeds from this workspace;
direct PostgreSQL connections still fail from Replit. The mobile baseline
was refreshed after the follow/feed work: current source has 585 literal
`.from("relation")` call sites over 84 relation names in 110 files, and 91
direct RPC call sites over 36 function names. The latest catalog cross-check
remains dated 2026-10-07 and covered the prior 89-name relation set; the three
current names `app_banners`, `app_settings`, and `collections` have not been
checked against that catalog.

Named `/v1/chat/*` routes now cover saved posts, post create/detail/likes/replies,
follow lists/status/mutations, discover feeds, and batched post-view recording.
The mobile follow surfaces use these routes rather than direct
`.from("follows")` queries. Chat, Auth, Realtime, and SQLite offline behavior
remain separate boundaries; this is not a blanket PostgREST migration.

The current source still references four absent relation names
(`blocks`, `business_verification_requests`, `life_earth_leaderboard`, and
`org_page_jobs`); `orders` exists in `shop`, not `public`. These need explicit
domain mappings, not new tables or a general-purpose database proxy.

- The `afuchat` schema exists and has 201 base tables; all 201 currently have
  row-level security enabled. The schema also contains relations named for
  AfuMail (`afumail_*`) and Afu Ads (`ad_*`). Do not change those relations.
- `chat`/`social` and `afuchat` contain separate physical copies with divergent
  data. In the read-only message comparison, 18 rows present only in
  `chat.messages` have plaintext content and no encrypted content; among 3,080
  shared message IDs, 1,956 have different sender IDs. Other shared chat,
  membership, channel, and follow rows also differ. Some `afuchat` foreign keys
  still reference `chat` or `social`. Do not bulk-copy legacy rows, overwrite
  existing `afuchat` values, or turn plaintext into encrypted content. Keep both
  copies intact until conflicts and the row-retention policy are explicitly
  resolved.
- The database role setting for PostgREST excludes `afuchat`. The schema grants
  `USAGE` to `anon` and `authenticated`, so adding it to the exposed-schema
  setting could expand the REST API surface. Table grants and policies still
  need a per-table review, and the other product owners must be coordinated
  with before changing this shared API setting.
- The mobile client currently uses Supabase's default schema; changing its
  gateway profile to `afuchat` is not a safe drop-in until its table and RPC
  usage is mapped and compatible.
- A read-only mobile-source/catalog crosswalk found 94 literal table names and
  37 literal RPC names. Eighty-six table names resolve to an `afuchat` base
  table and an identically named `public` compatibility view; seven names were
  absent from both schemas and one resolves only in another exposed schema.
  All 86 views are `security_invoker` views that reference `afuchat`, so their
  underlying table RLS applies. However, the paired schemas are not equivalent:
  each side has 902 columns across these relations, with 363 column definitions
  unique to each side. All 37 called RPC names exist in `public`, none in
  `afuchat`. All 37 are `SECURITY DEFINER` functions with a search path spanning
  16 shared schemas; `clear_afuai_chat` also sets `row_security=off`. A direct
  profile switch would break client contracts, while blanket RPC forwarding
  would cross product boundaries. Any compatibility bridge must be explicitly
  scoped; do not expose all of `public` from the product Worker.
- The last read-only inventory (2026-10-04) recorded 1,429 objects totaling
  1,531,320,634 bytes in `afuchat-media`; no new object inventory was run for
  this integration. The bucket has several product/media categories, so do not
  bulk-copy it without confirming per-prefix ownership.
- The existing `cdn.afuchat.com` R2 custom domain remains attached to
  `afuchat-media`. The active `afu-cdn` Worker handles both root legacy paths
  and `/chat/*` through separate bindings to that same bucket.
- `img.afuchat.com` remains mapped to `afucloud-images`.
- The mobile Supabase client uses the current shared Supabase URL. Chat and
  media-storage API calls use `/v1/chat/*`; media-session verification uses
  AfuAuth `/v1/auth/session`.
- The app normalizes legacy `/v1/storage/{key}` and `/chat/{key}` URLs. The
  mobile resolver keeps legacy keys on the CDN root and sends `containers/...`
  keys under `/chat/`; the two URL forms now use the same physical
  `afuchat-media` bucket. This is not live in already-released app builds until
  they are rebuilt/released.
- On 2026-10-06, `afu-chat-assets` was verified to contain zero objects, both
  AfuChat bindings were switched to `afuchat-media`, and the empty bucket was
  deleted. No existing objects were copied or moved.
- The user confirmed AfuChat owns its app routes under `/v1/chat/*`, including
  status, payments, account export, and videos. AI is a separate product owned
  by `afuai-api` under `/v1/ai/*`. Do not add a generic `/v1/*` route.
- The repository source implements health, status, conversations, account
  export, Pesapal payments, and the existing media-storage operations under
  `/v1/chat/storage/*`. The updated `afuchat-api` Worker was deployed on
  2026-10-06. Health and status return `200`; status reports both Supabase and
  Worker checks as healthy. CORS, invalid-session rejection, and unauthenticated
  canonical storage checks pass. The legacy `/v1/storage*` API alias is removed.
  This does not replace an authenticated upload/read test. Video processing
  endpoints return `501` until their handlers are configured. See
  `docs/AFUCHAT_API.md` for the full contract.

## Client contract inventory

- Supabase Auth/PostgREST/Realtime calls use the same shared Supabase project
  directly. App reads and writes continue to use `public` compatibility
  relations/RPCs; changing PostgREST profiles requires a call-by-call audit.
- Media session/container requests use AfuAuth `/v1/auth/session` and AfuChat
  `/v1/chat/storage/*`; chat-list requests use `/v1/chat/conversations`.
- AfuChat app functions use `/v1/chat/*` (including status, payments,
  account export, and videos); AI requests use `/v1/ai/*` on `afuai-api`.
  Existing mobile callers are being aligned to these product namespaces.
- AfuMail, AfuCloud, and AfuAds retain their own API namespaces. Reuse the
  shared Supabase identity; do not create product-specific user tables or
  tokens.

## Storage and routing guardrails

1. Keep the current shared Supabase project and its `public` compatibility
   views/RPCs; do not add a schema migration for this Worker connection.
2. Keep the legacy root CDN mapping for old keys. AfuChat and legacy media
   currently share `afuchat-media`; any future separation or object copy must be
   separately approved, prefix-scoped, count/byte verified, and reversible by
   retaining the source.
3. Leave unrelated `/v1/*` handlers and the other product APIs unchanged.

## Rollback boundary

The prior `afu-chat-assets` bucket was empty when deleted. A rollback must not
restore a binding to that deleted bucket; create a replacement bucket and
explicitly migrate data only if separation is needed again. Existing
`afuchat-media` objects, the root CDN mapping, Supabase schema, and users were
not changed.