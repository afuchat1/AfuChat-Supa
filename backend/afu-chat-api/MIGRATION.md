# AfuChat backend separation

This file records the separation constraints and known database compatibility
risks. The current production inventory and API smoke results are in
[`docs/API_INFRASTRUCTURE_AUDIT.md`](../../docs/API_INFRASTRUCTURE_AUDIT.md).

The user's required final Worker is exactly `afuchat-api`, with the public
namespace `api.afuchat.com/v1/chat/*`. That Worker is not present in the live
inventory. The staged source in this directory is configured as `afu-chat-api`
(different name), is incomplete, and must not be deployed over the existing
media Worker route.

## Current live ownership

- `afuchat-media-worker` owns `api.afuchat.com/afuchat/*` and
  `cdn.afuchat.com/chat/*`. It is the current Supabase-compatible and media
  Worker used by mobile; it is not the complete `/v1/chat/*` business API.
- `afu-api-gateway` owns the broad `api.afuchat.com/*` route and forwards root
  `/v1/*` traffic to `afucloud-api`.
- `cdn.afuchat.com` at the root remains an R2 custom domain for
  `afuchat-media`. The more-specific `/chat/*` Worker route reads
  `afu-chat-assets`.
- The target `afu-chat-assets` bucket exists and is empty. The source
  `afuchat-media` bucket remains intact and currently contains 1,429 objects;
  the full inventory totals 1,531,320,634 bytes.

Do not detach the live routes or rename/redeploy a Worker to an overlapping
route until all current app callers have a compatibility plan and the new
handlers pass production-equivalent tests.

## Database and compatibility inventory

Database crosswalk findings below were collected read-only on 2026-10-03;
Cloudflare routes and R2 counts were rechecked on 2026-10-04.

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
- The AfuChat media source, `afuchat-media`, currently contains 1,429 objects
  totaling 1,531,320,634 bytes. A fresh paginated inventory aggregated only
  object counts, byte totals, and top-level key groups; no object contents were
  read. The bucket has several product/media categories, so do not bulk-copy it
  without confirming per-prefix ownership.
- The existing `cdn.afuchat.com` custom domain maps to `afuchat-media` at the
  root. Keep this mapping intact. `/chat/*` is a separate path-specific route
  to `afuchat-media-worker`, backed by the empty `afu-chat-assets` bucket.
- `img.afuchat.com` remains mapped to `afucloud-images`.
- The mobile Supabase client and media API now use
  `https://api.afuchat.com/afuchat`; other app-specific calls still use root
  `https://api.afuchat.com/v1/*`. The requested `/v1/chat/*` namespace has not
  been cut over.
- The app normalizes legacy `/v1/storage/{key}` and `/chat/{key}` URLs. The new
  `/chat/*` Worker accepts only `containers/...` keys, while legacy objects
  remain in `afuchat-media` and the root CDN custom domain. The mobile resolver
  has been corrected in source to keep legacy keys on the root CDN and send
  only `containers/...` keys to `/chat/`. This is not live in already-released
  app builds until they are rebuilt/released.
- The target bucket has no existing container keys to copy. A broader copy of
  the legacy bucket is not necessary for that new key format and would include
  categories whose ownership must be reviewed.
- The staged source's login-resolver, push, support-reply, and account-export
  handlers query `public` through a service-role client (including profiles,
  push devices, chat membership/messages, support tickets, and export data).
  Do not copy them into this Worker as-is or grant it general `public` access.
  Their table ownership and schema placement need review first.

## Client contract inventory

- Supabase Auth/PostgREST/Realtime calls use the live `afuchat-media-worker`
  path `/afuchat/{auth,rest,realtime}/v1/*`, backed by the existing Supabase
  project. App reads and writes continue to use `public` compatibility
  relations/RPCs; changing PostgREST profiles requires a call-by-call audit.
- Media session/container requests use `/afuchat/v1/auth/session`,
  `/afuchat/v1/storage/usage`, and `/afuchat/v1/storage-containers/*`.
- Other mobile functions still call the legacy root `/v1/*` API, including
  `/v1/status`, `/v1/auth-resolve-identifier`, `/v1/ai/chat`,
  `/v1/account/export`, `/v1/videos/*`, and `/v1/payments/*`. Production probes
  found `/v1/status`, `/v1/ai/chat`, `/v1/auth/register`, and
  `/v1/chat/conversations` return 404. Authenticated behavior for other routes
  was not tested with a user account.
- The required `/v1/chat/*`, `/v1/auth/*`, `/v1/mail/*`, `/v1/cloud/*`,
  `/v1/ai/*`, and `/v1/ads/*` product namespaces are not fully served by the
  current routes. Preserve legacy paths while the corresponding handlers and
  compatibility aliases are built.

## Gates before production routing

1. Obtain the current AfuMail and AfuAds backend sources and identify their
   existing API contracts; do not create placeholder Workers.
2. Reconcile every mobile `/v1/*` caller with its deployed handler. Do not
   treat local `backend/cf-worker` route declarations as proof of live behavior.
3. Map the remaining public compatibility views/RPCs to their owning product
   and service before moving calls from the shared Supabase proxy.
4. Implement and test AfuChat business handlers under the exact target
   `afuchat-api` and `/v1/chat/*` without replacing the active media proxy.
5. Keep the legacy root CDN mapping for old keys. No broad R2 copy is planned;
   any future copy must be separately approved, prefix-scoped, count/byte
   verified, and reversible by retaining the source.
6. Add a target API route only after the exact handler and all affected clients
   pass auth, RLS, contract, CORS, upload/download, and rollback tests. Preserve
   `/afuchat/*` and legacy root `/v1/*` routes during the compatibility release.

## Rollback boundary

The URL resolver change is source-only and can be reverted independently. No
Worker deployment, route, DNS record, database state, or R2 object was changed.
The existing root CDN and source bucket remain available for legacy keys. If a
future cutover fails, remove only newly added product routes and restore clients
to their prior API bases; do not remove the broad gateway route, the root CDN
mapping, or source objects.