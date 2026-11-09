---
name: Username marketplace schema drift
description: Production schema detail that affects username purchase and auction settlement RPCs.
---

Production `public.owned_usernames` uses `acquired_at`, not `created_at`. The live `purchase_username` and `settle_username_auction` RPCs must update `acquired_at` in their conflict branches.

**Why:** A later marketplace function referenced `created_at` even though the existing production table had the older `acquired_at` column, causing every purchase to fail and roll back atomically.

**How to apply:** Before changing marketplace RPCs or applying related schema work, inspect the live `owned_usernames` columns and keep the refund/payment transaction atomic. Do not assume `CREATE TABLE IF NOT EXISTS` adds missing columns.