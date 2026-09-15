---
name: Chat media cache ownership
description: Durable rules for preventing duplicate received-chat media copies and repeated gallery saves.
---

Received chat attachments must use one canonical URL-keyed app cache and one deterministic local path. Do not add a second permanent downloader or silently mirror every received file into the device gallery.

**Why:** Multiple permanent downloaders created orphaned duplicate files, while repeated gallery creation could show or save the same image again whenever a chat rerendered.

**How to apply:** Route automatic chat downloads through the canonical chat attachment cache. Coalesce concurrent downloads, migrate legacy cache paths when encountered, and only create a gallery asset after an explicit user setting/action; record that save so it is idempotent.