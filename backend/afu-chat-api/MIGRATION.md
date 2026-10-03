# AfuChat backend separation

This is the staged AfuChat-owned Worker, named exactly `afu-chat-api`. It is
not deployed and has no production route attached. The existing `afucloud-api`
Worker, its catch-all `api.afuchat.com/*` route, and all AfuCloud resources are
left unchanged.

## Target ownership

- Worker: `afu-chat-api`
- Database schema: `afuchat`
- R2 bucket: `afu-chat-assets`
- API path: `api.afuchat.com/afuchat/*`
- CDN path: `cdn.afuchat.com/chat/*` routed to `afu-chat-assets`

The API route is intentionally disabled in `wrangler.toml`. The
`afu-chat-assets` bucket has been created, but no objects have been copied and
no CDN/API route has been attached. Do not deploy or attach routes until the
database, storage, and compatibility gates below pass.

## Live inventory checked on 2026-10-03

- The `afuchat` schema exists and has 201 base tables; all 201 currently have
  row-level security enabled. The schema also contains relations named for
  AfuMail (`afumail_*`) and Afu Ads (`ad_*`). Do not change those relations.
- The database role setting for PostgREST excludes `afuchat`. The schema grants
  `USAGE` to `anon` and `authenticated`, so adding it to the exposed-schema
  setting could expand the REST API surface. Table grants and policies still
  need a per-table review, and the other product owners must be coordinated
  with before changing this shared API setting.
- The mobile client currently uses Supabase's default schema; changing its
  gateway profile to `afuchat` is not a safe drop-in until its table and RPC
  usage is mapped and compatible.
- The AfuChat media source, `afuchat-media`, contains 1,428 objects totaling
  1,530,935,263 bytes. The complete paginated inventory reports object metadata
  on all 1,428 objects. No object names or contents were copied or exposed.
- The existing `cdn.afuchat.com` custom domain maps to `afuchat-media` at the
  root. Keep this mapping intact; `/chat/*` requires a separate path-specific
  route to `afu-chat-assets`, not a replacement of the root custom domain.
- The exact `afu-chat-assets` bucket now exists and remains empty. The old
  bucket and `img.afuchat.com` mapping to `afucloud-images` are unchanged.
- The live `api.afuchat.com` root routes still target `afucloud-api`. AfuChat
  mobile calls include paths that are absent from the deployed route literals,
  so verify the production contracts before moving clients.
- AfuChat media calls currently hit storage handlers in `afucloud-api`; those
  handlers use the `afucloud` schema. Moving that data or changing the
  AfuCloud Worker/schema requires coordination with its owner and is outside
  this AfuChat-only change.

## Client contract inventory

The mobile app currently sends AfuChat requests to the root `api.afuchat.com`
base URL. The current repository Worker source does not match all observed
client paths, so deployed behavior must be checked before moving any consumer.

- Supabase Auth, PostgREST, and Realtime: `/auth/v1/*`, `/rest/v1/*`, and
  `/realtime/v1/*`; currently proxied by the mixed Worker. The staged Worker
  accepts these under `/afuchat/` and applies the `afuchat` PostgREST profile.
- AfuChat app functions: `/v1/status`, `/v1/auth-resolve-identifier`,
  `/v1/ai/*`, `/v1/push/*`, `/v1/support/ai-reply`, and `/v1/account/export`.
  Several are implemented in the current Worker source but are not yet copied
  into this Worker.
- Video: `/v1/videos/*` is called by the mobile client but no matching route is
  registered in the inspected Worker source. Its active production handler and
  owner must be identified before migration.
- Media: `/v1/storage/*` and `/v1/storage-containers/*` are used by mobile
  uploads. Current handlers bind the existing `afuchat-media` bucket and query
  product data. These require a verified object/table inventory and a
  compatibility-preserving copy to `afu-chat-assets`.
- Payments: `/v1/payments/*` is called by AfuChat screens, but payment ownership
  and downstream callbacks must be confirmed before moving the handler.
- Other observed calls include `/v1/auth/session` and status/account flows;
  validate the exact deployed contract and auth semantics before cutover.

The new Worker currently serves health checks and the Supabase-compatible
gateway only. Other paths return an explicit `501` until their handlers are
migrated and tested; it does not silently proxy product business logic back
through AfuCloud.

## Required gates before production routing

1. Obtain privileged, read-only access to inventory the live `afuchat` and
   currently exposed schemas, tables, views, functions, grants, RLS, triggers,
   indexes, relationships, and row counts. The observed live API did not expose
   `afuchat`, and the available management credential previously returned 403.
2. Confirm `afuchat` schema setup and PostgREST exposure. The staged gateway
   sends `Accept-Profile: afuchat` for REST requests and will not fall back to
   `public` or `afucloud`.
3. Copy the inventoried AfuChat objects into the existing `afu-chat-assets`
   bucket. Preserve keys and metadata, verify object counts and byte totals,
   and retain the source objects for rollback.
4. Inspect the active production Worker/version and exercise every client
   endpoint against it. Source code alone is not proof of the live contract.
5. Move AfuChat-owned handlers and data access into this Worker using only
   `afuchat` and `AFUCHAT_ASSETS`. Confirm ambiguous payment/video ownership
   with the relevant product owner; do not change AfuCloud resources.
6. Coordinate any shared PostgREST exposure or AfuCloud-owned storage migration
   with the affected product owners. Add the explicit `/afuchat/*` API route
   and `/chat/*` CDN mapping only after endpoint, auth, upload/download, and RLS
   tests pass. Move clients in a
   compatibility-preserving release, verify production behavior, then plan
   legacy decommissioning separately.

## Rollback boundary

No production infrastructure has been modified by this staging change. Until a
cutover is approved and verified, clients keep using their existing base URL,
the current API route stays in place, and existing storage objects remain
untouched. If a future cutover fails, remove only the newly added AfuChat route
and restore clients to the previous base URL; do not change the AfuCloud
Worker, schema, bucket, or catch-all route.