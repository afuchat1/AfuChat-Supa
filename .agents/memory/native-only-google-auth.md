---
name: Native-only Google auth
description: The project decision and boundary for Google authentication after removing web Google login.
---

Google authentication is native-only in the app. The Android Google SDK obtains an ID token and Supabase receives it through signInWithIdToken. The Supabase Google provider and its server-side credentials remain enabled; the mobile bundle must not contain the provider secret.

**Why:** Browser Google login and One Tap were not part of the mobile authentication experience and created redirect/fallback paths that could bypass the intended native flow.

**How to apply:** Keep the native Google SDK and Supabase ID-token exchange. Do not re-add Google One Tap, web Google signInWithOAuth, or Google browser callback handling. The current native implementation is Android-only unless iOS native configuration is added separately.

For Play-distributed Android builds, Google Sign-In requires the Play deployment certificate SHA-1 to be registered for `com.afuchat.mobile`; the Play certificate can differ from the EAS certificate used by sideloaded APKs. The verified Play deployment fingerprint is `77:80:C8:79:0E:EC:E8:D6:BC:D8:17:2A:9B:EE:AE:D0:AA:BD:66:3C`.

**Why:** `DEVELOPER_ERROR` persisted until the Play deployment fingerprint was registered, even though the OAuth client IDs and native token exchange were correct.

**How to apply:** When Google Sign-In works in one distribution channel but not another, register the signing SHA-1 for that channel while keeping the web client ID used by `GoogleSignin.configure` unchanged.