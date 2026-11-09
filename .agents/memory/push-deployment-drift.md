---
name: Push deployment drift
description: Live push Edge Functions can remain on an older Expo protocol after the repository moves to direct FCM.
---

The push client, Edge Functions, and Firebase credentials must be treated as one release unit. A repository change from Expo Push to direct FCM does not affect Supabase until both push functions are redeployed, and the sender must read the exact secret names configured in Supabase.

**Why:** Live logs showed successful registration HTTP responses while the deployed functions still validated Expo tokens and called the Expo gateway, leaving the direct-FCM registry empty.

**How to apply:** After every push protocol change, download or inspect the live function source, compare protocol markers, redeploy both functions, verify the device registry and delivery audit rows, then build a fresh native app.