---
name: Production Android data loss — MMKV memory fallback + routing bugs
description: Root causes and fixes for "all data lost on restart" in Play Store builds
---

## The bug
On Android Play Store builds, users were logged out and all locally stored data
(conversations, settings, profile cache) was lost on every app restart.

## Root causes (all four must be fixed)

### 1. `__expo` global check in `isExpoGo()` (mmkv.ts)
```js
if (typeof (global as any).__expo !== "undefined") return true;
```
The `__expo` global IS set by the Expo SDK in ALL Expo apps (not just Expo Go).
This caused `isExpoGo()` to return `true` in production, silently switching MMKV
to an in-memory store — wiping everything on every process kill.
**Fix:** Remove this line. The `appOwnership === "expo"` and
`executionEnvironment === "storeClient"` checks are sufficient and correct.

### 2. Safety timer fired before slow-path completed (index.tsx)
The 600ms safety timer in `index.tsx` fired before `getSession()` + SecureStore
refresh could complete (can take 1–2 s on slow networks / post-reboot).
The timer called `getCachedUserId()` → null (MMKV empty) → routed to `/welcome`.
**Fix:** Extended timer to 2 500 ms.

### 3. `doRedirect` only checked MMKV for user identity (index.tsx)
```js
const isLoggedIn = hasSession || Boolean(cachedId); // Bug: didn't check user?.id
```
Even after the AuthContext set a synthetic user from SecureStore, `doRedirect`
still routed to welcome because it only checked MMKV's `getCachedUserId()`.
**Fix:** Added `|| Boolean(user?.id)` as a third signal in `isLoggedIn` check.

### 4. No durable backup for user_id when MMKV used memory store (offlineStore.ts)
`getCachedUserId()` only read from MMKV. If MMKV was memory store, the user_id
was gone on every restart. No persistent fallback existed.
**Fix:**
- `setCachedUserId` now ALSO writes to `AsyncStorage` key `@ac:uid_bk`
- `getCachedUserId` checks MMKV first, then module-level `_uidMirror` (set by either MMKV read or `initUserIdCache`)
- `initUserIdCache()` (async) pre-populates the sync mirror from AsyncStorage backup at boot
- Called fire-and-forget at module scope in `_layout.tsx` before AuthProvider mounts
- `clearCachedUserId` and `wipeAllLocalData` both clear the AsyncStorage backup and `_uidMirror`

**Why:** MMKV v3 initialization can fail silently on some Android devices (JNI timing race),
causing `new MMKV({id})` to throw and the catch to create an in-memory store.

## Files changed
- `lib/storage/mmkv.ts` — removed `__expo` check; retry logic + console.error on fallback
- `lib/offlineStore.ts` — dual-write uid, `initUserIdCache()`, `_uidMirror` fallback
- `app/index.tsx` — `user?.id` check in `doRedirect`; timer 600ms → 2500ms
- `app/_layout.tsx` — `initUserIdCache()` call at module scope
