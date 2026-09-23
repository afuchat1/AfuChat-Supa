---
name: Cloudflare Worker deployment audit
description: How to verify an active Worker version and route bundle when local Wrangler dependencies are unavailable.
---

The Cloudflare Workers API can identify the active deployment and return the deployed script bundle directly. Use the deployment list to find the 100% version, then GET the Worker script root with an authenticated API request; it returns multipart data containing index.js. Inspect route markers from the extracted bundle and probe protected endpoints without credentials: a registered route returns the auth response, while an unknown route returns the Worker 404.

**Why:** A healthy Worker endpoint only proves that some version is live, and local Wrangler may not be linked in an independent workspace even after pnpm installation.

**How to apply:** Keep the token in the secure secrets flow, never print it, compare the active bundle against local route literals, and separately probe API-server compatibility paths because path/method drift can look like missing deployment modules.