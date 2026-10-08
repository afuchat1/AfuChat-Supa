---
name: AfuChat Supabase schema migration
description: AfuChat's intended schema migration and the mismatch observed in the live Supabase project.
---

The target architecture requires AfuChat product data in the `afuchat` schema, with shared identity/auth kept separate. A read-only Supabase Management API inventory on 2026-10-03 confirmed `afuchat` exists with 201 base tables and RLS enabled on all of them, but PostgREST's authenticator schema setting excludes it. The schema also contains AfuMail- and Afu Ads-named relations, so exposing or restructuring it is a cross-product concern. The schema has `USAGE` grants for `anon` and `authenticated`; audit per-table grants and policies before any exposure change.

The mobile client also relies on 86 `public` security-invoker compatibility views over `afuchat` tables. Their column definitions differ from the base tables, and 37 mobile-called RPCs exist only in `public`; all are `SECURITY DEFINER` with a search path spanning shared schemas. `clear_afuai_chat` additionally sets `row_security=off`.

The similarly named `chat`/`social` and `afuchat` relations are separate physical tables with divergent live data, not aliases. In the checked message inventory, 18 `chat.messages` rows have plaintext content but no encrypted content, and 1,956 of 3,080 shared message IDs have different sender IDs. Other shared chat, membership, channel, and follow rows also differ; some `afuchat` foreign keys still point into `chat` or `social`. Preserve both copies during migration review; do not overwrite `afuchat` rows from legacy tables or convert plaintext into encrypted fields.

**Why:** Earlier inventory used an API path that returned 403 and led to the incorrect conclusion that the schema was absent. The schema exists, but its current PostgREST configuration and cross-product contents make a direct cutover unsafe.

**How to apply:** Re-check live schema configuration before each migration. Do not expose all of `afuchat` or `public`, or move AfuMail/Afu Ads relations under AfuChat-only scope. Preserve the compatibility contract until client calls and RPC ownership are reviewed individually; audit security-definer search paths and cross-schema foreign keys before routing RPCs. Keep divergent legacy data intact and resolve conflicts explicitly; never promote plaintext into encrypted columns. Coordinate shared PostgREST settings with affected owners, inventory table grants/policies, and preserve rollback data until consumers pass. Never infer row counts from anonymous RLS-filtered results.

PostgREST cannot infer some relationships used through the `public` compatibility views when their underlying foreign keys cross schemas (for example, AfuChat product rows referencing canonical `accounts.profiles`). A nested embed then fails with `PGRST200` even when the flat product query and the profile query both succeed.

**Why:** Live probes on 2026-10-07 returned `400 PGRST200` for post/profile, follow/profile, post/image, and message/sender embeds; the corresponding flat reads returned `200`.

**How to apply:** For affected client reads, query the product view and child rows by ID, then batch-load only the needed display fields from `accounts.profiles` using the same authenticated Supabase client. Keep privacy checks fail-closed. Do not create duplicate profile data, widen PostgREST schema exposure, or add a migration solely to restore implicit embeds.

The live AfuChat API has split read/write paths: `public.get_chat_list` and `public.get_or_create_direct_chat` use `chat.*`, and message/membership routes merge public AfuChat-backed views with legacy REST reads. A fresh read-only production inventory on 2026-10-08 found 337 identical chat IDs; 216 legacy-only membership pairs whose IDs already belong to different canonical rows; 21 legacy-only messages (18 plaintext-only, 3 ciphertext rows missing `sent_at`); and 1,772 legacy-only status pairs whose IDs already belong to different canonical rows. Of 3,080 shared message IDs, 1,956 have different sender IDs. Two `platform.notification_events` reference messages missing from AfuChat. Thirty-one foreign keys outside `chat` and 32 `public` functions mention `chat.*`.

**Why:** The user selected `afuchat` as the source of truth and the migration instructions prohibit overwriting canonical data or generating replacement IDs. The production key collisions mean those constraints currently make full membership/status merging impossible; forcing a cutover would either lose rows or alter identity.

**How to apply:** Keep `chat` intact and do not cut over merged reads/writes or drop the schema until the conflicting IDs, missing message timestamps, notification references, all cross-product foreign keys, and function dependencies are explicitly resolved. Preserve plaintext as plaintext. Only move a row when its original key, relationships, and target schema requirements all match without overwriting an AfuChat record.