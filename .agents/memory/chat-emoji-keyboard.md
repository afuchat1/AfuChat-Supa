---
name: Chat emoji and keyboard handoff
description: Stable, keyboard-height replacement between the chat emoji panel and system keyboard.
---

In the chat composer, emoji and attachment panels replace the system keyboard at the same bottom edge. Switching should feel like a smooth cover/uncover transition without bounce, jumps, or shaking. Keep the emoji and keyboard toggle icons the same size with clear contrast. Attachment actions stay icon-only, use one accent color, and have no visible labels or explanations.

**Why:** The user requested the attachment picker behave like the emoji picker and specified monochrome icons without explanatory text. React Native Web does not provide browser keyboard events through `Keyboard`, so web needs viewport-based measurement.

**How to apply:** Keep both panels aligned to the keyboard's total height, including safe-area space, and leave them mounted underneath the system keyboard. Use native keyboard events on iOS/Android and `visualViewport` on web; coordinate the composer with viewport changes instead of animating the panel and composer independently.
