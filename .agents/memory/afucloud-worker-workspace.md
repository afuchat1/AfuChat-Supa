---
name: AfuCloud worker workspace
description: Dependency and verification boundary for the canonical AfuCloud Cloudflare Worker artifact.
---

The AfuCloud Worker is intentionally outside the root pnpm workspace, so its dependencies and lockfile must be installed from `artifacts/cf-worker` before running its typecheck or deployment commands.

**Why:** Root workspace installation only covers `artifacts/mobile`; a worker check otherwise reports missing Cloudflare type definitions even when the mobile dependencies are present.

**How to apply:** Treat `artifacts/cf-worker/pnpm-lock.yaml` as the worker's independent dependency lock and run verification from that artifact directory.