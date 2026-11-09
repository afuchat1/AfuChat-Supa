---
name: Chat keyboard avoidance — effectiveBottom
description: How the floating chat input bar avoids the system keyboard on Android and iOS
---

## Rule
The `floatingInputContainer` is `position: absolute`. **Always apply `keyboardHeight` to `effectiveBottom` on both platforms.** Do NOT add an Android-special-case that skips `keyboardHeight`.

```tsx
const effectiveBottom = showEmojiStickerPicker && !keyboardHeight
  ? emojiKeyboardHeight + insets.bottom
  : keyboardHeight > 0
    ? keyboardHeight       // same on iOS and Android
    : insets.bottom;
```

**Why:** `softwareKeyboardLayoutMode: "resize"` (adjustResize) is set in `app.config.ts`, but Expo Router's screen container does NOT propagate the activity resize to absolutely-positioned children. So the container's `bottom` doesn't move automatically — we must move it manually via `keyboardHeight` events on both platforms.

**How to apply:** Every time the effectiveBottom formula is touched, verify the Android branch includes `keyboardHeight > 0 ? keyboardHeight` — not `insets.bottom`.

## Selection debounce
Android fires `onSelectionChange({0,0})` before a FormatToolbar button's `onPress` fires, which would collapse the toolbar before the action runs. Fix: debounce any selection clear by 150ms using a `selectionClearTimer` ref.

```tsx
onSelectionChange={(e) => {
  const sel = e.nativeEvent.selection;
  if (sel.start === sel.end) {
    if (selectionClearTimer.current) clearTimeout(selectionClearTimer.current);
    selectionClearTimer.current = setTimeout(() => setInputSelection(sel), 150);
  } else {
    if (selectionClearTimer.current) { clearTimeout(selectionClearTimer.current); selectionClearTimer.current = null; }
    setInputSelection(sel);
  }
}}
```
