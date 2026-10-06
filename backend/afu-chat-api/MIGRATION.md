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
  `/v1/chat/storage/*` routes, and `cdn.afuchat.com/chat/*`. It preserves the
  existing media handler and R2 binding while serving the chat API.
- The older `/v1/storage*` paths remain temporary compatibility aliases for
  already-released app versions; new clients use only `/v1/chat/storage/*`.
- `afuauth-api` owns `api.afuchat.com/v1/auth/*` and the legacy username
  resolver alias. AfuChat verifies sessions through its Worker service binding
  and forwards the same Supabase bearer token to RLS.
- AfuCloud's existing API and CDN routes are unchanged by this AfuChat/AfuAuth
  cutover.
- `cdn.afuchat.com` at the root remains an R2 custom domain for
  `afuchat-media`. The more-specific `/chat/*` Worker route retains its
  existing `AFUCHAT_ASSETS` binding to that same bucket.

Do not detach the live routes or rename/redeploy a Worker to an overlapping
route until all current app callers have a compatibility plan and the new
handlers pass production-equivalent tests.

## Database and compatibility inventory

The detailed schema crosswalk below is historical and read-only; do not assume
its counts describe the new shared Supabase project. On 2026-10-06, read-only
PostgREST probes against the new project confirmed `accounts.profiles` and
`public.get_chat_list` are present. No database migration is needed for this
Worker integration.

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
- The existing `cdn.afuchat.com` custom domain maps to `afuchat-media` at the
  root. Keep this mapping intact. `/chat/*` is a separate path-specific route
  that must retain its `afuchat-media` bucket binding.
- `img.afuchat.com` remains mapped to `afucloud-images`.
- The mobile Supabase client uses the current shared Supabase URL. Chat and
  media-storage API calls use `/v1/chat/*`; media-session verification uses
  AfuAuth `/v1/auth/session`.
- The app normalizes legacy `/v1/storage/{key}` and `/chat/{key}` URLs. The new
  `/chat/*` Worker accepts only `containers/...` keys, while legacy objects
  remain in `afuchat-media` and the root CDN custom domain. The mobile resolver
  has been corrected in source to keep legacy keys on the root CDN and send
  only `containers/...` keys to `/chat/`. This is not live in already-released
  app builds until they are rebuilt/released.
- No media copy or storage migration is part of the AfuChat/AfuAuth connection.
- The user confirmed AfuChat owns its app routes under `/v1/chat/*`, including
  status, payments, account export, and videos. AI is a separate product owned
  by `afuai-api` under `/v1/ai/*`. Do not add a generic `/v1/*` route.
- The repository source implements health, status, conversations, account
  export, Pesapal payments, and the existing media-storage operations under
  `/v1/chat/storage/*`. The updated `afuchat-api` Worker was deployed on
  2026-10-06. Unauthenticated `/v1/chat/storage/usage` and the legacy
  `/v1/storage/usage` both return `401`, confirming both paths reach the
  authentication-guarded handler. This does not replace an authenticated
  upload/read test. Video processing and unimplemented chat paths return `501`
  until their handlers are configured. See `docs/AFUCHAT_API.md` for the full
  contract.

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

## Gates before production routing

1. Keep the current shared Supabase project and its `public` compatibility
   views/RPCs; do not add a schema migration for this Worker connection.
2. Keep the legacy root CDN mapping for old keys. No broad R2 copy is planned;
   any future copy must be separately approved, prefix-scoped, count/byte
   verified, and reversible by retaining the source.
3. Leave unrelated `/v1/*` handlers and the other product APIs unchanged.

## Rollback boundary

Rollback restores the prior Worker modules and removes only routes created by
this cutover. No Supabase schema, user, or R2 object is changed. Keep the
existing R2 bucket binding and root CDN mapping for legacy keys.