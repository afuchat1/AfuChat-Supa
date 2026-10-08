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

The live AfuChat API had split paths: several `public` RPCs used `chat.*`, while public REST views already mapped the chat table names to `afuchat.*`. A read-only production inventory on 2026-10-08 found 337 identical chat IDs; 216 legacy-only membership pairs and 1,772 legacy-only status pairs had IDs already occupied by different AfuChat rows; 21 legacy-only messages included 18 plaintext-only rows and 3 ciphertext rows missing `sent_at`; and 1,956 of 3,080 shared message IDs had different sender IDs. Thirty-one external FKs target `chat`; 26 public routine bodies explicitly reference it. Two `platform.notification_events` rows point to messages absent from AfuChat. The user explicitly authorized dropping `chat` and accepts loss of rows stored in it.

**Why:** The user clarified that `afuchat` is the source of truth and directly instructed deletion of the legacy schema; do not invent an additional requirement to preserve its rows.

**How to apply:** Do not copy or re-key legacy rows. Redirect explicit routine references to AfuChat, retarget and validate the 30 external FKs whose parents exist there, preserve external notification rows while explicitly removing their invalid FK, and use `DROP SCHEMA ... RESTRICT` after Worker deployment so overlooked external dependencies abort rather than cascade. Do not expand PostgREST schema exposure; existing public compatibility views already point to AfuChat.