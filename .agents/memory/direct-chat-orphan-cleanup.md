---
name: Direct chat orphan cleanup
description: Direct chats with fewer than two members cannot resolve an other profile and surface as Unknown
---

Direct-message list queries must exclude nameless non-group chats that have no resolvable member besides the current user. Direct-chat creation should use a transaction-scoped pair lock and require two distinct participants.

**Why:** Historical one-member direct rows caused Unknown chats that could not open, while concurrent creation could produce duplicate or incomplete conversations.

**How to apply:** Keep server filtering and client-side filtering in place, and clean only nameless non-group/non-channel chats with fewer than two members; preserve named groups, channels, notes, and valid support/system conversations.