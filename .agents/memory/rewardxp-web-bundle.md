---
name: Reward XP bundle loading
description: Avoids Metro unknown-module failures from lazily split rewardXp imports.
---

Keep `lib/rewardXp.ts` in the startup bundle while its callers use dynamic imports. Metro emitted it as a separate web chunk, and the app reported `Requiring unknown module` when that chunk was unavailable or stale. The module ID varies by build.

**Why:** a missing lazily loaded helper chunk caused the app error screen after a web rebuild.

**How to apply:** keep the root side-effect import or convert callers to static imports; never depend on a numeric module ID. After bundling, confirm the helper is in the entry bundle and no separate rewardXp chunk remains.
