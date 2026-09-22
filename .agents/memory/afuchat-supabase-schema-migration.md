---
name: AfuChat Supabase schema migration
description: The replacement Supabase project stores AfuChat application tables in afuchat while preserving auth and profile access.
---

The replacement project keeps all AfuChat base tables in the `afuchat` schema. Public compatibility views expose the same table names to the existing client, while `auth` remains project-owned and is not copied during application-data migrations. RLS policies and table triggers must be attached to `afuchat` base tables, not the compatibility views.

**Why:** A table/data-only migration can look complete while silently losing RLS and trigger behavior; the target had matching tables and row counts but no policies or triggers.

**How to apply:** Compare base tables, columns, indexes, row counts, policies, triggers, and functions separately. Do not recreate the legacy `create_marketplace_listing` RPC unless its missing `user_shop_purchases` dependency is restored first.