---
name: Phone contact display and matching
description: Device phonebook rows must preserve raw display data while normalized E.164 values are used only for account matching.
---

Keep the phonebook cache as the source of truth for offline contact screens. Preserve each device row's original name, number, and position for display and invites; use a separate normalized E.164 value only for matching registered users.

**Why:** Reformatting or mapping contacts by phone number changes the user's device order, loses local formatting, and can merge separate phonebook entries.

**How to apply:** Render cached rows immediately, keep their stored position/phone index order, and perform online matching as a background update that never clears the cache on transient failures.