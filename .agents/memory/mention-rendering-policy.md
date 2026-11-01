---
name: Mention display policy
description: How tagged users should appear in AfuChat content and mention pickers.
---

Render actual tagged or mentioned users with their avatar and public display name. Never show the `@` prefix or handle as the visible mention label. If profile data is unavailable, use a neutral “User” label with an initial avatar placeholder. Keep `@handle` in stored content and input/search flows where it is needed to create or resolve a mention; ordinary account identity labels are not mention tokens.

**Why:** The product owner explicitly requested readable mentions across the app without exposing usernames.

**How to apply:** Use the shared rich-text mention renderer for user-generated content and check custom mention pickers or renderers separately so their visible labels remain name-based.
