---
name: Discover feed jitter prevention
description: Layout rules for the Discover virtualized feed.
---

## Rule
Keep Discover header rows and feed item heights stable while content loads or refreshes. Do not conditionally insert measured header rows or resize image containers from late image metadata.

**Why:** VirtualizedList recalculates offsets when a visible row or the header changes height during a gesture, which users perceive as shaking or jumping.

**How to apply:** Reserve refresh-indicator space with opacity/pointer-events changes, and use a fixed feed image ratio unless dimensions are known before the item is mounted.