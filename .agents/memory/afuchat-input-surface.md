---
name: AfuChat input and floating surface policy
description: Project-specific interaction design rule for app-wide text inputs and floating controls.
---

All app text-input surfaces should share the compact rounded glass style of the chat input. Composite bars use one shell, with nested fields rendered embedded. Keep primary controls inside that shell when the layout supports it. Floating controls use the shared glass-surface architecture.

In chat, keep the first line compact; grow only as text wraps, stop at three lines, and scroll additional text inside the field. Anchor the emoji and send controls to the composer’s bottom edge and keep the emoji picker aligned to the keyboard. Place reply context inside the same shell above the message row, without a separate border. The AI editor control shows only “AI,” with no word count or outline.

**Why:** the user explicitly requested that every input bar and floating icon or bar share the same small, responsive design.

**How to apply:** reuse the shared surfaces for new fields and floating controls, preserve each control’s behavior and keyboard/safe-area handling, and avoid a second glass shell inside compound bars. For chat-composer changes, preserve the three-line cap, fixed bottom controls, shared reply shell, and keyboard-to-picker alignment.
