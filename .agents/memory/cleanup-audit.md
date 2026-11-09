---
name: Conservative dead-code audits
description: Dead-code cleanup must trace indirect runtime imports, not only route and component references.
---

When removing apparently unused modules, inspect runtime/context imports and dynamic registries before deleting them; route-level reference counts alone are insufficient.

**Why:** The Apps runtime consumed its module registry indirectly, even though no route imported the registry directly.

**How to apply:** Confirm both direct references and the full runtime import chain, then restart and typecheck after each cleanup batch.