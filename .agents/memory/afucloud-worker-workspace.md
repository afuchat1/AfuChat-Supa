---
name: AfuCloud worker workspace
description: Dependency and verification boundary for the canonical AfuCloud Cloudflare Worker artifact.
---

The AfuCloud Worker is intentionally outside the root pnpm workspace, so its dependencies and lockfile must be installed from `artifacts/cf-worker` before running its typecheck or deployment commands.

**Why:** Root workspace installation only covers `artifacts/mobile`; a worker check otherwise reports missing Cloudflare type definitions even when the mobile dependencies are present.

**How to apply:** Treat `artifacts/cf-worker/pnpm-lock.yaml` as the worker's independent dependency lock, install with `pnpm install --ignore-workspace` from that artifact directory, and use Node 22+ for the current Wrangler release.

**Why:** Wrangler 4.136 requires Node 22 or newer; the workspace's default Node 20 runtime fails before authentication.

The public mobile data boundary is AfuCloud: its shared client points at the Worker, which proxies Supabase Auth, PostgREST, and Realtime while preserving the caller's bearer token and upstream RLS.

**Why:** This moves the broad existing client query surface behind AfuCloud without rewriting hundreds of Supabase query chains or bypassing row-level authorization.

**How to apply:** Keep the gateway limited to the configured AfuChat Supabase prefixes (`/auth/v1`, `/rest/v1`, `/realtime/v1`); never forward service credentials to the client or turn it into an open proxy.