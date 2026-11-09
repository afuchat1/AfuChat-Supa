---
name: Message request gating
description: The offline-safe rule for direct-chat composer access before recipient acceptance.
---

Direct message requests must be tracked per account and exact conversation ID with three states: unknown, limited, and unlocked. Unknown blocks sending without showing a limit notice; limited shows the lock notice; unlocked shows the composer. Relationship checks must never turn the composer on merely because the network is unavailable or a request is still loading.

**Why:** A single optimistic boolean initialized every direct chat as limited, and a pair-level cache could let one chat's state appear in another chat while navigating or reconnecting.

**How to apply:** Use synchronous durable storage keyed by user ID plus chat ID. Apply cached state before network checks, scope local messages to the same chat ID, preserve limited state offline, and only persist unlocked/limited after that chat's own follow/reply/outgoing-message checks. Keep groups, channels, AI chats, and personal notes outside this gate.