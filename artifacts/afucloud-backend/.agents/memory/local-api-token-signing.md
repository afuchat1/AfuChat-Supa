---
name: Local API token signing
description: How development authentication behaves without a persisted JWT secret
---

# Local API token signing

The development API generates a random JWT signing key in memory when `JWT_SECRET` is absent. It does not persist or expose that key. Production environments must still provide an explicit `JWT_SECRET`.

**Why:** The user does not want another long-lived signing secret stored in Replit, while local login still needs signed access tokens.

**How to apply:** Expect local access and refresh tokens to become invalid whenever the API process restarts. Do not reuse this development fallback for deployed production services.