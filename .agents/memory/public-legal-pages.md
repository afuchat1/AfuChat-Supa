---
name: Public legal pages
description: Durable conventions for AfuChat’s externally accessible policy and safety pages.
---

Public policy and safety pages should use the shared legal web renderer and stable Expo Router paths. Contact addresses in policy text must be rendered as actual mail links, not plain text, so they work for both desktop and mobile visitors.

**Why:** App-store policy reviewers need a stable public URL and an immediately usable reporting contact, while duplicating page markup creates inconsistent dates, navigation, and accessibility.

**How to apply:** Add new public policies as a typed page variant plus a dedicated route, link them from the legal navigation/footer, and verify the canonical path directly in the web preview before publishing.