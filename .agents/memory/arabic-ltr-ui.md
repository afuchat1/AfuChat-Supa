---
name: Arabic UI direction
description: Arabic localization uses translated copy without changing the app's existing layout direction.
---

Arabic is translated like every other supported UI language, but the app intentionally keeps its existing left-to-right layout, navigation order, spacing, and icon placement.

**Why:** The product requirement is language translation without a visual layout change when Arabic is selected.

**How to apply:** Do not re-enable the root RTL direction switch for Arabic; keep direction behavior separate from the translation catalogs.