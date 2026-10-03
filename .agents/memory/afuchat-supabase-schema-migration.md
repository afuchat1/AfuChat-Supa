---
name: AfuChat Supabase schema migration
description: AfuChat's intended schema migration and the mismatch observed in the live Supabase project.
---

The target architecture requires AfuChat product data in the `afuchat` schema, with shared identity/auth kept separate. A read-only Supabase Management API inventory on 2026-10-03 confirmed `afuchat` exists with 201 base tables and RLS enabled on all of them, but PostgREST's authenticator schema setting excludes it. The schema also contains AfuMail- and Afu Ads-named relations, so exposing or restructuring it is a cross-product concern. The schema has `USAGE` grants for `anon` and `authenticated`; audit per-table grants and policies before any exposure change.

The mobile client also relies on 86 `public` security-invoker compatibility views over `afuchat` tables. Their column definitions differ from the base tables, and 37 mobile-called RPCs exist only in `public`; all are `SECURITY DEFINER` with a search path spanning shared schemas. `clear_afuai_chat` additionally sets `row_security=off`.

**Why:** Earlier inventory used an API path that returned 403 and led to the incorrect conclusion that the schema was absent. The schema exists, but its current PostgREST configuration and cross-product contents make a direct cutover unsafe.

**How to apply:** Re-check live schema configuration before each migration. Do not expose all of `afuchat` or `public`, or move AfuMail/Afu Ads relations under AfuChat-only scope. Preserve the compatibility contract until client calls and RPC ownership are reviewed individually; audit security-definer search paths before routing RPCs. Coordinate shared PostgREST settings with affected owners, inventory table grants/policies, and preserve rollback data until consumers pass. Never infer row counts from anonymous RLS-filtered results.