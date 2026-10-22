---
name: AfuSearch results policy
description: Product scope and result behavior for AfuSearch visual search.
---

AfuSearch searches public AfuChat posts only. It should find related posts using image matching, readable text inside the submitted image, and typed keywords. Results belong in an image/post grid, with an explicit no-results state when nothing matches. Do not scrape Google, TikTok, or other external image sources.

**Why:** The user selected AfuChat public posts as the source and asked that text found in images or related post text surface relevant results.

**How to apply:** Keep result queries limited to public, non-blocked AfuChat posts; preserve the grid and honest empty state when changing search behavior.
