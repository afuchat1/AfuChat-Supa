---
name: Web-only legal routes
description: Platform routing and startup behavior for public Terms, Privacy, and account-deletion pages.
---

Web-only public pages in this Expo Router app should use a shared route component selected by `Platform.OS === "web"` inside the route file. The native branch should not render the legal page; it may open the public URL externally for existing app links.

**Why:** Platform-suffixed route files were not reliably selected over existing generic route stubs during the web preview, and the app-wide JS splash overlay hid the mounted web page.

**How to apply:** Keep the generic route for deep-link verification/native compatibility, guard its native redirect effect, render the web page branch, and do not show `SplashScreenView` when `Platform.OS === "web"`.