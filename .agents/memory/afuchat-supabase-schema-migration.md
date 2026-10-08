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

The live AfuChat API currently has split read paths: `public.get_chat_list` and `public.get_or_create_direct_chat` use `chat.*`, while public REST views for messages, follows, and posts map to `afuchat.*`. On 2026-10-08, `chat` and `afuchat` had the same 337 chat IDs, but membership edges comprised 406 shared, 223 AfuChat-only, and 216 legacy-only pairs. Of 3,080 shared message IDs, 1,956 had different sender IDs; message-status pairs also diverged (2,179 AfuChat-only, 1,844 legacy-only), and each mute table had one unmatched row. `social` and `afuchat` had 608/609 follows with only 230 shared pairs; all 237 post IDs overlapped, but 85 author IDs differed. `afuchat.chat_members` and `afuchat.messages` reference `chat.chats` / `chat.messages`, so the legacy chat parent remains part of the live FK graph.

**Why:** The user selected AfuChat product data as the winner where records conflict. The large number of records unique to either schema means an exclusive table switch would hide valid records even without deleting them.

**How to apply:** For overlapping product keys, prefer AfuChat values but retain legacy-only rows; keep `chat.chats` as the FK parent. Do not bulk-copy or delete divergent rows, and never promote plaintext to encrypted fields. A real authenticated account is still required to verify `auth.uid()` and compare live API responses with known records.