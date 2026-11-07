---
name: Outgoing chat message durability
description: Keep outgoing chat history durable across send paths, reconnects, and navigation.
---

Every server-confirmed outgoing chat message and its delivered/read timestamps must be stored in the local persistent message store, regardless of its send type. Do not rely on a timestamp-only delta to recover server messages that were not cached locally. Do not remove pending bubbles until sync confirms the message is committed; a failed or skipped sync is not message deletion.

**Why:** Incoming messages were persisted while several outgoing pathways and receipt timestamps were not, and timestamp deltas could skip uncached rows. The UI also hid all pending messages after a sync call that could return early or fail.

**How to apply:** Cache each confirmed send, and persist receipt timestamps from both realtime events and server refreshes so Message Info works offline. Reconcile pending UI only from confirmed sync or persisted state. Keep server backfill bounded while retaining older local history.
