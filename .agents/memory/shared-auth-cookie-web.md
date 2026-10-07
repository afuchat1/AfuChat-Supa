---
name: Web Supabase auth storage
description: The earlier shared-cookie note no longer matches the active mobile web client.
---

The older shared `.afuchat.com` cookie implementation note is stale. The current
mobile web client uses `createClient` with a `localStorage`-backed storage
adapter; whether cross-subdomain session sharing is still an intended product
requirement has not been verified.

**Why:** The active client source and the previous memory entry conflict, so
future debugging must not assume cookie sharing is implemented.

**How to apply:** Check the current client configuration before investigating
web session sharing, and confirm the desired cross-subdomain behavior before
restoring or removing it.
