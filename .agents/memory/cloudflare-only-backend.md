---
name: Product-isolated Cloudflare architecture
description: AfuChat and AfuCloud are isolated products behind shared ecosystem entry points.
---

AfuChat and AfuCloud are distinct products. They may share Afu Account, the `api.afuchat.com` API gateway, the `cdn.afuchat.com` CDN gateway, and one database, but each must own an independently deployable Worker, schema, R2 bucket, routes, configuration, secrets, and deployment. The API gateway routes requests; product-specific business logic belongs in its product Worker. Do not route browser requests directly to Supabase as a workaround for a missing Worker route.

**Why:** The user's Afu ecosystem master rules supersede earlier decisions that treated AfuChat and AfuCloud as one product with shared product resources. The user also specified that AfuChat's backend must be the Cloudflare Worker.

**How to apply:** Classify each endpoint, schema, object, binding, and deployment by product before changing it. Preserve legacy contracts during migration. Do not alter or decommission a resource until ownership, dependencies, data, consumers, validation, and rollback are confirmed; stop when ownership is unknown.