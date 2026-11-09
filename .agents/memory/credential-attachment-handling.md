---
name: Credential attachment handling
description: How to handle uploaded credential files when a runtime secret is required.
---

Uploaded files remain workspace attachments and do not populate Replit Secrets automatically. A credential file must be submitted through the secure secret flow before deployment code can use it.

**Why:** Bundling or committing service-account files would expose private keys, while the secret API accepts secret values rather than file paths.

**How to apply:** Inspect only non-secret metadata from an attachment, then ask the user to copy its contents into the secure secret form. Never print, commit, or paste the credential into chat.