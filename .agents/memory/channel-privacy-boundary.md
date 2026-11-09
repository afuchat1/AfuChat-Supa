---
name: Channel privacy boundary
description: Durable rules for keeping channel ownership and member management private.
---

Channel ownership is private by default. Public channel discovery may expose only safe metadata such as name, handle, description, avatar, verification, and subscriber count. Creator IDs, owner profile joins, and manager attribution must be redacted from search, discovery, chat lists, route parameters, and channel messages.

Subscriber/member and administrator rosters are visible only to the channel owner and authorized channel administrators. Ordinary subscribers may read or mutate only their own membership/subscription state as needed to join or leave; groups retain their existing roster behavior.

RLS policies used by authenticated table queries must not directly reference columns hidden by column-level grants. Put ownership and membership checks that need hidden columns behind `SECURITY DEFINER` helpers with row-security disabled, and make the policy call only the helper.

**Why:** Hiding a creator label in the UI is insufficient because PostgREST queries, cached chat-list rows, route parameters, and channel message metadata can expose the same identity through alternate paths.

**How to apply:** For every new channel surface, use safe metadata queries and server-side access functions. Treat URL owner IDs as untrusted. When changing channel tables, preserve column-level grants and RLS so direct client queries cannot retrieve ownership or enumerate rosters.