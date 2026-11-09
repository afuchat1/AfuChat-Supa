---
name: Story upload media lifecycle
description: Android story uploads must detach picker and camera media from Expo Go temporary host-cache paths before background publishing.
---

Story publishing on Android must resolve or copy picker/camera media before the create screen navigates away, and the create screen must remain mounted until the native upload finishes. Expo Go can return a temporary host-cache URI that disappears or is inaccessible to `ExponentFileSystem.uploadAsync`; camera photos are safest through a short-lived in-memory draft, while larger media needs an app-owned cache file. The upload layer should keep a readable-URI fallback and return a user-facing error instead of the native exception.

**Why:** The story screen previously dismissed immediately and uploaded a volatile Expo Go URI, producing the `Directory ... doesn't exist` failure before Supabase received any bytes. Even a successful pre-copy can be asynchronous, so navigation must wait for the upload result.

**How to apply:** Treat native media URIs as ephemeral at the picker boundary, keep story rails backed by active `stories` rows, and test the final upload on a logged-in Android device because the web preview cannot exercise native filesystem behavior.