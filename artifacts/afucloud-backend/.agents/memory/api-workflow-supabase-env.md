---
name: API workflow Supabase environment
description: Constraints that keep the API workflow connected to the shared Supabase database
---

# API workflow Supabase environment

The API package must remain listed in `pnpm-workspace.yaml`, and its workflow must receive `SUPABASE_DB_HOST`, `SUPABASE_DB_USER`, `SUPABASE_DB_PORT`, `SUPABASE_DB_NAME`, `SUPABASE_PROJECT_ID`, and the `SUPABASE_DB_PASSWORD` secret.

**Why:** If the package is excluded, the filtered workflow does not rebuild. If the target variables are absent, the database client can start against `DATABASE_URL`, where the Supabase `auth` schema does not exist; login then fails with a misleading relation-not-found 500.

**How to apply:** After workspace or environment changes, restart the API workflow and confirm its process has the Supabase target variables before testing authentication.