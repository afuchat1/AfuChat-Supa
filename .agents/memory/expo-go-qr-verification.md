---
name: Expo Go QR verification
description: Expo tunnel fallback and bundle checks before sharing a development QR.
---

In this workspace, Expo SDK 58's default tunnel stopped when the Replit-managed Expo CLI session was unavailable. The installed ngrok provider (`expo start --tunnel ngrok`) started successfully without manual Expo authentication and served an Expo Go `exp.direct` URL over HTTP and HTTPS. With no Expo account, Expo CLI 58 can pause at a login/proceed-anonymously prompt when stdin is interactive; redirect stdin from `/dev/null` and leave `CI` unset to proceed anonymously without disabling normal Metro behavior. `CI=1` skips the prompt but disables Metro reloads.

Do not assume a visible QR is usable: fetch the Android manifest and its actual JavaScript bundle from the QR host, and confirm both return HTTP 200 before sharing the QR. After a major dependency reinstall, clear Metro by default; if preserving a warm cache for faster QR startup, keep it only when both requests succeed.

**Why:** The phone's generic “Failed to download remote update” message can hide a Metro bundling failure or a tunnel/authentication problem; a QR alone does not prove the bundle is reachable. A verified manifest and bundle can also confirm that a warm cache survived a dependency install.

**How to apply:** If the default tunnel requires sign-in and Replit's managed session is unavailable, do not ask for Expo credentials or run manual Expo login. Try the installed ngrok tunnel provider; when Expo CLI shows an account prompt, redirect stdin from `/dev/null` with `CI` unset. Then request the manifest with Android Expo headers, fetch its `launchAsset.url`, and require HTTP 200 for both before presenting its QR. If either request fails after a dependency reinstall, restart with `--clear`.
