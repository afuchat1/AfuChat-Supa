---
name: Supabase production function capacity
description: Production Edge Function limits and drift from local source.
---

Before deploying another Supabase Edge Function, compare the live production inventory with the current local source. On 2026-11-15, production had 100 active functions while this workspace had 12 local function directories; Supabase rejected a new deployment at the project function limit. Several production names explicitly indicate tests.

**Why:** deploying `call-turn-credentials` failed with a maximum-functions error, and deleting or repurposing an active endpoint could break external clients.

**How to apply:** list remote functions read-only before deployment, identify safe candidates with the user, and obtain explicit approval before deleting or repurposing any live function. Do not assume an endpoint is unused just because this app does not reference it.
