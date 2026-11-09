---
name: Profile username trigger timing
description: Database ordering constraint for synchronizing profile handles with canonical username ownership.
---

The profile username reservation trigger must run after profile insertion or handle updates. It inserts into `owned_usernames`, whose owner reference requires the profile row to already exist.

**Why:** A before-insert trigger caused Supabase Auth signups to fail with the generic database error because the ownership insert violated the profile foreign key.

**How to apply:** Keep handle validation and reservation checks in the trigger, but use an `AFTER INSERT OR UPDATE OF handle` trigger. Allow profile rows with a temporary blank handle only if the schema or auth flow uses that state.