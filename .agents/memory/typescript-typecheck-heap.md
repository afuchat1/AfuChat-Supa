---
name: TypeScript typecheck heap
description: Full mobile TypeScript checks can exceed Node's default heap in this workspace.
---

Run the mobile typecheck with an increased Node heap when the default process exits with an out-of-memory error.

**Why:** The project-wide TypeScript graph is large enough to exhaust Node's default heap before reporting diagnostics.

**How to apply:** Use `NODE_OPTIONS=--max-old-space-size=4096` for the check; treat the default-heap crash as an environment limit, not a type error.