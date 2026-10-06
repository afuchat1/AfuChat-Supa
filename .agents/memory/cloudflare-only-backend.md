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

All six products use the same Supabase project and one Supabase-issued account identity. Never create product-specific user identities, duplicate login systems, or mint product-specific session tokens. Supabase SDK auth/data calls use the shared project directly; product business APIs use their owning versioned Worker route.

**Why:** The user explicitly requires one Afu account across all current Afu products and identified AfuChat ↔ AfuAuth as the first integration.

**How to apply:** Verify a shared Supabase-issued token through AfuAuth and forward that exact token to Supabase/RLS for product data. Keep product logic and Worker routes isolated; use the supported AfuChat `/chat/*` compatibility paths.

Existing mixed media in `afuchat-media` and its root CDN mapping must remain intact. Canonical AfuChat storage API requests use `/v1/chat/storage/*`; media and Supabase compatibility requests use `/chat/*`. Keep `/v1/storage*` only as a temporary compatibility alias for old clients until the new Worker route is deployed and verified. Stored URLs may be normalized as data, but outgoing requests must use supported AfuChat paths. Do not copy, delete, or reassign mixed-bucket objects without prefix ownership review.

**Why:** The existing bucket contains mixed product/media categories and is still used by legacy URLs; changing the public namespace must not break already-released clients.

**How to apply:** Preserve the existing R2 binding and root CDN. Deploy and verify the canonical Worker route before releasing clients that call it; keep compatibility parsing for old stored URLs separate from outgoing API requests.