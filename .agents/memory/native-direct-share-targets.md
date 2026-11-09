---
name: Native direct-share targets
description: Android Direct Share needs app-shell synchronization and an exact chat ID bridge for one-tap delivery.
---

Android Direct Share targets must be refreshed from authenticated app state, not only when the share route opens. The share route can be opened after the system has already selected a target, so it must read the selected chat ID from the native launch intent and resolve that membership even when the chat is outside the visible recent-chat limit. Direct-message shortcuts use the other participant's profile avatar; groups and channels use the conversation avatar, with initials as the fallback.

**Why:** The system share sheet can query dynamic shortcuts before AfuChat is launched, and a selected target is not guaranteed to be in the first visible recent rows.

**How to apply:** Keep the native shortcut sync mounted under the authenticated root, keep the shortcut intent and deep-link path aligned, and preserve the app-level recent-chat send path as the fallback for web/Expo Go.