---
name: JSX localization boundary
description: How bundled UI localization distinguishes platform copy from dynamic user content.
---

Static JSX text and clearly static string expressions should be localized at build time, including labels nested beside icons or inside custom controls. Dynamic expressions must remain unchanged because they may contain names, posts, server errors, amounts, or other user/runtime data.

**Why:** Translating every runtime string would corrupt user content, while translating only standalone Text nodes leaves common button and icon-adjacent labels in English.

**How to apply:** Extend the Babel localization transform for new static UI syntax, and keep the shared LocalizedText boundary limited to known static parts unless a component explicitly opts into all-static text.