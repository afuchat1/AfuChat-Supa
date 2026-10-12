---
name: Expo Go tunnel workflow
description: Reliable Expo Go startup and public bundle delivery from this Replit workspace
---

## Rule
Use Replit's public port proxy on port 8000 for Expo Go, and provide Expo Go an `exps://` link/QR rather than the default `exp://` link:

```
EXPO_PACKAGER_PROXY_URL=https://$REPLIT_DEV_DOMAIN:8000 \
EXPO_NO_REDIRECT_PAGE=1 \
NODE_OPTIONS=--max-old-space-size=4096 \
node scripts/start-expo-go.mjs
```

**Why:** Replit's forwarded port serves HTTPS, but Expo Go resolves `exp://` to HTTP; that request returns 400 even when the HTTPS manifest and bundle both return 200. `exps://` maps to HTTPS. The Android bundle is large, and compiling it after the phone connects can also hit the client timeout.

**How to apply:** Keep `--go`, `--lan`, `EXPO_PACKAGER_PROXY_URL=https://$REPLIT_DEV_DOMAIN:8000`, `EXPO_NO_REDIRECT_PAGE=1`, and the 4 GB Node heap. Prewarm the Android bundle, then print a separate `exps://$REPLIT_DEV_DOMAIN:8000` QR and tell users to scan that one instead of Metro's default `exp://` QR.

Verify that the public HTTPS manifest and Android bundle both return HTTP 200. A successful manifest alone does not prove Expo Go can load the app.

**Do NOT use `CI=1`:** CI=1 breaks native bundle serving — every Expo Go connection produces a CommandError and the native bundle is never served.

