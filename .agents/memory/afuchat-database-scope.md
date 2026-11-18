---
name: AfuChat app scope
description: The user's product boundary and source-of-truth rule for this AfuChat app.
---

This workspace is the AfuChat app only. Follow the current AfuChat code and remote baseline, not historical assumptions. Use the existing AfuChat schema; there is no separate shop schema. Before diagnosing a failed chat query as an access-policy issue, compare every selected message column against the live Supabase schema; a migration can exist in source without being applied remotely.

**Why:** The user clarified that this is only the AfuChat app and asked that its remote baseline, not historical context, guide app work. A missing production message column also caused Supabase to reject full chat-history queries even though the migration existed in the repository.

**How to apply:** Before changing app behavior, inspect the current code and compare with the live remote schema. Verify relevant migrations are applied before changing RLS or send logic. Keep user-facing names and flows scoped to AfuChat.
