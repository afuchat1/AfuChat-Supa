---
name: AfuChat input and floating surface policy
description: Project-specific interaction design rule for app-wide text inputs and floating controls.
---

All app text-input surfaces should share the compact rounded glass style of the chat input. Composite bars use one shell, with nested fields rendered embedded. Keep primary controls inside that shell when the layout supports it. Floating controls use the shared glass-surface architecture.

The full-screen post image and story viewers enforce dark presentations; keep reply fields, typed text, and placeholders high-contrast and dark regardless of app theme or underlying media.

In chat, keep the first line compact; grow only as text wraps, stop at three lines, and scroll additional text inside the field. Anchor the emoji and send controls to the composer’s bottom edge and keep the emoji picker aligned to the keyboard. Place reply context inside the same shell above the message row, without a separate border. Keep the AI editor as an icon-only sparkles control inside the composer’s right action column, above Send with clear separation and no background, shadow, or text label. The emoji/keypad toggle must switch between picker and keyboard while keeping the icon color unchanged in both states. Hide the gift control once text is entered, but keep the attachment picker available so the entered text can be sent as an attachment caption.

On Android, keep the native text-selection action mode enabled for the chat composer. Use its native selection and clipboard actions, with AfuChat formatting actions in the compact in-app toolbar so the feature remains usable in Expo Go.

**Why:** the user chose Expo Go compatibility after Android text selection stopped working. React Native cancels Android's selection action mode when `contextMenuHidden` is true, and stock Expo Go does not support adding AfuChat-specific formatting actions to Android's native menu.

**How to apply:** reuse shared surfaces for new fields and floating controls, preserve each control’s behavior and keyboard/safe-area handling, avoid a second glass shell inside compound bars, and give full-screen image/story reply fields a dark surface with explicit light text and legible placeholders. For chat-composer changes, preserve the three-line cap, fixed bottom controls, shared reply shell, keyboard-to-picker alignment, caption-preserving attachment flow, and the inline AI icon’s position above Send. On Android, leave native selection enabled and avoid duplicate clipboard controls in AfuChat's toolbar.

Keep the native chat input in control of live text selection. Do not feed the selection range mirrored for the custom toolbar back through the input's `selection` prop on every render; after app-owned text edits, restore the intended range with `setSelection` once the new value is committed.

**Why:** Reapplying a stale controlled range during React renders can reset the native selection, making its highlight and drag handles jump or disappear.

**How to apply:** Treat the selection state as toolbar data only. Call the native input's `setSelection(start, end)` after Cut, Paste, Quote, or formatting changes the composer text.
