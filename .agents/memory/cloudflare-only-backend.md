---
name: Shared Afu identity and isolated Worker APIs
description: Afu products share one Supabase identity while their product APIs use isolated, versioned Cloudflare Worker routes.
---

AfuChat, AfuAuth, AfuMail, AfuCloud, AfuAI, and AfuAds are distinct products with exact Worker names and namespaces: `afuchat-api` → `/v1/chat/*`, `afuauth-api` → `/v1/auth/*`, `afumail-api` → `/v1/mail/*`, `afucloud-api` → `/v1/cloud/*`, `afuai-api` → `/v1/ai/*`, and `afuads-api` → `/v1/ads/*`.

All six products use the same Supabase project and one Supabase-issued account identity. Never create product-specific user identities, duplicate login systems, or mint product-specific session tokens. Supabase SDK auth/data calls use the shared project directly; product business APIs use their owning versioned Worker route.

**Why:** The user explicitly requires one Afu account across all current Afu products and identified AfuChat ↔ AfuAuth as the first integration.

**How to apply:** Verify a shared Supabase-issued token through AfuAuth and forward that exact token to Supabase/RLS for product data. Keep product logic and Worker routes isolated; do not use public `/afuchat/*` API calls or create placeholder Workers for future products.

Existing mixed media in `afuchat-media` and its root CDN mapping must remain intact. Keep media API requests on `/v1/storage*`; legacy stored URLs may still be normalized as data, but clients must not send requests to `/afuchat/*`. Do not copy, delete, or reassign mixed-bucket objects without prefix ownership review.

**Why:** The existing bucket contains mixed product/media categories and is still used by legacy URLs.

**How to apply:** Preserve the existing R2 binding and root CDN while changing API routes. Keep compatibility parsing for old stored URLs separate from outgoing API requests.