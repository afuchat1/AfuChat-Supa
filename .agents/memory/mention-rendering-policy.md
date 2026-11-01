---
name: Mention display policy
description: How tagged users should appear in AfuChat content and mention pickers.
---

Render actual tagged or mentioned users with their avatar and `@handle` as the visible mention label, not the display name. Keep the avatar and handle on the same visual line with vertical centering. If profile data is unavailable, keep the `@handle` visible with an initial avatar placeholder. Ordinary account identity labels are not mention tokens.

**Why:** The product owner changed the preference back to usernames with the `@` prefix for mentions.

**How to apply:** Use the shared rich-text mention renderer for user-generated content and keep custom mention pickers consistent with the visible `@handle` format.
