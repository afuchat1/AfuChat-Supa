---
name: Shared Afu identity and isolated Worker APIs
description: Afu products share one Supabase identity while their product APIs use isolated, versioned Cloudflare Worker routes.
---

AfuChat, AfuAuth, AfuMail, AfuCloud, AfuAI, and AfuAds are distinct products with exact Worker names and namespaces: `afuchat-api` → `/v1/chat/*`, `afuauth-api` → `/v1/auth/*`, `afumail-api` → `/v1/mail/*`, `afucloud-api` → `/v1/cloud/*`, `afuai-api` → `/v1/ai/*`, and `afuads-api` → `/v1/ads/*`.

The user confirmed AfuChat owns its app endpoints under `/v1/chat/*`, including status, payments, account export, and videos; AI is separate and belongs to `afuai-api` under `/v1/ai/*`. The current AfuChat Worker still needs handlers/configuration for the routes that return 501.

**Why:** Product path ownership is based on the app/product, not on where legacy route code happens to live.

**How to apply:** Move app calls to the owning product prefix, verify the owner Worker has a real handler before calling the route complete, and keep AfuAI on its own Worker.

Never attach a generic `api.afuchat.com/v1/*` fallback to AfuCloud. Each product keeps its own namespace, and an unassigned legacy path must not be captured by another product's Worker.

**Why:** The user clarified that the shared database contains multiple product schemas and each product must remain isolated: `/v1/chat` is AfuChat, `/v1/cloud` is AfuCloud, and `/v1/mail` is AfuMail.

Before adding a route, identify its product owner and exact prefix. Create a placeholder Worker only when the user explicitly names that API and Cloudflare confirms the Worker script is missing. Keep placeholder routes limited to that product prefix and return clear `501` responses for unimplemented operations; never use a catch-all or create a duplicate.

**Why:** The user requested future API placeholders only for named Workers that are confirmed missing, without connecting those placeholders to unrelated product routes.

**How to apply:** Query the Cloudflare Worker-script and route inventories before deployment. Preserve every existing script and route owner, then verify the new Worker health and placeholder responses.

All six products use the same Supabase project and one Supabase-issued account identity. Never create product-specific user identities, duplicate login systems, or mint product-specific session tokens. Supabase SDK remains the shared sign-in/session mechanism. AfuChat current-profile hydration uses `GET /v1/chat/me`; other product business APIs stay on their owning versioned Worker route.

**Why:** The user explicitly requires one Afu account across all current Afu products, preserving the working login while keeping AfuChat user/profile API ownership under `/v1/chat/*`.

**How to apply:** For AfuChat profile reads, validate the shared bearer through AfuAuth, derive the lookup ID only from the verified session, and forward that exact bearer to the existing Supabase/RLS profile source. Never accept a client-supplied user ID as authority or change AfuAuth login unnecessarily.

The API root route `api.afuchat.com/` belongs to the `afu-api` gateway and forwards only `/` through its AfuAuth service binding. Product API namespaces remain direct routes to their owning Workers. Each product CDN prefix must use that product's isolated R2 bucket. Keep the existing `cloud.afuchat.com/*` website route.

**Why:** The user requires the main API root to remain owned by `afu-api`, while each product keeps its own API/CDN namespace and storage.

**How to apply:** Reconcile only the exact product routes plus the root gateway. Do not add a generic API catch-all. Preserve the existing root `cdn.afuchat.com` and `img.afuchat.com` R2 domains for old object URLs; do not copy, delete, or reassign objects during route cleanup.

Product CDN URLs follow `cdn.afuchat.com/{product}/{object}`. The product segment is a routing namespace, not part of the object key; an empty product root is not an object lookup. An API-host `/chat` path is not a CDN object path and should return a generic API 404, not a storage-key validation error.

**Why:** The user clarified that `/chat` identifies the AfuChat CDN namespace and the object key starts after it.

**How to apply:** Keep host and prefix checks explicit, strip the exact product prefix before object lookup, and test both CDN namespace roots and API-host `/chat` paths.

When route cleanup is requested across products, first verify every product's exact API/CDN owner and isolated bucket binding. Once non-AfuChat routing is confirmed, leave those products' health and implementation unchanged and focus follow-up health work on AfuChat only.

**Why:** The user explicitly clarified that Afu products are separate products: other products need correct URL bindings, not additional health work during an AfuChat audit.

**How to apply:** Confirm non-AfuChat route and bucket ownership, report any observed health issue without changing that product, then continue checks and fixes only for AfuChat.

Public API responses must not expose internal Worker names, bindings, upstream services, database details, Cloudflare implementation details, stack traces, or internal hostnames. Keep operational diagnostics in internal logs and return generic public errors. Do not modify the AfuAuth API Worker; sanitize its responses at the gateway when needed. Preserve product namespaces and existing valid CDN object URLs.

**Why:** The user explicitly requires infrastructure details to remain private while preserving API ownership and existing media URLs.

**How to apply:** When changing maintained API Workers or the root gateway, sanitize upstream failures and uncaught errors before responding. Keep successful product data intact, use the owning product's isolated R2 binding for CDN objects, and leave AfuAuth source unchanged.