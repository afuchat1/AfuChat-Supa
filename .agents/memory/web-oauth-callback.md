---
name: Web OAuth callback
description: Browser OAuth redirect and Supabase session restoration requirements.
---

On the web build, OAuth must redirect through the current browser origin with Supabase's normal browser redirect. The web Supabase client must persist auth state in localStorage and enable URL session detection; native builds keep Expo deep-link handling.

**Why:** The native Expo redirect URI and `WebBrowser.openAuthSessionAsync` path do not complete a browser login reliably, and disabling URL detection leaves the returned PKCE code unexchanged.

**How to apply:** Use `${window.location.origin}/` as the web `redirectTo`, omit `skipBrowserRedirect` on web, and ensure every deployed origin is listed in Supabase Authentication URL Configuration.