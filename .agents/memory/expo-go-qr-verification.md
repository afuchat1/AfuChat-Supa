---
name: Expo Go QR verification
description: Expo tunnel fallback and bundle checks before sharing a development QR.
---

In this workspace, Expo SDK 58's default tunnel stopped when the Replit-managed Expo CLI session was unavailable. The installed ngrok provider (`expo start --tunnel ngrok`) started successfully without manual Expo authentication and served an Expo Go `exp.direct` URL over HTTP and HTTPS.

Do not assume a visible QR is usable: fetch the Android manifest and its actual JavaScript bundle from the QR host, and confirm both return HTTP 200 before sharing the QR. Clear Metro's cache after a major dependency reinstall.

**Why:** The phone's generic “Failed to download remote update” message can hide a Metro bundling failure or a tunnel/authentication problem; a QR alone does not prove the bundle is reachable.

**How to apply:** If the default tunnel requires sign-in and Replit's managed session is unavailable, do not ask for Expo credentials or run manual Expo login. Try the installed ngrok tunnel provider, then verify the exact Expo Go host and Android bundle before presenting its QR.
