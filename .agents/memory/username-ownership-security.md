---
name: Username ownership security
description: AfuChat's distinction between free primary handles and purchased aliases.
---

`profiles.handle` is the source of truth for a user's current primary username. A current primary reservation is free and has `acquired_at` set to `NULL`; a non-null `acquired_at` represents a purchased alias. Profile edits may switch the primary handle, but must not create durable aliases. Client roles must not directly insert, update, or delete `owned_usernames`; trusted claim and purchase functions handle those writes. Preserve read access required for username resolution.

Do not treat `acquired_at` by itself as proof of purchase: the old default timestamped free reservations. Use marketplace transaction evidence or the established legacy completed-sale evidence when auditing older records.

**Why:** Broad client write policies and the timestamp default let users create or promote unpaid secondary usernames.

**How to apply:** Keep profile edits limited to one current free primary reservation, release its previous free reservation on change, and require purchase evidence for aliases that remain owned.
