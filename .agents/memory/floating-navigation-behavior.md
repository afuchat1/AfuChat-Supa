---
name: Floating navigation behavior
description: The main AfuChat bottom navigation floats above scrollable content in the HiOS style.
---

The main bottom navigation must remain a floating overlay. Content scrolls behind the pill; do not reserve a footer or scene area and do not add a full-width background layer. Preserve the existing pill appearance and position while applying the safe-area bottom offset.

**Why:** the user explicitly asked for HiOS-style floating navigation with content passing behind the bar and no added background layer.

**How to apply:** keep the main tab scene full-height and position the pill absolutely over it. Do not shrink the scene or add bottom padding to simulate clearance.
