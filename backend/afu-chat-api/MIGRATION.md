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

The API route is intentionally disabled in `wrangler.toml`. The bucket binding
names the target bucket, but that bucket was absent from the live inventory.
Do not deploy or attach routes until the database and storage gates below pass.

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
3. Create/inventory the exact `afu-chat-assets` bucket and plan a validated
   copy from current AfuChat object locations. Preserve keys, metadata, access
   behavior, and the `/chat/*` CDN contract; retain the old objects for
   rollback.
4. Inspect the active production Worker/version and exercise every client
   endpoint against it. Source code alone is not proof of the live contract.
5. Move AfuChat-owned handlers and data access into this Worker using only
   `afuchat` and `AFUCHAT_ASSETS`. Confirm ambiguous payment/video ownership
   with the relevant product owner; do not change AfuCloud resources.
6. Add the explicit `/afuchat/*` API route and `/chat/*` CDN mapping only after
   endpoint, auth, upload/download, and RLS tests pass. Move clients in a
   compatibility-preserving release, verify production behavior, then plan
   legacy decommissioning separately.

## Rollback boundary

No production infrastructure has been modified by this staging change. Until a
cutover is approved and verified, clients keep using their existing base URL,
the current API route stays in place, and existing storage objects remain
untouched. If a future cutover fails, remove only the newly added AfuChat route
and restore clients to the previous base URL; do not change the AfuCloud
Worker, schema, bucket, or catch-all route.