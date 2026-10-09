---
name: AfuChat Supabase schema migration
description: Runtime schema ownership and safe routing for AfuChat data through Supabase PostgREST.
---

`afuchat` is the sole source of truth for AfuChat-owned application data. The mobile app and AfuChat Worker must read and write those records only through `afuchat`; do not route AfuChat data through `public` or `chat`. AfuAuth remains responsible for verifying identity, and the same user bearer must reach Supabase so row-level security remains authoritative.

Schema-only changes, when production is missing a required AfuChat contract, must be limited to the existing `afuchat` schema, reviewed against its live catalog, and reversible. Never copy, move, or recreate production records to make an alternate schema work.

**Why:** the user explicitly clarified that the existing AfuChat schema is authoritative and the `public` and `chat` data paths were introduced by mistake.

**How to apply:** Pin app and Worker PostgREST requests to `afuchat`, reject requests that select another schema, and surface database failures instead of returning a successful empty list. Keep identity verification separate from the AfuChat data source.
