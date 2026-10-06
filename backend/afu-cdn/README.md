# afu-cdn

`afu-cdn` is the single public media-delivery Worker for
`cdn.afuchat.com/*`. It dispatches known product prefixes to isolated R2
bindings and serves unprefixed legacy keys from `afuchat-media` without moving
or copying objects.

| Path | R2 bucket |
|---|---|
| `/chat/{key}` | `afu-chat-assets` |
| `/cloud/{key}` | `afucloud-images` |
| `/mail/{key}` | `afu-mail-assets` |
| `/ai/{key}` | `afu-ai-assets` |
| `/ads/{key}` | `afu-ads-assets` |
| `/{legacy-key}` | `afuchat-media` |

Product namespace roots such as `/chat` and `/chat/` are not object keys. An
unknown first segment is treated as a legacy key to preserve older root URLs;
add any future product prefix to the dispatch table and its R2 binding.

The active AfuCloud Worker was inspected read-only: its public URL base is
`cdn.afuchat.com/cloud`, and it resolves that prefix against `afucloud-images`.
The existing `img.afuchat.com` R2 custom domain remains attached to that same
bucket for older URLs.

## Deployment order

1. Deploy this Worker with `pnpm exec wrangler deploy --config backend/afu-cdn/wrangler.toml`.
   The broad route is added while any older, more-specific product routes remain
   in place.
2. Review the read-only route plan with `node backend/route-management/reconcile.mjs`.
3. After approving the production cutover, run
   `node backend/route-management/reconcile.mjs --apply` to remove the old
   product CDN routes and leave the single `cdn.afuchat.com/*` route.

The route reconciliation also validates API routes, all product R2 bindings,
the legacy CDN domain, the AfuCloud image domain, and the existing website
route. It does not change DNS, buckets, or objects.
