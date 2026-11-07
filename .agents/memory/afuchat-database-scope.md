---
name: AfuChat database scope
description: The user's schema boundary for AfuChat and commerce-related data.
---

Use the existing AfuChat schema. There is no separate shop schema.

**Why:** The user explicitly corrected that the project has an AfuChat schema and no shop schema.

**How to apply:** Inspect the existing AfuChat schema before database work. Do not assume or create a separate schema for commerce features.
