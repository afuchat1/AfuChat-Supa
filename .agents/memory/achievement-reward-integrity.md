---
name: Achievement reward integrity
description: Server-side requirements for awarding AfuChat achievement XP.
---

Achievement rewards must be earned from server-verified profile/activity state and recorded with a unique per-user achievement claim. Never accept achievement IDs or XP amounts from the client as payout authority.

**Why:** Client-derived unlocks are display state, not proof; direct client awards can be forged or repeated, and some achievement rewards exceed the generic XP RPC limit.

**How to apply:** For future achievement or milestone rewards, add eligibility and idempotency to the Supabase transaction, and have clients request synchronization rather than choose rewards.
