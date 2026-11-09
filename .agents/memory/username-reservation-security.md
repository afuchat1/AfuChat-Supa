---
name: Username reservation security
description: Marketplace usernames must be reserved and claimed at the database boundary.
---

Username availability is advisory in the client; the database must be authoritative. Active listings and purchased aliases are checked by a protected claim RPC and a profile-handle trigger, while ownership transfer and the buyer's active handle update occur transactionally.

**Why:** Signup and profile-edit requests can race with marketplace purchases or bypass client checks entirely, so UI-only availability checks can allow sold or listed usernames to be claimed.

**How to apply:** Any new username write path must use the protected claim flow or rely on the database trigger; never trust a prior availability query as authorization.

The profile reservation trigger must validate `NEW.id` against the canonical owner rather than relying on `auth.uid()`, because trusted server-side profile writes may have no user session.