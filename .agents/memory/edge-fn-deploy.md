---
name: Supabase Edge Function deploy from Replit
description: Deploy Supabase functions from this workspace without interactive CLI login.
---

Use the Supabase access token from Replit Secrets and run `SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" pnpm --package=supabase dlx supabase functions deploy <function> --project-ref <project-ref> --use-api` from `artifacts/mobile`.

**Why:** the Management API deployment path works from Replit without direct database networking, Docker, or interactive Supabase login.

**How to apply:** verify the project's current Supabase URL for the project reference, keep the token in the secret environment only, and do not echo or log it.
