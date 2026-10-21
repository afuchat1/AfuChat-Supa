---
name: AfuSearch platform-wide scope
description: Product direction for AfuSearch coverage across platform content.
---

AfuSearch is intended to act as a platform-wide search engine that indexes public/searchable content across AfuChat, rather than being limited to image matching or search suggestions. Private messages and private posts must not appear in AfuSearch.

`/app/afusearch` is the only canonical AfuSearch surface. Do not render a second `/search` experience; if the legacy path is retained, it must redirect to the canonical app route, and app navigation should link directly there.

**Why:** the user explicitly set this as the product direction. Production schema inspection also found no public job-listings table.

**How to apply:** when expanding AfuSearch, cover public content and keep private messages/posts outside the index. Keep `/app/afusearch` as the sole search UI. Re-check the schema before adding job indexing; the app's `org_page_jobs` reference is not a production table.
