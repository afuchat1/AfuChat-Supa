---
name: Android notification channels
description: Android notification channel sound persistence and safe rollout of sound changes.
---

Android notification channel sound settings are persistent and effectively immutable after channel creation. Updating the payload or calling setNotificationChannelAsync again with the same ID does not reliably replace a ringtone-style sound selected or stored on the device.

**Why:** FCM and Expo both route Android notifications through the channel ID; the channel's stored OS configuration takes precedence over later payload sound values.

**How to apply:** When correcting notification sound behavior, create a new notification-specific channel ID, configure it with the system default notification sound, update every sender to target it, and ensure the updated client bundle is installed before switching live delivery to the new channel.