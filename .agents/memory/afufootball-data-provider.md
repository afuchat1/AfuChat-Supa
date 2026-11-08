---
name: AfuFootball data provider
description: Provider choice and request-quota constraints for AfuFootball.
---

Use API-Football v3 for AfuFootball's global fixture, team, competition, event, lineup, and standings data. The configured Free plan allows 100 requests per day. All provider requests must go through the Supabase Edge Function and shared database cache; do not expose the provider key in the mobile app or add polling that bypasses the cache.

**Why:** the user supplied an API-Football key for the AfuFootball feature, and the provider confirmed its 100-request daily Free-plan limit.

**How to apply:** keep query deduplication and conservative cache TTLs in place. Check the account's actual daily limit before increasing live refresh frequency or adding new provider-backed searches.
