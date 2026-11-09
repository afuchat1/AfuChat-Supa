---
name: Supabase realtime channel ownership
description: Lifecycle rule for Supabase Realtime channels used by chat screens and draft-to-real chat transitions.
---

Configure all `postgres_changes` and broadcast handlers on a Supabase channel before calling `subscribe()`. A logical channel must also have one lifecycle owner; transitional states such as draft-to-real chat creation should hand ownership to the normal screen effect rather than creating a second channel with the same name.

**Why:** Supabase caches channels by name. If a previous effect run left one subscribed (React Strict Mode double-invoke, or dep change before cleanup fires), `supabase.channel(name)` returns the already-subscribed instance and calling `.on()` on it throws "cannot add postgres_changes callbacks after subscribe()".

**How to apply:** At the top of any effect that creates a named channel, evict every stale same-topic instance and await removal before configuring the replacement:
```ts
const stale = supabase.getChannels().filter(ch => ch.topic === `realtime:${channelName}`);
await Promise.all(stale.map(ch => supabase.removeChannel(ch)));
```
Check the effect cancellation flag after the await, then create/configure the channel and call `subscribe()` exactly once. This is especially important for web Strict Mode and fast auth transitions.