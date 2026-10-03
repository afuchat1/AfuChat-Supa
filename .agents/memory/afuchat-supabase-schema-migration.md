---
name: AfuChat Supabase schema migration
description: AfuChat's intended schema migration and the mismatch observed in the live Supabase project.
---

The target architecture requires AfuChat product data in the `afuchat` schema, with shared identity/auth kept separate. However, a live PostgREST inspection on 2026-10-03 showed that `afuchat` is not in the exposed-schema list; `public`, `chat`, and `afucloud` are exposed. The available Supabase management token returned HTTP 403 for database queries, and the anonymous key cannot read protected product rows or alter schemas. Earlier migration notes are not proof of current live placement.

**Why:** The live API contradicts the previous assumption that the target schema was already deployed, while the only available database-management credential lacks query privileges.

**How to apply:** Before migrating, obtain a privileged HTTPS database path; inventory ownership, tables, views, columns, constraints, indexes, policies, triggers, functions, and row counts. Preserve compatibility views and auth behavior, validate copies, and retain rollback data until consumers pass. Never infer row counts from anonymous RLS-filtered results.