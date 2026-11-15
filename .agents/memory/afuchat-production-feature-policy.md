---
name: AfuChat production feature policy
description: The user's product direction for production availability and user-facing limitations.
---

Treat AfuChat features, including calls, as production functionality. Do not tell users to install a separate "production environment" to access features; make the supported production path work and avoid test-environment-only solutions.

**Why:** the user explicitly asked for production-grade features and said not to direct users to install a production environment.

**How to apply:** when a capability is unavailable in a preview/runtime, distinguish that limitation from the production app behavior and fix or verify the production path instead of presenting a test-environment workaround.
