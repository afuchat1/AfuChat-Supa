---
name: Chat sender identity persistence
description: Preserve sender names and avatars on received chat messages across sessions and partial payloads.
---

Treat a received chat message's non-empty sender display name and avatar URL as a durable identity snapshot. Keep known values when later realtime, server, or local-cache records omit them; do not downgrade a known sender to a generic placeholder or handle-only label. Persist snapshots locally so they survive navigation and app restarts.

**Why:** The product owner requires sender identity to remain visible after a message has been received.

**How to apply:** Merge sender profiles field-by-field in message hydration and realtime paths, update only with non-empty values, and keep the local message schema capable of storing the snapshot.
