---
name: Foreground sync service risk
description: Android data-sync queue behavior and why the custom foreground service is not used
---

The offline action queue must remain durable in SQLite and use bounded foreground retry triggers; do not start a custom Android foreground service for ordinary sync attempts.

**Why:** Starting a data-sync foreground service from reconnect/enqueue callbacks can terminate the Android process under modern background-start restrictions, while the queue already persists work and retries safely.

**How to apply:** Keep sync work bounded, guarded by connectivity and an in-flight lock, and retry from authenticated foreground lifecycle events. Reintroduce a native service only with a tested OS-compliant long-running job and a real background workload.