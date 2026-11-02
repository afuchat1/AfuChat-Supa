---
name: Chat emoji and keyboard handoff
description: Stable, keyboard-height replacement between the chat emoji panel and system keyboard.
---

In the chat composer, the emoji picker replaces the system keyboard at the same bottom edge. Switching should feel like a smooth cover/uncover transition without bounce, jumps, or shaking. Keep the emoji and keyboard toggle icons the same size with clear contrast.

**Why:** The user explicitly requested a smooth keyboard-to-emoji transition and matched, visible toggle icons.

**How to apply:** Keep the picker aligned to the keyboard's total height, including safe-area space, and let the system keyboard cover the picker before hiding it. Avoid competing transitions during a toggle.
