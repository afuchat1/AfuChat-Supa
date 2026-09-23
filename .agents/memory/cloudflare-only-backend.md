---
name: Cloudflare-only application backend
description: AfuChat and AfuCloud share one product/backend boundary; Worker owns application APIs and R2 owns object storage.
---

AfuChat and AfuCloud are one product and share the same database/backend architecture. The Cloudflare Worker is the only public application backend; Supabase PostgreSQL/Auth are internal infrastructure, while Supabase Storage and Supabase Edge Functions are not production dependencies. Use Worker routes and Cloudflare R2 for application functions and media.

**Why:** The user explicitly selected a Cloudflare-only application backend so every project uses one API boundary and one object-storage layer.

**How to apply:** Do not add client calls to Supabase Storage or Edge Functions. Port legacy Edge Function behavior into Worker handlers, access shared database tables server-side, and keep R2 object operations behind authenticated Worker routes.