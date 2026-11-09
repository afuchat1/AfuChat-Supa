---
name: Permissions manager + navigation abstraction
description: lib/permissionsManager.ts and lib/navigation.ts provide centralised permission caching and typed route helpers.
---

# Permissions Manager + Navigation Abstraction

## Permissions Manager (`lib/permissionsManager.ts`)

**Rule:** All permission requests must go through `requestPermission(type)` or `checkPermission(type)`.

- Caches statuses in MMKV under `perm_status_<type>` keys — synchronous read via `getPermissionStatus(type)`.
- Types: `"camera" | "microphone" | "mediaLibrary" | "contacts" | "location"`.
- Fast-path: if MMKV has `"granted"` or `"blocked"`, no native call is made.
- `refreshAllPermissions()` — re-checks all statuses from OS; call when app returns to foreground.
- **Permission keys survive `wipeAllLocalData`** — they are preserved in the MMKV snapshot/restore loop (device-level, not account-level).

**Why:** Ad-hoc permission calls scattered across screens caused redundant prompts after every sign-out and no way to check status synchronously before showing permission-gated UI.

## Navigation Abstraction (`lib/navigation.ts`)

**Rule:** Use `Navigate.*` helpers instead of hardcoded `router.push("/path")` strings.

- `Navigate.toChat(params)`, `Navigate.toChats()`, `Navigate.toLogin()`, `Navigate.back()`, etc.
- Works identically online and offline (Expo Router resolves from local bundle).

**Why:** Hardcoded path strings scattered across 50+ files; renaming a route required grep-and-replace across the whole codebase.

## Reconnect signal (`lib/offlineStore.ts`)

**Added:** `onReconnect(fn: () => void): () => void` — fires only on offline→online transition (not on every connectivity update). Screens subscribe via `useEffect(() => onReconnect(() => refresh()), [])`.

**Why:** Previously there was no way to trigger a data refresh specifically when coming back online — all screens had to subscribe to `onConnectivityChange` and filter direction themselves.
