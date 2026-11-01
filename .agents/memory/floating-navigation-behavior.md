---
name: Floating navigation behavior
description: The main AfuChat bottom navigation floats above scrollable content in the HiOS style.
---

The main bottom navigation must remain a floating overlay. Content scrolls behind the pill; do not reserve a footer or scene area and do not add a full-width background layer. Preserve the existing pill appearance and position while applying the safe-area bottom offset.

Every app back or close control must use the shared floating button treatment: match the bottom navigation's surface, border, blur, shadow, sizing, and pressed state. Use the close icon for dismiss actions while preserving each screen's existing placement and navigation behavior.

All multi-destination app navigation bars and the Files app category bar must share the same floating capsule, item sizing, theme colors, blur, and shadow in both light and dark modes. AfuSearch is an explicit exception and has no app-shell bottom navigation. Single-destination utilities may omit a redundant one-item bar.

**Why:** the user explicitly asked for HiOS-style floating navigation with content passing behind the bar and no added background layer.

**Why:** the user also asked for every back button to float and match the bottom navigation's design and appearance.

**Why:** the user asked for the same bottom-bar design across the other apps, including Files, in light and dark modes.

**How to apply:** keep the main tab scene full-height and position the pill absolutely over it where navigation is present. Do not shrink the scene or add bottom padding to simulate clearance. Use shared navigation and back-control components instead of one-off bar or route-back styles; do not add the AfuSearch app-shell bar.
