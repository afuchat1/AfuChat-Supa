---
name: AfuChat Supabase schema migration
description: Runtime schema ownership and safe routing for AfuChat data through Supabase PostgREST.
---

`afuchat` is the sole source of truth for AfuChat-owned application data, including all commerce relations (`shops`, `shop_products`, `shop_orders`, and related tables); there is no separate `shop` schema. The shared account profile and verification relations live in `accounts` and must be treated as explicit external references. The mobile app and AfuChat Worker must read and write AfuChat-owned records only through `afuchat`; do not route AfuChat data through `public`, `chat`, or a made-up schema. AfuAuth remains responsible for verifying identity, and the same user bearer must reach Supabase so row-level security remains authoritative.

Schema-only changes, when production is missing a required AfuChat contract, must be limited to the existing `afuchat` schema, reviewed against its live catalog, and reversible. Never copy, move, or recreate production records to make an alternate schema work.

**Why:** the user corrected a stale commerce route that targeted a nonexistent `shop` schema; live catalog checks confirm commerce tables are in `afuchat` and shared profiles are in `accounts`.

**How to apply:** Pin app and Worker PostgREST requests to `afuchat`, reject requests that select another schema, and surface database failures instead of returning a successful empty list. Route only confirmed shared-account relations to `accounts`. Before embedding shop/order/product relations, verify that a real FK exists; otherwise fetch related rows in batches and join them explicitly.
