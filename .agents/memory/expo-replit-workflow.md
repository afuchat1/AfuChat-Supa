---
name: Expo Go tunnel workflow
description: Reliable Expo Go startup and public bundle delivery from this Replit workspace
---

## Rule
Use Replit's public port proxy for Expo Go device testing when Ngrok is unavailable:

```
EXPO_PACKAGER_PROXY_URL=https://$REPLIT_DEV_DOMAIN:8000 \
EXPO_NO_REDIRECT_PAGE=1 \
NODE_OPTIONS=--max-old-space-size=4096 \
node scripts/start-expo-go.mjs
```

**Why:** Ngrok can fail before producing a tunnel, while Replit's external port 8000 serves the Expo manifest and Android bundle over HTTPS. Expo Go's first Android bundle compilation is slow enough to hit the client timeout unless it is warmed before scanning.

**How to apply:** Keep `--go`, `--lan`, the public `EXPO_PACKAGER_PROXY_URL`, and the 4 GB Node heap in the workflow. Disable the runtime redirect page. The startup wrapper polls the Android Metro bundle endpoint until the 21 MB bundle is ready.

The direct public manifest and bundle must both return HTTP 200; a successful manifest alone does not prove Expo Go can load the app.

**Do NOT use `CI=1`:** CI=1 breaks native bundle serving — every Expo Go connection produces a CommandError and the native bundle is never served.

## Workflow startup check

The managed workflow can remain in a running/building state while Metro is warming and may report no detected port temporarily. Check `getWorkflowStatus` for `openPorts: [8000]` and the wrapper's `Expo Android bundle warmed and ready for Expo Go.` message before changing the startup command. A direct shell `curl` may not see managed workflow ports from the same namespace.

**Why:** A premature restart or command rewrite can discard a healthy Expo process; the workflow service and ordinary shell do not always share the same port visibility.

**How to apply:** Allow the existing wrapper to finish its first bundle warm-up, then verify through workflow status and logs. Only diagnose forwarding after the workflow remains failed with no `openPorts` after the warm-up window.

