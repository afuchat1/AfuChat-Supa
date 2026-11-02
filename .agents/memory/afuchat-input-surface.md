---
name: AfuChat input and floating surface policy
description: Project-specific interaction design rule for app-wide text inputs and floating controls.
---

All app text-input surfaces should share the compact rounded glass style of the chat input. Composite bars use one shell, with nested fields rendered embedded. Keep primary controls inside that shell when the layout supports it. Floating controls use the shared glass-surface architecture.

The full-screen post image viewer enforces a dark presentation; keep its reply input surface dark regardless of the app theme.

In chat, keep the first line compact; grow only as text wraps, stop at three lines, and scroll additional text inside the field. Anchor the emoji and send controls to the composer’s bottom edge and keep the emoji picker aligned to the keyboard. Place reply context inside the same shell above the message row, without a separate border. The AI editor is a visible, icon-only sparkles button floated above the send button with a clear gap; do not use an “AI” text label or outline, and do not let it take input width. The emoji/keypad toggle must switch between picker and keyboard while keeping the icon color unchanged in both states. Hide the gift control once text is entered, but keep the attachment picker available so the entered text can be sent as an attachment caption.

**Why:** the user explicitly requested consistent compact input surfaces and a dark reply bar in the full-screen post image viewer, independent of theme.

**How to apply:** reuse shared surfaces for new fields and floating controls, preserve each control’s behavior and keyboard/safe-area handling, avoid a second glass shell inside compound bars, and keep the image viewer’s reply surface dark rather than deriving it from the app theme. For chat-composer changes, preserve the three-line cap, fixed bottom controls, shared reply shell, keyboard-to-picker alignment, and caption-preserving attachment flow.
