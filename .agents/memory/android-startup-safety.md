---
name: AfuChat Android startup safety
description: Durable constraints for cached identity, startup reporting, and Android list behavior.
---

A cached AfuChat identity may support cached/offline UI, but it is not a Supabase session; server or sensitive operations must require a matching live session.

Keep one global crash reporter. Persist startup failures locally, defer network uploads until the app is operational, sanitize error content, and include startup phase and storage-backend diagnostics. Never include tokens, passwords, or private message content in crash reports.

Do not mutate FlatList or SectionList defaults globally. Disable clipping only on identified long or dynamic screens that need it.

**Why:** The user requires offline UI without treating cached identity as authorization, privacy-safe startup diagnostics, and scoped Android list safeguards. Global defaults affect unrelated screens. A physical Android trace is still needed to confirm any device-specific crash cause.

**How to apply:** Gate remote calls on a current authenticated session while retaining permitted local data. Keep reporter failures non-fatal and sanitize before storage or upload. Verify list-specific settings on Android before widening them.
