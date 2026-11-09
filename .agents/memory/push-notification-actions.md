---
name: Push notification actions
description: Requirements for actionable Expo push notifications and message targeting.
---

Actionable Expo notifications require both sides: the native client must register the category and listen for responses, while the sender must include the matching category ID and message target metadata in the push payload.

**Why:** A plain push token registry and title/body payload can display notifications but cannot show Reply/Mark as read/Open actions or identify which chat/message an action belongs to.

**How to apply:** Keep message category registration and cold-start response handling in the client; preserve chatId/messageId in the sender payload; ship a new native build because existing installs do not receive runtime category code changes. Treat notification preferences as a server-side delivery concern too: local handler settings cannot suppress background pushes or enforce quiet hours. On Android, define and register an expo-task-manager notification task at module scope, and set reply/mark-read actions to `opensAppToForeground: false`; only explicit Open actions should navigate.

## Audit warning
The client currently stores message/call/social/marketplace, preview, and quiet-hours preferences locally, but the push delivery function only filters by the device's master `enabled` flag. Every notification producer must apply the user's category and quiet-hours preferences before sending, and message previews must be redacted when disabled.

**Why:** Android background notifications are displayed by the OS without the foreground notification handler, so local UI preferences alone do not prevent unwanted alerts or message text from appearing.