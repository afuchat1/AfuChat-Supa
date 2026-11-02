---
name: AfuChat input and floating surface policy
description: Project-specific interaction design rule for app-wide text inputs and floating controls.
---

All app text-input surfaces should share the compact rounded glass style of the chat input. Composite bars use one shell, with nested fields rendered embedded. Keep primary controls inside that shell when the layout supports it. Floating controls use the shared glass-surface architecture.

**Why:** the user explicitly requested that every input bar and floating icon or bar share the same small, responsive design.

**How to apply:** reuse the shared surfaces for new fields and floating controls, preserve each control’s behavior and keyboard/safe-area handling, and avoid a second glass shell inside compound bars.
