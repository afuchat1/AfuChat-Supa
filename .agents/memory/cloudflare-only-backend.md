---
name: Product-isolated Cloudflare architecture
description: AfuChat and AfuCloud are isolated products behind shared ecosystem entry points.
---

AfuChat, AfuAuth, AfuMail, AfuCloud, AfuAI, and AfuAds are distinct products. Their required Worker names and namespaces are exact: `afuchat-api` → `/v1/chat/*`, `afuauth-api` → `/v1/auth/*`, `afumail-api` → `/v1/mail/*`, `afucloud-api` → `/v1/cloud/*`, `afuai-api` → `/v1/ai/*`, and `afuads-api` → `/v1/ads/*`. They may share an API hostname, account identity, or database, but product logic and access must remain isolated. Do not create placeholders or duplicate services; preserve legacy routes until their clients are migrated and verified. Do not route browser requests directly to Supabase as a workaround for a missing Worker route.

**Why:** The user's Afu ecosystem master rules supersede earlier decisions that treated AfuChat and AfuCloud as one product with shared product resources. The user also specified that AfuChat's backend must be the Cloudflare Worker.

**How to apply:** Classify each endpoint, schema, object, binding, and deployment by product before changing it. Preserve legacy contracts during migration. Do not alter or decommission a resource until ownership, dependencies, data, consumers, validation, and rollback are confirmed; stop when ownership is unknown.

The required final API namespaces above supersede the older `/afuchat` and `/afucloud` namespace proposal. Current legacy paths (`/afuchat/*` and root `/v1/*`) remain live compatibility routes until replacement handlers and clients are ready.

**Why:** the user specified exact target Worker names and versioned product namespaces in the infrastructure brief.

**How to apply:** Reconcile each live client path with its owner before changing routes. Keep `afu-api-gateway` only while required for current legacy calls; do not route a product namespace to an incomplete handler.

Legacy AfuChat media keys stay on the existing `cdn.afuchat.com` root mapping to `afuchat-media`; only new `containers/...` objects use `cdn.afuchat.com/chat/*` and `afu-chat-assets`. Do not bulk-copy the mixed source bucket without prefix ownership review.

**Why:** the live `/chat/*` Worker accepts only container keys and its target bucket is empty, while older product media remains in the source bucket.

**How to apply:** Preserve legacy media URLs through the root CDN or an explicitly approved, prefix-scoped migration. Keep source objects for rollback.