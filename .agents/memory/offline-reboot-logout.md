---
name: Offline reboot logout bug
description: Root cause and fix for users being logged out after device reboot when offline
---

## Rule
Never gate the synthetic-user bootstrap on both `effectiveUserId && primaryAccount`.
Use only `effectiveUserId` (MMKV) to keep the app shell responsive while SecureStore retries,
but never treat that cached ID as a verified Supabase session or authorize protected actions.
Handle null `primaryAccount` (SecureStore) with a retry.

## Why
Android Keystore (used by expo-secure-store) has a timing race on fresh device reboot.
The Keystore is locked until biometric/PIN unlock, which can happen milliseconds before
the app opens. On the very first read, SecureStore can return null even for a valid token.
With the old `effectiveUserId && primaryAccount` guard, MMKV had the user ID but
`primaryAccount` was null, so no synthetic user was set, and the router sent the user
to the welcome screen (logout). The opposite mistake is also unsafe: a cached ID can
survive token revocation, explicit logout, account deletion, or a different account's
cache, so it cannot be an authentication boundary.

## How to apply
- Bootstrap condition in AuthContext.tsx: `if (effectiveUserId)` only
- If SecureStore returns null, schedule a 3-second retry to upgrade to real session
- User stays in-app with cached identity only for a clearly non-authoritative loading/offline shell
- Require a verified Supabase session for mutations, private data, account actions, and protected navigation
- Treat empty chat-list responses as non-authoritative when local conversations are already hydrated; preserve the local list and retry rather than replacing it with an empty state
- This is especially important in AuthContext's `restoreSession` / bootstrap logic
