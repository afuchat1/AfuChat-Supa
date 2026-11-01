---
name: AfuSearch results policy
description: Product scope and result behavior for AfuSearch visual search.
---

AfuSearch discovery is a flat, vertically mixed feed using existing Afu product data: public AfuChat posts and videos plus published AfuMusic tracks. Avoid horizontal content carousels and do not show an app-shell bottom navigation bar. Tapping the search bar opens a full-screen overlay with recent searches first, then ranked search terms and available popular content in one vertical list; when there is no history, lead with popular searches and results. For image-bearing post/video results, keep text on the left and the image on the right.

Visual search and typed post searches remain grounded in existing public AfuChat content and current search helpers. Preserve category tabs without numeric counts, omit the filter/sort strip and result-count summaries, and keep a clear empty state. Do not scrape Google, TikTok, or other external image sources.

**Why:** The user expanded AfuSearch from a posts-only discovery screen to a Google-inspired mixed Afu content feed with a full-screen history/trending search overlay, while keeping the existing public-post visual search.

**How to apply:** Use existing Supabase-backed posts, video, music, and ranked-search helpers rather than inventing endpoints or migrations. Keep the home feed and overlay results flat, place available thumbnails to the right of text, and omit the app-shell bottom navigation.
