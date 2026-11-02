---
name: React Native text indentation
description: Leading JSX indentation can shift the first line of copy in React Native text rows.
---

When a React Native `<Text>` starts with literal copy on an indented line, the source indentation can be preserved in the rendered text and shift the first line away from a neighboring icon or checkbox. Use an explicit string expression such as `{"Label text"}` for the leading copy; `minWidth: 0` is also needed on flexible text columns so they can shrink beside controls.

**Why:** A Prestige card showed its first body line offset even though computed text alignment was left; the preserved whitespace, not centering, caused the visible gap.

**How to apply:** When only a text block's first line starts farther right than its wrapped lines or neighboring title, inspect the JSX child for a raw indented literal before changing layout spacing or alignment styles.
