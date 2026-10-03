---
name: Cloudflare Worker deployment audit
description: How to verify an active Worker version and route bundle when local Wrangler dependencies are unavailable.
---

The Cloudflare Workers API can identify the active deployment and return the deployed script bundle directly. Use the deployment list to find the 100% version, then GET the Worker script root with an authenticated API request; it returns multipart data containing index.js. Inspect route markers from the extracted bundle and probe protected endpoints without credentials: a registered route returns the auth response, while an unknown route returns the Worker 404. When changing Supabase projects, update the Worker service-role secret separately from Wrangler's non-secret project vars, then smoke-test `/healthz`, `/auth/v1/settings`, and a public `/rest/v1` query through the live hostname.

**Why:** A healthy Worker endpoint only proves that some version is live; local project vars and a successful deployment do not prove the Worker has the correct routes or project credentials.

**How to apply:** Keep tokens and service keys in the secure secrets flow, never print them, compare the active bundle against local route literals, rotate the service key during project migrations, and separately probe API-server compatibility paths because path/method drift can look like missing deployment modules. In this workspace, Cloudflare control-plane calls succeeded but direct requests to the zone and `workers.dev` hosts returned Cloudflare 1010; use an allowed external data-plane probe rather than treating 1010 as a Worker failure.