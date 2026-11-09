---
name: Expo workflow port detection
description: Replit workflow behavior when an Expo Metro web preview starts without an explicit waited-for port
---

For Expo workflows that serve the web preview on port 5000, configure the managed workflow with `waitForPort: 5000` in addition to passing `--port 5000` to Expo. Without an explicit waited-for port, the Metro process can be alive and eventually serve HTTP while the workflow remains unattached or reports no open port.

**Why:** A valid Metro command initially showed only “Starting Metro Bundler” and the managed workflow had `waitForPort: null`; the same command served correctly when run directly, and became previewable after the workflow waited on port 5000.

**How to apply:** When a managed Expo preview reports no port, inspect workflow status and listener state before changing app code. If Metro is healthy on 5000, set the workflow output type to `webview` and `waitForPort` to `5000`, then restart once and allow the initial file-map build to finish.