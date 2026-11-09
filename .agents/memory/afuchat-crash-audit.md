---
name: AfuChat crash audit patterns
description: Systematic crash risks found and fixed in AfuChat (Expo React Native) — patterns to apply consistently
---

## Critical patterns found across the codebase

### 1. Module-level FileSystem path initialisation (HIGH)
`const DIR = FileSystem.cacheDirectory + "foo/"` at module top crashes if native module not ready.
**Fix:** Make lazy: `function getDir() { return FileSystem.cacheDirectory + "foo/"; }`
**Files hit:** mediaCache.ts, tempCache.ts

### 2. Supabase .then() without .catch() (HIGH)
Promise chains from supabase calls inside useEffect, event handlers, or background tasks silently crash.
**Fix:** Always add `.catch(() => {})` on any `.then()` chain from supabase.
**Files hit:** AuthContext, AdvancedFeaturesContext, me.tsx

### 3. await supabase calls without try/catch (MEDIUM)
`await supabase.from(...).select(...)` without try/catch crashes if network is down or session expired.
**Fix:** Wrap supabase awaits in try/catch; use null-initialized let variables.
**Files hit:** ChatPreferencesContext, AdvancedFeaturesContext, AuthContext, index.tsx

### 4. AsyncStorage calls without error handling (MEDIUM)
`await AsyncStorage.setItem(...)` can fail if storage is full or corrupted.
**Fix:** Wrap in try/catch or add .catch(() => {})
**Files hit:** dataMode.ts, TourContext.tsx, ChatPreferencesContext.tsx

### 5. Context providers returning null while loading (HIGH)
A provider that returns null before state is ready blocks the ENTIRE React tree.
**Fix:** Always render {children}, expose `loading` boolean via context value instead.
**Files hit:** ThemeContext.tsx (was returning null)

### 6. _initPromise not reset on failure (HIGH)
If db.ts _initPromise rejects, subsequent callers get the same rejected promise.
**Fix:** Reset to null in the catch block so callers can retry.

### 7. SecureStore without try/catch (HIGH)
SecureStore throws on device without hardware security module or when biometrics fail.
**Fix:** Wrap ALL SecureStore calls in try/catch.

### 8. NetInfo native module calls without error handling (MEDIUM)
`NetInfo.fetch().then(...)` without `.catch()` can throw if native module not ready.
**Fix:** Add .catch(() => {}) to the .then() chain.

## What NOT to worry about
- `(Text as any).defaultProps` mutation — uses `?? {}` guard, works fine in RN
- getTotalUnread() in useState initializer — pure sync in-memory read, never throws
- callService.ts TaskManager — already guarded with platform check + try/catch
- SafeGradient, AudioPlayer, ShortsFeed — already had correct guards
- LayoutAnimation Android guard — already uses `!("RN$Bridgeless" in global)` check

## Empty catch {} pattern in Babel
When wrapping entire function bodies that contain `return` statements in `try {}...} catch {}`, Babel sometimes misparses. Instead, wrap individual await calls in separate try/catch blocks with intermediate let variables.
**Example:**
```ts
// WRONG — can confuse Babel parser in large functions:
try {
  ...
  if (x) { return; }
  ...
} catch {}

// RIGHT — targeted wrapping:
let result = null;
try {
  const { data } = await supabase.from(...).select(...);
  result = data;
} catch {}
```
