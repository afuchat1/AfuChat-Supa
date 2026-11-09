---
name: Shared Supabase auth cookie between afuchat.com and web.afuchat.com
description: How the mobile app's web export shares login state with the marketing site via a cookie-scoped Supabase client.
---

On web (Platform.OS === "web"), `artifacts/mobile/lib/supabase.ts` uses
`createBrowserClient` from `@supabase/ssr` instead of `createClient` +
AsyncStorage, with `cookieOptions.domain` set to `.afuchat.com` only when
`window.location.hostname` is `afuchat.com` or ends with `.afuchat.com`
(checked via `isProdHost()`). Native (iOS/Android) is unaffected — it still
uses `createClient` with AsyncStorage.

**Why:** the marketing site (`artifacts/afuchat-website`) already writes its
Supabase session to a `.afuchat.com`-scoped cookie so a logged-in user sees
"Open App" instead of Login/Sign Up. Without matching cookie options on this
app's web build, sessions would live in separate `localStorage` per
subdomain and never be visible to each other.

**How to apply:** any future change to Supabase auth config in
`lib/supabase.ts` must keep the web-only cookie path in sync with
`artifacts/afuchat-website/src/lib/supabase.ts` (same `sameSite`, `secure`,
and domain-detection logic) or shared login breaks silently — no error, just
two disconnected sessions. Also keep `@supabase/supabase-js` at a version
satisfying `@supabase/ssr`'s peer dependency range (was bumped to `^2.108.0`
for `@supabase/ssr@0.12.0`) to avoid unsupported version drift.
