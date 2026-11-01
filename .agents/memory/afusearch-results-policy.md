---
name: AfuSearch results policy
description: Product scope and result behavior for AfuSearch visual search.
---

AfuSearch searches public AfuChat posts only. It should find related posts using image matching, readable text inside the submitted image, and typed keywords. Keep results in one search screen: show matching posts as normal content rows and image results in a two-column, Google Images-style grid. Keep category tabs without numeric counts, omit the filter/sort strip and result-count summaries, and do not show an app-shell bottom navigation bar. Preserve a clear empty state. Do not scrape Google, TikTok, or other external image sources.

**Why:** The user selected AfuChat public posts as the source, asked for one results page with normal content and image matches, requested categories without result counts or the filter/sort row, and said AfuSearch does not need a bottom navigation bar.

**How to apply:** Keep result queries limited to public, non-blocked AfuChat posts; display OCR/text/caption matches as content results and image matches in the image grid. Keep category navigation clean of counts and extra filter/sort controls, and omit the app-shell bottom navigation.
