---
name: Supabase Realtime channel lifecycle
description: Prevent callbacks from being added to a reused, already-subscribed channel.
---

Supabase's `channel(topic)` returns the existing channel when that topic is still registered. `removeChannel` is asynchronous, so a component effect that restarts quickly can receive its previous subscribed channel and throw when adding another `postgres_changes` handler.

**Why:** the Stories viewer crash report showed this exact failure during effect setup.

**How to apply:** use a distinct topic per effect setup when the effect can rerun before cleanup finishes, or serialize removal before reusing a topic. Keep the existing channel removal in effect cleanup.
